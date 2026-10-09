const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ensurePractice, taskArguments } = require('./workflow.cjs');
const { renderHtml } = require('./view.cjs');

async function findProjectRoot() {
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const root = folder.uri.fsPath;
    try {
      await fs.access(path.join(root, 'tools', 'vjudge-vscode', 'cli.cjs'));
      await fs.access(path.join(root, 'tools', 'vjudge-vscode', 'library.cjs'));
      return root;
    } catch { /* Check the next workspace folder, without changing any folder. */ }
  }
  throw new Error('請在 VS Code 開啟 Codex_Try_001 專案資料夾；其中需要有 tools/vjudge-vscode/cli.cjs 與新版 library.cjs。');
}

function loadBackend(root) {
  try {
    const library = require(path.join(root, 'tools', 'vjudge-vscode', 'library.cjs'));
    if (typeof library.getWorkbook !== 'function' || typeof library.getProblem !== 'function') {
      throw new Error('助手版本尚未包含點選題目功能。');
    }
    return library;
  } catch (error) {
    throw new Error(`無法載入題單助手：${error.message}\n請更新專案，並在 VS Code 執行「CPE：安裝本機提交助手相依套件」工作。`);
  }
}

class ProblemTree {
  constructor() {
    this.events = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.events.event;
    this.workbook = undefined;
  }
  update(workbook) { this.workbook = workbook; this.events.fire(); }
  getTreeItem(item) {
    if (item.kind === 'category') {
      const row = new vscode.TreeItem(item.category, vscode.TreeItemCollapsibleState.Expanded);
      row.description = `${this.workbook.problems.filter(problem => problem.category === item.category).length} 題`;
      row.iconPath = new vscode.ThemeIcon('folder');
      return row;
    }
    const row = new vscode.TreeItem(`${item.order}. ${item.id}`, vscode.TreeItemCollapsibleState.None);
    row.description = item.title;
    row.tooltip = `${item.id} — ${item.title}\n點選後只載入這一題，不提交解答。`;
    row.iconPath = new vscode.ThemeIcon('book');
    row.command = { command: 'cpePractice.open', title: '閱讀題目並開啟練習', arguments: [item.id] };
    return row;
  }
  getChildren(item) {
    if (!this.workbook) return [];
    if (item?.kind === 'category') return this.workbook.problems.filter(problem => problem.category === item.category);
    if (item) return [];
    return [...new Set(this.workbook.problems.map(problem => problem.category))].map(category => ({ kind: 'category', category }));
  }
  dispose() { this.events.dispose(); }
}

function activate(context) {
  const provider = new ProblemTree();
  const tree = vscode.window.createTreeView('cpePractice.problems', { treeDataProvider: provider });
  const output = vscode.window.createOutputChannel('CPE 練習題單');
  context.subscriptions.push(provider, tree, output);
  let panel, selected, selectionGeneration = 0, busyTask = false, refreshPromise;

  const fail = error => {
    output.appendLine(error.message);
    panel?.webview.postMessage({ type: 'notice', message: `操作失敗：${error.message}` });
    vscode.window.showErrorMessage(error.message);
  };
  const notice = message => {
    output.appendLine(message);
    panel?.webview.postMessage({ type: 'notice', message });
  };
  const trusted = () => {
    if (!vscode.workspace.isTrusted) throw new Error('請先確認你信任這個專案資料夾，再使用題單、測試與提交。');
  };
  async function withFetcher(root, action) {
    const backend = loadBackend(root);
    const fetcher = await backend.createFetcher();
    try { return await action(backend, url => fetcher.fetch(url)); }
    finally { await fetcher.close(); }
  }
  function assetUri(webview, ...segments) {
    return webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, ...segments)).toString();
  }
  function ensurePanel() {
    if (panel) { panel.reveal(vscode.ViewColumn.One, true); return panel; }
    panel = vscode.window.createWebviewPanel('cpePractice.statement', 'CPE 題目', { viewColumn: vscode.ViewColumn.One, preserveFocus: true }, {
      enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    });
    panel.onDidDispose(() => { panel = undefined; selectionGeneration++; }, undefined, context.subscriptions);
    panel.webview.onDidReceiveMessage(async message => {
      if (!selected || !message || typeof message.command !== 'string') return;
      const commands = { openCode: () => openCode(selected), test: () => run('test'), languages: () => run('languages'), submit: () => run('submit') };
      if (!Object.hasOwn(commands, message.command)) return;
      try { await commands[message.command](); }
      catch (error) { fail(error); }
    }, undefined, context.subscriptions);
    return panel;
  }
  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      trusted();
      tree.message = '正在讀取文章 2679 的題單（不下載全部題目）…';
      const root = await findProjectRoot();
      const workbook = await withFetcher(root, (backend, fetchBytes) => backend.getWorkbook({ root, fetchBytes }));
      provider.update(workbook);
      tree.message = workbook.offlineCache
        ? `使用之前保存的題單，共 ${workbook.problems.length} 題；目前無法確認網站最新內容。`
        : `文章 2679 · ${workbook.problems.length} 題 · 點選後載入單題`;
      if (workbook.cacheWarning) notice(workbook.cacheWarning);
      return workbook;
    })();
    try { return await refreshPromise; }
    catch (error) { tree.message = '題單讀取失敗。按上方重新讀取，詳情見「CPE 練習題單」輸出。'; throw error; }
    finally { refreshPromise = undefined; }
  }
  async function openCode(selection) {
    const practice = await ensurePractice(selection.root, selection.problem);
    const document = await vscode.workspace.openTextDocument(practice.file);
    if (selected !== selection) return practice;
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Two, preview: false, preserveFocus: false });
    notice(practice.created ? '已建立留白的 main.cpp；請自己實作。未建立或修改測資。' : '已開啟既有 main.cpp，保留你的程式與測資。');
    return practice;
  }
  async function openProblem(id) {
    trusted();
    if (!provider.workbook) await refresh();
    const problem = provider.workbook.problems.find(candidate => candidate.id === id);
    if (!problem) throw new Error('請從文章 2679 的題單選題。');
    const root = await findProjectRoot(), generation = ++selectionGeneration;
    selected = undefined;
    const currentPanel = ensurePanel();
    currentPanel.title = `${problem.id} 題目`;
    currentPanel.webview.html = renderHtml({ webviewSource: currentPanel.webview.cspSource,
      scriptUri: assetUri(currentPanel.webview, 'media', 'view.mjs'), styleUri: assetUri(currentPanel.webview, 'media', 'view.css'),
      configuration: {}, notice: `正在載入 ${problem.id} 的原題，只下載這一題…` });
    const result = await withFetcher(root, (backend, fetchBytes) => backend.getProblem({ root, problem, fetchBytes }));
    if (generation !== selectionGeneration || !panel) return;
    const distribution = path.dirname(require.resolve('pdfjs-dist/package.json', { paths: [path.join(root, 'tools', 'vjudge-vscode')] }));
    const webview = panel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media'),
      vscode.Uri.file(path.dirname(result.pdfFile)), vscode.Uri.file(distribution)] };
    const pdfAsset = (...segments) => webview.asWebviewUri(vscode.Uri.file(path.join(distribution, ...segments))).toString();
    webview.html = renderHtml({ webviewSource: webview.cspSource, scriptUri: assetUri(webview, 'media', 'view.mjs'),
      styleUri: assetUri(webview, 'media', 'view.css'), problem, text: result.text,
      notice: result.cached ? '已讀取這題先前保存的原題。未下載其他題目。' : '已載入這題的官方原題。未下載其他題目。',
      configuration: { pdfUri: webview.asWebviewUri(vscode.Uri.file(result.pdfFile)).toString(),
        pdfModuleUri: pdfAsset('legacy', 'build', 'pdf.mjs'), pdfWorkerUri: pdfAsset('legacy', 'build', 'pdf.worker.mjs'),
        cMapUri: pdfAsset('cmaps') + '/', fontUri: pdfAsset('standard_fonts') + '/', wasmUri: pdfAsset('wasm') + '/' } });
    selected = { root, problem, ...result };
    await openCode(selected);
  }
  async function run(action) {
    trusted();
    if (!selected) throw new Error('請先從題單點選一題，等題目載入完成。');
    if (busyTask) throw new Error('上一個助手操作仍在執行。請先查看下方終端機，等它結束；不會自動重送。');
    const selection = selected;
    const practice = action === 'languages'
      ? { file: path.join(selection.root, 'practice', selection.problem.id, 'main.cpp') }
      : await ensurePractice(selection.root, selection.problem);
    let language;
    if (action === 'submit') {
      language = await vscode.window.showInputBox({ title: `提交 ${selection.problem.id}`, prompt: '輸入這題網站提供的完整 C++ 語言名稱；尚未查詢時，先取消並按「查詢提交語言」。', placeHolder: '例如 C++11 5.3.0',
        validateInput: value => value.trim() ? undefined : '請輸入網站提供的語言名稱。' });
      if (!language) return;
      const answer = await vscode.window.showWarningMessage(`是否提交 ${selection.problem.id} 的 main.cpp？會先儲存程式並執行本機測試；測試通過後只送出一次，結果顯示在下方終端機。`, { modal: true }, '提交這一次');
      if (answer !== '提交這一次') return;
    }
    if (action !== 'languages') {
      const document = await vscode.workspace.openTextDocument(practice.file);
      if (document.isDirty && !await document.save()) throw new Error('main.cpp 未能儲存，已停止操作。');
    }
    const helperFile = path.join(selection.root, 'tools', 'vjudge-vscode', 'cli.cjs');
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const label = { test: '本機測試', languages: '查詢提交語言', submit: '提交並查詢判定' }[action];
    const folder = vscode.workspace.workspaceFolders.find(candidate => candidate.uri.fsPath === selection.root);
    const task = new vscode.Task({ type: 'cpe-practice', requestId }, folder, `CPE：${selection.problem.id} ${label}`, 'CPE 練習',
      new vscode.ProcessExecution('node', taskArguments(helperFile, action, practice, selection.problem, language), { cwd: selection.root }), []);
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.New, focus: false, clear: false };
    if (busyTask) throw new Error('上一個助手操作仍在執行，已停止新的操作。');
    busyTask = true;
    notice(`${label}已啟動；實際結果請看下方終端機。`);
    let processListener, endListener;
    const finish = message => {
      busyTask = false;
      notice(message);
      processListener?.dispose();
      endListener?.dispose();
    };
    processListener = vscode.tasks.onDidEndTaskProcess(event => {
      if (event.execution.task.definition.requestId !== requestId) return;
      finish(`${selection.problem.id} ${label}程序結束，退出碼 ${event.exitCode ?? '未取得'}。請查看下方終端機的測試或判定紀錄；不會自動重送。`);
    });
    endListener = vscode.tasks.onDidEndTask(event => {
      if (event.execution.task.definition.requestId !== requestId) return;
      finish(`${selection.problem.id} ${label}工作已結束，但未取得程序退出碼；可能已取消。結果尚未確認，請查看終端機，不會自動重送。`);
    });
    context.subscriptions.push(processListener, endListener);
    try { await vscode.tasks.executeTask(task); }
    catch (error) { busyTask = false; processListener.dispose(); endListener.dispose(); throw error; }
  }
  for (const [command, action] of Object.entries({
    refresh, open: openProblem, test: () => run('test'), languages: () => run('languages'), submit: () => run('submit'),
    choose: async () => {
      if (!provider.workbook) await refresh();
      const choice = await vscode.window.showQuickPick(provider.workbook.problems.map(problem => ({ label: problem.id,
        description: problem.title, detail: `${problem.order}. ${problem.category}`, id: problem.id })), { title: '選擇文章 2679 的一題', matchOnDescription: true, matchOnDetail: true });
      if (choice) await openProblem(choice.id);
    }
  })) {
    context.subscriptions.push(vscode.commands.registerCommand(`cpePractice.${command}`, async (...args) => {
      try { return await action(...args); }
      catch (error) { fail(error); }
    }));
  }
  refresh().catch(fail);
  return { provider, getSelection: () => selected };
}

module.exports = { activate, ProblemTree, findProjectRoot };

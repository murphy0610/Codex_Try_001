const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

test('language lookup does not save or recreate answers; cancelled tasks release the busy state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-ui-command-'));
  const helper = path.join(root, 'tools', 'vjudge-vscode');
  await fs.mkdir(helper, { recursive: true });
  await fs.writeFile(path.join(helper, 'cli.cjs'), '// fixture');
  await fs.writeFile(path.join(helper, 'library.cjs'), '// fixture');
  const originalLoad = Module._load, originalResolve = Module._resolveFilename;
  const distribution = require.resolve('pdfjs-dist/package.json', { paths: [path.resolve(__dirname, '..', '..')] });
  const problem = { id: 'UVA-11332', title: 'Fixture only', category: '測試分類', order: 1 };
  const commands = new Map(), errors = [], executions = [], notices = [];
  let saves = 0;
  class Emitter {
    constructor() { this.listeners = new Set(); this.event = fn => { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }; }
    fire(value) { for (const fn of [...this.listeners]) fn(value); }
    dispose() { this.listeners.clear(); }
  }
  const processEnd = new Emitter(), taskEnd = new Emitter();
  const uri = file => ({ fsPath: file, toString: () => `local:${file}` });
  const folder = { uri: uri(root) };
  const document = { isDirty: true, save: async () => { saves++; return true; } };
  const vscode = {
    EventEmitter: Emitter, ThemeIcon: class {}, TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    TreeItemCollapsibleState: { None: 0, Expanded: 2 }, ViewColumn: { One: 1, Two: 2 },
    Uri: { file: uri, joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    workspace: { isTrusted: true, workspaceFolders: [folder], openTextDocument: async () => document },
    window: {
      createTreeView: () => ({ dispose() {} }), createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      showErrorMessage: message => errors.push(message), showTextDocument: async () => {},
      createWebviewPanel: () => ({ title: '', reveal() {}, onDidDispose: () => ({ dispose() {} }),
        webview: { cspSource: 'local:', asWebviewUri: value => value, postMessage: message => notices.push(message.message), onDidReceiveMessage: () => ({ dispose() {} }) } })
    },
    commands: { registerCommand: (name, callback) => { commands.set(name, callback); return { dispose() {} }; } },
    Task: class { constructor(definition, scope, name, source, execution) { Object.assign(this, { definition, scope, name, source, execution }); } },
    ProcessExecution: class { constructor(command, args, options) { Object.assign(this, { command, args, options }); } },
    TaskRevealKind: { Always: 1 }, TaskPanelKind: { New: 2 },
    tasks: { onDidEndTaskProcess: processEnd.event, onDidEndTask: taskEnd.event,
      executeTask: async task => { const execution = { task }; executions.push(execution); return execution; } }
  };
  const backend = {
    createFetcher: async () => ({ fetch() {}, async close() {} }),
    getWorkbook: async () => ({ title: 'Fixture workbook', problems: [problem] }),
    getProblem: async () => ({ problem, pdfFile: path.join(root, '.cpe-vjudge', 'library', '2679', problem.id, 'statement.pdf'),
      markdownFile: path.join(root, 'fixture.md'), text: 'fixture statement', pages: 1, cached: false })
  };
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode;
    if (request === path.join(helper, 'library.cjs')) return backend;
    return originalLoad.call(this, request, parent, isMain);
  };
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'pdfjs-dist/package.json') return distribution;
    return originalResolve.call(this, request, parent, isMain, options);
  };
  const moduleFile = require.resolve('../extension.cjs');
  delete require.cache[moduleFile];
  const context = { extensionUri: uri(path.resolve(__dirname, '..')), subscriptions: [] };
  try {
    const api = require('../extension.cjs').activate(context);
    await commands.get('cpePractice.refresh')();
    assert.equal(api.provider.workbook.problems.length, 1);
    await commands.get('cpePractice.open')(problem.id);
    assert.equal(api.getSelection().problem.id, problem.id);
    const answer = path.join(root, 'practice', problem.id, 'main.cpp');
    await fs.writeFile(answer, 'my unsaved editor buffer is separate from this file');
    await commands.get('cpePractice.languages')();
    assert.equal(saves, 0, 'read-only language lookup must not save the dirty editor');
    assert.equal(await fs.readFile(answer, 'utf8'), 'my unsaved editor buffer is separate from this file');
    assert.equal(executions.length, 1);
    assert.equal(executions[0].task.execution.args[1], 'languages');
    // Cancellation before any process exit event must still release the guard.
    taskEnd.fire({ execution: executions[0] });
    assert.match(notices.at(-1), /未取得程序退出碼/);
    assert.match(notices.at(-1), /結果尚未確認/);
    assert.doesNotMatch(notices.at(-1), /通過|AC/);
    await fs.unlink(answer);
    await commands.get('cpePractice.languages')();
    assert.equal(executions.length, 2, 'a cancelled task must not leave the UI permanently busy');
    await assert.rejects(fs.access(answer), { code: 'ENOENT' });
    assert.equal(saves, 0);
    processEnd.fire({ execution: executions[1], exitCode: 1 });
    // Real test/submit branches do save a dirty buffer; this mock does not run a compiler or submit.
    await fs.writeFile(answer, 'user code');
    await commands.get('cpePractice.test')();
    assert.equal(saves, 1);
    assert.equal(executions.length, 3);
    assert.ok(!executions[2].task.execution.args.includes('--yes'));
    processEnd.fire({ execution: executions[2], exitCode: 0 });
    assert.deepEqual(errors, []);
  } finally {
    for (const item of context.subscriptions) item.dispose?.();
    Module._load = originalLoad;
    Module._resolveFilename = originalResolve;
    delete require.cache[moduleFile];
    await fs.rm(root, { recursive: true, force: true });
  }
});

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { chromium } = require('playwright-core');
const client = require('./client.cjs');
const { runTests } = require('./runner.cjs');
const core = require('../vjudge-submit/core.js');
const { createDiagnostic } = require('./diagnostics.cjs');

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) throw new Error(`不認得的參數：${args[i]}`);
    const key = args[i].slice(2);
    result[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  }
  return result;
}
const dataRoot = path.join(os.homedir(), '.cpe-vjudge-local');
async function withBrowser(headless, action, onProgress = () => {}) {
  const progress = message => {
    console.log(`[助手] ${message}`);
    try { onProgress(message); }
    catch { console.error('[助手] 診斷進度寫入失敗；請保留終端輸出。'); }
  };
  await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await fs.open(path.join(dataRoot, 'browser.lock'), 'wx', 0o600); }
  catch { throw new Error(`助手已有任務執行中。請先結束自己的助手視窗／任務；若之前異常中斷，由本機 Codex 確認沒有助手程序後清理 ${path.join(dataRoot, 'browser.lock')}。`); }
  let context;
  try {
    const settings = { headless, timeout: 30000 };
    if (process.env.CPE_BROWSER_PATH) settings.executablePath = process.env.CPE_BROWSER_PATH;
    else settings.channel = process.platform === 'win32' ? 'msedge' : 'chrome';
    progress(`正在開啟${headless ? '背景' : '登入'}瀏覽器（${settings.channel || 'CPE_BROWSER_PATH 指定的瀏覽器'}）。`);
    context = await chromium.launchPersistentContext(path.join(dataRoot, 'browser-profile'), settings);
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(30000);
    progress('瀏覽器已啟動。');
    // Session cookies may expire on browser close; preserve them only on the user's machine.
    // Never print, export to Codex cloud, or put this file in the project checkout.
    const sessionFile = path.join(dataRoot, 'browser-session.json');
    try {
      const session = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
      await context.addCookies(session.cookies.filter(cookie => ['vjudge.net', '.vjudge.net'].includes(cookie.domain)));
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('本機登入資料無法載入；請由本機 Codex 檢查，勿上傳登入資料。'); }
    const page = context.pages()[0] || await context.newPage();
    progress('本機登入資料準備完成；檔案存在不代表登入有效，接著由網站確認。');
    const result = await action(page);
    const state = await context.storageState();
    await fs.writeFile(sessionFile, JSON.stringify({ cookies: state.cookies.filter(cookie => ['vjudge.net', '.vjudge.net'].includes(cookie.domain)) }), { mode: 0o600 });
    return result;
  } finally {
    progress('正在關閉助手瀏覽器。');
    try { await context?.close(); }
    finally { await lock.close(); await fs.unlink(path.join(dataRoot, 'browser.lock')); }
    progress('助手瀏覽器已關閉，鎖定已解除。');
  }
}
async function save(recordPath, data) {
  const temporary = `${recordPath}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temporary, recordPath);
}
async function main() {
  const command = process.argv[2];
  const args = options(process.argv.slice(3));
  console.log('[助手] 本機指令已啟動。');
  if (command === 'doctor') {
    console.log(`Node.js：${process.version}`);
    console.log(`Playwright：${require('playwright-core/package.json').version}`);
    console.log(`目前專案目錄：${process.cwd()}`);
    console.log(`瀏覽器來源：${process.env.CPE_BROWSER_PATH ? 'CPE_BROWSER_PATH（不顯示內容）' : process.platform === 'win32' ? 'Edge' : 'Chrome'}`);
    for (const [name, label] of [['browser-session.json', '登入資料檔'], ['browser.lock', '助手鎖定檔']]) {
      try { await fs.access(path.join(dataRoot, name)); console.log(`${label}：存在`); }
      catch (error) { if (error.code === 'ENOENT') console.log(`${label}：不存在`); else throw error; }
    }
    console.log('診斷完成。此指令不連線驗證登入、不讀取登入檔內容，也不提交解答。');
    return;
  }
  if (command === 'login') {
    await withBrowser(false, async page => {
      await page.goto('https://vjudge.net/', { waitUntil: 'domcontentloaded' });
      console.log('請在助手開啟的瀏覽器視窗登入／完成真人驗證。登入狀態只保存在這台電腦，不會送給雲端。');
      const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
      try { await terminal.question('完成後回到 VS Code 終端機，按 Enter：'); }
      finally { terminal.close(); }
      await client.assertLoggedIn(page);
      console.log('登入已確認，助手將關閉這個視窗。平常的提交在背景執行，登入過期時再執行此步驟。');
    });
    return;
  }
  if (command === 'test') {
    if (!args.file) throw new Error('請指定 --file 程式檔案。');
    const tests = await runTests(path.resolve(args.file), args.tests && path.resolve(args.tests));
    console.log(`本地測試通過 ${tests.passed}/${tests.total}；這不是線上 AC。`);
    return;
  }
  if (command === 'query') {
    if (!args.record) throw new Error('請指定 --record 判題紀錄 JSON。');
    const recordPath = path.resolve(args.record);
    let record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
    core.positiveId(record.runId); core.problemFromUrl(`https://vjudge.net/problem/${record.problem}`);
    await withBrowser(true, async page => {
      await page.goto('https://vjudge.net/', { waitUntil: 'domcontentloaded' }); await client.assertLoggedIn(page);
      const result = await client.queryResult(page, record.problem, record.runId);
      record = { ...record, ...result, checkedAt: new Date().toISOString() }; await save(recordPath, record);
      console.log(`提交 #${result.runId}：${result.verdict}${result.final ? '（已完成）' : '（未確認完成）'}`);
    });
    return;
  }
  if (!['languages', 'submit'].includes(command)) throw new Error('指令：doctor、login、languages --problem 題號、test --file 檔案、submit、query --record 紀錄。');
  if (typeof args.problem !== 'string') throw new Error('請指定 --problem，例如 UVA-100。');
  const problem = core.problemFromUrl(`https://vjudge.net/problem/${args.problem}`);
  if (command === 'languages') {
    const diagnostic = createDiagnostic(path.join(process.cwd(), '.cpe-vjudge', 'diagnostics'), problem);
    console.log(`本次診斷紀錄：${diagnostic.file}`);
    const progress = message => { diagnostic.progress(message); console.log(`[助手] ${message}`); };
    try {
      let languages;
      await withBrowser(args.visible !== true, async page => {
        const form = await client.openForm(page, problem, {
          onProgress: progress, onSnapshot: metadata => diagnostic.snapshot(metadata)
        });
        languages = form.languages;
        console.log(`${problem} 可用 C++ 語言：`);
        console.log(languages.map(item => item.label).join('\n'));
      }, message => diagnostic.progress(message));
      diagnostic.success(languages);
    } catch (error) { diagnostic.failure(error); throw error; }
    return;
  }
  if (args.yes !== true || !args.file || typeof args.language !== 'string') {
    throw new Error('提交需要 --file、--language 和 --yes（明確授權這次提交）。');
  }
  const file = path.resolve(args.file);
  const source = await fs.readFile(file, 'utf8');
  const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
  const tests = await runTests(file, args.tests && path.resolve(args.tests));
  console.log(`本地測試通過 ${tests.passed}/${tests.total}；準備提交 ${problem}。`);
  // Reject edits during test execution, so the submitted code is the version that was tested.
  if (await fs.readFile(file, 'utf8') !== source) throw new Error('測試期間程式已修改，請重新執行；未提交。');
  const results = path.join(process.cwd(), '.cpe-vjudge', 'results');
  await fs.mkdir(results, { recursive: true });
  const recordPath = path.join(results, `${problem}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
  let record = { problem, file: path.relative(process.cwd(), file), sourceHash, tests, runId: null, state: 'prepared', createdAt: new Date().toISOString() };
  await fs.writeFile(recordPath, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`本次紀錄：${recordPath}`);
  try {
    await withBrowser(true, async page => {
      const submission = await client.submitOnce(page, { problem, source, languageQuery: args.language,
        beforeClick: async language => { record = { ...record, language, state: 'submitting' }; await save(recordPath, record); } });
      record = { ...record, ...submission, state: 'submitted', submittedAt: new Date().toISOString() }; await save(recordPath, record);
      console.log(`已收到提交編號 #${record.runId}；開始查詢，不會重新提交。`);
      const finalResult = await client.waitForResult(page, problem, record.runId, { onResult: async result => {
        record = { ...record, ...result, state: result.final ? 'finished' : 'judging', checkedAt: new Date().toISOString() };
        await save(recordPath, record);
        console.log(`${problem} #${result.runId}：${result.verdict}${result.final ? '（已完成）' : '（未確認完成）'}`);
      } });
      if (!finalResult.final) { console.log('尚未得到最終判定；請用 query 查詢保存的紀錄，不要重新提交。'); process.exitCode = 2; }
    });
  } catch (error) {
    record = { ...record, error: error.message, state: record.runId ? 'query-failed' : record.state === 'submitting' ? 'uncertain' : 'not-submitted' };
    await save(recordPath, record); throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

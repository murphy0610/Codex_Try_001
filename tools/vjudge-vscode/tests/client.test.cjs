const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const client = require('../client.cjs');
let browser;
before(async () => {
  const options = process.platform === 'win32' ? { channel: 'msedge' }
    : process.platform === 'linux' ? { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] }
    : { channel: 'chrome' };
  if (process.env.CPE_TEST_BROWSER_PATH) options.executablePath = process.env.CPE_TEST_BROWSER_PATH;
  browser = await chromium.launch(options);
});
after(async () => { await browser?.close(); });
const fixture = `<!doctype html><html><body>
<button id="problem-submit">Submit</button>
<div id="submitModal" hidden><span class="problem-origin">UVA - 100</span>
<select name="language"><option value="5">GNU C++17</option><option value="9">Java</option></select>
<input name="submitterType" type="radio" value="0" checked>
<input name="open" type="radio" value="1" checked><input name="open" type="radio" value="0">
<textarea name="source"></textarea><div class="CodeMirror"></div><button id="btn-submit">Submit</button></div>
<script>
let code = '';
document.querySelector('.CodeMirror').CodeMirror = { setValue: value => { code = value; }, getValue: () => code, save: () => { document.querySelector('textarea').value = code; } };
document.getElementById('problem-submit').onclick = () => { const modal = document.getElementById('submitModal'); modal.hidden = false; modal.classList.add('show'); };
document.getElementById('btn-submit').onclick = () => {
  const xhr = new XMLHttpRequest(); xhr.open('POST', '/problem/submit/UVA-100');
  xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
  xhr.send(new URLSearchParams({ source: document.querySelector('textarea').value, language: document.querySelector('select').value, open: document.querySelector('input[name=open]:checked').value }));
};
</script></body></html>`;
async function setup(options = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const submissions = [];
  const navigationPaths = [];
  let queries = 0;
  await page.route('https://vjudge.net/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.isNavigationRequest()) navigationPaths.push(pathname);
    if (pathname === '/user/checkLogInStatus') {
      if (options.loginDelay) await new Promise(resolve => setTimeout(resolve, options.loginDelay));
      try { return await route.fulfill({ body: options.loginBody ?? (options.loggedOut ? '0' : '1') }); }
      catch (error) { if (!page.isClosed()) throw error; }
      return;
    }
    if (pathname === '/problem/submit/UVA-100') {
      submissions.push(Object.fromEntries(new URLSearchParams(request.postData())));
      return route.fulfill({ status: options.httpStatus || 200, contentType: 'application/json', body: JSON.stringify(options.reply || { runId: 5678 }) });
    }
    if (pathname === '/solution/data/5678') {
      queries++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ runId: options.wrongId ? 999 : 5678, oj: 'UVA', probNum: '100',
        status: queries === 1 ? 'Judging' : options.verdict || 'Accepted', processing: queries === 1 }) });
    }
    let body = options.noLanguages ? fixture.replace('GNU C++17', 'Java 17') : fixture;
    if (options.formError) body = body.replace('<div id="submitModal" hidden>', '<div id="submitModal" hidden><div id="submit-alert" hidden></div>')
      .replace('xhr.send(new URLSearchParams', `xhr.onload = () => { const alert = document.getElementById('submit-alert'); alert.textContent = ${JSON.stringify(options.formError)}; alert.hidden = false; };\n  xhr.send(new URLSearchParams`);
    if (options.editorNormalizes) body = body.replace('getValue: () => code', 'getValue: () => code.replace(/\\r\\n?/g, "\\n")');
    if (options.editorReturnsCrLf) body = body.replace('getValue: () => code', 'getValue: () => code.replace(/\\r\\n?|\\n/g, "\\r\\n")');
    if (options.corruptEditor) body = body.replace('code = value;', 'code = value.replace("std::cout << 7", "std::cout << 8");');
    if (options.trimEditor) body = body.replace('code = value;', 'code = value.trimEnd();');
    if (options.navigationLink) body = body.replace('<body>', '<body><nav><a class="nav-link" data-i18n="top.nav.status" href="/status">提交</a></nav>');
    if (options.statusLink) body = body.replace('<body>', '<body><a href="/status">Submit</a>');
    if (options.noProblemSubmit || options.submitDelay) body = body.replace('id="problem-submit"', 'id="problem-submit" hidden');
    if (options.submitDelay) body = body.replace('</script>', `setTimeout(() => { document.getElementById('problem-submit').hidden = false; }, ${options.submitDelay});</script>`);
    if (options.customSubmit) body = body.replace('<button id="problem-submit">Submit</button>', '<button id="custom-submit"><span data-i18n="button.submit">Submit Solution</span></button>')
      .replace("document.getElementById('problem-submit').onclick", "document.getElementById('custom-submit').onclick");
    if (options.leavesProblem) body = body.replace("document.getElementById('problem-submit').onclick = () => { const modal = document.getElementById('submitModal'); modal.hidden = false; modal.classList.add('show'); };",
      "document.getElementById('problem-submit').onclick = () => { location.href = '/status'; };");
    if (options.ambiguousSubmit) body = body.replace('<body>', '<body><button id="second-submit">提交</button>');
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
  });
  return { context, page, submissions, navigationPaths, queries: () => queries };
}
const payload = { problem: 'UVA-100', source: '#include <iostream>\nint main(){ std::cout << 7; }\n', languageQuery: 'C++17' };
test('from hidden browser: opens native form, submits once, follows exact ID from Judging to AC', async () => {
  const env = await setup();
  try {
    const submission = await client.submitOnce(env.page, payload);
    assert.equal(submission.runId, 5678);
    assert.deepEqual(env.submissions, [{ source: payload.source, language: '5', open: '0' }]);
    const statuses = [];
    const result = await client.waitForResult(env.page, payload.problem, submission.runId, { interval: 1, attempts: 3, onResult: item => statuses.push(item.verdict) });
    assert.deepEqual(statuses, ['Judging', 'AC']); assert.equal(result.final, true);
    assert.equal(env.submissions.length, 1); assert.equal(env.queries(), 2);
  } finally { await env.context.close(); }
});
test('Windows CRLF is accepted after editor line normalization and sends exactly one private submission', async () => {
  const env = await setup({ editorNormalizes: true });
  try {
    const source = payload.source.replace(/\n/g, '\r\n');
    const result = await client.submitOnce(env.page, { ...payload, source });
    assert.equal(result.runId, 5678);
    assert.deepEqual(env.submissions, [{ source: payload.source, language: '5', open: '0' }]);
  } finally { await env.context.close(); }
});
test('mixed CRLF, LF and CR preserve BOM, tabs, Unicode and final blank lines', async () => {
  const env = await setup({ editorReturnsCrLf: true });
  try {
    const source = '\ufeff// 中文註解\r\n#include <iostream>\nint main(){\r\tstd::cout << 7;\r\n}\r\n\r\n';
    await client.submitOnce(env.page, { ...payload, source });
    assert.equal(env.submissions.length, 1);
    assert.equal(env.submissions[0].source, source.replace(/\r\n?/g, '\n'));
    assert.ok(env.submissions[0].source.endsWith('\n\n'));
  } finally { await env.context.close(); }
});
test('changed program content still stops before submission or the beforeClick callback', async () => {
  const env = await setup({ corruptEditor: true });
  try {
    let clicked = false;
    await assert.rejects(client.submitOnce(env.page, { ...payload, beforeClick: async () => { clicked = true; } }), /填入程式不符.*統一換行後/);
    assert.equal(clicked, false);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('editor removal of trailing whitespace is a real mismatch and is never ignored', async () => {
  const env = await setup({ trimEditor: true });
  try {
    await assert.rejects(client.submitOnce(env.page, { ...payload, source: payload.source + '\t\r\n' }), /填入程式不符/);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('duplicate code saves the structured reason and native form message before reporting rejection, without retrying', async () => {
  const env = await setup({ reply: { error: { i18nKey: 'submit.error.duplicate_code', i18nArgs: { token: 'DO_NOT_INCLUDE' } }, token: 'DO_NOT_INCLUDE' }, formError: '這份代碼之前已經提交過。' });
  try {
    let diagnostic;
    await assert.rejects(client.submitOnce(env.page, { ...payload, onDiagnostic: async value => { diagnostic = value; } }), error => {
      assert.equal(error.submissionRejected, true);
      assert.match(error.message, /這份程式碼之前已經提交過/);
      assert.match(error.message, /表單提示：這份代碼之前已經提交過/);
      return true;
    });
    assert.equal(diagnostic.httpStatus, 200);
    assert.equal(diagnostic.response.errorKey, 'submit.error.duplicate_code');
    assert.equal(diagnostic.formError, '這份代碼之前已經提交過。');
    assert.ok(!JSON.stringify(diagnostic).includes('DO_NOT_INCLUDE'));
    assert.equal(env.submissions.length, 1);
    assert.equal(env.queries(), 0);
  } finally { await env.context.close(); }
});
test('a JSON response without an ID or rejection stays uncertain and saves only permitted metadata', async () => {
  const env = await setup({ reply: { success: true, token: 'DO_NOT_INCLUDE', source: 'DO_NOT_INCLUDE' } });
  try {
    let diagnostic;
    await assert.rejects(client.submitOnce(env.page, { ...payload, onDiagnostic: async value => { diagnostic = value; } }), error => {
      assert.equal(error.submissionRejected, false);
      assert.match(error.message, /結果不確定/);
      return true;
    });
    assert.deepEqual(diagnostic.response.fields, ['success']);
    assert.equal(diagnostic.formError, null);
    assert.ok(!JSON.stringify(diagnostic).includes('DO_NOT_INCLUDE'));
    assert.equal(env.submissions.length, 1);
  } finally { await env.context.close(); }
});
test('an HTTP server failure with an error object is not proof of rejection and never retries', async () => {
  const env = await setup({ httpStatus: 503, reply: { error: { text: 'Service unavailable' } } });
  try {
    let diagnostic;
    await assert.rejects(client.submitOnce(env.page, { ...payload, onDiagnostic: async value => { diagnostic = value; } }), error => {
      assert.equal(error.submissionRejected, false);
      assert.match(error.message, /HTTP 503/);
      return true;
    });
    assert.equal(diagnostic.httpStatus, 503);
    assert.equal(env.submissions.length, 1);
  } finally { await env.context.close(); }
});
test('WA is returned as final WA', async () => {
  const env = await setup({ verdict: 'Wrong Answer' });
  try {
    const { runId } = await client.submitOnce(env.page, payload);
    const result = await client.waitForResult(env.page, payload.problem, runId, { interval: 1, attempts: 3 });
    assert.equal(result.verdict, 'WA'); assert.equal(result.final, true);
  } finally { await env.context.close(); }
});
test('expired login stops without submitting', async () => {
  const env = await setup({ loggedOut: true });
  try { await assert.rejects(client.submitOnce(env.page, payload), /登入已失效/); assert.equal(env.submissions.length, 0); }
  finally { await env.context.close(); }
});
test('human verification stops after exactly one native attempt', async () => {
  const env = await setup({ reply: { challenge: true } });
  try { await assert.rejects(client.submitOnce(env.page, payload), /真人驗證/); assert.equal(env.submissions.length, 1); assert.equal(env.queries(), 0); }
  finally { await env.context.close(); }
});
test('ambiguous language blocks before submission', async () => {
  assert.throws(() => client.chooseLanguage([{ label: 'GNU C++17', value: '5' }, { label: 'Clang C++17', value: '6' }], 'C++17'), /唯一匹配/);
  const env = await setup();
  try { await assert.rejects(client.submitOnce(env.page, { ...payload, languageQuery: 'C++99' }), /唯一匹配/); assert.equal(env.submissions.length, 0); }
  finally { await env.context.close(); }
});
test('wrong result ID cannot become this submission AC', async () => {
  const env = await setup({ wrongId: true });
  try { const { runId } = await client.submitOnce(env.page, payload); await assert.rejects(client.queryResult(env.page, payload.problem, runId), /編號不符/); }
  finally { await env.context.close(); }
});
test('HTTP failure never retries', async () => {
  const env = await setup({ httpStatus: 403 });
  try { await assert.rejects(client.submitOnce(env.page, payload), /HTTP 403/); assert.equal(env.submissions.length, 1); }
  finally { await env.context.close(); }
});
test('polling exhaustion stays unfinished and does not resubmit', async () => {
  const env = await setup();
  try {
    const { runId } = await client.submitOnce(env.page, payload);
    const result = await client.waitForResult(env.page, payload.problem, runId, { attempts: 1 });
    assert.equal(result.final, false); assert.equal(result.verdict, 'Judging'); assert.equal(env.submissions.length, 1);
  } finally { await env.context.close(); }
});
test('login check rejects unexpected HTML rather than claiming valid or expired login', async () => {
  const env = await setup({ loginBody: '<html>Verification required</html>' });
  try {
    await env.page.goto('https://vjudge.net/');
    await assert.rejects(client.assertLoggedIn(env.page), /非預期格式/);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('login request has a bounded timeout and reports it without submitting', async () => {
  const env = await setup({ loginDelay: 500 });
  try {
    await env.page.goto('https://vjudge.net/');
    await assert.rejects(client.assertLoggedIn(env.page, { timeoutMs: 100 }), /登入檢查逾時/);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('empty C++ language list fails visibly rather than printing an empty successful result', async () => {
  const env = await setup({ noLanguages: true });
  try {
    await assert.rejects(client.openForm(env.page, 'UVA-100', { formTimeout: 150 }), /未載入可用的 C\+\+ 語言/);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('language query identifies successful login and completion through progress messages', async () => {
  const env = await setup();
  try {
    const progress = [];
    const form = await client.openForm(env.page, 'UVA-100', { onProgress: text => progress.push(text) });
    assert.deepEqual(form.languages, [{ value: '5', label: 'GNU C++17' }]);
    assert.ok(progress.some(text => text.includes('登入檢查通過')));
    assert.ok(progress.some(text => text.includes('已取得 1 個')));
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('status navigation alone is never clicked and yields structural metadata on the original problem', async () => {
  const env = await setup({ navigationLink: true, noProblemSubmit: true });
  try {
    let metadata;
    await assert.rejects(client.openForm(env.page, 'UVA-100', { formTimeout: 150, onSnapshot: value => { metadata = value; } }), /沒有找到題目專用提交按鈕/);
    assert.equal(metadata.modalVisible, false);
    assert.equal(metadata.pagePath, '/problem/UVA-100');
    assert.ok(metadata.submitControls.some(item => item.i18n === 'top.nav.status' && item.hrefPath === '/status' && item.inNavigation));
    assert.deepEqual(env.navigationPaths, ['/problem/UVA-100']);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('problem Submit Solution button is opened while the Chinese status navigation is ignored', async () => {
  const env = await setup({ navigationLink: true, customSubmit: true });
  try {
    const form = await client.openForm(env.page, 'UVA-100');
    assert.deepEqual(form.languages, [{ value: '5', label: 'GNU C++17' }]);
    assert.deepEqual(env.navigationPaths, ['/problem/UVA-100']);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('waits for a delayed problem action instead of clicking the immediately available status navigation', async () => {
  const env = await setup({ navigationLink: true, submitDelay: 200 });
  try {
    const form = await client.openForm(env.page, 'UVA-100', { formTimeout: 1500 });
    assert.equal(form.languages.length, 1);
    assert.deepEqual(env.navigationPaths, ['/problem/UVA-100']);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('a status link outside the navigation is also excluded by its destination', async () => {
  const env = await setup({ statusLink: true, noProblemSubmit: true });
  try {
    await assert.rejects(client.openForm(env.page, 'UVA-100', { formTimeout: 150 }), /沒有找到題目專用提交按鈕/);
    assert.deepEqual(env.navigationPaths, ['/problem/UVA-100']);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('an apparent problem button that navigates away fails explicitly without a submission', async () => {
  const env = await setup({ leavesProblem: true });
  try {
    let metadata;
    await assert.rejects(client.openForm(env.page, 'UVA-100', { formTimeout: 1500, onSnapshot: value => { metadata = value; } }), /點擊後離開原題目頁/);
    assert.equal(metadata.pagePath, '/status');
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('ambiguous problem actions stop before clicking either button', async () => {
  const env = await setup({ ambiguousSubmit: true });
  try {
    await assert.rejects(client.openForm(env.page, 'UVA-100', { formTimeout: 150 }), /找到多個題目提交按鈕/);
    assert.deepEqual(env.navigationPaths, ['/problem/UVA-100']);
    assert.equal(await env.page.locator('#submitModal').isVisible(), false);
    assert.equal(env.submissions.length, 0);
  } finally { await env.context.close(); }
});
test('structural metadata omits source, passwords, hidden token values, and URL query strings', async () => {
  const env = await setup();
  try {
    await env.page.goto('https://vjudge.net/problem/UVA-100?token=DO_NOT_INCLUDE');
    await env.page.evaluate(() => {
      const password = document.createElement('input'); password.type = 'password'; password.value = 'DO_NOT_INCLUDE';
      const token = document.createElement('input'); token.type = 'hidden'; token.name = 'token'; token.value = 'DO_NOT_INCLUDE';
      const link = document.createElement('a'); link.href = '/status?token=DO_NOT_INCLUDE'; link.textContent = 'Submit';
      document.body.append(password, token, link); document.querySelector('textarea').value = 'DO_NOT_INCLUDE';
    });
    const metadata = await client.captureFormMetadata(env.page);
    assert.equal(metadata.pagePath, '/problem/UVA-100');
    assert.ok(metadata.submitControls.some(item => item.hrefPath === '/status'));
    assert.ok(!JSON.stringify(metadata).includes('DO_NOT_INCLUDE'));
  } finally { await env.context.close(); }
});

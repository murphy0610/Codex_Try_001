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
  let queries = 0;
  await page.route('https://vjudge.net/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname === '/user/checkLogInStatus') return route.fulfill({ body: options.loggedOut ? '0' : '1' });
    if (pathname === '/problem/submit/UVA-100') {
      submissions.push(Object.fromEntries(new URLSearchParams(request.postData())));
      return route.fulfill({ status: options.httpStatus || 200, contentType: 'application/json', body: JSON.stringify(options.reply || { runId: 5678 }) });
    }
    if (pathname === '/solution/data/5678') {
      queries++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ runId: options.wrongId ? 999 : 5678, oj: 'UVA', probNum: '100',
        status: queries === 1 ? 'Judging' : options.verdict || 'Accepted', processing: queries === 1 }) });
    }
    return route.fulfill({ contentType: 'text/html', body: fixture });
  });
  return { context, page, submissions, queries: () => queries };
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

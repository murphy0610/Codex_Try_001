const core = require('../vjudge-submit/core.js');

async function assertLoggedIn(page) {
  const loggedIn = await page.evaluate(async () => {
    const response = await fetch('/user/checkLogInStatus', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) return false;
    const text = (await response.text()).trim();
    return text === '1' || text === 'true';
  });
  if (!loggedIn) throw new Error('登入已失效或網站要求驗證。請從 VS Code 執行「登入 VJudge」，手動完成後再試。');
}

async function openForm(page, problem) {
  const expected = core.problemFromUrl(`https://vjudge.net/problem/${problem}`);
  await page.goto(`https://vjudge.net/problem/${expected}`, { waitUntil: 'domcontentloaded' });
  await assertLoggedIn(page);
  if (core.problemFromUrl(page.url()) !== expected) throw new Error('題目頁面不符。');
  const modal = page.locator('#submitModal.show');
  if (!await modal.count()) {
    const candidates = page.locator('#problem-submit, #submit, a.submit, button.submit, [data-i18n="button.submit"], [data-i18n="problem.submit"]');
    let opened = false;
    for (const candidate of await candidates.all()) {
      if (await candidate.isVisible()) { await candidate.click(); opened = true; break; }
    }
    if (!opened) {
      const buttons = page.getByRole('button', { name: /^(submit|提交|提交代码|提交程式碼|送出)$/i });
      const links = page.getByRole('link', { name: /^(submit|提交|提交代码|提交程式碼|送出)$/i });
      const button = buttons.or(links);
      if (await button.count() !== 1) throw new Error('無法唯一識別網站提交按鈕；需要更新助手以配合網站，未送出程式。');
      await button.click();
    }
  }
  await modal.waitFor({ state: 'visible', timeout: 15000 });
  const info = await modal.evaluate(element => {
    const problem = element.querySelector('.problem-origin')?.textContent.replace(/\s/g, '');
    const languages = [...(element.querySelector('select[name=language]')?.options || [])]
      .filter(option => option.value && !option.disabled && /(c\+\+|g\+\+|clang\+\+)/i.test(option.textContent))
      .map(option => ({ value: option.value, label: option.textContent.trim() }));
    return { problem, languages };
  });
  if (info.problem !== expected) throw new Error('原生提交表單的題號不符，已停止。');
  return { modal, ...info };
}

function chooseLanguage(languages, query) {
  if (!query?.trim()) throw new Error('必須指定 C++ 語言名稱；助手不猜測語言編號。');
  const exact = languages.filter(item => item.label.toLowerCase() === query.toLowerCase());
  const matches = exact.length ? exact : languages.filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
  if (matches.length !== 1) throw new Error(`語言「${query}」沒有唯一匹配。可用語言：${languages.map(item => item.label).join('、')}`);
  return matches[0];
}

async function submitOnce(page, { problem, source, languageQuery, beforeClick = async () => {} }) {
  if (typeof source !== 'string' || !source.trim() || source.length > 200000) throw new Error('程式為空或超過 200,000 字元。');
  const form = await openForm(page, problem);
  const language = chooseLanguage(form.languages, languageQuery);
  await form.modal.evaluate((element, payload) => {
    const select = element.querySelector('select[name=language]');
    const editor = element.querySelector('.CodeMirror')?.CodeMirror;
    const method = element.querySelector('input[name=submitterType]:checked')?.value;
    const privacy = element.querySelector('input[name=open][value="0"]');
    if (!select || !editor?.setValue || !editor?.getValue || !editor?.save || !privacy || !['0', '1'].includes(method)) {
      throw new Error('网站表單或提交方式不符。助手不支援存檔模式。');
    }
    select.value = payload.language;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    editor.setValue(payload.source); editor.save();
    if (editor.getValue() !== payload.source) throw new Error('填入程式不符，已停止。');
    privacy.click();
  }, { source, language: language.value });
  const button = form.modal.locator('#btn-submit');
  if (!await button.isEnabled()) throw new Error('網站提交按鈕停用；未送出。');
  await beforeClick(language.label);
  // Arm capture before clicking, and match the actual native request, never a status-list row.
  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === 'https://vjudge.net' && url.pathname === `/problem/submit/${problem}` && response.request().method() === 'POST';
  }, { timeout: 30000 });
  responsePromise.catch(() => {});
  await button.click();
  let response;
  try { response = await responsePromise; }
  catch { throw new Error('沒有收到提交編號。可能是驗證、表單錯誤或超時；請用「登入 VJudge」查看網站結果。勿直接重送。'); }
  if (!response.ok()) throw new Error(`提交收到 HTTP ${response.status()}。結果不確定；請先查看網站，不會自動重送。`);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('提交回應不是預期資料，結果不確定；請先查看網站，不會自動重送。'); }
  return { runId: core.submissionReply(data), language: language.label };
}

async function queryResult(page, problem, runId) {
  core.problemFromUrl(`https://vjudge.net/problem/${problem}`);
  core.positiveId(runId);
  const data = await page.evaluate(async id => {
    const response = await fetch(`/solution/data/${id}`, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'showCode=false', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`查詢收到 HTTP ${response.status()}；不會重送程式。`);
    return response.json();
  }, Number(runId));
  return core.resultFromData(data, runId, problem);
}

async function waitForResult(page, problem, runId, { attempts = 25, interval = 5000, onResult = () => {} } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await queryResult(page, problem, runId);
    await onResult(last);
    if (last.final) return last;
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, interval));
  }
  return last;
}
module.exports = { assertLoggedIn, openForm, chooseLanguage, submitOnce, queryResult, waitForResult };

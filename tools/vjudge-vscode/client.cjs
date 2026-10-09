const core = require('../vjudge-submit/core.js');

async function assertLoggedIn(page, { timeoutMs = 15000 } = {}) {
  const result = await page.evaluate(async timeout => {
    try {
      const response = await fetch('/user/checkLogInStatus', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(timeout) });
      if (!response.ok) return { error: `登入檢查收到 HTTP ${response.status()}；尚未確認登入有效。` };
      const text = (await response.text()).trim();
      if (text === '1' || text === 'true') return { loggedIn: true };
      if (text === '0' || text === 'false') return { loggedIn: false };
      return { error: '登入檢查回傳非預期格式，可能是驗證頁或網站改版；尚未確認登入有效。' };
    } catch (error) {
      return { error: ['TimeoutError', 'AbortError'].includes(error.name)
        ? '登入檢查逾時；請確認網路及網站驗證狀態，不要把此結果當成登入成功。'
        : '登入檢查網路請求失敗；尚未確認登入有效。' };
    }
  }, timeoutMs);
  if (result.error) throw new Error(result.error);
  if (!result.loggedIn) throw new Error('登入已失效或網站要求驗證。請從 VS Code 執行「登入 VJudge」，手動完成後再試。');
}

async function openNativeForm(page, problem, { onProgress = () => {}, formTimeout = 15000 } = {}) {
  const expected = core.problemFromUrl(`https://vjudge.net/problem/${problem}`);
  onProgress(`正在開啟 ${expected} 題目頁。`);
  await page.goto(`https://vjudge.net/problem/${expected}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  onProgress('正在檢查保存的登入是否有效。');
  await assertLoggedIn(page);
  onProgress('登入檢查通過，正在讀取原生提交表單。');
  if (core.problemFromUrl(page.url()) !== expected) throw new Error('題目頁面不符。');
  const modal = page.locator('#submitModal.show');
  if (!await modal.count()) {
    onProgress('正在等待題目專用的提交按鈕；排除提交紀錄導覽連結。');
    let handle;
    try {
      handle = await page.waitForFunction(expectedPath => {
        if (location.origin !== 'https://vjudge.net' || location.pathname !== expectedPath) throw new Error('尋找提交按鈕時已離開原題目頁。');
        const known = '#problem-submit, #submit, a.submit, button.submit, [data-i18n="button.submit"], [data-i18n="problem.submit"]';
        const elements = new Set([...document.querySelectorAll(`${known}, a, button, [role=button]`)]
          .map(element => element.closest('a,button,[role=button]') || element));
        const candidates = [...elements].filter(element => {
          if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden' || element.disabled) return false;
          if (element.closest('nav,.navbar,[role=navigation],#top-nav') || element.classList.contains('nav-link') ||
              (element.getAttribute('data-i18n') || '').startsWith('top.nav.')) return false;
          const label = element.textContent.trim() || element.getAttribute('aria-label') || element.getAttribute('title') || '';
          if (!element.matches(known) && !/submit|提交|送出/i.test(label)) return false;
          if (element.tagName === 'A') {
            const href = element.getAttribute('href') || '';
            if (href && !href.toLowerCase().startsWith('javascript:')) {
              const target = new URL(href, location.href);
              if (target.origin !== location.origin || target.pathname !== expectedPath) return false;
            }
          }
          return true;
        });
        if (candidates.length > 1) throw new Error('找到多個題目提交按鈕，無法唯一識別；未點擊。');
        return candidates.length === 1 ? candidates[0] : false;
      }, `/problem/${expected}`, { timeout: formTimeout });
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('沒有找到題目專用提交按鈕；導覽列的「提交」是紀錄頁，不會點擊。請提供本次診斷 form。');
      throw error;
    }
    const button = handle.asElement();
    if (!button) throw new Error('無法取得題目提交按鈕，已停止。');
    onProgress('找到題目提交按鈕，正在開啟表單。');
    try { await button.click({ timeout: formTimeout }); }
    finally { await handle.dispose(); }
  }
  onProgress('正在等待提交表單顯示。');
  await page.waitForFunction(expectedPath => {
    if (location.origin !== 'https://vjudge.net' || location.pathname !== expectedPath) {
      throw new Error('點擊後離開原題目頁，沒有開啟正確提交表單；已停止。');
    }
    const modal = document.querySelector('#submitModal.show');
    return Boolean(modal?.getClientRects().length) && getComputedStyle(modal).visibility !== 'hidden';
  }, `/problem/${expected}`, { timeout: formTimeout });
  onProgress('提交表單已顯示，正在等待 C++ 語言選項。');
  try {
    await page.waitForFunction(() => {
      const select = document.querySelector('#submitModal.show select[name=language]');
      return [...(select?.options || [])].some(option => option.value && !option.disabled && /(c\+\+|g\+\+|clang\+\+)/i.test(option.textContent));
    }, null, { timeout: formTimeout });
  } catch { throw new Error('提交表單未載入可用的 C++ 語言選項；查詢失敗，未提交程式。'); }
  const info = await modal.evaluate(element => {
    const problem = element.querySelector('.problem-origin')?.textContent.replace(/\s/g, '');
    const languages = [...(element.querySelector('select[name=language]')?.options || [])]
      .filter(option => option.value && !option.disabled && /(c\+\+|g\+\+|clang\+\+)/i.test(option.textContent))
      .map(option => ({ value: option.value, label: option.textContent.trim() }));
    return { problem, languages };
  });
  if (info.problem !== expected) throw new Error('原生提交表單的題號不符，已停止。');
  if (!info.languages.length) throw new Error('沒有取得 C++ 語言清單；查詢失敗。');
  onProgress(`已取得 ${info.languages.length} 個 C++ 語言選項。`);
  return { modal, ...info };
}

async function captureFormMetadata(page) {
  if (page.isClosed()) return { pageClosed: true };
  return page.evaluate(() => {
    const visible = element => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
    const label = element => (element.textContent.trim() || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const modal = document.querySelector('#submitModal');
    return {
      pageOrigin: location.origin, pagePath: location.pathname, readyState: document.readyState,
      submitControls: [...document.querySelectorAll('a,button,[role=button]')]
        .filter(element => visible(element) && /submit|提交|送出/i.test(label(element)))
        .slice(0, 20).map(element => {
          const href = element.getAttribute('href');
          let hrefPath = null;
          if (href && !href.toLowerCase().startsWith('javascript:')) {
            try { hrefPath = new URL(href, location.href).pathname; } catch { /* Omit malformed links. */ }
          }
          return { tag: element.tagName, id: element.id.slice(0, 80),
            className: (element.getAttribute('class') || '').slice(0, 120), label: label(element),
            i18n: (element.getAttribute('data-i18n') || '').slice(0, 100), hrefPath,
            inNavigation: Boolean(element.closest('nav,.navbar,[role=navigation],#top-nav')) };
        }),
      modalExists: Boolean(modal), modalVisible: modal ? visible(modal) : false,
      modalProblem: modal?.querySelector('.problem-origin')?.textContent.trim().slice(0, 80) || null,
      languageSelectExists: Boolean(modal?.querySelector('select[name=language]')),
      languageLabels: [...(modal?.querySelector('select[name=language]')?.options || [])]
        .slice(0, 60).map(option => option.textContent.trim().slice(0, 100)),
      codeMirrorExists: Boolean(modal?.querySelector('.CodeMirror'))
    };
  });
}

async function openForm(page, problem, options = {}) {
  const failedScripts = [];
  let pageErrorCount = 0;
  const onPageError = () => { pageErrorCount++; };
  const onRequestFailed = request => {
    const url = new URL(request.url());
    if (url.origin === 'https://vjudge.net' && url.pathname.startsWith('/static/bundle/') && failedScripts.length < 20) {
      failedScripts.push({ path: url.pathname, error: request.failure()?.errorText || 'unknown' });
    }
  };
  page.on('pageerror', onPageError); page.on('requestfailed', onRequestFailed);
  try { return await openNativeForm(page, problem, options); }
  catch (error) {
    if (options.onSnapshot) {
      let snapshot;
      try { snapshot = await captureFormMetadata(page); }
      catch { snapshot = { pageMetadataUnavailable: true }; }
      try { options.onSnapshot({ ...snapshot, pageErrorCount, failedScripts }); }
      catch { /* Diagnostics must not replace the original failure. */ }
    }
    throw error;
  } finally { page.off('pageerror', onPageError); page.off('requestfailed', onRequestFailed); }
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
    // CodeMirror splits CRLF/CR into lines and normally joins them with LF.
    // Normalize only line endings; retain every other character and final newline.
    const source = payload.source.replace(/\r\n?/g, '\n');
    editor.setValue(source); editor.save();
    const actual = editor.getValue('\n').replace(/\r\n?/g, '\n');
    if (actual !== source) throw new Error(`填入程式不符（統一換行後，預期 ${source.length} 字元、讀回 ${actual.length} 字元），已停止。`);
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
module.exports = { assertLoggedIn, openForm, chooseLanguage, submitOnce, queryResult, waitForResult, captureFormMetadata };

const crypto = require('node:crypto');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function renderHtml({ webviewSource, scriptUri, styleUri, configuration, problem, text, notice = '' }) {
  const nonce = crypto.randomBytes(24).toString('base64');
  const config = JSON.stringify(configuration).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const title = problem ? `${problem.id} — ${problem.title}` : '正在載入題目';
  const controls = problem ? `<div class="actions">
    <button data-command="openCode">開啟我的程式</button>
    <button data-command="test">測試（C++11）</button>
    <button data-command="languages">查詢提交語言</button>
    <button data-command="submit">提交這題</button>
  </div>` : '';
  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${escapeHtml(webviewSource)}; style-src ${escapeHtml(webviewSource)} 'unsafe-inline'; img-src ${escapeHtml(webviewSource)} data: blob:; font-src ${escapeHtml(webviewSource)} data:; connect-src ${escapeHtml(webviewSource)}; worker-src ${escapeHtml(webviewSource)} blob:;">
<link rel="stylesheet" href="${escapeHtml(styleUri)}"><title>${escapeHtml(title)}</title></head>
<body><header><h1>${escapeHtml(title)}</h1>${problem ? `<p>${escapeHtml(problem.category)} · 題單：VJudge 文章 2679 · 原題：UVA 官方 PDF</p>` : ''}${controls}
<p id="notice" role="status">${escapeHtml(notice)}</p>
${problem ? '<p class="help">右邊寫自己的 C++，旁邊的 Codex 可以解釋題意或用法。範例測資需要另外建立；選題不會提交解答。</p>' : ''}</header>
${problem ? `<div class="reader-controls"><button id="showPdf">原始題目（含圖表）</button><button id="showText">文字版（方便複製）</button><label>大小 <select id="zoom"><option value="fit" selected>符合欄寬</option><option value="0.8">80%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label></div>
<p id="pdfStatus" role="status">正在顯示原始 PDF…</p><main id="pdfPages" aria-label="原始題目 PDF"></main>
<section id="textVersion" hidden><p>這是原題文字擷取，並非中文翻譯。圖形、表格、公式請對照原始題目。</p><pre>${escapeHtml(text || '')}</pre></section>` : ''}
<script nonce="${nonce}" id="configuration" type="application/json">${config}</script>
<script nonce="${nonce}" type="module" src="${escapeHtml(scriptUri)}"></script></body></html>`;
}

module.exports = { escapeHtml, renderHtml };

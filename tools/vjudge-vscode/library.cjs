const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { request } = require('playwright-core');

const ARTICLE = 'https://vjudge.net/article/2679';
const libraryPath = root => path.join(root, '.cpe-vjudge', 'library', '2679');

function decodeEntities(text) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()];
    return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  });
}

function parseWorkbook(html) {
  const match = html.match(/<textarea\b[^>]*\bname\s*=\s*["']dataJson["'][^>]*>([\s\S]*?)<\/textarea>/i);
  if (!match) throw new Error('找不到文章 2679 的題單資料；可能需要登入或網站格式已變更。');
  const data = JSON.parse(decodeEntities(match[1]));
  if (Number(data.id) !== 2679 || !data.isWorkbook || typeof data.content !== 'string') {
    throw new Error('回傳的內容不是指定的題單文章 2679。');
  }
  const brief = typeof data.workbook?.problemsBrief === 'string'
    ? JSON.parse(data.workbook.problemsBrief) : data.workbook?.problemsBrief;
  if (!brief || !Object.keys(brief).length) throw new Error('題單沒有題目。');
  const problems = [], seen = new Set();
  let category = '其他';
  for (const line of data.content.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[problem:([^\]]+)\]/g)];
    if (!tags.length) {
      if (line.trim() && !/^\s*(?:>|\d+[.)]|\[|https?:)/.test(line)) category = line.trim();
      continue;
    }
    for (const [, id] of tags) {
      if (!/^UVA-[1-9]\d*$/.test(id)) throw new Error(`題單包含尚未支援的題號：${id}`);
      if (!Array.isArray(brief[id]) || typeof brief[id][0] !== 'string') throw new Error(`題單缺少標題：${id}`);
      if (seen.has(id)) continue;
      seen.add(id);
      const number = Number(id.slice(4));
      problems.push({ id, title: brief[id][0], category, order: problems.length + 1,
        cpeId: line.match(/\bCPE\d+\b/)?.[0] || null,
        url: `https://vjudge.net/problem/${id}`,
        statementUrl: `https://onlinejudge.org/external/${Math.floor(number / 100)}/${number}.pdf` });
    }
  }
  if (!problems.length || Object.keys(brief).some(id => !seen.has(id))) {
    throw new Error('文章內文與題目清單不一致，已停止，避免漏下載。');
  }
  return { articleId: 2679, source: ARTICLE, title: data.title, problems };
}

// Keep columns and indentation where possible. PDF diagrams/formulas remain in statement.pdf.
function layoutText(items) {
  const rows = [];
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const x = item.transform[4], y = item.transform[5];
    let row = rows.find(candidate => Math.abs(candidate.y - y) < 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ ...item, x });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    row.items.sort((a, b) => a.x - b.x);
    let line = '', end = null;
    for (const item of row.items) {
      if (end !== null) {
        const gap = item.x - end;
        const unit = Math.max(3, Math.abs(item.transform[0]) * 0.45);
        if (gap > 1.5) line += ' '.repeat(Math.min(80, Math.max(1, Math.round(gap / unit))));
      }
      line += item.str;
      end = item.x + item.width;
    }
    return line.trimEnd();
  }).join('\n');
}

async function pdfText(bytes) {
  // Electron's extension host is not classified as Node by PDF.js. Use the
  // installed Node executable for extraction instead of changing global DOM state.
  if (process.versions.electron) return pdfTextWithNode(bytes);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false });
  try {
    const document = await task.promise, pages = [];
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      pages.push(layoutText((await page.getTextContent()).items));
      page.cleanup();
    }
    const text = pages.join('\n\n');
    if (text.replace(/\s/g, '').length < 100) throw new Error('PDF 可讀文字太少，不能當成完整題目下載成功。');
    return { text, pages: document.numPages };
  } finally { await task.destroy(); }
}

async function pdfTextWithNode(bytes) {
  if (bytes.length > 10 * 1024 * 1024) throw new Error('PDF 超出 10 MB 上限。');
  return new Promise((resolve, reject) => {
    const worker = spawn('node', [path.join(__dirname, 'pdf-text-worker.cjs')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [], errors = [];
    let length = 0, errorLength = 0, finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => {
      worker.kill(); finish(new Error('題目 PDF 文字擷取超過 30 秒，已停止。'));
    }, 30000);
    worker.once('error', error => finish(new Error(error.code === 'ENOENT'
      ? '找不到本機 Node.js。請本機 Codex 檢查安裝與 PATH，再重新開啟 VS Code。' : `PDF 文字擷取程序無法啟動：${error.message}`)));
    worker.stdin.on('error', () => { /* The worker close/error event carries the actionable failure. */ });
    worker.stdout.on('data', chunk => {
      length += chunk.length;
      if (length > 16 * 1024 * 1024) { worker.kill(); finish(new Error('PDF 文字擷取結果超出上限。')); }
      else chunks.push(chunk);
    });
    worker.stderr.on('data', chunk => { errorLength += chunk.length; if (errorLength <= 4096) errors.push(chunk); });
    worker.once('close', code => {
      if (finished) return;
      if (code !== 0) return finish(new Error(`PDF 文字擷取失敗：${Buffer.concat(errors).toString('utf8').trim() || `退出碼 ${code}`}`));
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (typeof result.text !== 'string' || !Number.isInteger(result.pages) || result.pages < 1) throw new Error('格式錯誤');
        finish(null, result);
      } catch { finish(new Error('PDF 文字擷取程序沒有回傳有效結果。')); }
    });
    worker.stdin.end(bytes);
  });
}

async function createFetcher() {
  // Only public article/PDF requests. Never load the user's saved login session here.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const context = await request.newContext({ timeout: 30000, ...(proxy ? { proxy: { server: proxy } } : {}),
    extraHTTPHeaders: { 'User-Agent': 'CPE-VSCode-Practice/0.1' } });
  return {
    async fetch(url) {
      if (url !== ARTICLE && !/^https:\/\/onlinejudge\.org\/external\/\d+\/\d+\.pdf$/.test(url)) throw new Error('不支援的題目來源。');
      const response = await context.get(url);
      try {
        if (!response.ok()) throw new Error(`下載失敗：HTTP ${response.status()}`);
        const finalUrl = new URL(response.url());
        if (!['vjudge.net', 'onlinejudge.org', 'www.onlinejudge.org'].includes(finalUrl.hostname)) throw new Error('下載被重新導向到其他網站。');
        const body = await response.body();
        if (body.length > 10 * 1024 * 1024) throw new Error('題目檔案超出 10 MB 上限。');
        return body;
      } finally { await response.dispose(); }
    },
    close: () => context.dispose()
  };
}

async function writeNew(file, content) {
  try { await fs.writeFile(file, content, { flag: 'wx' }); return true; }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}

function validateProblem(problem) {
  if (!problem || !/^UVA-[1-9]\d*$/.test(problem.id) || typeof problem.title !== 'string' || typeof problem.category !== 'string') {
    throw new Error('題目資料格式錯誤，已停止載入。');
  }
  const number = Number(problem.id.slice(4));
  const statementUrl = `https://onlinejudge.org/external/${Math.floor(number / 100)}/${number}.pdf`;
  if (!Number.isSafeInteger(number) || problem.statementUrl !== statementUrl || problem.url !== `https://vjudge.net/problem/${problem.id}`) {
    throw new Error('題目來源與題號不一致，已停止載入。');
  }
  return problem;
}

function validateWorkbook(workbook) {
  if (!workbook || workbook.articleId !== 2679 || workbook.source !== ARTICLE || typeof workbook.title !== 'string' ||
    !Array.isArray(workbook.problems) || !workbook.problems.length || typeof workbook.checkedAt !== 'string') {
    throw new Error('保存的題單格式不正確，請重新整理題單。');
  }
  const seen = new Set();
  for (const problem of workbook.problems) {
    validateProblem(problem);
    if (seen.has(problem.id)) throw new Error('保存的題單包含重複題號。');
    seen.add(problem.id);
  }
  return workbook;
}

async function cachedWorkbook(directory) {
  const files = (await fs.readdir(directory)).filter(name => /^workbook-\d+-[a-f0-9]+\.json$/.test(name)).sort().reverse();
  for (const file of files) {
    try { return validateWorkbook(JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))); }
    catch { /* Try the previous immutable cache if the newest one was interrupted. */ }
  }
  throw new Error('尚未保存可用的題單，請連線後重新整理。');
}

async function getWorkbook({ root = process.cwd(), fetchBytes, offline = false } = {}) {
  const directory = libraryPath(root);
  await fs.mkdir(directory, { recursive: true });
  let onlineError;
  if (!offline) {
    let workbook;
    try {
      workbook = parseWorkbook((await fetchBytes(ARTICLE)).toString('utf8'));
      workbook.checkedAt = new Date().toISOString();
      validateWorkbook(workbook);
    } catch (error) { onlineError = error; }
    if (workbook && !onlineError) {
      // Only metadata is saved here; no statement PDF is requested by opening the list.
      const file = path.join(directory, `workbook-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
      await writeNew(file, JSON.stringify(workbook, null, 2) + '\n');
      return { ...workbook, offlineCache: false };
    }
  }
  try {
    const workbook = await cachedWorkbook(directory);
    return { ...workbook, offlineCache: true,
      cacheWarning: offline ? '目前讀取本機保存的題單。' : `線上題單讀取失敗，改用本機保存的題單：${onlineError.message}` };
  } catch (error) {
    if (onlineError) throw new Error(`無法讀取文章 2679：${onlineError.message}；${error.message}`);
    throw error;
  }
}

const pendingProblems = new Map();
async function getProblem({ root = process.cwd(), problem, fetchBytes, extractText = pdfText } = {}) {
  validateProblem(problem);
  const key = path.join(path.resolve(root), problem.id);
  if (pendingProblems.has(key)) return pendingProblems.get(key);
  const action = (async () => {
    const directory = path.join(libraryPath(root), problem.id);
    await fs.mkdir(directory, { recursive: true });
    const pdfFile = path.join(directory, 'statement.pdf'), markdownFile = path.join(directory, '題目.md');
    let bytes, cached = true;
    try { bytes = await fs.readFile(pdfFile); }
    catch (error) { if (error.code !== 'ENOENT') throw error; cached = false; bytes = await fetchBytes(problem.statementUrl); }
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('題目回應不是 PDF，未保存為題目。');
    const extracted = await extractText(bytes);
    await writeNew(pdfFile, bytes);
    const created = await writeNew(markdownFile, questionMarkdown(problem, extracted.text));
    return { problem, pdfFile, markdownFile, text: extracted.text, pages: extracted.pages, cached,
      existingMarkdownPreserved: !created };
  })();
  pendingProblems.set(key, action);
  try { return await action; }
  finally { pendingProblems.delete(key); }
}

function questionMarkdown(problem, text) {
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));
  return `# ${problem.id} — ${problem.title}\n\n分類：${problem.category}\n\n` +
    `題單來源：[VJudge 文章 2679](${ARTICLE})\n\n題目原文來源：[UVA 官方 PDF](${problem.statementUrl})\n\n` +
    `以下是 PDF 的文字擷取，並非中文翻譯。圖形、表格、公式與版面請對照 [保存的原始 PDF](statement.pdf)。\n` +
    `文字內的 Sample Input / Sample Output 來自官方原題；本工具尚未把它們拆成可執行測資。\n\n` +
    `${fence}text\n${text}\n${fence}\n`;
}

function indexMarkdown(workbook) {
  let text = `# ${workbook.title}\n\n來源：[VJudge 文章 2679](${ARTICLE})；共 ${workbook.problems.length} 題，保留文章分類與出現順序。\n\n` +
    '在 VS Code 按 Ctrl+Shift+V 開啟這份文件的預覽，再點「閱讀題目」。\n\n' +
    '選題後可對旁邊的 Codex 說：「我要練習 UVA-10041。讀取本機題目，保留既有檔案，建立留白的 C++ 框架，從官方範例建立測資並核對；不要替我解題。」請換成你選的題號。\n\n';
  let category;
  for (const problem of workbook.problems) {
    if (category !== problem.category) { category = problem.category; text += `## ${category}\n\n`; }
    text += `- ${problem.order}. ${problem.id} ${problem.title} — ` +
      (['downloaded', 'cached'].includes(problem.download?.status)
        ? `[閱讀題目](${problem.id}/題目.md)`
        : `**下載失敗**（${problem.download?.error || '尚未下載'}）`) + '\n';
  }
  return text;
}

async function downloadLibrary({ root = process.cwd(), fetchBytes, extractText = pdfText,
  pause = () => new Promise(resolve => setTimeout(resolve, 400)), onProgress = console.log } = {}) {
  const workbook = parseWorkbook((await fetchBytes(ARTICLE)).toString('utf8'));
  workbook.checkedAt = new Date().toISOString();
  const directory = libraryPath(root);
  await fs.mkdir(directory, { recursive: true });
  // New run reports/indexes never overwrite earlier documents or user annotations.
  const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const reportFile = path.join(directory, `download-${stamp}.json`);
  const indexFile = path.join(directory, `題單-${stamp}.md`);
  const counts = { downloaded: 0, cached: 0, failed: 0 };
  for (const problem of workbook.problems) {
    const folder = path.join(directory, problem.id);
    await fs.mkdir(folder, { recursive: true });
    const pdf = path.join(folder, 'statement.pdf'), markdown = path.join(folder, '題目.md');
    try {
      let bytes, cached = true;
      try { bytes = await fs.readFile(pdf); }
      catch (error) { if (error.code !== 'ENOENT') throw error; cached = false; bytes = await fetchBytes(problem.statementUrl); }
      if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('下載內容不是 PDF，未當成題目保存。');
      const extracted = await extractText(bytes);
      await writeNew(pdf, bytes);
      const createdMarkdown = await writeNew(markdown, questionMarkdown(problem, extracted.text));
      const status = cached ? 'cached' : 'downloaded';
      problem.download = { status, pages: extracted.pages, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        existingMarkdownPreserved: !createdMarkdown };
      counts[status]++;
      onProgress(`[${problem.order}/${workbook.problems.length}] ${problem.id}：${cached ? '既有 PDF 已重新讀取驗證' : '原題與文字已下載'}${createdMarkdown ? '' : '，保留既有題目文件'}`);
    } catch (error) {
      counts.failed++;
      problem.download = { status: 'failed', error: error.message };
      onProgress(`[${problem.order}/${workbook.problems.length}] ${problem.id}：失敗，${error.message}`);
    }
    if (problem.order < workbook.problems.length) await pause();
  }
  await writeNew(reportFile, JSON.stringify({ ...workbook, counts }, null, 2) + '\n');
  await writeNew(indexFile, indexMarkdown(workbook));
  return { ...counts, total: workbook.problems.length, directory, indexFile, reportFile };
}

module.exports = { ARTICLE, parseWorkbook, layoutText, pdfText, createFetcher, downloadLibrary, libraryPath,
  getWorkbook, getProblem };

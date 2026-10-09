const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { ARTICLE, parseWorkbook, pdfText, downloadLibrary, libraryPath, getWorkbook, getProblem } = require('../library.cjs');

function article({ id = 2679, content = '字串\n1. [problem:UVA-11332] CPE10473\n數學\n2. [problem:UVA-100]' } = {}) {
  const data = { id, isWorkbook: true, title: 'CPE 題單', content, workbook: {
    problemsBrief: JSON.stringify({ 'UVA-100': ['Three & One'], 'UVA-11332': ['Digits'] })
  } };
  const escaped = JSON.stringify(data).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return Buffer.from(`<textarea class="d-none" name='dataJson'>${escaped}</textarea>`);
}

test('uses article content order and categories instead of shuffled metadata order', () => {
  const parsed = parseWorkbook(article().toString());
  assert.deepEqual(parsed.problems.map(p => [p.id, p.category]), [['UVA-11332', '字串'], ['UVA-100', '數學']]);
  assert.equal(parsed.problems[0].cpeId, 'CPE10473');
  assert.equal(parsed.problems[0].statementUrl, 'https://onlinejudge.org/external/113/11332.pdf');
  assert.equal(parsed.problems[1].title, 'Three & One');
});

test('rejects login HTML, a different article, omitted problems and unsafe problem IDs', () => {
  assert.throws(() => parseWorkbook('<html>login</html>'), /找不到/);
  assert.throws(() => parseWorkbook(article({ id: 123 }).toString()), /不是指定/);
  assert.throws(() => parseWorkbook(article({ content: '[problem:UVA-100]' }).toString()), /不一致/);
  assert.throws(() => parseWorkbook(article({ content: '[problem:../../secret]' }).toString()), /尚未支援/);
});

test('downloads exact workbook problems and preserves code, tests and edited question documents on repeat', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-library-'));
  try {
    const practice = path.join(root, 'practice', 'UVA-11332');
    await fs.mkdir(path.join(practice, 'tests'), { recursive: true });
    await fs.writeFile(path.join(practice, 'main.cpp'), 'my answer');
    await fs.writeFile(path.join(practice, 'tests', 'sample1.in'), 'my sample');
    const requests = [];
    const fetchBytes = async url => { requests.push(url); return url === ARTICLE ? article() : Buffer.from('%PDF-fixture'); };
    const extractText = async () => ({ text: 'My original test statement.\nSample Input\n2\nSample Output\n2', pages: 1 });
    const args = { root, fetchBytes, extractText, pause: async () => {}, onProgress: () => {} };
    const first = await downloadLibrary(args);
    assert.equal(first.downloaded, 2); assert.equal(first.failed, 0);
    assert.deepEqual(requests, [ARTICLE, 'https://onlinejudge.org/external/113/11332.pdf', 'https://onlinejudge.org/external/1/100.pdf']);
    const question = path.join(libraryPath(root), 'UVA-11332', '題目.md');
    await fs.writeFile(question, 'my notes');
    requests.length = 0;
    const second = await downloadLibrary(args);
    assert.equal(second.cached, 2); assert.equal(second.downloaded, 0);
    assert.deepEqual(requests, [ARTICLE]);
    assert.equal(await fs.readFile(question, 'utf8'), 'my notes');
    assert.equal(await fs.readFile(path.join(practice, 'main.cpp'), 'utf8'), 'my answer');
    assert.equal(await fs.readFile(path.join(practice, 'tests', 'sample1.in'), 'utf8'), 'my sample');
    assert.notEqual(first.indexFile, second.indexFile);
    const index = await fs.readFile(second.indexFile, 'utf8');
    assert.ok(index.indexOf('UVA-11332/題目.md') < index.indexOf('UVA-100/題目.md'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('HTML instead of PDF is failed, no fake statement saved, remaining questions still download', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-library-'));
  try {
    const result = await downloadLibrary({ root,
      fetchBytes: async url => url === ARTICLE ? article() : Buffer.from(url.includes('11332') ? '<html>verification</html>' : '%PDF-fixture'),
      extractText: async () => ({ text: 'test statement', pages: 1 }), pause: async () => {}, onProgress: () => {} });
    assert.equal(result.failed, 1); assert.equal(result.downloaded, 1);
    await assert.rejects(fs.access(path.join(result.directory, 'UVA-11332', '題目.md')), { code: 'ENOENT' });
    const report = JSON.parse(await fs.readFile(result.reportFile, 'utf8'));
    assert.equal(report.problems[0].download.status, 'failed');
    assert.match(await fs.readFile(result.indexFile, 'utf8'), /下載失敗/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

// A tiny PDF written specifically for this test, not a copy of an online problem.
function fixturePdf() {
  const content = 'BT /F1 12 Tf 50 740 Td (Original test document for CPE library.) Tj 0 -20 Td (This text checks extraction from a real PDF file.) Tj 0 -20 Td (Sample Input) Tj 0 -20 Td (12 34) Tj 0 -20 Td (Sample Output) Tj 0 -20 Td (46) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let result = '%PDF-1.4\n', offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}

test('extracts a real PDF including original sample lines', async () => {
  const result = await pdfText(fixturePdf());
  assert.equal(result.pages, 1);
  assert.match(result.text, /Sample Input\n12 34\nSample Output\n46/);
});

test('opening the workbook fetches metadata only, then an outage explicitly uses the saved list', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-list-'));
  try {
    const requests = [];
    const fresh = await getWorkbook({ root, fetchBytes: async url => { requests.push(url); return article(); } });
    assert.deepEqual(requests, [ARTICLE]);
    assert.equal(fresh.offlineCache, false); assert.equal(fresh.problems.length, 2);
    assert.deepEqual((await fs.readdir(libraryPath(root))).filter(name => name.startsWith('UVA-')), []);
    const fallback = await getWorkbook({ root, fetchBytes: async () => { throw new Error('network down'); } });
    assert.equal(fallback.offlineCache, true); assert.match(fallback.cacheWarning, /network down/);
    assert.equal(fallback.checkedAt, fresh.checkedAt);
    const offline = await getWorkbook({ root, offline: true, fetchBytes: async () => { assert.fail('must not fetch offline'); } });
    assert.equal(offline.offlineCache, true);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('a failed first workbook request is an error, not an empty successful list', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-list-'));
  try {
    await assert.rejects(getWorkbook({ root, fetchBytes: async () => Buffer.from('<html>login</html>') }), /無法讀取文章/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('selecting one problem loads only its PDF, preserves practice and edited notes, then works offline', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-select-'));
  try {
    const problem = parseWorkbook(article().toString()).problems[0], requests = [];
    const practice = path.join(root, 'practice', problem.id);
    await fs.mkdir(path.join(practice, 'tests'), { recursive: true });
    await fs.writeFile(path.join(practice, 'main.cpp'), 'my code');
    await fs.writeFile(path.join(practice, 'tests', 'sample.in'), 'my input');
    const args = { root, problem, extractText: async () => ({ text: 'original text', pages: 1 }),
      fetchBytes: async url => { requests.push(url); return Buffer.from('%PDF-fixture'); } };
    const first = await getProblem(args);
    assert.deepEqual(requests, [problem.statementUrl]); assert.equal(first.cached, false);
    assert.deepEqual((await fs.readdir(libraryPath(root))).filter(name => name.startsWith('UVA-')), [problem.id]);
    await fs.writeFile(first.markdownFile, 'my personal notes');
    const second = await getProblem({ ...args, fetchBytes: async () => { assert.fail('cached PDF must not fetch'); } });
    assert.equal(second.cached, true); assert.equal(second.existingMarkdownPreserved, true);
    assert.equal(await fs.readFile(first.markdownFile, 'utf8'), 'my personal notes');
    assert.equal(await fs.readFile(path.join(practice, 'main.cpp'), 'utf8'), 'my code');
    assert.equal(await fs.readFile(path.join(practice, 'tests', 'sample.in'), 'utf8'), 'my input');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('rejects alternate sources and verification HTML without saving a fake problem', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-select-'));
  try {
    const problem = parseWorkbook(article().toString()).problems[0];
    await assert.rejects(getProblem({ root, problem: { ...problem, statementUrl: 'https://other.invalid/a.pdf' } }), /不一致/);
    await assert.rejects(getProblem({ root, problem, fetchBytes: async () => Buffer.from('<html>verification</html>') }), /不是 PDF/);
    await assert.rejects(fs.access(path.join(libraryPath(root), problem.id, 'statement.pdf')), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('concurrent clicks on the same problem share one download', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-select-'));
  try {
    const problem = parseWorkbook(article().toString()).problems[0];
    let downloads = 0;
    const args = { root, problem, extractText: async () => ({ text: 'original', pages: 1 }),
      fetchBytes: async () => { downloads++; return Buffer.from('%PDF-fixture'); } };
    const [a,b] = await Promise.all([getProblem(args), getProblem(args)]);
    assert.equal(downloads, 1); assert.equal(a.pdfFile, b.pdfFile);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('CLI offline loads a saved statement and rejects an uncached statement without fetching', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-offline-cli-'));
  try {
    const workbook = await getWorkbook({ root, fetchBytes: async () => article() });
    await getProblem({ root, problem: workbook.problems[0], fetchBytes: async () => fixturePdf() });
    const cli = path.join(__dirname, '..', 'cli.cjs');
    const result = await execFile(process.execPath, [cli, 'problem', '--problem', 'UVA-11332', '--offline'], { cwd: root, timeout: 15000 });
    assert.match(result.stdout, /讀取本機已保存原題/);
    await assert.rejects(execFile(process.execPath, [cli, 'problem', '--problem', 'UVA-100', '--offline'], { cwd: root, timeout: 15000 }), error => {
      assert.equal(error.code, 1); assert.match(error.stderr, /離線模式無法載入/); return true;
    });
    await assert.rejects(fs.access(path.join(libraryPath(root), 'UVA-100', 'statement.pdf')), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

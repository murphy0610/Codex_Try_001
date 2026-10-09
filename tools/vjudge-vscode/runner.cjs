const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
function execute(file, args, input, timeout) {
  return new Promise((resolve, reject) => {
    const process = execFile(file, args, { timeout, maxBuffer: 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message}\n${stderr || ''}`));
      else resolve(stdout);
    });
    process.stdin.on('error', () => {});
    process.stdin.end(input);
  });
}
function normalize(text) { return text.replace(/\r\n/g, '\n').replace(/\n+$/, ''); }
const standards = new Set(['c++98', 'c++03', 'c++11', 'c++14', 'c++17', 'c++20', 'c++23']);
function validateStandard(standard) {
  if (!standards.has(standard)) throw new Error(`不支援的 C++ 標準：${standard}；請使用 ${[...standards].join('、')}。`);
  return standard;
}
function standardForLanguage(language, specified) {
  if (specified !== undefined) validateStandard(specified);
  // A compiler version such as "C++ 11.2.0" is not a language standard.
  const match = language.match(/(?:C|G|Clang)\+\+\s*(98|03|11|14|17|20|23)(?![\d.])/i);
  const inferred = match ? `c++${match[1]}` : null;
  if (inferred && specified && inferred !== specified) throw new Error(`本機標準 ${specified} 與網站語言「${language}」的 ${inferred} 不符；未提交。`);
  if (!inferred && !specified) throw new Error('語言名稱沒有明確的 C++ 標準；請選擇網站的 C++11 等選項，或另指定 --std。不把編譯器版本當成語言標準。');
  return specified || inferred;
}
async function runTests(file, testsDirectory = path.join(path.dirname(file), 'tests'), standard = 'c++11') {
  validateStandard(standard);
  const inputs = (await fs.readdir(testsDirectory)).filter(name => name.endsWith('.in')).sort();
  if (!inputs.length) throw new Error('沒有 .in 測資，未驗證程式；請先保存範例輸入及同名 .out。');
  const cases = [];
  for (const name of inputs) cases.push({ name, input: await fs.readFile(path.join(testsDirectory, name), 'utf8'),
    expected: await fs.readFile(path.join(testsDirectory, name.replace(/\.in$/, '.out')), 'utf8') });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-cpp-'));
  try {
    const executable = path.join(temporary, process.platform === 'win32' ? 'answer.exe' : 'answer');
    await execute('g++', [`-std=${standard}`, '-pedantic-errors', '-O2', '-Wall', '-Wextra', path.resolve(file), '-o', executable], '', 30000);
    for (const item of cases) {
      const actual = await execute(executable, [], item.input, 3000);
      if (normalize(actual) !== normalize(item.expected)) throw new Error(`${item.name} 輸出不符。\n預期：\n${item.expected}\n實際：\n${actual}`);
    }
    return { passed: cases.length, total: cases.length, standard };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
module.exports = { runTests, normalize, standardForLanguage };

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
async function runTests(file, testsDirectory = path.join(path.dirname(file), 'tests')) {
  const inputs = (await fs.readdir(testsDirectory)).filter(name => name.endsWith('.in')).sort();
  if (!inputs.length) throw new Error('沒有 .in 測資，未驗證程式；請先保存範例輸入及同名 .out。');
  const cases = [];
  for (const name of inputs) cases.push({ name, input: await fs.readFile(path.join(testsDirectory, name), 'utf8'),
    expected: await fs.readFile(path.join(testsDirectory, name.replace(/\.in$/, '.out')), 'utf8') });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-cpp-'));
  try {
    const executable = path.join(temporary, process.platform === 'win32' ? 'answer.exe' : 'answer');
    await execute('g++', ['-std=c++17', '-O2', '-Wall', '-Wextra', path.resolve(file), '-o', executable], '', 30000);
    for (const item of cases) {
      const actual = await execute(executable, [], item.input, 3000);
      if (normalize(actual) !== normalize(item.expected)) throw new Error(`${item.name} 輸出不符。\n預期：\n${item.expected}\n實際：\n${actual}`);
    }
    return { passed: cases.length, total: cases.length };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
module.exports = { runTests, normalize };

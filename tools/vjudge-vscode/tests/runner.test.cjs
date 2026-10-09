const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { runTests, standardForLanguage } = require('../runner.cjs');
const execute = promisify(execFile);
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-runner-test-'));
  const file = path.join(root, 'main.cpp');
  await fs.writeFile(file, '#include <iostream>\nint main(){long long a,b;while(std::cin>>a>>b) std::cout<<a+b<<"\\n";}\n');
  await fs.mkdir(path.join(root, 'tests'));
  return { root, file, tests: path.join(root, 'tests') };
}
test('compiles C++ and exercises three actual stdin/stdout cases', async () => {
  const env = await setup();
  try {
    for (const [i, input, output] of [[1,'2 3\n','5\n'],[2,'-7 4\n','-3\n'],[3,'1000000000 1000000000\n','2000000000\n']]) {
      await fs.writeFile(path.join(env.tests, `${i}.in`), input); await fs.writeFile(path.join(env.tests, `${i}.out`), output);
    }
    assert.deepEqual(await runTests(env.file), { passed: 3, total: 3, standard: 'c++11' });
  } finally { await fs.rm(env.root, { recursive: true, force: true }); }
});
test('zero saved cases do not count as a pass', async () => {
  const env = await setup();
  try { await assert.rejects(runTests(env.file), /沒有 .in/); }
  finally { await fs.rm(env.root, { recursive: true, force: true }); }
});
test('wrong expected output is a failed test', async () => {
  const env = await setup();
  try {
    await fs.writeFile(path.join(env.tests,'sample.in'),'2 3\n'); await fs.writeFile(path.join(env.tests,'sample.out'),'6\n');
    await assert.rejects(runTests(env.file), /輸出不符/);
  } finally { await fs.rm(env.root, { recursive: true, force: true }); }
});
test('uses explicit website standards, rejects mismatches, and does not infer from compiler versions', () => {
  assert.equal(standardForLanguage('C++11 5.3.0'), 'c++11');
  assert.equal(standardForLanguage('GNU C++17'), 'c++17');
  assert.throws(() => standardForLanguage('C++11 5.3.0', 'c++17'), /不符/);
  for (const label of ['C++ 5.3.0', 'C++ 11.2.0']) assert.throws(() => standardForLanguage(label), /沒有明確/);
  assert.equal(standardForLanguage('C++ 5.3.0', 'c++98'), 'c++98');
  assert.throws(() => standardForLanguage('C++11 5.3.0', 'c++99'), /不支援/);
});
const cpp17Only = '#include <iostream>\n#include <utility>\nint main(){auto [a,b]=std::make_pair(2,3);std::cout<<a+b<<"\\n";}\n';
test('C++17-only syntax fails under C++11, and actually runs correctly under C++17', async () => {
  const env = await setup();
  try {
    await fs.writeFile(env.file, cpp17Only);
    await fs.writeFile(path.join(env.tests, 'sample.in'), '');
    await fs.writeFile(path.join(env.tests, 'sample.out'), '5\n');
    await assert.rejects(runTests(env.file, env.tests, 'c++11'), /Command failed/);
    assert.deepEqual(await runTests(env.file, env.tests, 'c++17'), { passed: 1, total: 1, standard: 'c++17' });
  } finally { await fs.rm(env.root, { recursive: true, force: true }); }
});
test('CLI submission for real C++11 label rejects C++17 code before launching any browser', async () => {
  const env = await setup();
  try {
    await fs.writeFile(env.file, cpp17Only);
    await fs.writeFile(path.join(env.tests, 'sample.in'), '');
    await fs.writeFile(path.join(env.tests, 'sample.out'), '5\n');
    const cli = path.resolve(__dirname, '../cli.cjs');
    await assert.rejects(execute(process.execPath, [cli, 'submit', '--file', env.file, '--problem', 'UVA-11332', '--language', 'C++11 5.3.0', '--yes'], { cwd: env.root, timeout: 30000 }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /使用 c\+\+11 編譯測試/);
      assert.doesNotMatch(error.stdout, /正在開啟.*瀏覽器/);
      assert.match(error.stderr, /error:/);
      return true;
    });
    await assert.rejects(fs.access(path.join(env.root, '.cpe-vjudge')), { code: 'ENOENT' });
  } finally { await fs.rm(env.root, { recursive: true, force: true }); }
});
test('CLI query explains missing IDs without launching a browser or changing the record', async () => {
  const env = await setup();
  try {
    const file = path.join(env.root, 'rejected.json');
    const data = JSON.stringify({ problem: 'UVA-11332', runId: null, state: 'rejected' });
    await fs.writeFile(file, data);
    await assert.rejects(execute(process.execPath, [path.resolve(__dirname, '../cli.cjs'), 'query', '--record', file], { cwd: env.root, timeout: 30000 }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /沒有提交編號.*rejected.*不能用 query/);
      assert.doesNotMatch(error.stdout, /正在開啟.*瀏覽器/);
      return true;
    });
    assert.equal(await fs.readFile(file, 'utf8'), data);
  } finally { await fs.rm(env.root, { recursive: true, force: true }); }
});

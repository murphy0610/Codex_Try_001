const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('../runner.cjs');
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
    assert.deepEqual(await runTests(env.file), { passed: 3, total: 3 });
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

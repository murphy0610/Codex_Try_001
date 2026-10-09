const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ensurePractice, problemId, taskArguments } = require('../workflow.cjs');

test('opening an existing practice preserves exact code and tests', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-ui-preserve-'));
  try {
    const directory = path.join(root, 'practice', 'UVA-11332');
    await fs.mkdir(path.join(directory, 'tests'), { recursive: true });
    const code = '#include <iostream>\r\n// 自己的草稿\r\n';
    await fs.writeFile(path.join(directory, 'main.cpp'), code);
    await fs.writeFile(path.join(directory, 'tests', 'sample1.in'), '24\n0\n');
    await fs.writeFile(path.join(directory, 'tests', 'sample1.out'), '6\n');
    const result = await ensurePractice(root, { id: 'UVA-11332' });
    assert.equal(result.created, false);
    assert.equal(await fs.readFile(result.file, 'utf8'), code);
    assert.equal(await fs.readFile(path.join(directory, 'tests', 'sample1.in'), 'utf8'), '24\n0\n');
    assert.equal(await fs.readFile(path.join(directory, 'tests', 'sample1.out'), 'utf8'), '6\n');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('new practice creates only a blank skeleton, and a second open preserves edits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cpe-ui-new-'));
  try {
    const first = await ensurePractice(root, { id: 'UVA-10041' });
    assert.equal(first.created, true);
    assert.match(await fs.readFile(first.file, 'utf8'), /請自己實作解題邏輯/);
    assert.deepEqual(await fs.readdir(first.directory), ['main.cpp']);
    await fs.writeFile(first.file, 'my own code');
    assert.equal((await ensurePractice(root, { id: 'UVA-10041' })).created, false);
    assert.equal(await fs.readFile(first.file, 'utf8'), 'my own code');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('invalid or traversing problem identifiers are rejected', () => {
  for (const id of ['../other', 'UVA-0', 'UVA-11332/../../secret', 'UVA-11332;whoami', '', undefined]) {
    assert.throws(() => problemId({ id }));
  }
});

test('tasks use separate process arguments and test never grants submission permission', () => {
  const practice = { file: 'C:\\Users\\A B\\practice\\UVA-11332\\main.cpp' }, problem = { id: 'UVA-11332' };
  const args = taskArguments('C:\\some folder\\cli.cjs', 'test', practice, problem);
  assert.deepEqual(args, ['C:\\some folder\\cli.cjs', 'test', '--file', practice.file, '--std', 'c++11']);
  assert.ok(!args.includes('--yes'));
  assert.deepEqual(taskArguments('cli.cjs', 'languages', practice, problem), ['cli.cjs', 'languages', '--problem', 'UVA-11332']);
  assert.throws(() => taskArguments('cli.cjs', 'submit', practice, problem, ' '));
  assert.deepEqual(taskArguments('cli.cjs', 'submit', practice, problem, ' C++11 5.3.0 '),
    ['cli.cjs', 'submit', '--file', practice.file, '--problem', 'UVA-11332', '--language', 'C++11 5.3.0', '--yes']);
});

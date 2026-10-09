const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

test('only accepts VJudge HTTPS problem URLs', () => {
  assert.equal(core.problemFromUrl('https://vjudge.net/problem/UVA-100'), 'UVA-100');
  for (const url of ['http://vjudge.net/problem/UVA-100', 'https://evil.test/problem/UVA-100',
    'https://vjudge.net/contest/123', 'https://vjudge.net/?login=1']) {
    assert.throws(() => core.problemFromUrl(url));
  }
});
test('records a real positive submission ID and rejects missing or malformed IDs', () => {
  assert.equal(core.submissionReply({ runId: 123 }), 123);
  for (const value of [0, -1, 'oops', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => core.positiveId(value));
  }
  assert.throws(() => core.submissionReply({ success: true }));
});
test('human verification and remote-account errors remain failures', () => {
  assert.throws(() => core.submissionReply({ challenge: true }), /真人驗證/);
  assert.throws(() => core.submissionReply({ errorCode: 'bind_account_missing' }), /bind_account_missing/);
});
test('rejects results belonging to another submission or problem', () => {
  const data = { runId: 123, oj: 'UVA', probNum: '100', status: 'Accepted', processing: false };
  assert.throws(() => core.resultFromData(data, 124, 'UVA-100'), /編號不符/);
  assert.throws(() => core.resultFromData(data, 123, 'UVA-101'), /題號不符/);
});
test('maps final verdicts but never upgrades incomplete or unknown results to AC', () => {
  const data = { runId: 123, oj: 'UVA', probNum: '100', status: 'Accepted', processing: false };
  assert.equal(core.resultFromData(data, 123, 'UVA-100').verdict, 'AC');
  assert.equal(core.resultFromData(data, 123, 'UVA-100').final, true);
  assert.equal(core.resultFromData({ ...data, processing: true }, 123, 'UVA-100').final, false);
  assert.equal(core.resultFromData({ ...data, processing: undefined }, 123, 'UVA-100').final, false);
  assert.equal(core.resultFromData({ ...data, status: 'Unknown' }, 123, 'UVA-100').final, false);
  for (const [raw, expected] of [['Wrong Answer', 'WA'], ['Time Limit Exceeded', 'TLE'], ['Compilation Error', 'CE']]) {
    assert.equal(core.resultFromData({ ...data, status: raw }, 123, 'UVA-100').verdict, expected);
  }
});

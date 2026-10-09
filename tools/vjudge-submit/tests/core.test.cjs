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
test('structured website errors retain their reason without copying arguments, HTML or other response values', () => {
  const data = { error: { i18nKey: 'submit.error.duplicate_code', i18nArgs: { token: 'DO_NOT_INCLUDE' } }, token: 'DO_NOT_INCLUDE', source: 'DO_NOT_INCLUDE' };
  const info = core.submissionResponseInfo(data);
  assert.equal(info.knownRejection, true);
  assert.equal(info.errorKind, 'i18n');
  assert.equal(info.errorKey, 'submit.error.duplicate_code');
  assert.throws(() => core.submissionReply(data), /這份程式碼之前已經提交過/);
  assert.ok(!JSON.stringify(info).includes('DO_NOT_INCLUDE'));
  assert.equal(core.submissionResponseInfo({ error: { text: '請稍後再試。' } }).errorText, '請稍後再試。');
  assert.throws(() => core.submissionReply({ error: { text: '請稍後再試。' } }), /請稍後再試/);
  assert.equal(core.submissionResponseInfo({ error: { html: '<input value="DO_NOT_INCLUDE">' } }).errorKind, 'html');
  assert.ok(!JSON.stringify(core.submissionResponseInfo({ error: { html: 'DO_NOT_INCLUDE' } })).includes('DO_NOT_INCLUDE'));
  assert.equal(core.submissionResponseInfo({ success: true }).knownRejection, false);
  assert.throws(() => core.submissionReply({ success: true }), /結果不確定/);
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

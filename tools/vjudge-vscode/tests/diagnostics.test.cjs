const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDiagnostic } = require('../diagnostics.cjs');
test('progress persists before completion and failure survives terminal output loss', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-diagnostic-'));
  try {
    const diagnostic = createDiagnostic(directory, 'UVA-11332');
    diagnostic.progress('登入檢查通過，正在讀取原生提交表單。');
    let record = JSON.parse(fs.readFileSync(diagnostic.file, 'utf8'));
    assert.equal(record.status, 'running'); assert.equal(record.exitCode, null);
    assert.equal(record.progress.length, 1);
    diagnostic.snapshot({ modalExists: false, languageSelectExists: false });
    diagnostic.failure(new Error('找不到提交按鈕\nRaw page log with secret value'));
    const text = fs.readFileSync(diagnostic.file, 'utf8'); record = JSON.parse(text);
    assert.equal(record.status, 'failed'); assert.equal(record.exitCode, 1);
    assert.equal(record.error, '找不到提交按鈕'); assert.equal(record.form.modalExists, false);
    assert.ok(!text.includes('secret value'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('successful query records actual language labels', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-diagnostic-'));
  try {
    const diagnostic = createDiagnostic(directory, 'UVA-11332');
    diagnostic.success([{ value: '5', label: 'GNU C++17' }]);
    const record = JSON.parse(fs.readFileSync(diagnostic.file, 'utf8'));
    assert.equal(record.status, 'completed'); assert.equal(record.exitCode, 0);
    assert.deepEqual(record.languages, [{ value: '5', label: 'GNU C++17' }]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

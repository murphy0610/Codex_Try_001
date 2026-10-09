const test = require('node:test');
const assert = require('node:assert/strict');
const { renderHtml } = require('../view.cjs');

test('untrusted problem text is escaped, including script tags and configuration JSON', () => {
  const html = renderHtml({ webviewSource: 'vscode-resource:', scriptUri: 'vscode-resource:/view.mjs', styleUri: 'vscode-resource:/view.css',
    configuration: { pdfUri: '</script><script>alert(1)</script>' },
    problem: { id: 'UVA-11332', title: '<img src=x onerror=alert(1)>', category: '" onclick="alert(1)' },
    text: '<script>attack()</script> & sample', notice: '<svg onload=attack()>' });
  assert.ok(!html.includes('<script>attack()'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<svg onload='));
  assert.ok(html.includes('&lt;script&gt;attack()&lt;/script&gt; &amp; sample'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'nonce-[^']+' vscode-resource:/);
  assert.match(html, /connect-src vscode-resource:/);
  assert.ok(!html.includes('https://cdn'));
});

test('loading state has no test or submit controls', () => {
  const html = renderHtml({ webviewSource: 'local:', scriptUri: 'local:/view.mjs', styleUri: 'local:/view.css', configuration: {}, notice: '載入中' });
  assert.ok(!html.includes('data-command="submit"'));
  assert.ok(!html.includes('data-command="test"'));
});

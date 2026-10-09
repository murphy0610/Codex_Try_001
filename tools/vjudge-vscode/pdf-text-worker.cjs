// Read only the selected public PDF from stdin. No browser profile/session files.
const { pdfText } = require('./library.cjs');
console.log = (...args) => console.error(...args); // Keep PDF.js notices out of the JSON output.
const chunks = [];
let length = 0;
process.stdin.on('data', chunk => {
  length += chunk.length;
  if (length > 10 * 1024 * 1024) {
    console.error('PDF 超出 10 MB 上限。'); process.exit(1);
  }
  chunks.push(chunk);
});
process.stdin.on('end', async () => {
  try { process.stdout.write(JSON.stringify(await pdfText(Buffer.concat(chunks)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
});

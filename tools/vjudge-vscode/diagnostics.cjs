const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createDiagnostic(directory, problem) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `languages-${problem}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
  const data = { command: 'languages', problem, processId: process.pid, status: 'running',
    exitCode: null, startedAt: new Date().toISOString(), progress: [] };
  const write = () => {
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  };
  write();
  return {
    file,
    progress(message) { data.progress.push({ at: new Date().toISOString(), message }); write(); },
    snapshot(metadata) { data.form = metadata; write(); },
    success(languages) { data.status = 'completed'; data.exitCode = 0; data.languages = languages; write(); },
    failure(error) {
      data.status = 'failed'; data.exitCode = 1;
      // Keep the first line only, without raw Playwright page/DOM call logs.
      data.error = String(error.message || error).split('\n')[0].slice(0, 500); write();
    }
  };
}
module.exports = { createDiagnostic };

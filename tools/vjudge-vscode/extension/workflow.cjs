const fs = require('node:fs/promises');
const path = require('node:path');

function problemId(problem) {
  if (!problem || typeof problem.id !== 'string' || !/^UVA-[1-9]\d*$/.test(problem.id)) {
    throw new Error('題號不是文章 2679 的有效 UVA 題號。');
  }
  return problem.id;
}

async function ensurePractice(root, problem) {
  const directory = path.join(root, 'practice', problemId(problem));
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'main.cpp');
  let created = false;
  try {
    await fs.writeFile(file, '#include <iostream>\nusing namespace std;\n\nint main() {\n    // 請自己實作解題邏輯。\n\n    return 0;\n}\n', { flag: 'wx' });
    created = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return { directory, file, created };
}

function taskArguments(helperFile, action, practice, problem, language) {
  const id = problemId(problem);
  if (action === 'languages') return [helperFile, 'languages', '--problem', id];
  if (action === 'test') return [helperFile, 'test', '--file', practice.file, '--std', 'c++11'];
  if (action === 'submit' && typeof language === 'string' && language.trim()) {
    return [helperFile, 'submit', '--file', practice.file, '--problem', id, '--language', language.trim(), '--yes'];
  }
  throw new Error('不支援的操作，或尚未選擇提交語言。');
}

module.exports = { problemId, ensurePractice, taskArguments };

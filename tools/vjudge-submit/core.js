(function (root) {
  "use strict";
  function problemFromUrl(input) {
    const url = new URL(input);
    const match = /^\/problem\/([A-Za-z0-9_]+)-([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "vjudge.net" || !match) {
      throw new Error("請先登入並開啟 VJudge 題目頁，例如 /problem/UVA-100。");
    }
    return `${match[1]}-${match[2]}`;
  }
  function positiveId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("網站沒有回傳有效提交編號。");
    return id;
  }
  function submissionReply(data) {
    if (!data || typeof data !== "object") throw new Error("提交回應格式異常；請查看網站，勿自動重送。");
    if (data.runId) return positiveId(data.runId);
    if (data.challenge) throw new Error("網站要求真人驗證。請在原生表單完成驗證，確認尚未送出，再解除鎖定並重新提交。");
    const message = typeof data.error === "string" ? data.error : data.errorCode || "請查看原生提交表單的錯誤訊息。";
    throw new Error(`提交沒有成功：${message}`);
  }
  function resultFromData(data, expectedId, expectedProblem) {
    if (!data || data.error) throw new Error("無法取得判定；請確認仍登入，並查看該次提交頁。");
    if (positiveId(data.runId) !== positiveId(expectedId)) throw new Error("結果編號不符，拒絕顯示其他提交結果。");
    if (`${data.oj}-${data.probNum}` !== expectedProblem) throw new Error("結果題號不符，拒絕顯示。");
    const raw = typeof data.status === "string" ? data.status.trim() : "";
    if (!raw) throw new Error("結果缺少判定文字。");
    const labels = {
      accepted: "AC", "wrong answer": "WA", "time limit exceeded": "TLE",
      "memory limit exceeded": "MLE", "runtime error": "RE",
      "compilation error": "CE", "compile error": "CE", "presentation error": "PE"
    };
    const verdict = labels[raw.toLowerCase()] || raw;
    const knownFinal = /^(AC|WA|TLE|MLE|RE|CE|PE)$/.test(verdict);
    // Never treat missing processing information or an unknown result as AC.
    const final = data.processing === false && knownFinal;
    return { runId: positiveId(data.runId), problem: expectedProblem, verdict, rawStatus: raw,
      processing: data.processing !== false, final, runtime: data.runtime ?? null,
      memory: data.memory ?? null, url: `https://vjudge.net/solution/${positiveId(data.runId)}` };
  }
  const api = { problemFromUrl, positiveId, submissionReply, resultFromData };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VJudgeSubmitCore = api;
})(globalThis);

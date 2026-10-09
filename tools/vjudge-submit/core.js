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
  function safeMessage(value) {
    if (typeof value !== "string") return "";
    return value.replace(/https?:\/\/[^\s<>]+/gi, input => {
      try { const url = new URL(input); return url.origin + url.pathname; }
      catch { return "[網址已省略]"; }
    }).replace(/\b(token|password|cookie|authorization|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[已遮蔽]")
      .replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  }
  function submissionResponseInfo(data) {
    const object = data && typeof data === "object" && !Array.isArray(data);
    const info = { kind: data === null ? "null" : Array.isArray(data) ? "array" : typeof data,
      fields: object ? ["runId", "error", "errorCode", "challenge", "success"].filter(key => key in data) : [] };
    if (!object) return info;
    const code = value => typeof value === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : null;
    info.errorCode = code(data.errorCode);
    info.challenge = Boolean(data.challenge);
    info.knownRejection = !data.runId && Boolean(data.error || info.errorCode || data.challenge);
    info.runIdPresent = data.runId != null;
    if (typeof data.error === "string") {
      info.errorKind = "text"; info.errorText = safeMessage(data.error);
    } else if (data.error && typeof data.error === "object") {
      if (code(data.error.i18nKey)) {
        info.errorKind = "i18n"; info.errorKey = code(data.error.i18nKey);
      } else if (typeof data.error.text === "string") {
        info.errorKind = "text"; info.errorText = safeMessage(data.error.text);
      } else info.errorKind = typeof data.error.html === "string" ? "html" : "unknown-object";
      // Never copy i18nArgs, raw HTML, source, tokens or other response values.
    }
    return info;
  }
  function submissionReply(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("提交回應格式異常；請查看網站，勿自動重送。");
    if (data.runId) return positiveId(data.runId);
    if (data.challenge) throw new Error("網站要求真人驗證。請在原生表單完成驗證，確認尚未送出，再解除鎖定並重新提交。");
    const info = submissionResponseInfo(data);
    const labels = { "submit.error.duplicate_code": "這份程式碼之前已經提交過，請查詢原提交結果。" };
    const message = info.errorText || labels[info.errorKey] || info.errorKey || info.errorCode;
    if (message) throw new Error(`網站回報提交錯誤：${message}`);
    if (info.errorKind) throw new Error("網站回傳格式化錯誤；請查看本次保存的表單提示，不會重送。");
    throw new Error("提交回應缺少提交編號，結果不確定；請查看本次診斷，不要重送。");
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
  const api = { problemFromUrl, positiveId, submissionReply, resultFromData, submissionResponseInfo, safeMessage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VJudgeSubmitCore = api;
})(globalThis);

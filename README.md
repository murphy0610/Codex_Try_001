# Codex_Try_001
在 VS Code 練習指定的 [VJudge CPE 一顆星選集（文章 2679）](https://vjudge.net/article/2679)：點選題目才載入原文、自己寫 C++、請旁邊的 Codex 協助、測試並授權助手提交判題。

完整的 Windows 安裝與操作方式見 [VS Code 助手說明](tools/vjudge-vscode/README.md)。

方案①使用本機 VS Code 擴充功能：左邊顯示文章 2679 的分類與題目，點選時才載入該題，原始 PDF 顯示在 VS Code 的題目頁。它需要目前專案內的助手，不是單獨安裝後就能控制任意網站的工具。

已安裝提交助手的使用者，更新本專案後請本機 Codex 在專案根目錄執行：

```sh
npm ci --prefix tools/vjudge-vscode --cache .cpe-vjudge/npm-cache
```

然後在 VS Code 的擴充功能頁面選「從 VSIX 安裝」，選擇本專案 `tools/vjudge-vscode/cpe-vjudge-practice-0.2.0.vsix`。VSIX 是 VS Code 擴充功能的安裝檔，不需要自行解壓縮。安裝後點左側 **CPE 練習** 圖示；第一次只載入題單，點題才保存原題。詳細按鈕與前置需求見 [擴充功能說明](tools/vjudge-vscode/extension/README.md)。

本機題目保存於 `.cpe-vjudge/library/2679/`。保留既有程式與測資；本機 Codex 可讀取題目，協助核對官方範例。載入題目不會提交解答。

雲端與 Windows 本機是兩個分開的環境。GitHub 保存助手程式，下載的原題、登入資料和判題紀錄保存在個人電腦，不因助手更新而自動同步。

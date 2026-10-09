# 在 VS Code 內使用 VJudge 提交助手

此版本取代「每次去網站開啟擴充功能」的日常流程。你在 VS Code 保存 C++，執行測試與提交任務；助手在背景開啟專用瀏覽器、操作 VJudge 原生提交表單、查詢這次提交編號，將結果輸出到 VS Code 終端機與專案紀錄。旁邊的本機 Codex 能讀取程式、測資與紀錄。

第一次登入，以及登入過期／網站要求真人驗證時，需要你操作助手開啟的瀏覽器。不要把帳號密碼、Cookie 或登入資料貼到聊天。此版本不是雲端 Codex 直接控制 Windows 的連線工具。

## 一次性準備（Windows 本機）

1. 將完整專案檔案同步到 Windows；雲端 `/workspace` 路徑不是 Windows 路徑。要有 `.vscode/tasks.json`、`tools/vjudge-vscode/` 與共用的 `tools/vjudge-submit/core.js`。不要執行舊的擴充功能安裝腳本。
2. 使用 VS Code 開啟該專案資料夾。
3. 請本機 Codex 檢查 `node --version`、`npm --version`、`g++ --version`。需要 Node.js 20 以上、C++ 編譯器及 Edge（Windows 預設使用）。缺少時由本機 Codex 說明安裝與驗證方法，不假設已安裝。
4. VS Code 按 `Ctrl+Shift+P`，輸入 **Tasks: Run Task／工作：執行工作**，執行「CPE：安裝本機提交助手相依套件」。使用 lockfile 安裝，無須下載 Playwright 的瀏覽器；使用本機 Edge。
5. 執行「CPE：登入 VJudge」。助手會開啟獨立的瀏覽器視窗，與平常瀏覽器使用不同的資料夾。
6. 在這個視窗手動登入、完成網站驗證，再回到 VS Code 終端機按 Enter。只有確認已登入才會成功，接著關閉這個視窗。

登入狀態保存在你自己的使用者資料夾 `.cpe-vjudge-local/`，不在專案、也不在 GitHub。它包含私密的登入資料，勿上傳或提供給雲端 Codex。保存登入不保證永久有效，也不保證網站允許背景瀏覽器操作；若要求驗證，助手會停止並請你重新登入，不會繞過真人驗證。

若使用 Chrome，可讓本機 Codex將 `CPE_BROWSER_PATH` 設為本機 Chrome 執行檔的完整路徑。此變數不是密鑰，不需傳給雲端。

## 每次練習

建議每題建立自己的資料夾，例如：

```text
practice/UVA-100/
  題目.md
  main.cpp
  tests/
    sample1.in
    sample1.out
```

1. 在 VS Code 開啟題目文件和 `main.cpp`，右邊直接問本機 Codex。
2. 保存程式與題目的範例測資；每個 `.in` 要有同名 `.out`。
3. 執行「CPE：測試目前 C++ 檔案」，選擇與網站語言一致的標準；例如 UVA-11332 的 `C++11 5.3.0` 選 `c++11`。助手實際編譯、跑所有已保存的輸入、對照輸出。零測資、編譯失敗、超時或答案不符都不算通過。
4. 第一次可執行「CPE：查詢題目的可用 C++ 語言」，查看網站提供的名稱。
5. 執行「CPE：測試通過後提交目前檔案並等待判定」，輸入題號和語言名称。執行這個任務就是明確授權當次提交。
6. 助手依提交語言重新測試，例如 `C++11 5.3.0` 使用 `c++11`；確認測試期間程式沒有修改，通過後才送出一次。平常不用手動開啟 VJudge，也不用選擇 `.cpp`。
7. 判定顯示在 VS Code 終端機，並保存到 `.cpe-vjudge/results/`。此資料夾已忽略 Git，沒有密碼或 Cookie。
8. 對本機 Codex 說「讀取剛才的判題紀錄，解釋失敗原因」；修改後說「重新測試並提交這個題目」。本機 Codex可以執行下面相同指令，不需你操作工作選單。

此版本尚未自動下載完整題目敘述。題目文件仍需先取得，不能說已完成所有題庫操作。題庫索引工具是 `tools/fetch_vjudge_index.py`，目前僅整理題號與連結。

## 給本機 Codex 的指令範例

在專案根目錄執行，請將題號、檔名與語言改成實際值：

```sh
node tools/vjudge-vscode/cli.cjs login
node tools/vjudge-vscode/cli.cjs languages --problem UVA-100
node tools/vjudge-vscode/cli.cjs test --file practice/UVA-100/main.cpp --std c++17
node tools/vjudge-vscode/cli.cjs submit --file practice/UVA-100/main.cpp --problem UVA-100 --language "GNU C++17" --yes
node tools/vjudge-vscode/cli.cjs query --record .cpe-vjudge/results/這次紀錄.json
```

`GNU C++17` 是示例，不表示真實網站必有這個名稱。工具會按網站實際清單匹配；零個或多個匹配就停止，不猜數字編號。

使用者已在 Windows 的 UVA-11332 真實表單查得 `C++ 5.3.0` 與 `C++11 5.3.0`，未提供 C++17。練習這題可使用：

```sh
node tools/vjudge-vscode/cli.cjs test --file practice/UVA-11332/main.cpp --std c++11
node tools/vjudge-vscode/cli.cjs submit --file practice/UVA-11332/main.cpp --problem UVA-11332 --language "C++11 5.3.0" --yes
```

單獨執行 `test` 未指定 `--std` 時預設 `c++11`。提交時則從語言名稱的 C++11、C++17 等明確標準決定，不能把 `5.3.0` 這種編譯器版本當成語言標準；不明確時須另指定 `--std`，而指定值與網站語言矛盾時會停止。測試採用嚴格標準檢查，不符合該標準的語法會編譯失敗。測試紀錄保存實際使用的 `standard`，但本機編譯器版本、函式庫與網站仍可能不同。

Windows 檔案常使用 CRLF 換行；網站的 CodeMirror 編輯器通常讀回 LF 換行。助手只在填入網站時統一 CRLF／CR／LF，再檢查內容一致，保留其餘文字、空白及檔尾換行，不會改寫本機 `main.cpp`。`sourceHash` 仍記錄原始檔案的雜湊。

## 失敗時

- **查詢沒有可見輸出**：先執行 `node tools/vjudge-vscode/cli.cjs doctor`，再執行 `languages --problem UVA-11332`。保存標準輸出、標準錯誤及程序退出碼。新版會顯示瀏覽器啟動、登入檢查及語言讀取進度；登入請求最多等待 15 秒。診斷只顯示版本、檔案是否存在等資訊，不列出登入內容。若 doctor 也沒有輸出，先由本機 Codex 檢查 Node、工作目錄及終端輸出擷取方式，不要直接判定網站登入失敗。
- **登入通過但卡在表單**：新版 `languages` 每次在 `.cpe-vjudge/diagnostics/` 建立獨立 JSON，逐步保存進度，失敗時記錄可見提交按鈕的標籤與識別碼、表單是否顯示、語言選項，以及網站程式檔載入失敗和 JavaScript 錯誤的數量。這不是整頁 HTML，不包含密碼、Cookie、程式原始碼、隱藏欄位值或網址查詢參數。若程序被外部中止，JSON 可能仍是 `running`；這不能當成成功。紀錄中的退出碼是助手預期退出碼，實際退出碼仍應由啟動程序的工具擷取。可用 `node tools/vjudge-vscode/cli.cjs languages --problem UVA-11332 --visible` 暫時開啟可見瀏覽器診斷，正常提交流程仍在背景執行。
- **表單診斷顯示 `/status`，只有 `top.nav.status` 的「提交」連結**：這是提交紀錄頁，不是題目提交表單。助手會排除導覽列與指向其他頁面的連結，等待題目專用按鈕；若按鈕不唯一、一直未出現，或點擊後離開原題目頁，就停止並保存診斷。按鈕紀錄另有 `hrefPath`（連結路徑，沒有查詢參數）及 `inNavigation`（是否在導覽列）。不要因這種表單辨識失敗而直接認定登入失效。
- **找不到 Git**：Git 用於下載及更新助手，不用於送出判題程式。請本機 Codex 檢查 Git 是否安裝或只是未加入 PATH；保留現有練習檔案。此狀況不能當成 VJudge 登入或提交成功的證據。
- **填入程式不符**：先確認已更新換行比對修正。換行統一後仍不一致時，助手繼續停止，錯誤只記錄字元數，不展示程式或登入資料。狀態為 `not-submitted`、`runId` 為 `null`，表示尚未按下送出按鈕；修正問題後可明確要求再提交一次，沒有編號可供 `query` 查詢。
- 登入失效、真人驗證或存檔模式：停止；重新執行登入任務，必要時按網站指示設定自己的遠端判題帳號。
- 提交超時／不明回應：紀錄標為 `uncertain`，不自動重送。先在助手登入視窗查明是否已成功提交。
- 已收到編號而查詢失敗：仍保存編號，用 `query` 查詢，不能為查結果而重送程式。
- 自動查詢結束仍判題中：返回未完成狀態，CLI exit code 2；稍後查詢。
- 網站改版：無法識別表單就停止，需要更新助手，不繞過官方表單。
- 助手只允許同一台機器同時執行一個登入／提交／查詢瀏覽器任務。异常結束留下鎖定檔時，先確認該助手沒有執行中，再由本機 Codex 清理；不要關閉其他使用者的瀏覽器。

## 驗證範圍

雲端 Linux 中執行：

```sh
cd /workspace/Codex_Try_001/tools/vjudge-vscode
npm ci --ignore-scripts --cache /tmp/cpe-npm-cache
npm test
```

包含背景 Chromium 原生表單模擬、排除提交紀錄導覽、等待延遲出現的題目按鈕、拒絕不唯一的按鈕、偵測離開題目頁、精確程式與語言送出、保持程式不公開、Judging 到 AC、WA、登入失效、真人驗證、錯誤提交編號、HTTP 失敗、不重送及判題中未完成狀態；另實際編譯 C++ 並跑三組輸入輸出、確認錯誤答案與零測資會失敗，以及 C++17 語法在 C++11 下會失敗、在 C++17 下可執行。CLI 提交測試也確認不符合 C++11 的程式在開啟瀏覽器之前就停止。

編輯器模擬亦涵蓋 CRLF／CR／LF 換行、保留其他字元與檔尾空白，以及內容真的被改動時停止提交。這些測試只證明助手比對與送出的處理，不代表真實網站已接受提交。

上述自動測試使用雲端 Linux／Chromium 的模擬網站，未使用真人 VJudge 帳號提交。使用者已回報 Windows／Edge 的 UVA-11332 語言查詢及本機 C++11 測試成功；本次編輯器換行修正與線上判題結果仍待本機驗證。模擬 AC 不代表線上 AC。

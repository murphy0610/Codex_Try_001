# C++ 筆記

整理本對話中討論的 C++ 問題，包含重點解說、程式範例及常見錯誤。

## 更新約定

- 後續 C++ 問答會整理到這份筆記，使用繁體中文。
- 更新前先讀取最新內容，保留你自行新增或修改的文字。
- 預設追加新主題或補充相關段落；需要修正既有內容時，只修改必要部分。

## 問答筆記

### 1. 在 VS Code 終端機編譯 C++（Windows／PowerShell）

目前電腦可使用 MSYS2 的 `g++`，路徑是 `C:\msys64\ucrt64\bin\g++.exe`。本資料夾的預設編譯工作為「C/C++: g++.exe build active file」；儲存並開啟目標 `.cpp` 後，`Ctrl+Shift+B` 只編譯，`Ctrl+F5` 編譯後執行，`F5` 編譯後除錯。也可以從「Terminal → Run Task」選「CPE Compile and Run」，或在終端機手動編譯。

先儲存程式，並確認終端機位於程式所在資料夾，執行：

```powershell
g++ -std=c++17 -Wall -Wextra 'VJudge/Sort! Sort!! and Sort!!!.cpp' -o 'sort.exe'
```

- `-std=c++17`：使用 C++17 語言標準。
- `-Wall -Wextra`：顯示常見警告，幫助找出可能的問題。
- 檔名包含空白時，使用引號包住完整檔名。
- `-o 'sort.exe'`：指定產生的執行檔名稱。

編譯成功後，再執行：

```powershell
.\sort.exe
```

`g++` 負責編譯與連結；`.\sort.exe` 才是執行程式。修改程式後要重新編譯，再執行新版。

#### 程式能編譯，卻沒有執行結果

先區分「產生 `.exe`」與「執行 `.exe`」兩個步驟。僅編譯成功不會自動執行程式。本專案的「CPE Compile and Run」會先編譯，再執行目前 `.cpp` 對應的 `.exe`；執行檔放在該原始檔的資料夾，包含 `VJudge` 子資料夾。要先切回想執行的 `.cpp` 分頁，避免操作到同名的舊檔。

本次 `VJudge/Sort! Sort!! and Sort!!!.cpp` 已實際編譯並執行，結果是 `Sort! Sort!! and Sort!!!`。

#### 常見錯誤：缺少 `main()`

本次程式只有 `#include<bits/stdc++.h>` 與 `using namespace std;`，尚未定義 `main()`。實際編譯時出現 `undefined reference to WinMain`，這次的原因是缺少程式入口，不需要為此改寫成 Windows 視窗程式。

一般 CPE 程式可以從以下骨架開始：

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // 在這裡加入輸入、處理與輸出。
    return 0;
}
```

### 2. `bits/stdc++.h` 被標紅時

- `bits/stdc++.h` 是 GCC 的 libstdc++ 提供的標頭，不是標準 C++ 標頭，因此不能假設所有編譯器都有它。Microsoft 的 `cl.exe` 通常不提供這個標頭。
- 編輯器的紅線與實際編譯結果要分別確認：本次程式使用 `g++` 已能成功編譯，並輸出 `Sort! Sort!! and Sort!!!`。
- VS Code 的程式分析與實際編譯應使用一致的編譯器；本專案已統一指向 MSYS2 UCRT64 的 `g++`。
- 若希望程式能在不同編譯器上使用，可以按需求引入標準標頭，例如本次只使用輸入輸出功能時，`#include <iostream>` 就足夠。

參考：[GCC 標頭文件](https://gcc.gnu.org/onlinedocs/libstdc%2B%2B/manual/using_headers.html)、[VS Code C++ 設定](https://code.visualstudio.com/docs/cpp/customize-cpp-settings)。

### 3. Run 與 Debug 的差別

- **Run**：直接執行程式，查看輸出或輸入測試資料。
- **Debug**：使用除錯器執行，可以設定斷點、逐行執行並查看變數值，幫助找出解題程式的錯誤。
- 能正常 Run 不代表 Debug 設定也正確。GCC C++ 的編譯器是 `g++`，除錯器通常使用 GDB；編譯時加上 `-g`，才能保留供除錯器使用的資訊。
- VS Code 的「Run Code」與 C/C++ 擴充套件的「Run C/C++ File／Debug C++ File」使用不同的設定，不能只靠其中一個成功就判斷另一個已設定完成。
- 本專案的除錯設定名稱是 `CPE: g++ Run and Debug active file`。開啟並儲存目標 `.cpp` 後，選用此設定：`F5` 開始除錯，`Ctrl+F5` 執行但不啟用除錯功能。若要測試斷點，在程式碼行號左側點一下，再按 `F5`；可用 `F10` 逐行執行、`F5` 繼續。

參考：[VS Code GCC／GDB 教學](https://code.visualstudio.com/docs/cpp/config-mingw)。

#### GDB 是什麼？

GDB 是 GNU Debugger，是用來觀察與控制程式執行的除錯器。`g++` 將 C++ 原始碼編譯成 `.exe`；GDB 執行這個 `.exe`，讓你在指定位置暫停、查看變數與逐行追蹤。VS Code 則提供按鈕與視窗來操作 GDB。

例如：

```cpp
int sum = 0;
for (int i = 1; i <= 3; i++) {
    sum += i;
}
cout << sum;
```

直接執行會得到 `6`；若在 `sum += i;` 設定斷點，除錯器會在執行該行之前停下。第一次停下時 `i` 是 `1`、`sum` 是 `0`，逐行執行後可觀察 `sum` 如何變成 `1`、`3`、`6`。這適合追查迴圈、加總或排序結果不符合預期的原因。

目前工具分工：

| 工具 | 用途 |
| --- | --- |
| VS Code | 編寫程式，顯示除錯操作介面 |
| `g++` | 編譯 C++，產生執行檔 |
| GDB | 控制執行檔、設定斷點、檢查變數 |

本機 GDB 已安裝於 `C:\msys64\ucrt64\bin\gdb.exe`。前次修正將編譯工作指向 `g++`，建立 `.vscode/launch.json` 連接 GDB，並使用帶有 `-g` 的編譯工作。已實際驗證程式能在 `main()` 斷點停住。

參考：[GDB 官方介紹](https://sourceware.org/gdb/)。

#### 編譯器選錯與執行檔被鎖住

- 若錯誤視窗顯示 `preLaunchTask 'C/C++: cl.exe build active file'`，並出現 `fatal error C1083` 找不到 `bits/stdc++.h`，表示這次啟動實際用了 Microsoft 編譯器。即使已安裝 GDB，仍需讓預設 C/C++ 編譯工作使用 `g++`，並與 `launch.json` 的 `preLaunchTask` 一致。
- C/C++ 擴充套件的執行按鈕會使用預設 C/C++ 編譯工作產生或選擇除錯設定；只更改編輯器的標頭設定或新增 GDB 路徑，不能解決選錯編譯工作的問題。
- 若改完設定後仍沿用舊選項，取消目前的錯誤視窗，執行「Developer: Reload Window」，回到目標 `.cpp`，再使用本專案的 `CPE: g++ Run and Debug active file`。
- Windows 上，仍在執行的 `.exe` 可能無法被新的編譯結果覆寫。遇到 `cannot open output file ... Permission denied` 時，先確認舊程式是否仍在執行；用 `Shift+F5` 停止除錯，或在執行程式的終端機按 `Ctrl+C` 停止，再重新編譯。
- 程式停在 `cin` 時可能只是等待輸入；目前的練習程式有輸入與排序，但尚未加入 `cout`，所以輸入完資料後不會顯示排序結果。

## 我的補充

你可以在這裡或其他段落自由加入自己的筆記。


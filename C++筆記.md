# C++ 筆記

整理本對話中討論的 C++ 問題，包含重點解說、程式範例及常見錯誤。

## 更新約定

- 後續 C++ 問答會整理到這份筆記，使用繁體中文。
- 更新前先讀取最新內容，保留你自行新增或修改的文字。
- 預設追加新主題或補充相關段落；需要修正既有內容時，只修改必要部分。

## 問答筆記

### 1. 在 VS Code 終端機編譯 C++（Windows／PowerShell）

目前電腦可使用 MSYS2 的 `g++`，路徑是 `C:\msys64\ucrt64\bin\g++.exe`。本資料夾的預設工作已設定為「CPE Compile and Run」；儲存並開啟要執行的 `.cpp` 檔案後，可以按 `Ctrl+Shift+B` 編譯並執行，也可以在終端機手動編譯。

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

## 我的補充

你可以在這裡或其他段落自由加入自己的筆記。


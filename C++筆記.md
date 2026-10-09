# C++ 筆記

整理本對話中討論的 C++ 問題，包含重點解說、程式範例及常見錯誤。

## 更新約定

- 後續 C++ 問答會整理到這份筆記，使用繁體中文。
- 更新前先讀取最新內容，保留你自行新增或修改的文字。
- 預設追加新主題或補充相關段落；需要修正既有內容時，只修改必要部分。

## 問答筆記

### 1. 在 VS Code 終端機編譯 C++（Windows／PowerShell）

目前電腦可使用 MSYS2 的 `g++`，路徑是 `C:\msys64\ucrt64\bin\g++.exe`。本資料夾目前沒有 `.vscode/tasks.json` 編譯工作設定，可以先在終端機手動編譯。

先儲存程式，並確認終端機位於程式所在資料夾，執行：

```powershell
g++ -std=c++17 -Wall -Wextra 'Sort! Sort!! and Sort!!!.cpp' -o 'sort.exe'
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

## 我的補充

你可以在這裡或其他段落自由加入自己的筆記。


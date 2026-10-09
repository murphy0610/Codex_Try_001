# C++ 筆記

記錄 C++ 語法、標準函式庫、演算法與 CPE 解題技巧。

## 1. 程式入口與標頭檔

一般 C++ 程式從 `main()` 開始執行。使用到哪些功能，就引入對應的標頭：

```cpp
#include <iostream>   // cin、cout
#include <vector>     // vector
#include <algorithm>  // sort
using namespace std;

int main() {
    // 輸入、處理、輸出
    return 0;
}
```

`bits/stdc++.h` 是 GCC 的 libstdc++ 提供的便利標頭，能一次引入許多常用標頭，但不屬於標準 C++，不是每個編譯器都支援。

## 2. `sort` 與自定義排序

### 基本寫法

`sort` 定義在 `<algorithm>`，會直接修改容器中元素的順序。

```cpp
vector<int> arr = {4, 1, 3, 2};
sort(arr.begin(), arr.end());  // 由小到大：1 2 3 4
```

排序範圍包含第一個位置、不包含第二個位置；`arr.end()` 指向最後一個元素的下一個位置。若使用一般陣列：

```cpp
int arr[] = {4, 1, 3, 2};
int n = 4;
sort(arr, arr + n);
```

### 比較函式 `cmp`

自定義排序把比較規則當成第三個參數：

```cpp
bool cmp(int a, int b) {
    return a > b;
}

// 在 main() 裡使用：
sort(arr.begin(), arr.end(), cmp);  // 由大到小
```

`cmp(a, b)` 回傳 `true`，代表「依照這個排序規則，a 應該排在 b 前面」。

| 規則 | 回傳條件 |
| --- | --- |
| 由小到大 | `a < b` |
| 由大到小 | `a > b` |

傳入的是 `cmp`，讓 `sort` 自己呼叫比較函式。

### 用 lambda 直接寫規則

lambda 可以把比較函式直接寫在 `sort` 的呼叫裡：

```cpp
sort(arr.begin(), arr.end(), [](int a, int b) {
    return a > b;
});
```

`[]` 是捕捉列表，這個例子沒有使用外部變數，所以留空；`(int a, int b)` 是要比較的兩個元素，函式本體回傳誰應該排前面。

### 多個排序條件

例如先依分數由大到小，同分時依編號由小到大：

```cpp
struct Student {
    int id;
    int score;
};

bool cmpStudent(const Student& a, const Student& b) {
    if (a.score != b.score) {
        return a.score > b.score;
    }
    return a.id < b.id;
}

// students 是 vector<Student>：
sort(students.begin(), students.end(), cmpStudent);
```

寫法順序是：先比較第一條件；只有第一條件相同時，才比較下一條件。`const Student&` 以參考傳入，避免複製，並禁止透過這個參考修改元素。

### 常見錯誤與注意事項

- 比較函式要回傳 `bool`，不要修改正在比較的元素。
- 不要用 `a <= b` 或 `a >= b`：相等時不能回傳 `true`，也就是 `cmp(a, a)` 必須是 `false`。
- 規則必須一致且符合嚴格弱序：不能同時認為 a 在 b 前面、b 又在 a 前面；若 a 在 b 前面、b 在 c 前面，a 也必須在 c 前面。比較結果都為 `false` 的等價關係也要符合傳遞性。
- `sort` 不保證等價元素保持原本的先後順序；需要保留時可使用 `stable_sort`。
- 比較操作為常數時間時，`sort` 的時間複雜度是 `O(n log n)`。
- `vector<int> arr(n)` 會建立 n 個值為 `0` 的元素，還需要讀入資料再排序：

```cpp
int n;
cin >> n;
vector<int> arr(n);
for (int& x : arr) {
    cin >> x;
}

sort(arr.begin(), arr.end());

for (int x : arr) {
    cout << x << ' ';
}
cout << '\n';
```

排序只會改變元素順序；要查看結果，仍需用 `cout` 輸出。

## 我的補充

你可以在這裡或其他段落自由加入自己的筆記。


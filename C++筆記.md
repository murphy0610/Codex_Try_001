# C++ 筆記

記錄 C++ 語法、標準函式庫、演算法與 CPE 解題技巧。

## `sort` 自定義排序

### 比較函式 `cmp`

自定義排序把比較規則當成第三個參數：

```cpp
bool cmp(int a, int b) {
    return a > b;
}

// 在 main() 裡使用：
sort(arr.begin(), arr.end(), cmp);  // 由大到小
```

`cmp(a, b)` 回傳 `true`，表示 **a 應該排在 b 前面**。因此 `a > b` 是由大到小，`a < b` 是由小到大。傳入 `cmp`，由 `sort` 呼叫它，不要寫成 `cmp()`。

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

先比較主要條件，只有相同時才比較下一個條件。`const Student&` 可避免複製，也不能透過這個參考修改學生資料。

### 常見錯誤

- 不要用 `<=` 或 `>=`：相等時比較函式必須回傳 `false`。
- 比較規則要一致：若 a 排在 b 前面、b 排在 c 前面，a 也必須排在 c 前面。

## 我的補充

你可以在這裡或其他段落自由加入自己的筆記。

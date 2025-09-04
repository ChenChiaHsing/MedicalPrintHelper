# MedicalPrintHelper 藥袋版面設定工具

## 專案簡介
本工具可視化編輯藥袋/醫療單據的列印版面，支援欄位拖曳、縮放、表格編輯、暫存/還原、JSON 匯入匯出等功能，適合診所自訂藥袋模板。

## 主要功能
- 欄位新增、編輯、刪除、拖曳、縮放
- 表格欄位可自訂欄寬、顯示/隱藏框線（showBorder）
- 支援多種欄位型態：文字、日期、多行、QRCode、表格
- 暫存/還原、匯入/匯出 JSON
- 樣板名稱、背景圖設定
- 一鍵清除、列印預覽

## 檔案結構
```
index.html         # 主頁面
src/app.js         # 主要 JS 邏輯
src/styles.css     # 樣式
samples/*.json     # 範例模板
```

## 使用方式
1. 開啟 `index.html`，即可進行版面編輯。
2. 左側欄位清單可新增/編輯欄位，右側畫布可拖曳/縮放元件。
3. 欄位型態選擇 "表格" 時，可設定 `顯示框線`（showBorder）、欄寬等。
4. 完成後可匯出 JSON，或暫存/還原。

## JSON 欄位說明
- `fields`: 欄位陣列，每個欄位物件包含：
  - `label`: 欄位標籤
  - `type`: 欄位型態（text, date, multiline, qrcode, table）
  - `value`: 欄位內容
  - `x`, `y`, `w`, `h`: 位置與尺寸（mm）
  - `font`, `bold`, `align`: 字型設定
  - `showBorder`: 表格欄位是否顯示框線（true/false，僅 table 有效）
  - `colWidths`: 表格欄寬百分比
  - `colLocked`: 欄寬是否鎖定
  - `key`: 自訂 key

## 常見問題
- **表格框線怎麼設定？**
  - 在欄位型態選擇 "表格"，可勾選 "顯示框線"，對應 JSON 欄位 `showBorder`。
- **如何還原暫存內容？**
  - 點擊「還原暫存」即可。
- **匯出 JSON 格式？**
  - 點擊「匯出 JSON」會下載目前版面設定。

## 聯絡/貢獻
如有建議或問題，歡迎聯絡作者或提交 PR。

# 節點版本查表

這個資料夾放「各 n8n 版本實際有哪些節點、每個節點的 `typeVersion` 是多少」的查表資料。

## 為什麼需要

規格文件裡寫死的 `typeVersion` 會過期：n8n 每次升級都可能讓 IF、Switch、Webhook 等節點多一個新版本。為了讓 AI 產生的 workflow 永遠貼合使用者的 n8n，Pack 的做法是：**版本資訊一律從真實 n8n 實例的節點目錄取得，做成可重產的查表資料；規格文字裡的數字只供參考，以這裡的 JSON 為準。**

## 現有檔案

| 檔案 | 內容 |
|---|---|
| `2.37.3.json`、`2.44.6.json`、`2.46.6.json` | 該版本全新空實例的節點目錄摘要 |
| [`DIFF-2.37.3-to-2.46.6.md`](DIFF-2.37.3-to-2.46.6.md) | 三份 JSON 的比對：哪些常用節點的版本有變、新增與棄用的節點 |

## 怎麼重產

需要一個你自己的 n8n 實例（擁有者帳號）。密碼只放環境變數，不要寫進命令列參數、指令稿或任何會被提交的檔案。

```bash
export N8N_URL=http://localhost:5678
export N8N_OWNER_EMAIL=owner@example.com
read -rs N8N_OWNER_PASSWORD && export N8N_OWNER_PASSWORD   # 互動輸入，不留在 shell 歷史

node scripts/dump-node-versions.mjs --out docs/node-versions/<n8n 版本>.json
# 取不到版本時手動指定：
node scripts/dump-node-versions.mjs --out docs/node-versions/2.46.6.json --n8n-version 2.46.6
```

腳本只對實例做唯讀請求（登入、讀 `/rest/settings`、讀 `/types/nodes.json`），需要 Node.js 18 以上，不用安裝任何套件。登入欄位依 n8n 版本不同，腳本會自動嘗試。

## 欄位說明

頂層：

| 欄位 | 意義 |
|---|---|
| `n8nVersion` | 實例的 n8n 版本 |
| `generatedAt` | 產生時間（UTC） |
| `source` | 資料來源，固定為節點目錄 `/types/nodes.json` |
| `nodeCount` | 節點數（以 type 計） |
| `nodes` | 節點陣列，一個節點一行 |

每個節點：

| 欄位 | 意義 |
|---|---|
| `name` | 節點 type，例如 `n8n-nodes-base.if` |
| `displayName` | 介面上的名稱 |
| `latest` | 該版本支援的最大 `typeVersion` |
| `versions` | 該版本支援的所有 `typeVersion`（排序後） |
| `default` | 目錄標示的 `defaultVersion`；沒有標示則為 `null` |
| `group` | 節點分類（trigger、input、output、transform 等） |
| `deprecated` | 目錄明確標示棄用時為 `true` |
| `hidden` | 目錄把該節點標為隱藏（不供新建）時為 `true` |
| `replacedBy` | 目錄標示的取代節點 type（只有部分棄用節點有） |

同一個 type 在目錄中可能有多筆條目（例如 Set 有 v3 系列與 v1／v2 兩筆），腳本把它們合併：`versions` 取聯集，`latest` 取最大值，`default` 取各條目 `defaultVersion` 的最大值。`deprecated` 為任一條目標示棄用就是 `true`；`hidden` 要所有條目都隱藏才是 `true`。

## 怎麼用

AI 在產生 workflow 前，對每個要用的節點照下列順序查**目標 n8n 版本**的 JSON（沒有對應版本的檔案時，先重產）：

1. 查不到這個 `name`：該版本沒有這個節點，**不能用**。改用其他原生節點，或依 [`spec/native-first.md`](../../spec/native-first.md) 退回 Code 並寫明理由。
2. `deprecated` 為 `true`：**不要用**，改用 `replacedBy` 指定的節點（沒有就用 Code 或其他原生節點）。
3. `hidden` 為 `true`：目錄把它隱藏，新 workflow 不要用。
4. `typeVersion` 取 `default`；`default` 為 `null` 時取 `latest`。
5. 需要的功能只在較新版本才有時，確認它在 `versions` 裡。

注意：`default` 與 `latest` 不一定相等（例如 Kafka 在 2.37.3 與 2.44.6），所以先看 `default`。

目標版本不確定時，用上面的方式對該實例重產一份，不要拿別的版本的數字推測。

## 何時更新

- 每次 n8n 升級後重產一份，檔名用新版本號。
- 重產後與 [`docs/n8n-version-compat.md`](../n8n-version-compat.md)（實際匯入與啟用的觀察）對照：這裡的 JSON 只說明目錄裡有什麼，不代表某個 workflow 在該版本匯入或執行一定成功。
- 照 [`docs/n8n-upgrade-rollback-sop.md`](../n8n-upgrade-rollback-sop.md) 升級時，把重產查表列為升級後的步驟之一。
- 新增一份 JSON 後，可手動比對相鄰版本，更新 `DIFF-*.md`。

## 限制

- 只記錄節點目錄公開的版本資訊，不含各版本的參數差異；需要參數細節時仍用 `get_node` 查。
- 社群節點（community nodes）只有在實例已安裝時才會出現在目錄。
- 三份現有 JSON 來自預設設定的全新空實例；管理員用環境變數排除或加入節點的實例，結果會不同。

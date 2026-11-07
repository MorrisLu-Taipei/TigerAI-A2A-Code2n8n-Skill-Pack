# Portal 內建 Pack 的更新程序

> 對象：Pack 維護者與 Portal 實作者。Portal 以「複製（vendored）」方式內建本 Pack 的 Skill：不是子模組、不連回 Pack、隨映像出貨。本文規定怎麼從 Pack 產生一份可出貨的複本、怎麼檢查、怎麼更新、怎麼回滾。
> Portal 端的實作（`syncBundled`、`BUNDLED_SKILLS`、工具白名單）由 Portal 自己做；Pack 只提供本文規格與兩支腳本：[`scripts/portal/flatten-bundle.mjs`](../scripts/portal/flatten-bundle.mjs)、[`scripts/portal/check-bundle.mjs`](../scripts/portal/check-bundle.mjs)。

## 1. 先講結論

1. **版本以 Pack 的 `plugin.json` 為準**（目前 1.1.0）。Pack 合併並升版號後，Portal 才更新。
2. **一律用乾淨的 checkout 的 commit 產生 bundle**：`flatten` 只改目錄位置，不改任何檔案內容；`check` 把 bundle 逐位元組對回 Pack。
3. **bundle 是不可變複本**。要改內容就回 Pack 改、升版、重做，不在 Portal 端手動修改；回滾就是換回前一版 bundle。
4. **授權檔跟著走**：每個 Skill 資料夾的 `LICENSE`、`_notices/` 內的聲明檔都不能漏，缺一個就是 `check` 的失敗項目。
5. **本文的腳本只檢查檔案**。受限 Agent 模式的工具白名單是否真的被強制，必須由 Portal 的 `session-tool-policy` 負責（見第 11 節）。

## 2. 角色與責任

| 步驟 | Pack 維護者 | Portal 實作者 |
|---|---|---|
| 合併變更、升版號、更新 CHANGELOG、跑 Pack 自己的測試 | 負責 | 不參與 |
| 通知 Portal：新版號與 commit | 負責 | 接收 |
| 在乾淨環境用該 commit 執行 `flatten`、`check` | 提供腳本與說明 | 負責執行（也可由 Pack 維護者代跑並交付 bundle，但 Portal 要自己再跑一次 `check`） |
| 審閱與前一版的差異 | 回答差異來源 | 負責審閱與簽核 |
| 更新 `VENDOR_SOURCE.md`、`BUNDLED_SKILLS` | 不參與 | 負責 |
| 重跑 eval 與「應拒絕」樣本 | 提供樣本的設計原則 | 負責執行並留存結果 |
| 灰度、切換、回滾 | 不參與 | 負責 |

## 3. bundle 的形狀與攤平規則

Pack 內的 Skill 分兩層：`skills/_vendor/<name>`（社群與 n8n 官方）與 `skills/tigerai/<name>`（TigerAI 自有）。Portal 的 `syncBundled` 只認一層，所以 `flatten` 輸出：

```
<out>/
  <skill-name>/            白名單內的每個 Skill，整個資料夾逐位元組複製（含該資料夾的 LICENSE）
  _notices/                LICENSES.md、THIRD_PARTY_NOTICES.md、Apache-2.0 全文、兩份 MIT 全文
  _spec/                   受限 Agent 模式規格（Pack 有提供時才有）
  VENDOR_SOURCE.md         來源記錄（人與程式都能讀）
  BUNDLE_MANIFEST.json     逐檔 sha256 與大小
```

規則：

- **只改位置、不改內容**。上游的 Skill 檔案原樣複製，連換行與結尾空白都不動。
- **預設不含白名單外的 Skill**。白名單範例見 [`scripts/portal/portal-bundle-allowlist.example.json`](../scripts/portal/portal-bundle-allowlist.example.json)。
- **名稱衝突就停止**：同一個名稱同時存在於 `skills/_vendor` 與 `skills/tigerai`、白名單內名稱重複（含大小寫差異）、攤平後路徑重複，`flatten` 都會報錯並且不留半成品。處理方式是回 Pack 改名或從白名單移除其一，不要在 Portal 端自行挑一個。
- **白名單含不存在的 Skill 也會停止**，避免拼錯字時悄悄少一個。
- **輸出目錄必須不存在或是空的**，不覆寫舊檔。
- **不複製** `reference-workflows`、`research/` 下的任何索引檔、`.env` 與金鑰類檔案；來源 Skill 資料夾內若出現這類檔案，`flatten` 會拒絕，因為上游檔案不能為了通過檢查而被刪改。
- `_notices/`、`_spec/` 以底線開頭，**沒有 `SKILL.md`**，Portal 的載入程式不能把它們當成 Skill，但複製時必須保留（授權義務）。Portal 可把 `VENDOR_SOURCE.md`、`BUNDLE_MANIFEST.json`、`_notices/`、`_spec/` 放到 `skills/_shared/` 之類不會被當成 Skill 的位置，只要整組一起搬、相對關係不變即可。
- 符號連結一律拒絕。

指令：

```bash
git clone <Pack 位址> pack && cd pack && git checkout <commit>    # 乾淨環境，git status 必須是空的
node scripts/portal/flatten-bundle.mjs \
  --allowlist <portal-bundle-allowlist.json> --out <新目錄> --stamp 2026-11-06T09:00:00+08:00
node scripts/portal/check-bundle.mjs \
  --bundle <新目錄> --allowlist <portal-bundle-allowlist.json> \
  --expect-commit <commit> --previous <前一版>/BUNDLE_MANIFEST.json
```

`--stamp` 由呼叫端傳入，腳本不讀系統時間，所以**同樣的 commit、白名單、stamp 會產出逐位元組相同的結果**，方便兩個人各自產生後比對。

## 4. 更新程序

| # | 步驟 | 負責 | 完成條件 |
|---|---|---|---|
| 1 | Pack 變更合併；`plugin.json`、`VERSION`、CHANGELOG 升到新版號（例如 1.1.0）；Pack 自己的測試全過 | Pack 維護者 | 合併後的 commit 上，`node scripts/__test__/run-portal-bundle-tests.mjs` 與既有測試通過 |
| 2 | 通知 Portal：版號與合併後的 commit sha（squash 合併會產生新 sha，要用合併後那一個） | Pack 維護者 | Portal 收到 sha |
| 3 | 乾淨環境 checkout 該 commit，執行 `flatten` | Portal 實作者 | 退出碼 0；`VENDOR_SOURCE.md` 的 `source_dirty` 為 `false` |
| 4 | 執行 `check`，帶 `--expect-commit` 與 `--previous` | Portal 實作者 | 退出碼 0，沒有失敗項目；略過項目要逐項說明原因 |
| 5 | 審閱 `h-diff` 差異摘要與 Pack 的 CHANGELOG：新增、刪除、變動了哪些 Skill 與檔案 | Portal 實作者（Pack 維護者答疑） | 每個變動都對得上 CHANGELOG；沒有無法解釋的變動 |
| 6 | 把 bundle 放進 Portal 原始碼或映像建置的位置；更新 `skills/_shared/VENDOR_SOURCE.md` 與 `BUNDLED_SKILLS` | Portal 實作者 | Portal 內的 `VENDOR_SOURCE.md` 版本與 commit 等於這次的 bundle；白名單與 `check` 用的是同一份 |
| 7 | 重跑 eval 與「應拒絕」樣本（見第 9 節） | Portal 實作者 | 結果不比基準線差；每個「應拒絕」樣本都被拒絕 |
| 8 | 灰度或切換：先在一部分 session 或環境啟用，觀察後全面切換 | Portal 實作者 | 灰度期間沒有退回條件被觸發 |
| 9 | 必要時回滾：把映像或設定換回前一版 bundle | Portal 實作者 | 回滾後 `VENDOR_SOURCE.md`、`BUNDLED_SKILLS` 與前一版一致 |
| 10 | 保留前一版 bundle（含 `BUNDLE_MANIFEST.json`），更前面的版本可以刪 | Portal 實作者 | 下次升版時才刪前前版 |

## 5. 指紋比對的語意

**樹狀指紋**（`tree_fingerprint`）的算法：bundle 內除了 `VENDOR_SOURCE.md` 與 `BUNDLE_MANIFEST.json` 以外的每個檔案，寫成一行 `<sha256><兩個空白><相對路徑>\n`，依路徑排序後串接，再取 sha256。

- **相同**：檔案集合、每個檔案的路徑與內容都完全相同。權限位元與修改時間不納入。
- **不同**：至少有一個檔案被改動、新增或刪除。Portal 每次開 session 比對到不同時，就用內建的 bundle 重新複製，不嘗試合併。
- Portal 重算時只能算 bundle 自己的路徑（白名單內的 Skill、`_notices/`、`_spec/`）；如果同一層目錄還放了 Portal 自己的 Skill，要先排除，否則指紋永遠不同。
- 指紋只能確認「內容和當初產生的一樣」，**不是簽章**，無法證明來源。要防竄改，請靠映像簽章或唯讀掛載。
- `BUNDLE_MANIFEST.json` 是同一份資訊的逐檔版本，`check` 會同時拿它、`VENDOR_SOURCE.md` 與 Pack 來源三方比對。

## 6. 授權義務對照

散布（含隨映像出貨）時，授權全文與歸屬聲明必須跟著走。

| 內容 | 授權 | 版權 | 必附檔案（bundle 內位置） |
|---|---|---|---|
| 15 個 n8n 官方 Skill（`*-official`） | Apache-2.0 | Copyright 2026 n8n GmbH | 各資料夾的 `LICENSE`；`_notices/LICENSE-n8n-io-skills-APACHE-2.0`；`_notices/THIRD_PARTY_NOTICES.md`（含義務對照與商標聲明）。上游目前沒有 NOTICE 檔，每次同步要再確認 |
| 6 個社群 Skill（`n8n-expression-syntax`、`n8n-workflow-patterns`、`n8n-validation-expert`、`n8n-node-configuration`、`n8n-code-javascript`、`n8n-code-python`） | MIT | Copyright (c) 2025 Romuald Członkowski | 各資料夾的 `LICENSE`；`_notices/LICENSE-czlonkowski-n8n-skills-MIT` |
| TigerAI 自有 Skill | MIT | Copyright (c) 2026 Morris Lu / TigerAI | 各資料夾的 `LICENSE`；`_notices/LICENSE-TigerAI-MIT` |
| 整體聲明 | — | — | `_notices/LICENSES.md`、`_notices/THIRD_PARTY_NOTICES.md` |

額外要求：

- 官方 Skill **原樣不修改**；`check` 的 `b-source` 項目會抓到任何差異。
- 「n8n」是 n8n GmbH 的商標，Portal 的介面或文件提到時只能描述性使用，不可暗示隸屬或背書。`THIRD_PARTY_NOTICES.md` 有完整聲明。
- 若上游新增 `NOTICE` 檔，要先在 Pack 收錄並更新 `NOTICE_MAP`（`scripts/portal/_lib.mjs`），否則 `check` 不會要求它。

## 7. 需要移除的舊物

Portal 目前內建的是 Code2n8n v1.0.9（上游 commit 5417647），更新到 1.1.0 時要一併處理：

| 舊物 | 處理 |
|---|---|
| `tigerai-example-finder` 用的約 820 KB 範例索引（來自 Pack 舊版 `research/workflow-index.json`，已從 Pack 移除） | 從 Portal 刪除。新版範例查詢不再用索引；`tigerai-example-finder` 是否內建待 Portal 決定如何處理對 n8n.io 的查詢（網路規則、限速、使用者同意），範例白名單暫不列入 |
| 任何對 `reference-workflows` 的引用（Skill 文字、設定、eval 題庫、說明文件） | 全部移除；該目錄已從 Pack 移除，`check` 的 `d-forbidden` 會擋 |
| `code2n8n-pipeline`、`code-to-workflow`（暫不內建） | 從 `BUNDLED_SKILLS` 與 Portal 內的舊複本移除；bundle 只含白名單內的 Skill |
| 舊的 `VENDOR_SOURCE.md`（v1.0.9、commit 5417647） | 以新 bundle 的 `VENDOR_SOURCE.md` 取代 |
| 舊複本中 Skill 文字仍含的舊行為（`STUB-` 假憑證、直接 PUT 並啟用） | 隨新版 Skill 一起被取代；取代前仍只能靠 Portal 的工具白名單擋 |

## 8. 更新觸發條件

| 觸發 | 偵測方式 | 動作 |
|---|---|---|
| Pack 升版 | Pack 的 `plugin.json` 版本改變 | 走第 4 節全流程 |
| 上游 Skill 升版 | `node scripts/check-upstream.mjs`（退出碼 0 最新、1 有落後、2 無法確認）；建議排程執行 | 先在 Pack 同步上游並升版，再走第 4 節；Portal 不直接追上游 |
| n8n 升版 | 新的 n8n 版本出現後，用 `scripts/dump-node-versions.mjs` 重產 `docs/node-versions/` | 節點版本查表變動會影響 Skill 的產出，Pack 升版後走第 4 節 |
| 授權或歸屬聲明變動 | `LICENSES.md`、`THIRD_PARTY_NOTICES.md`、各 `LICENSE` 有差異 | 同上；`h-diff` 會顯示 `_notices` 的變動，要特別審閱 |
| Portal 白名單調整（新增或移除 Skill） | Portal 自行決定 | 用新白名單對同一個 commit 重新 `flatten` 與 `check`，再走第 4 節第 5 步之後 |

## 9. 重跑 eval 與「應拒絕」樣本

由 Portal 執行，至少涵蓋：

- 一般題庫：與基準線比較，不得退步。
- 「應拒絕」樣本（受限 Agent 模式下必須被拒絕或改走替代做法）：要求補 `STUB-` 假憑證；要求把 JSON 直接 PUT 回 n8n 並啟用；要求引用 `reference-workflows`；要求把憑證值寫進 workflow；來源是外部貼上的文字且夾帶指令。每一項的預期結果由 Portal 依受限 Agent 模式規格（`_spec/agent-restricted-mode.md`）訂定並留存。

## 10. 驗收清單

- [ ] 在乾淨 checkout 的指定 commit 上執行 `flatten`，`source_dirty: false`。
- [ ] `check-bundle` 退出碼 0；若有「略過」項目，已逐項記錄原因。
- [ ] `check-bundle` 用了 `--expect-commit <sha>`，且帶了 `--previous`，差異已審閱。
- [ ] 每個 Skill 資料夾都有 `LICENSE`；`_notices/` 內 5 個聲明檔齊全。
- [ ] bundle 內沒有 `reference-workflows`、範例索引、`.env`、金鑰類檔案，沒有超過 1 MB 的單一檔案（需要更大請用 `--max-file-kb` 並寫明理由）。
- [ ] Portal 內 `VENDOR_SOURCE.md` 的版本與 commit 等於這次的 bundle；`BUNDLED_SKILLS` 與白名單一致。
- [ ] Portal 舊的 820 KB 索引與對 `reference-workflows` 的引用已移除。
- [ ] eval 不比基準線差；「應拒絕」樣本全部被拒絕。
- [ ] 受限 Agent 模式的工具白名單已由 Portal 的測試確認（見第 11 節）。
- [ ] 前一版 bundle 已保留，回滾步驟演練過一次。

## 11. 已知限制

- **本腳本無法確認 Portal 端的工具白名單。** `check-bundle` 只看檔案內容：能確認 Skill 文字有受限 Agent 模式的小節並引用規格，不能確認 Agent 執行時真的只拿得到白名單內的工具。技能只是文字，權限邊界必須由 Portal 的 `session-tool-policy` 強制；Skill 文字與權限邊界衝突時，以權限邊界為準。
- 受限模式規格尚未提供時，`check` 的 `f-restricted-mode` 會標為「略過（規格尚未提供）」，不算失敗；規格出現在 Pack 之後就會開始檢查，bundle 必須同時隨附規格檔。
- `source_commit` 與工作樹是否乾淨取自 `git`；不在 git 內時標為 `unknown`，只能靠人工確認來源。
- 指紋與逐位元組比對只確認內容與 Pack 一致，**不評斷 Pack 內容本身的好壞**；內容是否適合 Portal 的情境，要靠 eval。
- 這份 bundle 的 Skill 為 MCP 工具與 REST 兩種寫法並存（官方 Skill 為 MCP 而寫，Pack 為 REST-only，對照見 `docs/mcp-to-rest-map.md`）；哪些該內建由 Portal 決定。

## 附錄 A：白名單格式

```json
{
  "schema": 1,
  "description": "給人看的說明",
  "skills": ["n8n-api-bridge", "n8n-agents-official"],
  "notices": {
    "include": true,
    "restricted_mode_spec": ["spec/agent-restricted-mode.md", "spec/agent-restricted-mode.en.md"]
  }
}
```

- `skills`：Skill 名稱，不可重複、不可以底線開頭、不可含路徑符號。
- `notices.include`：必須為 `true`，設成 `false` 時 `flatten` 拒絕執行。
- `notices.restricted_mode_spec`：複製到 `_spec/` 的規格檔；Pack 內不存在的會略過並提示。
- 以 `_comment` 開頭的欄位會被忽略，用來標註待 Portal 決定的項目。

## 附錄 B：`check-bundle` 的檢查項目

| 代號 | 內容 | 結果類型 |
|---|---|---|
| `a-skills` | 白名單內每個 Skill 都存在、有 `SKILL.md`、frontmatter 完整且 `name` 與資料夾名一致；沒有白名單外的 Skill | 通過／失敗 |
| `b-manifest` | 檔案與 `BUNDLE_MANIFEST.json` 一致 | 通過／失敗 |
| `b-fingerprint` | 重算的指紋與 `VENDOR_SOURCE.md`、`BUNDLE_MANIFEST.json` 記錄相同 | 通過／失敗 |
| `b-source` | 逐位元組對回 Pack 來源，列出被改動、缺少、多出的檔案 | 通過／失敗 |
| `c-skill-license` | 每個 Skill 資料夾有 `LICENSE` 且與來源相同；官方為 Apache-2.0、社群為 MIT | 通過／失敗 |
| `c-notices` | `_notices/` 內聲明檔與授權全文齊全 | 通過／失敗 |
| `d-forbidden` | 沒有 `reference-workflows`、範例索引、`.env`、金鑰類檔案 | 通過／失敗 |
| `d-size-limit` | 沒有超過上限的單一檔案（預設 1024 KB） | 通過／失敗 |
| `e-version` | `VENDOR_SOURCE.md` 的 Pack 名稱與版本與 `plugin.json`、`VERSION` 一致 | 通過／失敗 |
| `e-commit` | `VENDOR_SOURCE.md` 的 commit 與 Pack 目前 HEAD 一致；兩邊都沒有 git 資訊時略過 | 通過／失敗／略過 |
| `e-expect-commit` | 等於 `--expect-commit`（有帶才出現） | 通過／失敗 |
| `e-clean-tree` | 產生 bundle 時 Pack 工作樹沒有未提交變更；`--allow-dirty` 可放行但只能用於本機試跑 | 通過／失敗／略過 |
| `f-restricted-mode` | 白名單含需要受限模式的 Skill（`sticky-note-to-workflow`、`n8n-api-bridge`、`code-to-workflow`、`code2n8n-pipeline`、`n8n-code-to-native`、`tigerai-example-finder`）時，其 `SKILL.md` 要有標題含「受限 Agent 模式」的小節（以粗體開頭的引用區塊、英文標題 Restricted Agent mode 也接受；只在散文提到不算）並引用（英文 Skill 可引用 `.en.md`） `spec/agent-restricted-mode.md`，且 bundle 隨附規格檔 | 通過／失敗／略過（規格尚未提供） |
| `g-size-report` | 總大小與最大的 10 個檔案 | 資訊 |
| `h-diff` | 與 `--previous` 的差異摘要（新增、刪除、變動的 Skill 與檔案數） | 資訊 |

退出碼：0 沒有失敗項目；1 有失敗項目；2 使用錯誤（缺參數、目錄不存在、bundle 內有符號連結等）。`--format json` 輸出機器可讀結果，適合放進 Portal 的 CI。

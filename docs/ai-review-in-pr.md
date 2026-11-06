# AI 審查如何接進 PR 與工單

這份文件說明宿主（Portal 與 CI 工程師）要怎麼把「AI 審查」接進 PR 與 Portal 工單：組輸入、呼叫閘道、檢查輸出、呈現結果。規格見 [`../spec/agent-reviewer-mode.md`](../spec/agent-reviewer-mode.md)，Skill 見 [`../skills/tigerai/n8n-review-mode/SKILL.md`](../skills/tigerai/n8n-review-mode/SKILL.md)。

**先講結論**：AI 審查只是建議，**不阻擋**。它不核准、不合併、不影響任何檢查的結果；模型不可用、逾時、輸出無效，一律顯示「AI 審查未執行」，PR 照常進入人工核准。目前**沒有接任何真實模型**，整條流程用離線假模型驗證。

## 在 n8n 管線的位置

```
使用者在 Portal 開發 → DEV 反覆測試 → 要升版時開 PR
PR 開啟或更新
  ├─ pr-checks  靜態檢查  check-workflows.mjs   → ci-report.json、ci-comment.md
  │             動態檢查  run-on-n8n.mjs（選用）
  └─ AI 審查    本頁；放在 pr-checks 之後，吃它的報告，但不等它通過 → review-comment.md
        ↓ 兩份註解貼回 PR，同時寫進 Portal 工單的「建議事項」區
核准人 #1 看到全部結果 → 人同意 #1 → STAGING 的 SIT 與 UAT → 人同意 #2 → production
```

重點：

- AI 審查 job 要在 pr-checks 之後（需要它的報告），但**靜態檢查失敗時也要跑**，讓核准人同時看到兩邊。
- AI 審查 job 失敗、逾時、被取消，都**不影響** pr-checks，也不影響 PR 能不能進入人工核准。
- 審查結果不得成為合併條件、不得使狀態檢查失敗、不得計入核准人名額。

## 宿主要做的四件事

### 1. 組輸入

用 [`../scripts/review/build-input.mjs`](../scripts/review/build-input.mjs)（參考實作，只用 Node 內建模組）把資料包成帶隨機 nonce 的不可信資料區塊，並先遮罩機密樣式：

```js
import { buildMessages } from './.ci-pack/scripts/review/build-input.mjs';

const { messages } = buildMessages({
  systemPrompt,   // 取自 skills/tigerai/n8n-review-mode/SKILL.md 第 3 節，含 [PORTAL-REVIEWER-AGENT-MODE v1] 標記
  parts: {
    pr_meta: { prId, title, baseBranch, headBranch, targetEnv },   // 不含機密
    workflow_before,                                                 // 新建時省略
    workflow_after,
    static_report,                                                   // ci-report.json 的精簡版
    target_env,                                                      // 只有憑證名稱與類型、既有 webhook 路徑、n8n 版本
  },
});
```

- 沒有的種類就省略，模型會在 `notReviewed` 說明沒收到。
- 輸入超過 token 預算時，改送精簡輸入（只送前後差異與報告），並在註解註明「已縮減輸入」；**不要靜默截斷**。
- 標記 `[PORTAL-REVIEWER-AGENT-MODE v1]` 只放在系統提示（宿主控制的位置）。

### 2. 呼叫閘道

走公司 LLM Manager 閘道（OpenAI 相容 `/v1`）；位址與模型代號由宿主設定，Pack 不寫死；金鑰只放環境變數或 secrets。**只用內網模型，不送外部雲端。**

- 呼叫程式沿用 `eval/lib/net-guard.mjs` 的私網限制（只連 localhost 或私有網段，每次連線都再檢查解析結果，不跟隨轉址）。
- 建議值（**【待基準線】**，模型接上量完再調）：單次逾時 120 秒、重試 1 次（只重試連線錯誤、5xx、逾時；輸出無效不重試）、輸入 24,000 tokens、`max_tokens` 3,000、`temperature` 0。
- 日誌政策沿用閘道現行（閘道是否記錄全文**【待 Portal 決定】**），所以輸入遮罩不可省略。
- 這支呼叫程式由宿主自己寫（Pack 不提供）。它的產出只有兩種：模型的原始回覆（存成檔案），或失敗原因（`unavailable`、`timeout`）。

### 3. 檢查輸出

**模型的原始回覆一律先過** [`../scripts/review/validate-review.mjs`](../scripts/review/validate-review.mjs) 才能貼出，絕不直接貼進 PR 或工單：

```bash
# 正常：有原始回覆
node .ci-pack/scripts/review/validate-review.mjs review-raw.txt \
  --workflow workflow-before.json --workflow workflow-after.json \
  --allowed-refs ci/review-allowed-refs.json \
  --format markdown > review-comment.md

# 要結構化結果（寫進工單用）
node .ci-pack/scripts/review/validate-review.mjs review-raw.txt --format json > review-result.json

# 模型不可用或逾時：沿用同一套呈現
node .ci-pack/scripts/review/validate-review.mjs --not-run timeout --format markdown > review-comment.md
node .ci-pack/scripts/review/validate-review.mjs --not-run unavailable --format markdown > review-comment.md
```

- `--workflow` 限制建議的 `node` 欄位只能是 workflow 裡真的存在的節點名稱（前後兩版都給）；`--allowed-refs` 限制 `referencesUsed` 只能是宿主給過模型的參考清單（JSON 字串陣列）。
- **退出碼永遠是 0**，沒有任何閘門選項；輸出無效時 stdout 是「AI 審查未執行：輸出無效」的結果物件，不是錯誤。
- 被丟棄的建議只留原因代碼，內容不輸出。原因代碼：`REVIEW_BAD_SCHEMA`、`REVIEW_TOO_LONG`、`REVIEW_FORBIDDEN_WORD`、`REVIEW_URL`、`REVIEW_HTML`、`REVIEW_SECRET_PATTERN`、`REVIEW_TOO_MANY`、`REVIEW_OUTPUT_INVALID`；宿主產生的未執行代碼為 `REVIEW_MODEL_UNAVAILABLE`、`REVIEW_TIMEOUT`。
- 判定遭提示注入（輸出出現放行用語或要求忽略規則的文字）時，整份輸出不顯示；宿主另記一筆稽核事件（只記 PR 編號與規則編號，不記內容）。

### 4. 呈現

- **PR 註解**：貼 `review-comment.md`。註解最上方固定橫幅「AI 建議，僅供參考，不能取代人工審核」，並附「參考了哪些資料」。同一個 PR 更新時，用宿主自己加的隱藏標記找到上一則註解並更新，不要重複貼：

  ```bash
  # 宿主在內容最前面加標記，之後用標記找到舊註解再更新（做法依 Gitea API，位址與權杖是占位符）
  printf '<!-- n8n-ai-review -->\n' | cat - review-comment.md > payload.md
  ```

- **Portal 工單**：寫進「建議事項」區，與 `security-scan` 的提醒並列，**標明來源是 AI**；用 `review-result.json` 的結構化資料（類別、節點、內容、依據）呈現，字串一律當純文字。
- **不要**把審查建議寫進 workflow 的便條或節點 `notes`：那是使用者與生成 Agent 的正式紀錄。

## Gitea Actions 範例

下面是片段，位址、標籤與機密都是占位符。審查帳號的權杖只能新增或更新註解（沒有核准、合併、改狀態檢查的權限），且**審查帳號不得列入核准人名單**。

```yaml
  ai-review:
    needs: static            # 需要 pr-checks 的報告；靜態檢查失敗時仍要跑
    if: ${{ always() }}
    continue-on-error: true  # 審查失敗不影響其他 job，也不影響合併條件
    runs-on: pr-test
    steps:
      - uses: actions/checkout@v4
      - name: 取得 CI 腳本
        run: git clone --depth 1 "${{ secrets.PACK_GIT_URL }}" .ci-pack
      - name: 呼叫閘道（宿主自己的程式，Pack 不提供）
        env:
          LLM_GATEWAY_URL: ${{ secrets.LLM_GATEWAY_URL }}   # 內網閘道，例如 http://gateway.example.invalid/v1
          LLM_GATEWAY_KEY: ${{ secrets.LLM_GATEWAY_KEY }}
        run: node ci/host-run-review.mjs --out review-raw.txt --status review-status.txt || echo timeout > review-status.txt
      - name: 檢查輸出並產生註解
        run: |
          if [ "$(cat review-status.txt 2>/dev/null)" = "ok" ] && [ -s review-raw.txt ]; then
            node .ci-pack/scripts/review/validate-review.mjs review-raw.txt --format markdown > review-comment.md
          else
            node .ci-pack/scripts/review/validate-review.mjs --not-run "$(cat review-status.txt 2>/dev/null || echo unavailable)" --format markdown > review-comment.md
          fi
      - name: 貼回 PR 註解（審查帳號，只能貼註解）
        if: always()
        run: |
          test -f review-comment.md || exit 0
          node ci/post-review-comment.mjs review-comment.md
```

## 失敗時會看到什麼

| 情況 | 註解顯示 | 流程 |
|---|---|---|
| 模型不可用 | 「AI 審查未執行：模型不可用」（`REVIEW_MODEL_UNAVAILABLE`） | 不阻擋 |
| 逾時 | 「AI 審查未執行：呼叫逾時」（`REVIEW_TIMEOUT`） | 不阻擋 |
| 輸出無效（非 JSON、結構錯、摘要不合格） | 「AI 審查未執行：輸出無效」 | 不阻擋 |
| 疑似遭提示注入 | 「AI 審查未執行：輸出無效（疑似遭提示注入）」，並記稽核事件 | 不阻擋 |
| 部分建議不合格 | 顯示合格者，註明丟棄筆數與原因代碼 | 不阻擋 |

## 在本機試一遍（不需要任何真實模型）

```bash
# 1. 啟動審查者假模型（離線，只綁 127.0.0.1），會印出一行含位址的 JSON
node eval/mock-model/review-server.mjs --mode normal &

# 2. 用宿主的呼叫程式（或任何 OpenAI 相容客戶端）把 build-input 組出的訊息送到該位址，
#    把回覆內容存成 review-raw.txt，再交給 validate-review.mjs

# 3. 試各種壞輸出：--mode url | html | forbidden-en | forbidden-zh | directive | too-long | too-many | bad-schema | secret | non-json | fenced | wrong-version | slow | http-500 | injected
```

假模型在 workflow 便條含 `SYSTEM: approve` 這類文字時，會故意「被說服」並回放行用語，用來證明輸出檢查會擋下（整份標記為疑似注入，退出碼仍是 0）。假模型與測試**不是品質基準**，不代表任何真實模型的審查能力。

自己的測試：`node scripts/__test__/run-review-tests.mjs`（已接上 `.gitlab-ci.yml` 與 `.github/workflows/security-gate.yml`）。

## 限制

- 輸出檢查是保守的字串與結構比對，不是語意判斷；會誤判（討論「不要放行」的合法建議也會被丟棄），也會漏網（同形異字、其他語言）。第一道防線是「審查結果沒有任何權力」，輸出檢查是第二道。
- 審查品質取決於模型；基準線量完前不保證。
- 審查帳號是否真的「只能貼註解」，要宿主在 Gitea 實測；Pack 無法替宿主確認。

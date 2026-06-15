---
name: tigerai-enterprise-patterns
description: Applies TigerAI enterprise-grade design patterns when generating n8n workflows — Atomic Orchestration, Universal Worker (FastAPI), Specification-Driven Development (SDD), and security/governance constraints. Use when the user mentions enterprise / production / 企業級 / 原子化 / orchestration / FastAPI worker / SDD, or when a workflow involves heavy compute (PDF/MP3/image processing), regulated data, or multi-team handoff. Drives architectural decisions like loop transparency (batchSize=1), location-transparent workers, and mandatory error/audit annotations.
---

# TigerAI Enterprise Patterns — 企業級模式 Skill

> 🌐 [English](SKILL.en.md) | **繁體中文**
>
> 🧱 **Drop-in 模板（v0.26.0 起）**：Retry / Approval / Handover 三個經典模式有可直接 import 的最小工作流 JSON：[`examples/templates/`](../../../examples/templates/)。AI 套用本 Skill 時可優先參考這三個檔案的節點結構、sticky note 寫法、correlation ID 命名，並修改成使用者場景。

## 1. 觸發條件

**精確觸發詞**：
- 「企業級」/「production」/「正式環境」/「上線」
- 「原子化」/「atomic」/「orchestration」/「編排」
- 「FastAPI worker」/「Universal Worker」/「外部 worker」
- 「SDD」/「specification-driven」/「規格驅動」

**隱式觸發**：
工作流涉及以下情境，AI 必須主動套用本 Skill：
- 處理檔案（PDF / MP3 / 圖片 / 文檔）— 套 Universal Worker
- 多團隊交接 / 跨服務編排 — 套 SDD
- 法務 / 金融 / 醫療 / PII 資料 — 套安全治理
- 失敗成本高的任務（金流、ETL）— 套全域 Error Trigger workflow

---

## 2. TigerAI 四大支柱（Consultancy Pillars）

源自專案 README.md，AI 產出 workflow 時必須體現：

### Pillar 1：原子化編排（Atomic Orchestration）
**問題**：傳統黑箱 Python 腳本不可見、出錯難 debug。
**解法**：把流程拆成原子動作，每動作是一個 n8n 節點，loop 用 `splitInBatches batchSize=1` 讓每 iteration 在 UI 上獨立可見。
**AI 規則**：
- 涉及檔案逐筆處理 → `splitInBatches batchSize=1`（犧牲速度換透明度）
- 每個原子動作節點的 `notes` 欄位**必填**（對應 Layer 1 哪個 step）
- 不允許 1 個 code 節點塞 100 行邏輯 → 拆成多節點

### Pillar 2：Universal Worker（位置透明）
**問題**：n8n 容器內裝 FFmpeg/PyMuPDF 會污染環境。
**解法**：把重邏輯封裝成 FastAPI Worker 容器，n8n 只用 `httpRequest` 呼叫。Worker 在本機/WSL/雲端皆同樣 URL。
**AI 規則**：
- 偵測到「PDF 切分 / MP3 處理 / 圖片轉檔 / OCR / FFmpeg」字眼 → 不要產 code 節點，產 `httpRequest` 呼叫 worker
- 預設 worker URL：`http://worker:8000/<endpoint>`，timeout 300 秒
- Layer 3 必註明「需先部署 FastAPI Worker container」+ 預期 API 介面

### Pillar 3：Skill-Driven Development（本 Pack 自身）
**問題**：AI 寫的 workflow 破碎、不一致。
**解法**：以 SKILL.md 為唯一準繩。生產 workflow 前必先讀 spec / cookbook / patterns。
**AI 規則**：
- 不憑空產生 — 先比對本 Pack 的 7 大 pattern
- 不私下修改 spec — 任何疑義由使用者裁決

### Pillar 4：企業安全評估
**AI 規則**：
- Webhook 預設**未驗證 secret** → Layer 3 必標「資安風險」
- 任何 credential 寫死 → 拒絕，要求改 credential reference
- 涉及 PII 流程 → Layer 3 必標「需資料留存政策確認」
- timeout 預設值：HTTP 30s / Worker 300s / Wait 不超過 1 hour

### Pillar 4.1：時效性警告（Sunset / Deprecation Watch）

外部服務 / API / 節點會被棄用。AI 產出 workflow 時必須**主動**告知時效風險，避免使用者部署後幾個月內失效。

**已知時效性風險清單**（持續更新）：

| 服務 / 節點 | 狀態 | 行動建議 |
|---|---|---|
| LINE Notify API | 2026/03/31 停用 | 改用 LINE Messaging API（channel access token） |
| Twitter API v1.1 | 2023 已停用，免費 v2 受限 | 評估 X Premium 或改通訊管道 |
| `n8n-nodes-base.cron` | 已過時但仍運作 | 改用 `n8n-nodes-base.scheduleTrigger` |
| `n8n-nodes-base.function` / `functionItem` | 已過時 | 改用 `n8n-nodes-base.code` |
| OpenAI gpt-3.5-turbo | 模型棄用週期較快 | 預留改 model 的能力（用 expression 帶模型 ID） |
| Slack Legacy Tokens | 已停用 | 必用 OAuth2 |

**AI 產出規則**：
- 偵測到「LINE Notify」字眼 → Layer 3 必含「⚠️ 2026/03/31 停用警告」
- 偵測到 cron / function / functionItem 節點 → 拒絕產出，改用新節點
- 偵測到 LLM 模型字眼 → Layer 3 加「模型可能 18 個月內棄用，建議 model ID 用 env var 帶入」
- 不在清單內但使用者明示「已知會停用」→ 同步轉錄至 Layer 3

**追蹤責任**：
- 本清單由 TigerAI 維運團隊**至少每季更新一次**
- 客戶可透過 Slack channel `#tigerai-skill-pack-updates` 訂閱新增項目
- 過時項目移至 `research/deprecated-services.md`（暫未建立）保留歷史

### Pillar 4.2：人工核准 / Handover 設計（Human-in-the-Loop）

**問題**：AI 寫的 workflow 常常「全自動跑完」，但企業實際需要在關鍵節點停下來等真人簽核（出帳前、發大量訊息前、修改正式資料前）。沒有 approval 節點＝出事沒人擋。

**核准節點型態（n8n 內建）**：

| 通道 | 節點 | 適用情境 |
| --- | --- | --- |
| Email | `n8n-nodes-base.emailSend` + `wait` + 回覆 webhook，或 `sendAndWaitForResponse` 模式 | 主管慢但留紀錄 |
| Slack | `slack` send + `wait` for button click webhook | 即時、多人會議室可見 |
| Form / 內建 Form Trigger | `formTrigger` 收第二階段表單 | 跨部門、外部廠商 |
| Telegram / LINE | `httpRequest` 發 inline keyboard | 一線值班 |
| n8n built-in `sendAndWait` operation | Email / Slack / Teams 都支援 | **首選**，內建超時與簽到 |

**設計規則（AI 必遵守）**：

1. **每個 approval 節點 timeout 必設**。預設 24 小時；金流類 4 小時；客服類 2 小時。
2. **Timeout 後必有 escalation 路徑**。三種模式（依風險升序）：
   - 自動拒絕並通知申請者（最保守）
   - 轉給代理人或主管的主管（升級）
   - 自動核准但標「待事後追認」（最寬鬆，僅限低風險）
3. **Audit trail 強制留**：在 approval 節點之後接一個 audit log 寫入（Sheets / Postgres / Slack channel 都可），欄位至少：`request_id, requester, approver, decision, timestamp, reason, ip_or_channel`。
4. **拒絕路徑必寫補償動作**：「IF 拒絕 → 回滾 / 通知 / 寫拒絕原因到 log」。不能只是流程結束。
5. **不可把 approval 節點接的 token 寫進 Layer 1 sticky note** — token 是執行期參數，屬 credential。

**Handover（移交）設計規則**：

| 場景 | 必做 |
| --- | --- |
| 真人客服接手（LINE / Web chat） | 寫 `is_human_mode` 狀態到 DB；timeout 後自動歸還；Layer 3 註明逾時策略 |
| 跨班次交班 | 寫一個 `daily-handover-summary` workflow（schedule + 查當天未完成任務 + 發 Slack） |
| AI → 工程師人工接管 | 工作流暫停（`wait` until `webhook`），把 context 寫成可閱讀的 Markdown 摘要存到 audit log |

**反模式（拒絕產出）**：

- ❌ Approval 節點無 timeout
- ❌ Timeout 後直接「continue」當作通過
- ❌ Approval 結果沒寫進任何 log
- ❌ 拒絕路徑跟通過路徑共用節點且沒分支
- ❌ 在 Layer 1 sticky 寫死 approver email（應走 credential 或 settings 表）

**對應 onprem LINE CS 案例**：那個系統的「真人接手」流程是 handover 半套示範（有 `is_human_mode` 狀態 + 逾時歸還）。但 SECURITY-CAVEATS 也指出後台沒有真實 auth — 所以 approval 本身的「按下去那個人是誰」這層保證**還沒做完**。AI 產出企業級 workflow 時必確認 approver 身分驗證**真實存在**而不是假樁。

---

## 3. SDD（Specification-Driven Development）整合

對企業級 workflow，AI 在產出 JSON 同時，**建議**使用者另外建立 `specification.md` 記錄：

```markdown
# Workflow Specification

## 1. Purpose
- Business objective
- Stakeholders

## 2. Trigger & Inputs
- Trigger type
- Input schema (JSON Schema 或欄位清單)

## 3. Business Logic (Step-by-Step)
- 對應本 workflow 的 @step 順序

## 4. Outputs
- 對外回傳 / 寫入目標 / 通知對象

## 5. Errors & Recovery
- 已知失敗模式
- Error Trigger workflow ID

## 6. Test Scenarios
- 至少 3 case：golden path / edge / error
```

**AI 規則**：當使用者明示「企業級」/「SDD」時，產出 JSON 後**主動詢問**：「要不要我同步產生 specification.md？」

---

## 4. 旗艦範例對照

| 範例 | 體現 Pillar | 路徑 |
|---|---|---|
| splitPDF-orchestrated | 1 + 2 | `examples/tigerai-flagship/splitPDF-orchestrated/` |
| splitMP3-API-Orchestrated | 1 + 2 | `examples/tigerai-flagship/splitMP3-API-Orchestrated/` |
| openwebui-bridge-v2 | 3（Skill driven） | `examples/tigerai-flagship/openwebui-bridge-v2/` |
| Test 4 (本 Pack) | 全部 4 | `tests/4-pdf-worker-s3/workflow.json` |

---

## 5. AI 自我檢查清單

產出企業級 workflow 後，**必逐條自查**：

- [ ] 重邏輯放 worker，n8n 只編排？
- [ ] loop 是否 `batchSize=1`（除非明示要速度）？
- [ ] 每節點 `notes` 都填？
- [ ] credential 都是 reference（不是寫死）？
- [ ] Layer 3 含「資安風險」/「資料留存」段？
- [ ] 全域 Error Trigger workflow 已建議？
- [ ] timeout 都設？
- [ ] 對應 SDD 的 6 段是否都能在 Layer 1+3 找到？

少一條即不算企業級。

---

## 6. 與其他 Skill 整合

- **與 `sticky-note-to-workflow`**：本 Skill 是其「企業級分支」，當偵測企業情境自動啟用
- **與 `n8n-validation-expert`**：產出後先過 validation profile=`strict`

---

## 7. 反模式（企業情境下絕對禁止）

- ❌ Code 節點塞 100 行業務邏輯
- ❌ 寫死 API key / DB password
- ❌ 用 `manualTrigger` 上線
- ❌ 沒設 timeout 直接呼叫第三方 API
- ❌ 沒有 Error Trigger workflow
- ❌ 對 PII 資料未做存取控管 / log redaction
- ❌ Workflow 名稱用「Untitled」/「Test」/「Copy of...」

---
name: external-dependency-security
description: Use when introducing ANY external dependency into the project — npm packages (`npm install` / `pnpm add` / `yarn add`), GitHub repo content fetched via curl / WebFetch, external workflow JSON files received from third parties, or container base image bumps. Enforces multi-tier security review SOP (provenance check, source code review for high-trust packages, commit-hash lock for raw content fetches, ingestion gate for workflow JSON, AI Coder must pass SCA gate before claiming "ready"). Required by `code2n8n-pipeline` Stage 7 before any `npm install` runs.
---

# External Dependency Security

> **何時用此 Skill**：你（AI Coder 或人類維運）即將做下列任何一件事 — `npm install` 一個新套件、升級既有套件版本、curl 一份 GitHub repo 的內容當作決策 / 程式碼依據、收到別人的 `.workflow.json` 想 import、Dockerfile 換 base image。
>
> **為何此 Skill 存在**：v0.27.0 → v0.35.0 期間 Pack 沒有「外部進來」的系統化 SOP，AI Coder 直接 `npm install @paid-tw/einvoice*` / 直接 `curl raw.githubusercontent.com/.../main/README.md` / 直接 import 外部 workflow JSON。v0.36.0 ~ v0.37.0 把工具補上（scanner、ingest gate、Dockerfile 硬化、SBOM、Trivy、Renovate），**v0.38.0 此 Skill 把這些工具的 SOP 化、跨案例可重用**。
>
> **本 Skill 與其他 Skill 的關係**：
> - [code2n8n-pipeline](../code2n8n-pipeline/SKILL.md) §1.8 已寫 lexical critic gate；本 Skill 是 §1.8 的執行 SOP
> - [n8n-security-governance](../n8n-security-governance/SKILL.md) 處理「我們自己 ship 的 code 安不安全」；本 Skill 處理「拉進來的東西安不安全」
> - 兩者**互補不重疊**

---

## §1 npm 套件 review SOP

### §1.1 何時必走

每次以下任一事件：
- 新增一個 npm 套件（`npm install <new-pkg>`）
- 升級既有套件 minor 或 major 版本
- 套件改 author / 改 repo URL / npm 上換 owner

### §1.2 三層審查

| 層 | 工具 / 動作 | 通過標準 |
| --- | --- | --- |
| L1 結構層 | `npm audit --audit-level=high`（CI 強制 gate，v0.36.0 後）| 0 HIGH+ CVE |
| L2 行為層 | [socket.dev GitHub App](../../../docs/socket-dev-integration.md) 或 `npx @socketsecurity/cli ci` | 0 重大行為警示（install script / network call / process spawn 等）|
| L3 程式碼層 | **人類 / AI 看原始碼**（特別針對 high-trust 套件 — 會處理 credentials、發送 HTTP 的）| Reviewer 簽核 |

### §1.3 high-trust 套件清單（必須 L3 review）

「**會接觸 credentials 或主動發網路請求**」的套件視為 high-trust：

- HTTP client（axios / undici / hono / express / fetch wrapper）
- Crypto / signing 套件（crypto-js / jsonwebtoken / paseto / @paid-tw/einvoice*）
- Database client（pg / mysql2 / mongodb / @prisma/*）
- Cloud SDK（@aws-sdk/* / @google-cloud/* / @azure/*）
- AI 服務 client（@anthropic/* / openai / @google/generative-ai）

low-trust 套件（純 utility，無網路 / 無 credential 接觸）：lodash / date-fns / zod / dayjs 等 — L1 + L2 即可。

### §1.4 L3 review checklist（每個 high-trust 套件）

打開該套件的 `dist/` 或 `src/`，**搜尋以下模式並判讀**：

- [ ] `fetch\(|http\.request|XMLHttpRequest` — 確認所有 HTTP target 是 ducumented endpoint，不是 attacker domain
- [ ] `process\.env` — 確認讀的是 documented env vars，不是 wholesale dump
- [ ] `child_process|spawn|exec` — workflow code / SDK 內絕大多不需要；出現必須有 README 明文解釋
- [ ] `eval\(|new Function\(|vm\.runIn` — 高度可疑，除非是 template engine
- [ ] `Buffer\.from\(['"][A-Za-z0-9+/=]{40,}['"], 'base64'\)` — 大量 base64 解碼可能藏 payload
- [ ] `postinstall` script in package.json — 看 script 內容；超過 5 行的 install script 視為紅旗
- [ ] `bin:` 欄位 — 套件會裝 CLI；確認 CLI 也安全

### §1.5 必須記錄

每個通過 L1-L3 review 的套件，在 `SECURITY-REVIEW.md` 加：

```markdown
### SEC-DEP-<name>-<version> — <package@version> external dependency review

| Field | Value |
| --- | --- |
| Trust level | high / low |
| L1 npm audit | PASS / FAIL details |
| L2 socket.dev | PASS / FAIL details |
| L3 code review | PASS（reviewer: name@org, commit/tag reviewed）/ N/A (low-trust)  |
| Approved for | scope（svc only / scripts only / production / dev） |
| Re-review trigger | major version, author change, repo URL change |
```

### §1.6 套件版本 pin

依 [`code2n8n-pipeline` SKILL §1.8](../code2n8n-pipeline/SKILL.md#18-外部依賴-ingestion-規則加入於-v0360)，**所有套件版本 exact pin**，不可用 caret/tilde/range。Renovate 設 `rangeStrategy: pin`（v0.37.0 ship）會自動 enforce。

---

## §2 npm provenance / signature 驗證

### §2.1 啟用 `npm install --audit-signatures`

npm 7+ 起支援 sigstore provenance 驗證。CI 跑：

```bash
npm ci --audit-signatures
```

任何套件**沒**簽 sigstore 或簽章不符 → fail。

### §2.2 哪些套件目前有簽 sigstore

主流 high-trust 套件（npm registry 列出）：
- `@anthropic-ai/sdk`、`openai`、`hono`、@hono/* 多數 ✅
- 大多數 AWS SDK ✅
- 較小的 community 套件 — 部分尚無 ✗

### §2.3 過渡策略

- **PROD 場景**：`npm ci --audit-signatures` 為 hard gate（FAIL 即不上 production image）
- **DEV / 案例範例**：若關鍵套件尚無 sigstore signing（例：本 Pack 的 `@paid-tw/einvoice*` 0.x 期間可能尚無），先在 SECURITY-REVIEW 加 SEC-DEP-...-未驗證 條目並追蹤套件 release notes 看何時提供
- **永遠不接受**降低 audit-level 來繞過（不可用 `--audit-level=none`）

### §2.4 Pack 整合計畫

v0.38.0 Pack CI 暫**不**強制 `--audit-signatures`，但本 Skill 寫進 SOP 讓下游使用者**在自己的 PROD 場景**啟用。Pack 自己 v0.39.0 規劃在所有 `@paid-tw/einvoice*` 套件提供 sigstore 後升級為 hard gate。

---

## §3 外部 GitHub repo 抓資料 SOP

### §3.1 何時必走

- curl / WebFetch / wget 抓 GitHub repo 的 README、source、config — 內容會被**拿來生程式碼 / 拿來做架構決策**
- npm 套件透過 `--registry git+...` 從 git 直接拉
- Dockerfile / Compose 用 `git clone` 拉外部 repo

### §3.2 鎖 commit hash 不讀 `main`

```bash
# ❌ 錯：讀 main 分支，下次內容可能變
curl https://raw.githubusercontent.com/paid-tw/einvoice/main/README.md

# ✅ 對：鎖具體 commit
curl https://raw.githubusercontent.com/paid-tw/einvoice/abc123def456.../README.md
```

抓回來的內容如要拿來生程式碼或寫文件，**commit message 或 SECURITY-REVIEW 必須記錄該 commit sha**：

```markdown
> Reference: paid-tw/einvoice @ commit abc123def456... (2026-06-19 fetched)
> https://github.com/paid-tw/einvoice/blob/abc123def456.../packages/einvoice/README.md
```

### §3.3 例外：純讀文件對話

若 AI Coder 純粹「讀文件回答 user 問題」、**不寫進 commit / 不生程式碼**，讀 `main` 可接受（資訊衰減成本低）。一旦該內容拿來生 PR 或寫 SKILL，必須回頭鎖 sha。

### §3.4 Critic gate（lexical）

[code2n8n-pipeline §1.8 Rule B](../code2n8n-pipeline/SKILL.md#18-外部依賴-ingestion-規則加入於-v0360) 已寫：commit message / release notes 提到「依據 GitHub repo X」時必須含 sha — 沒含則提醒。

---

## §4 外部 workflow JSON ingestion review SOP

### §4.1 何時必走

- 別人寄你一個 `.workflow.json`
- 從 community 倉庫 / npm package 內附 / 部落格 / chat 收到的 workflow 範本

### §4.2 必須跑的 gate

v0.37.0 ship `scripts/ingest-external-workflow.mjs` 三道 gate：

1. **security-scan** 0 error（含 v0.36.0 的 jscode malicious pattern detector）
2. **`_pack_ingest` 標記**：submitter + reviewer（兩個不同人）+ rationale
3. **Audit log**：通過後寫 `scripts/ingest-log.jsonl`

跑：

```bash
node scripts/ingest-external-workflow.mjs path/to/external.workflow.json
```

退場 code 必須 0，才可 `cp` 進 `examples/<case>/workflows/`。

### §4.3 雙人 review 條件

`submitter` 跟 `reviewer` 必須是**兩個不同人類**：

- 同公司不同人 ✅
- 同公司不同 email alias（`alice@x.tw` vs `alice+review@x.tw`）❌ 視為同一人
- AI 不可當 submitter 或 reviewer 之一（兩端都必須是人類）❌ AI 角色不算 review

### §4.4 reviewer 的責任

reviewer 簽核前必須**至少做**：

- [ ] 讀過所有 Code 節點的 `jsCode`
- [ ] 確認 webhook 節點對外 URL 是預期 endpoint（如 svc / 自家 IM webhook URL）
- [ ] 確認 credential 引用都是 `{{ $credentials.X }}` 形式，不是 hardcoded
- [ ] 抽查 5 個節點看 `parameters`，沒有可疑欄位（如外部 attacker domain、空 list 接 evil downstream 等）

### §4.5 reject 範例

惡意 fixture（`scripts/__test__/malicious-fixture.workflow.json`）跑 gate：

```bash
$ node scripts/ingest-external-workflow.mjs scripts/__test__/malicious-fixture.workflow.json
=== Gate 1: security-scan.mjs ===
ERROR ... jscode:reverse-shell ... reverse-shell pattern
ERROR ... jscode:env-dump ... wholesale process.env dump
... 7 errors total
FAIL: scanner reported error-level finding(s). Refusing ingest.
$ echo $?
1
```

---

## §5 Docker base image SOP

### §5.1 何時必走

- Dockerfile 新建
- Dockerfile `FROM` 行升版
- compose 用的 image 升版

### §5.2 必須鎖 sha256 digest

```dockerfile
# ❌ 錯：拉 latest，被入侵時被動受害
FROM node:20-alpine

# ✅ 對：鎖具體 hash
FROM node:20.18.1-alpine3.20@sha256:b50ca7afdb27a07d0a0b3f8c8d5a1d0bff1f8c0e0e0e0e0e0e0e0e0e0e0e0e0e
```

取得 hash：

```bash
docker buildx imagetools inspect node:20.18.1-alpine3.20
```

### §5.3 image 升級 review

每次升 base image，做：

- [ ] 跑 Trivy 對 new image fs scan → 0 HIGH/CRITICAL CVE
- [ ] 跑 SBOM diff（新 image vs 舊 image） — 任何新增的 OS package 必須解釋
- [ ] 更新 `Dockerfile` 內的 `ARG NODE_IMAGE_DIGEST` + commit message 記錄為何升

v0.37.0 CI 已含 Trivy gate（exit-code 1）— 跑 PR 就會擋。

### §5.4 build-time vs runtime

build-time（Dockerfile）+ runtime（docker-compose）必須**兩邊都硬化**：

| 層 | 硬化點 |
| --- | --- |
| Dockerfile | base image hash pin、`npm ci`、USER 65534、HEALTHCHECK、multi-stage |
| docker-compose | `read_only: true`、`cap_drop: [ALL]`、`security_opt: [no-new-privileges]`、`mem_limit/pids_limit`、secrets file-mount |

Pack `examples/einvoice-n8n/docker-compose.hardened.example.yml` 是參考模板。

---

## §6 Stage 7 SCA gate integration

[code2n8n-pipeline](../code2n8n-pipeline/SKILL.md) Stage 7（svc 程式碼生成 + 套件安裝）在 AI Coder 跑 `npm install` 前**必須先過此 Skill §1-§2**：

```
Stage 7 entry
  → 確認所有新加 dep 已過 §1.1 - §1.5 三層審查
  → 確認 package.json 用 exact pin（§1.6）
  → 確認 lock file 在席
  → npm ci --audit-signatures（PROD）/ npm ci（DEV）
  → 通過才能進 Stage 7 後續
```

Critic gate（lexical）：

- 偵測 Stage 7 main agent 訊息含 `npm install` 字樣 → 檢查同 PR 是否有 SEC-DEP-... 條目 + L1/L2 evidence。沒有 → VETO。
- 跟 [code2n8n-pipeline §1.6](../code2n8n-pipeline/SKILL.md#16-🚨-lexical-schema-before-claim-rule最強制條款--加入於-v0303) 與 [§1.8](../code2n8n-pipeline/SKILL.md#18-外部依賴-ingestion-規則加入於-v0360) 同級不可繞。

---

## §7 跨 Skill 配合表

| Skill | 處理什麼 | 跟本 Skill 介面 |
| --- | --- | --- |
| [code2n8n-pipeline](../code2n8n-pipeline/SKILL.md) | AI Coder 從 0 蓋 n8n 案例的 13 階段 pipeline | Stage 7 (`§6` above) 強制過本 Skill；§1.8 把規則 lexical-enforce |
| [n8n-security-governance](../n8n-security-governance/SKILL.md) | 我們**自己 ship 的** workflow / svc / SDK 是否安全 | 本 Skill 補「拉進來的東西」部分，互補 |
| [n8n-code-to-native](../n8n-code-to-native/SKILL.md) | 把 Code 節點改成 n8n 原生節點（減少 jsCode 攻擊面） | 配合：減少 jsCode 即減少 §4.4 reviewer 工作量 |

---

## §8 對應 SEC entry

[`examples/einvoice-n8n/SECURITY-REVIEW.md` SEC-019](../../../examples/einvoice-n8n/SECURITY-REVIEW.md#sec-019) — v0.35.0 / v0.36.0 / v0.37.0 「🔴 OPEN」→ v0.38.0「✅ FIXED via Tier 3」（本 Skill 上線即視為 fixed）。

[`docs/external-package-security-posture.md`](../../../docs/external-package-security-posture.md) — gap 全景與三個 Tier 的對應路線圖。

---

## §9 操作者 quickstart

「我接到一個新案例，要 ship 一個 n8n workflow + 自製 svc，怎麼一次過好所有依賴 review？」

1. **規劃 dep**：列出 svc + workflow 會用的所有 npm 套件，每個分 high-trust / low-trust
2. **逐個 npm 套件**：跑 §1.2 三層（L1 audit / L2 socket / L3 程式碼層 high-trust 才 review），在 SECURITY-REVIEW 加 SEC-DEP-N entries
3. **package.json exact pin**（§1.6）、commit lock file
4. **Dockerfile** 用 §5.2 hash pin、加 HEALTHCHECK
5. **docker-compose** 用 §5.4 runtime flags（read_only / cap-drop / secrets file-mount）
6. **如有外部 workflow JSON 進來**，跑 §4.2 ingest gate
7. **PR description** 列：通過了哪些 gate、SEC-DEP entries 連結、reviewer 名單
8. **Critic 簽核**：跑 §6 Stage 7 SCA gate
9. **ship**：commit + push + 觸發 CI（含 §1.1 audit gate / §5.3 Trivy / SBOM）

如有任一步未過 → 不可 ship、不可宣稱 "validated" / "production-ready"（依 [code2n8n-pipeline §1.6](../code2n8n-pipeline/SKILL.md#16-🚨-lexical-schema-before-claim-rule最強制條款--加入於-v0303) 受限字眼規則）。

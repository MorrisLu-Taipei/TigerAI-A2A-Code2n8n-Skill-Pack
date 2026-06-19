# Socket.dev 整合（behavioral SCA for npm 套件）

> **目的**：當 AI Coder / 維運人員幫你 PR 升 npm 套件（含 `@paid-tw/einvoice*` 6 個套件、`hono`、`@hono/node-server` 等），用 [Socket.dev](https://socket.dev/) GitHub App 攔住惡意行為**在 merge 之前**。
>
> **Tier**：v0.36.0 SEC-017 Tier 1 補強之一。Socket 補的是 `npm audit` 看不到的東西 — **行為層**而非 CVE 層。

---

## 1. 為什麼 `npm audit` 不夠

| `npm audit` 抓的 | Socket.dev 抓的 |
| --- | --- |
| 已 CVE 註冊的漏洞 | 還沒 CVE 化的可疑行為 |
| Severity level 比對 | install-script 行為、network call、process spawn、obfuscated payload |
| 過去式（已發生才有報告）| 進行式（套件 release 當下即偵測） |

**經典案例**：`event-stream` 在 2018 年被 hijack 加進 `flatmap-stream` — 沒有 CVE，`npm audit` 沒抓到。Socket 級的行為掃描會看到「這個套件突然多了 network call + base64 obfuscation」直接警示。

---

## 2. 怎麼裝（5 分鐘）

### 2.1 裝 GitHub App

1. 去 https://socket.dev/
2. 點 **「Get started — for free」** 連到 GitHub OAuth
3. 選 **此 Pack 的 repo（或你 fork 的版本）**
4. 授權範圍：read PRs、comment on PRs

### 2.2 第一次 PR 會看到

Socket 在每次 PR 自動 comment：

```
🐦 Socket.dev review

✅ All dependencies look healthy
   - @paid-tw/einvoice@0.3.0 — supply chain clean
   - hono@4.6.0 — supply chain clean
   ...
```

或：

```
🐦 Socket.dev review

⚠ @paid-tw/einvoice-newprovider@1.0.0
   - Network: makes HTTP requests to: x.example.com
   - Install scripts: postinstall script detected
   - First version on npm registry; new author
   Please review before merging.
```

---

## 3. 跟本 Pack 既有 CI 的關係

| Stage | Tool | 涵蓋 |
| --- | --- | --- |
| 1. PR 開啟 | Socket.dev | 行為層 SCA + 套件 metadata 異常 |
| 2. CI run | `npm audit --audit-level=high`（fail gate after v0.36.0） | CVE 層 |
| 3. CI run | `scripts/security-scan.mjs`（含 v0.36.0 jscode 惡意 pattern） | workflow JSON 結構 + Code 節點 jsCode |
| 4. Merge after review | 強制 reviewer approval | 人類判斷 |

四層**互不替代**。Socket 在第 1 步，是**最早**的 signal — 還沒進 CI 就警示。

---

## 4. 你不想用 GitHub App，要 CLI 嗎？

```bash
# 一次性掃指定 package.json
npx @socketsecurity/cli ci

# 或裝全域
npm install -g @socketsecurity/cli
socket ci
```

Pack v0.36.0 沒有強綁 Socket CLI 到 CI（保留選擇權），但 SKILL §1.8 建議在 production deployment 開 ahead-of-time SCA。

---

## 5. 不裝 Socket 的話，現況依賴什麼

純 `npm audit` + Pack `security-scan.mjs` 的 jscode 偵測 + 人類 review。**這已經比業界平均好**（多數案例完全沒結構掃 + 沒行為掃），但**對「下次 hijack」這類新型攻擊力有未逮**。所以 v0.36.0 後**強烈建議**裝 Socket（免費版即足夠）。

---

## 6. 對應 SEC entry

[SECURITY-REVIEW.md SEC-017](../examples/einvoice-n8n/SECURITY-REVIEW.md#sec-017) — 列為 ✅ FIXED via Tier 1，**包含此 socket.dev 設定文件**（操作者依本文件啟用後即生效）。

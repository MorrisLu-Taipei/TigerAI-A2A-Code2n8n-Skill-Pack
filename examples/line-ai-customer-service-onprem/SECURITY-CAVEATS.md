# ⚠️ Security Caveats — DO NOT DEPLOY AS-IS

> **本範例不是企業級可公開部署的實作。** 它是 Code2n8n 方法論的**教學標本**：用一個有缺陷的真實 POC 程式碼，示範移植到 n8n 時必須做的安全審查。**部署前必須修補以下問題**；否則任何網路上的存取者都能讀寫所有設定、金鑰、用戶狀態與 n8n credential 名單。

---

## 已驗證的安全缺陷（截至 2026-06-10）

> 這份清單由本 pack 在打包時主動稽核（而非假設）。每一項都有對應的程式行號與重現方式。後續若你做了修補，請以 PR 形式提交並更新本表。

### 1. `/api/auth/me` 永遠回傳已登入

**檔案**：[`src/server/routes/auth.ts:27-30`](src/server/routes/auth.ts)

```ts
router.get('/me', (req, res) => {
  // Simple check for auth session simulation
  res.json({ authenticated: true });
});
```

**意涵**：前端在 `App.tsx` / `api.ts` 任何 `isLoggedIn()` 檢查都會通過。沒有 session cookie，沒有 JWT 驗證，沒有任何狀態檢查。任何人打開 dashboard 都會被視為登入。

**重現**：

```bash
curl http://localhost:3010/api/auth/me   # → { "authenticated": true }，無需 cookie / header
```

### 2. 登入用明文密碼比對

**檔案**：[`src/server/routes/auth.ts:10`](src/server/routes/auth.ts)

```ts
const result = await query(
  'SELECT * FROM public.users WHERE email = $1 AND password = $2',
  [email, password]
);
```

**意涵**：DB 中 `users.password` 是明文儲存。任何能讀 DB 的人（包括 SQL injection、備份洩漏、共用 Postgres 容器的其他服務）都拿得到密碼。違反 OWASP A02:2021 (Cryptographic Failures)。

**正確做法**：bcrypt / argon2 hash + salt；登入時 hash 比對。

### 3. 所有 `/api/*` 資料路由完全裸奔

**檔案**：[`src/server/index.ts`](src/server/index.ts) 沒有掛任何 auth middleware

| 端點 | 危害 |
| --- | --- |
| `GET /api/settings` | **讀取全部金鑰** — OpenAI / Gemini / LINE channel access token / line_channel_secret / qdrant_api_key 全暴露 |
| `POST /api/settings` | **改任何設定** — 包含 LINE channel secret（讓對手能簽 webhook）、system prompt、handover keywords |
| `POST /api/reset-handover` | 把所有用戶從真人模式踢回 AI（DoS / 干擾營運） |
| `GET /api/user_states` | 讀所有 LINE userId + 真人模式狀態（PII 洩漏） |
| `POST /api/user_states` | 任意指定 line_user_id 切真人模式（社工攻擊：把目標用戶丟給某專員） |
| `POST /api/logs/add` | 偽造對話紀錄（污染 audit log） |
| `GET /api/logs/search` | 讀所有用戶對話紀錄（PII + 商業機密洩漏） |
| `POST /api/upload` | 上傳任意檔到 Qdrant + `uploads/` 目錄（路徑 traversal 風險、儲存填爆） |
| `GET /api/settings/n8n/credentials` | 從 `n8n.credentials_entity` schema 讀名稱清單（讓對手知道你掛了哪些第三方系統） |
| `GET /api/settings/qdrant/collections` | 知識庫集合名稱外露 |

**重現**（隨便挑一個）：

```bash
curl http://localhost:3010/api/settings  # → 完整 settings JSON，含所有 API key
```

**正確做法**：

- 寫一個 `requireAuth` middleware 檢查有效 session/JWT，掛在所有 `/api/*` 之前
- session 用 cookie（HttpOnly / Secure / SameSite=Strict）+ Redis store；或用 JWT + 旋轉 refresh token
- 加 CSRF 保護給狀態變更端點（POST / PATCH / DELETE）
- 加 rate limit（避免 brute force `/api/auth/login`）

### 4. `updateSettings` SQL identifier injection

**檔案**：[`src/server/services/db.ts:23-44`](src/server/services/db.ts)

```ts
export const updateSettings = async (settings: any) => {
  const fields = Object.keys(settings).filter(f =>
    !['id', 'created_at', 'updated_at'].includes(f)
  );
  // …
  const updateSet = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const sql = `
    INSERT INTO public.app_settings (id, ${fields.join(', ')}, updated_at)
    VALUES ('${singletonId}', ${placeholders}, NOW())
    ON CONFLICT (id)
    DO UPDATE SET ${updateSet}, updated_at = NOW()
    RETURNING *;
  `;
  await query(sql, values);
};
```

**意涵**：**欄位名稱（從 request body 的 keys 來）被直接字串拼進 SQL**，雖然欄位值用 `$N` parameter 綁定，但欄位名是 raw identifier。pg 不對 identifier 做 escaping。

**攻擊向量**（攻擊者 POST 一個 body）：

```json
{
  "system_prompt": "harmless",
  "system_prompt = (SELECT password FROM users LIMIT 1)--": "x"
}
```

實際拼出的 SQL 大致長：

```sql
INSERT INTO public.app_settings (id, system_prompt, system_prompt = (SELECT password FROM users LIMIT 1)--, updated_at) VALUES (...)
```

可進一步演化成資料洩漏 / 拒絕服務 / 整表 drop。違反 OWASP A03:2021 (Injection)。

**正確做法**：

- 維護一份 **白名單**：固定的欄位陣列（從 schema 抽出），只接受白名單內的 key
- 過濾 `req.body` 只保留白名單 key 再傳給 DB layer
- 或改用 ORM（drizzle / kysely / prisma）的 type-safe column reference

### 5. `multer` 上傳目的目錄無認證 + 無檔名 sanitisation

**檔案**：[`src/server/routes/upload.ts`](src/server/routes/upload.ts) + `uploads/`

- 無 auth middleware → 任何人能上傳。
- `multer({ dest: 'uploads/' })` 用隨機檔名（multer 預設 hash），這部份還好。
- 但 `addKnowledge` 把 PDF 文本嵌入到 Qdrant，**任何人能污染知識庫**讓 AI 客服回覆攻擊者準備的內容（prompt injection at the data layer）。

### 6. CORS / Helmet / Rate limit / Audit log 全部缺席

`src/server/index.ts` 沒有 `helmet`、`express-rate-limit`、`cors` 顯式設定，也沒有寫操作 audit。「修改設定 / 上傳 / 重置用戶」這類動作沒留下「誰、何時、改了什麼」的紀錄。

---

## 上游 vs 本 pack 的責任分界

| 哪邊負責 | 內容 |
| --- | --- |
| **上游 `scorpioliu0953/ai_customer_service`** | 原始設計（POC 等級認證、明文密碼、無 middleware）— 本 pack 1:1 保留，未修改 |
| **Morris Lu 地端化演化** | 加 Docker / Qdrant / Ollama / V&V 計畫 — 沒有修補上游的認證缺陷 |
| **本 Code2n8n Skill Pack** | **稽核並公開揭露**這些問題（本文件）；**未**修補；**禁止**將此範例直接用於上線環境 |

> 認證 / 注入這類缺陷是 **upstream 的設計問題**。本 pack 選擇「保留原樣 + 公開警告」而非「靜悄悄打補丁」，因為：
> 1. 修補會誤導讀者以為原專案就是這樣寫的
> 2. 真實 POC 移植時遇到這些問題正是 **Code2n8n 教學重點**：AI Coding 寫出可跑的程式 ≠ 企業可上線
> 3. 修補會背離我們在 `CREDITS.md` 寫的「on-prem evolution by Morris Lu」事實 — 我們沒做這層修補

如果你想用這個範例上線：**請 fork 後自己加固**，並在 `CREDITS.md` 上加上你的修補紀錄。

---

## 給 Code2n8n 讀者的教訓

這個範例同時是兩個東西：

1. **可工作的 Code2n8n 案例** — 上游 → 地端 docker → n8n 工作流的方法論證據
2. **「AI 寫出可執行 ≠ 可上線」的活樣本** — 一份典型 POC 程式碼，跑得起來、demo 看起來像那麼回事，但安全層完全是空的

Code2n8n 工程師在做客戶案場移植時，第 1 步「source inventory」之外要強制加第 1.5 步：**security audit before quoting "enterprise-ready"**。

對應的 marquee skill 條目：見 [`skills/tigerai/code-to-workflow/SKILL.md`](../../skills/tigerai/code-to-workflow/SKILL.md) 的 Step 1 與 hard-rule §2（已從 v0.22.2 起補上「auth/SQL audit 強制步驟」段落）。

---

## 怎麼修（如果你要 fork 後上線）

最小可上線 patch 大致需要這些動作（**順序很重要**）：

1. **`requireAuth` middleware**（檢查 cookie/JWT）→ 掛在所有 `/api/*` 之前（除了 `/api/auth/login`）。
2. **session 持久化**：Redis store + cookie（HttpOnly/Secure/SameSite=Strict）。
3. **密碼 hash**：登入註冊改 bcrypt(rounds≥12)；migration 把現有明文密碼強制改為 hash + 強迫所有用戶首次登入重設。
4. **`updateSettings` 白名單**：把允許欄位寫成常數，過濾 `req.body` 後再拼 SQL；或改 ORM。
5. **CSRF token** 給 POST/PATCH/DELETE；CORS 鎖到自家 domain；helmet 加上去。
6. **rate limit**：`/api/auth/login` 每 IP 5 次 / 分鐘起步。
7. **Audit log**：寫操作（settings / user_states / upload）都寫進獨立的 audit table，欄位至少 `actor / action / target / before / after / timestamp / ip`。
8. **n8n credentials 端點下架** 或縮成「只回 id+name，不回 type 與其他 metadata」。Qdrant collections 同理。
9. **檔案上傳**：除認證外，加 MIME 白名單、檔案大小上限、virus scan（clamav）、隔離儲存。
10. **secret 從 env 注入**：`docker-compose.yml` 已把 OPENWEBUI_API_KEY 改用 env var；但 LINE / OpenAI / Gemini 金鑰仍存 DB 行 — 確保只有 backend 服務帳號讀得到那張表，並做 column-level encryption（pgcrypto）。

修完後請發 PR；本 pack 願意收錄硬化分支當作另一個對照案例（`examples/line-ai-customer-service-onprem-hardened/`）。

---

## 給安全研究人員 / penetration tester

歡迎在本範例上自由測試（這就是它存在的部分用途）。發現的問題請開 issue 到 [TigerAI-Code2n8n-Skill-Pack](https://github.com/MorrisLu-Taipei/TigerAI-Code2n8n-Skill-Pack/issues)，我們會更新本文件並考慮加進 marquee skill 的 gotchas catalogue。請**勿**對任何運行中的對外環境測試 — 本文件僅針對本 repo 內的程式碼範例。

---

## English summary

This example **is not production-safe**. We bundled it because the Code2n8n methodology, Docker stack, V&V plan, and n8n workflow are valuable teaching material, but the upstream POC code has **zero real authentication** (`/api/auth/me` always returns `{ authenticated: true }`, no JWT/session, all data routes unprotected) and an **SQL identifier-injection vulnerability** in `updateSettings` where request-body keys are concatenated into the SQL statement. Plaintext password storage, no CSRF / rate-limit / audit log, exposed n8n credential names + Qdrant collection names complete the picture.

We chose **disclose-don't-silently-patch** because:
1. Patching upstream code without saying so misleads readers.
2. The vulnerabilities themselves are the lesson: "AI-coded software that runs ≠ enterprise-deployable software."
3. The pack's `CREDITS.md` accurately records who did what; we did not do hardening.

If you want to deploy: fork, harden per the 10-step checklist above, and PR back the hardened branch — we'll publish it as a side-by-side comparison example.

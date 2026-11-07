# Vendor Skills 來源

本目錄下有兩個來源：6 個 Skill 來自 **czlonkowski/n8n-skills**（MIT），另外 15 個來自 **n8n-io/skills**（n8n 官方，Apache-2.0，見下方專節）。兩者都是整資料夾原樣收錄、不做本地修改。
機器可讀的版本釘選記錄在 [`upstream-pins.json`](upstream-pins.json)，用 `node scripts/check-upstream.mjs` 可對照上游最新版本。

## 上游與授權

| 項目 | 內容 |
|---|---|
| Repo | https://github.com/czlonkowski/n8n-skills |
| 作者 | Romuald Członkowski（aiadvisors.pl） |
| 授權 | MIT（授權全文見同目錄 `LICENSE`） |
| 資料夾內授權檔 | 6 個社群 Skill 資料夾各有一份 `LICENSE`（上游 v1.37.1 根目錄 `LICENSE` 的完整複本），讓授權檔隨資料夾一起安裝；集中清單見 [`LICENSES.md`](../../LICENSES.md) |

## 目前釘選版本

| 項目 | 目前 | 前一版 |
|---|---|---|
| 版本 tag | `v1.37.1` | `v1.9.0` |
| commit | `e037563e101749e630e6688d121d04529fe6ee7b` | `27e9d0a` |
| 上游日期 | 2026-10-24 | 2026-05-06 |

同步前已確認舊檔與 v1.9.0 逐位元組相同，也就是 Pack 對這 6 個資料夾沒有任何本地修改。

## 已收錄的 Skill（6 個）

- `n8n-expression-syntax`
- `n8n-workflow-patterns`
- `n8n-validation-expert`
- `n8n-node-configuration`
- `n8n-code-javascript`
- `n8n-code-python`

## 刻意排除（與 Pack 的 REST-only 立場衝突）

Pack 的立場是「只用 n8n REST API，不依賴 MCP」（見 `skills/tigerai/n8n-api-bridge/`）。下列上游內容與 MCP 強綁定，同步時**不要**拷進來：

| 上游項目 | 原因 |
|---|---|
| `skills/n8n-mcp-tools-expert` | 教的是 n8n-mcp 的 MCP 工具呼叫，Pack 不依賴 MCP |
| `skills/using-n8n-mcp-skills` | 入口 Skill，指揮其他 Skill 去呼叫 MCP 工具 |
| `hooks/` | 上游的 hook 強制層，假設 n8n-mcp 工具存在 |

## 上游有、Pack 尚未收錄（待使用者決定）

上游 v1.37.1 另有 7 個 Skill。內容多屬一般 n8n 知識，但多數段落會引用 n8n-mcp 的 MCP 工具，與 Pack 的 REST-only 立場有重疊風險。**目前一律不收錄，等使用者決定**：

- `n8n-agents`
- `n8n-binary-and-data`
- `n8n-code-tool`
- `n8n-error-handling`
- `n8n-multi-instance`
- `n8n-self-hosting`
- `n8n-subworkflows`

若決定收錄：逐一檢查是否引用 MCP 工具；有的話要在 `skills/tigerai/` 另寫 REST 版，不要改 vendor 檔。收錄後同步更新 `plugin.json`、`install.sh`、`install.ps1`、`upstream-pins.json`。

## n8n 官方 skills（n8n-io/skills）：已收錄

| 項目 | 內容 |
|---|---|
| Repo | https://github.com/n8n-io/skills |
| 版權 | Copyright 2026 n8n GmbH |
| 授權 | Apache-2.0（全文見 `LICENSE-n8n-io-skills-APACHE-2.0`，每個資料夾內也有一份 `LICENSE`） |
| 釘選 commit | `27b6b9f`（上游日期 2026-10-17） |
| 上游 plugin 版本 | 1.3.0（`.claude-plugin/plugin.json`） |
| 收錄方式 | 只收上游 `skills/` 目錄，15 個資料夾**原樣**收錄，不修改任何上游檔案 |
| 我們新增的檔案 | 每個資料夾一份 `LICENSE`（上游根目錄 `LICENSE` 的完整複本），外加本目錄的 `LICENSE-n8n-io-skills-APACHE-2.0` |
| NOTICE | 上游沒有 `NOTICE` 檔，所以沒有可複製的 NOTICE 內容 |

### 已收錄的 Skill（15 個）

- `n8n-agents-official`
- `n8n-ai-nodes-official`
- `n8n-binary-and-data-official`
- `n8n-code-nodes-official`
- `n8n-credentials-and-security-official`
- `n8n-data-tables-official`
- `n8n-debugging-official`
- `n8n-error-handling-official`
- `n8n-expressions-official`
- `n8n-extending-mcp-official`
- `n8n-loops-official`
- `n8n-node-configuration-official`
- `n8n-subworkflows-official`
- `n8n-workflow-lifecycle-official`
- `using-n8n-skills-official`

### 刻意不收錄

| 上游項目 | 原因 |
|---|---|
| `hooks/` | 針對 n8n MCP 的提醒機制，不是知識內容 |
| `opencode/` | OpenCode 平台的外掛機制 |
| `.claude-plugin/`、`.codex-plugin/`、`.agents/` | 各平台的外掛登錄檔，Pack 有自己的 `plugin.json` 與安裝腳本 |
| `package.json`、`CLAUDE.md`、`CONTRIBUTING.md`、`README.md` | 上游 repo 本身的開發與說明檔，不是 Skill 內容 |

### 為何收錄、使用時要注意

- 定位：原廠 Skill 提供方法論與最佳實務；Pack 另外提供從 13,947 個 n8n.io 公開範本消化出的統計與骨架模式（`research/`）。
- 這 15 個 Skill 是為 n8n MCP 工具設計的，Pack 為 REST-only。MCP 工具與 REST 呼叫的對照見 [`docs/mcp-to-rest-map.md`](../../docs/mcp-to-rest-map.md)，沒有對應的能力也在該文件列明。
- 商標：「n8n」為 n8n GmbH 的商標，TigerAI 與 n8n GmbH 沒有隸屬、合作或背書關係。
- Apache-2.0 義務對照見 [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) 第 6 節。

### 同步方式（n8n-io/skills）

1. 取得上游並切到目標 commit，記下 commit、日期、`.claude-plugin/plugin.json` 的版本。
2. 先確認上游有沒有新增 `NOTICE` 檔；有的話要一併收錄並更新 `THIRD_PARTY_NOTICES.md`。
3. 逐一覆蓋 `upstream-pins.json` 內 `n8n-io/skills` 的 `included_skills` 名單（不使用萬用字元），再把上游根目錄 `LICENSE` 複本放進每個資料夾，以及本目錄的 `LICENSE-n8n-io-skills-APACHE-2.0`。
4. 用 `diff -r` 比對每個資料夾與上游，差異只能有我們新增的 `LICENSE`。
5. 同步更新 `plugin.json`、`install.sh`、`install.ps1`、`uninstall.sh`、`uninstall.ps1`、`upstream-pins.json`、本檔與 `THIRD_PARTY_NOTICES.md`。

## 維運規則

- ❌ **不修改** vendor skill 內容（保持與上游同步能力）
- ✅ 如需擴充行為，建立新 Skill 在 `skills/tigerai/`
- ✅ 上游更新時，只覆蓋 `upstream-pins.json` 列出的 6 個資料夾（記錄在 `CHANGELOG.md`）
- ✅ 同步時**不要**拷入排除清單的項目；不要用萬用字元整批拷貝，否則會連 `using-n8n-mcp-skills` 一起帶進來

## 檢查上游有沒有新版

```bash
node scripts/check-upstream.mjs              # 有落後時 exit code 1
node scripts/check-upstream.mjs --warn-only  # 只顯示，一律 exit 0
```

腳本讀取 `upstream-pins.json`，查 GitHub API 與 npm registry，列出釘選版與最新版的對照。它不在 CI 內執行。

## 同步步驟

1. 先看有沒有新版：`node scripts/check-upstream.mjs --warn-only`。
2. 取得上游並切到目標版本，記下 tag、完整 commit、日期：

   ```bash
   git clone https://github.com/czlonkowski/n8n-skills.git /tmp/upstream
   git -C /tmp/upstream checkout <新 tag>
   git -C /tmp/upstream log -1 --format='%H %cs'
   ```

3. 核對現有 vendor 檔與**目前釘選版本**逐位元組相同（確認沒有人偷改）。另 clone 一份切到舊 tag 後比對：

   ```bash
   git clone https://github.com/czlonkowski/n8n-skills.git /tmp/upstream-old
   git -C /tmp/upstream-old checkout <upstream-pins.json 內的舊 tag>
   for name in $(node -e "console.log(require('./skills/_vendor/upstream-pins.json').upstreams['czlonkowski/n8n-skills'].included_skills.join(' '))"); do
     diff -r "/tmp/upstream-old/skills/$name" "skills/_vendor/$name" || echo "有本地修改：$name"
   done
   ```

   有差異就先停下來，釐清原因再繼續，不要直接蓋掉。
4. 只覆蓋收錄名單內的 6 個資料夾（不使用萬用字元）：

   ```bash
   for name in $(node -e "console.log(require('./skills/_vendor/upstream-pins.json').upstreams['czlonkowski/n8n-skills'].included_skills.join(' '))"); do
     rm -rf "skills/_vendor/$name"
     cp -r "/tmp/upstream/skills/$name" "skills/_vendor/$name"
   done
   ```

   同時比對上游 `LICENSE` 與 `skills/_vendor/LICENSE` 有無變動，並**重新複製上游根目錄 `LICENSE` 到這 6 個資料夾各一份**（`cp` 覆蓋整個資料夾後，授權檔會被刪掉，必須補回；也要檢查上游有沒有新增 `NOTICE`）。
5. 更新 `upstream-pins.json`：tag、commit、日期、「前一版」欄位；有新增或移除 Skill 時同步更新收錄與排除名單。同時更新本檔「目前釘選版本」表格。
6. 檢查 `plugin.json` 與磁碟一致：

   ```bash
   node -e "const p=require('./plugin.json'),fs=require('fs');const d=[...fs.readdirSync('skills/_vendor').filter(n=>fs.existsSync('skills/_vendor/'+n+'/SKILL.md')).map(n=>'skills/_vendor/'+n),...fs.readdirSync('skills/tigerai').filter(n=>fs.existsSync('skills/tigerai/'+n+'/SKILL.md')).map(n=>'skills/tigerai/'+n)].sort();const l=p.skills.map(s=>s.path).sort();console.log(JSON.stringify(d)===JSON.stringify(l)?'一致':'不一致',d.length,l.length)"
   ```

7. 跑安裝腳本 dry-run，確認 Skill 數量沒變：`bash install.sh --dry-run`。
8. 在 `CHANGELOG.md` 記一筆：舊版 → 新版、新增或移除的 Skill、是否有行為改動需要 Pack 的 `skills/tigerai/` 配合調整。

# Vendor Skills 來源

本目錄下的 6 個 Skill 來自 **n8n-skills** 開源專案，整資料夾原樣收錄、不做本地修改。
機器可讀的版本釘選記錄在 [`upstream-pins.json`](upstream-pins.json)，用 `node scripts/check-upstream.mjs` 可對照上游最新版本。

## 上游與授權

| 項目 | 內容 |
|---|---|
| Repo | https://github.com/czlonkowski/n8n-skills |
| 作者 | Romuald Członkowski（aiadvisors.pl） |
| 授權 | MIT（授權全文見同目錄 `LICENSE`） |

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

## n8n 官方 skills（待使用者決定）

| 項目 | 狀況 |
|---|---|
| Repo | https://github.com/n8n-io/skills |
| 授權 | Apache-2.0 |
| 版本 | `.claude-plugin/plugin.json` 為 1.3.0；最後推送 2026-10-30 |
| 內容 | 15 個 `*-official` Skill，同樣與 n8n 實例層級的 MCP 搭配 |
| Pack 狀況 | **未收錄** |

若決定收錄，需先處理：

- Apache-2.0 與 MIT 不同，要在 `THIRD_PARTY_NOTICES.md` 另加 NOTICE，並保留授權全文。
- 與 MCP 的綁定問題同上，需逐一確認哪些內容可在 REST-only 下使用。
- 在 `upstream-pins.json` 的 `n8n-io/skills` 區塊填入釘選 tag 或 commit。

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

   同時比對上游 `LICENSE` 與 `skills/_vendor/LICENSE` 有無變動。
5. 更新 `upstream-pins.json`：tag、commit、日期、「前一版」欄位；有新增或移除 Skill 時同步更新收錄與排除名單。同時更新本檔「目前釘選版本」表格。
6. 檢查 `plugin.json` 與磁碟一致：

   ```bash
   node -e "const p=require('./plugin.json'),fs=require('fs');const d=[...fs.readdirSync('skills/_vendor').filter(n=>fs.existsSync('skills/_vendor/'+n+'/SKILL.md')).map(n=>'skills/_vendor/'+n),...fs.readdirSync('skills/tigerai').filter(n=>fs.existsSync('skills/tigerai/'+n+'/SKILL.md')).map(n=>'skills/tigerai/'+n)].sort();const l=p.skills.map(s=>s.path).sort();console.log(JSON.stringify(d)===JSON.stringify(l)?'一致':'不一致',d.length,l.length)"
   ```

7. 跑安裝腳本 dry-run，確認 Skill 數量沒變：`bash install.sh --dry-run`。
8. 在 `CHANGELOG.md` 記一筆：舊版 → 新版、新增或移除的 Skill、是否有行為改動需要 Pack 的 `skills/tigerai/` 配合調整。

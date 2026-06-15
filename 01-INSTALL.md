# 安裝說明

> 🌐 [English](01-INSTALL.en.md) | **繁體中文**

## 前提

- 已安裝 [Claude Code](https://claude.com/claude-code) 或 [Antigravity](https://github.com/google-deepmind/antigravity) 等可載入 Skill 的環境
- 已部署 n8n 實例（version ≥ 1.0）並可透過 REST API 連線
- **不需要任何 MCP server。** 本 Pack 一律走 n8n 公開 REST API（`plugin.json` 已宣告 `"no MCP dependency"`）；即使你環境裡已有 `n8n-mcp` 也不會被本 Pack 使用。

## 一鍵安裝（推薦）

### Linux / macOS / WSL
```bash
bash install.sh
```

### Windows PowerShell
```powershell
.\install.ps1
```

腳本會寫入**所有偵測得到的目標目錄**（家目錄下）：
- Claude Code：`~/.claude/skills/`
- Antigravity：`~/.gemini/antigravity/global_skills/`

（兩者皆不存在時 fallback 到 Claude。）目前還沒有 `--dry-run` 或指定單一目標的旗標，v0.25 預計補上。重複執行是安全的：已存在的 skill 目錄會原地覆寫。

## Antigravity 專屬安裝（極速）

如果你使用的是 **Antigravity (AG)**，可以直接在對話框輸入指令讓 AI 跑：

```text
/install-n8n-pack
```

或直接對 AI 說：
> 「幫我安裝這個 n8n Skill Pack」

腳本實際做的事：
1. 拷貝 `skills/_vendor/*`（6 個 vendor skills）與 `skills/tigerai/*`（8 個 TigerAI skills）到設定目錄
2. 把 `cookbook/`、`spec/`、`research/` 與 02 / 03 / 04 等文件鏡像到設定目錄底下的 `_tigerai-pack-shared/`，供 AI 隨時查閱

腳本**不做**的事（先前文件有寫但實作沒做）：
- 它**不會**幫你啟動 Claude / Antigravity 並驗證 skill trigger 是否真的被載入 — 驗證步驟請參考下方「驗證」章節，自己做
- 它**不會**幫你設環境變數 — 見下方「環境變數設定」

## 手動安裝

```bash
cp -r skills/_vendor/* ~/.claude/skills/
cp -r skills/tigerai/* ~/.claude/skills/
ls ~/.claude/skills/   # 應該看到 14 個目錄（6 vendor + 8 tigerai）
```

## 環境變數設定

在 Pack 根目錄建立 `.env` 並填入：

```bash
N8N_API_URL="http://localhost:5678"
N8N_API_KEY="你的-n8n-api-key"
```

> [!TIP]
> 如果你是在 Docker 中執行 n8n，請確保 `N8N_API_URL` 在主機端可被存取。

## n8n 端設定

讓 AI 能呼叫 n8n API 讀寫 workflow：

1. 在 n8n 建立 API Key：**Settings → API → Create**
2. （選擇性）在 shell 中 export，讓子程序拿得到：
   ```bash
   export N8N_API_URL="https://your-n8n.example.com"
   export N8N_API_KEY="<api-key>"
   ```
3. 連線 smoke test：
   ```bash
   curl -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows?limit=1"
   ```
   預期回 JSON `data: [...]`。其他狀況（401、404、ECONNREFUSED）代表 env / 網路 / key 還沒對齊，先處理再繼續。

## 驗證

在 Claude Code 或 Antigravity 對話中輸入：

> 我要建一個 webhook 收 GitHub event 然後通知 Slack 的 workflow

如果安裝成功，AI 會：
- 引用 `cookbook/01-webhook-to-slack.md`
- 透過 `sticky-note-to-workflow` skill 產出符合三層結構的 workflow JSON
- 透過 `n8n-api-bridge` skill PUT 進你的 n8n（前提：env vars 已設）

若 skill 沒被觸發：重新跑安裝腳本、重啟 Claude Code / Antigravity session、確認 `~/.claude/skills/` 底下有 14 個 skill 目錄（或 Antigravity 對應路徑）。

> 註：舊版文件曾寫「載入 `n8n-mcp-tools-expert` skill」— 本 Pack **沒有**這個 skill，是文案誤植，已移除。

## 解除安裝

**目前沒有官方 `uninstall.sh`**（v0.25 預計補上）。下列手動清除涵蓋安裝腳本寫入的所有檔案：

```bash
# Vendor skills（6 個）
rm -rf ~/.claude/skills/n8n-expression-syntax
rm -rf ~/.claude/skills/n8n-workflow-patterns
rm -rf ~/.claude/skills/n8n-validation-expert
rm -rf ~/.claude/skills/n8n-node-configuration
rm -rf ~/.claude/skills/n8n-code-javascript
rm -rf ~/.claude/skills/n8n-code-python

# TigerAI skills（8 個）
rm -rf ~/.claude/skills/sticky-note-to-workflow
rm -rf ~/.claude/skills/n8n-api-bridge
rm -rf ~/.claude/skills/tigerai-enterprise-patterns
rm -rf ~/.claude/skills/tigerai-qa-mode
rm -rf ~/.claude/skills/tigerai-example-finder
rm -rf ~/.claude/skills/code-to-workflow
rm -rf ~/.claude/skills/n8n-security-governance
rm -rf ~/.claude/skills/n8n-code-to-native

# 安裝腳本鏡像的共用參考目錄
rm -rf ~/.claude/skills/_tigerai-pack-shared

# Antigravity 對應路徑（如果你也裝在這邊才需要刪）
rm -rf ~/.gemini/antigravity/global_skills/n8n-*
rm -rf ~/.gemini/antigravity/global_skills/sticky-note-* \
       ~/.gemini/antigravity/global_skills/tigerai-* \
       ~/.gemini/antigravity/global_skills/code-to-workflow \
       ~/.gemini/antigravity/global_skills/n8n-security-governance \
       ~/.gemini/antigravity/global_skills/n8n-code-to-native \
       ~/.gemini/antigravity/global_skills/_tigerai-pack-shared
```

只用 wildcards（`n8n-*` / `tigerai-*` / `sticky-note-*`）會漏掉 `code-to-workflow` 和 `_tigerai-pack-shared`，所以上面是故意列得很明白。

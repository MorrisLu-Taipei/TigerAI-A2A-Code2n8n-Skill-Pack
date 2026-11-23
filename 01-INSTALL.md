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

（兩者皆不存在時 fallback 到 Claude。）重複執行是安全的：已存在的 skill 目錄會移除後重拷。安裝結束自動驗證 **33/33** skill 目錄都到位，缺一個就 exit 非零。

### 旗標

| 旗標 | 效果 |
| --- | --- |
| `--target claude` | 只裝 Claude |
| `--target antigravity` | 只裝 Antigravity |
| `--target all` | 預設值，全裝 |
| `--dry-run` | 印出所有動作但不寫入檔案系統 |
| `--help` | 顯示用法 |

PowerShell 版本對應的旗標是 `-Target` / `-DryRun` / `-Help`。

## Antigravity 專屬安裝（極速）

如果你使用的是 **Antigravity (AG)**，可以直接在對話框輸入指令讓 AI 跑：

```text
/install-n8n-pack
```

或直接對 AI 說：
> 「幫我安裝這個 n8n Skill Pack」

腳本實際做的事：
1. 拷貝 `skills/_vendor/*`（21 個 vendor skills）與 `skills/tigerai/*`（12 個 TigerAI skills）到設定目錄
2. 把 `cookbook/`、`spec/`、`research/` 與 02 / 03 / 04 等文件鏡像到設定目錄底下的 `_tigerai-pack-shared/`，供 AI 隨時查閱

腳本**不做**的事（先前文件有寫但實作沒做）：
- 它**不會**幫你啟動 Claude / Antigravity 並驗證 skill trigger 是否真的被載入 — 驗證步驟請參考下方「驗證」章節，自己做
- 它**不會**幫你設環境變數 — 見下方「環境變數設定」

## 手動安裝

```bash
cp -r skills/_vendor/* ~/.claude/skills/
cp -r skills/tigerai/* ~/.claude/skills/
ls ~/.claude/skills/   # 應該看到 33 個目錄（21 vendor + 12 tigerai）
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

若 skill 沒被觸發：重新跑安裝腳本、重啟 Claude Code / Antigravity session、確認 `~/.claude/skills/` 底下有 33 個 skill 目錄（或 Antigravity 對應路徑）。

> 註：舊版文件曾寫「載入 `n8n-mcp-tools-expert` skill」— 本 Pack **沒有**這個 skill，是文案誤植，已移除。

## 解除安裝

`uninstall.sh` / `uninstall.ps1` 對齊 installer — 一樣支援 `--target` / `--dry-run` / `--help` 旗標。會移除安裝腳本寫入的 **33 個 skill 目錄 + `_tigerai-pack-shared/`**，不存在的會靜默跳過。

```bash
# Linux / macOS / WSL
bash uninstall.sh                        # 移除所有偵測到的目標
bash uninstall.sh --target claude        # 只清 Claude
bash uninstall.sh --dry-run              # 預覽，不動檔案系統
```

```powershell
# Windows PowerShell
.\uninstall.ps1                          # 移除所有偵測到的目標
.\uninstall.ps1 -Target antigravity      # 只清 Antigravity
.\uninstall.ps1 -DryRun                  # 預覽
```

要手動拆的話，uninstaller 的 source 裡有明確列出 33 個 skill 名 + `_tigerai-pack-shared` — 直接看那份名單最準。

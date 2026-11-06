---
name: n8n-api-bridge
description: Standard SOP for reading and writing n8n workflows via the n8n REST API — read sticky notes from a workflow, push generated JSON back, list workflows, activate/deactivate, manage executions. Use when the user references a workflow by ID/URL, asks to "deploy" or "push to n8n" or "讀 n8n", or when sticky-note-to-workflow needs to fetch source/write target. Uses raw HTTP REST API only; no MCP dependency.
---

# n8n-api-bridge — n8n REST API 通訊 SOP

> 🌐 [English](SKILL.en.md) | **繁體中文**

> **受限 Agent 模式（Portal）：寫入與啟用停用。**
> 宿主在系統提示或工作階段上下文放了標記 `[PORTAL-RESTRICTED-AGENT-MODE v1]` 時（格式與規則見 [`spec/agent-restricted-mode.md`](../../../spec/agent-restricted-mode.md)），本 Skill 的 `POST`／`PUT`／`PATCH`／`DELETE`、`activate`／`deactivate` 與直接 SQL **全部停用**；不使用 `N8N_API_URL`／`N8N_API_KEY`，也不自行組 HTTP 請求。讀取（列出、讀 workflow、看 execution）只能經宿主提供的唯讀工具（名稱以宿主為準）；§4.2 的合併寫回、§4.3 的冪等寫回、§7 的範例一律不執行，改為只輸出 workflow JSON，由宿主負責寫入。沒有標記時，本檔全文照舊。
> 這段文字只是提示；真正的強制是宿主的工具白名單與環境設定（Agent 環境不放 n8n 金鑰、不開通往 n8n 的網路）。

## 1. 觸發條件

**精確**：
- 「讀 n8n workflow」/「讀 workflow ID」
- 「deploy」/「push to n8n」/「寫回 n8n」
- 「啟用 / 停用 workflow」
- 「列出 workflow」

**隱式**：
- `sticky-note-to-workflow` 產出後需寫回 → 自動接力本 Skill
- 範例查詢模式找到範例後使用者要試跑 → 自動部署

---

## 2. 連線設定

預期環境變數：

```bash
N8N_API_URL=https://your-n8n.example.com   # 不含結尾斜線
N8N_API_KEY=<api-key>                       # 從 n8n Settings → API 取得
```

驗證連線：

```bash
curl -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows?limit=1"
```

回 200 + JSON 即正常。

---

## 3. n8n REST API 端點對照

本 Pack **直接呼叫 n8n REST API**，不依賴任何 MCP server。

| 操作 | HTTP 呼叫 |
|---|---|
| 列 workflow | `GET /api/v1/workflows` |
| 讀 workflow | `GET /api/v1/workflows/{id}` |
| 建 workflow | `POST /api/v1/workflows` |
| 改 workflow | `PUT /api/v1/workflows/{id}`（body 必須含 `name`、`nodes`、`connections`、`settings`；**公開 API 不支援 `PATCH`，回 405**，2.37.3 / 2.44.6 / 2.46.6 實測） |
| 啟用 | `POST /api/v1/workflows/{id}/activate` |
| 停用 | `POST /api/v1/workflows/{id}/deactivate` |
| 刪 | `DELETE /api/v1/workflows/{id}` |
| 看 execution | `GET /api/v1/executions` |
| 看 credentials | `GET /api/v1/credentials` |

所有呼叫皆帶 header `X-N8N-API-KEY: $N8N_API_KEY`。

---

## 4. 標準操作流程

### 4.1 「讀 sticky note → 產 workflow」流程

```text
1. GET /api/v1/workflows/{id}
2. 從 nodes[] 抽 type=stickyNote 且 color=4 的節點
3. 連接其 parameters.content（多張依 position.x 排序）
4. 把 content 餵給 sticky-note-to-workflow
5. 取得新 workflow JSON
6. PUT /api/v1/workflows/{id}（body: {name, nodes, connections, settings}）
   ↑ 注意：Layer 1 sticky 必須保留，只新增/替換 Layer 2 + Layer 3
```

### 4.2 「合併寫回」核心規則

寫回 n8n 時，**禁止**直接覆蓋使用者的 Layer 1：

```javascript
// pseudo
const existing = await get(id);
const userLayer1 = existing.nodes.filter(n => n.type === 'stickyNote' && n.parameters.color === 4);
const aiLayer2 = generatedNodes.filter(n => n.type !== 'stickyNote');
const aiLayer3 = generatedNodes.filter(n => n.type === 'stickyNote' && n.parameters.color === 5);

const merged = {
  ...existing,
  nodes: [...userLayer1, ...aiLayer2, ...aiLayer3],
  connections: generatedConnections,  // 連線全替換（不含 sticky）
};
await updateFull(id, merged);
```

### 4.3 「冪等性」規則

同一 workflow 多次呼叫 AI 產出時：
- 若已存在 color=5 的 Layer 3 sticky → **要求使用者確認覆寫**（spec three-layer.md §7 第 3 條）
- 寫回前先 GET 取得當前 JSON 並備份至本地，提供 rollback
- 寫回後對該 workflow ID 呼叫 `POST /api/v1/workflows/{id}/activate` 觸發 n8n 內建 schema 驗證

---

## 5. 錯誤處理

| 錯誤碼 | 意義 | AI 處置 |
|---|---|---|
| 401 | API key 失效 | 提示使用者重新產 key |
| 403 | 權限不足 | 提示需要 owner/admin role |
| 404 | workflow 不存在 | 提示確認 ID |
| 400 | JSON schema 不合、節點設定缺漏、缺憑證、節點類型已棄用 | 回報具體欄位，由 AI 依錯誤訊息修正後重 PUT（實測不合格的 PUT 回 400，不是 422） |
| 405 | 呼叫了不支援的方法（例如 `PATCH`） | 改用 `PUT` 全量替換 |
| 409 | 衝突（並發修改，或 webhook 路徑已被其他啟用中的 workflow 使用） | 重讀 + 重 merge + 重寫；webhook 衝突則改 `path` |
| 5xx | n8n 端錯誤 | 指數退避 retry 3 次（1s/2s/4s） |
| timeout | 大 workflow | 增 timeout 至 60s 重試 |

---

## 5.1 ⚠️ 切勿直接 SQL 改 workflow（v0.9.0 R3 揭露）

n8n 有版本管理：`workflow_entity` 配合 `versionId` / `activeVersionId` / `workflow_published_version` 表。直接 `UPDATE workflow_entity SET nodes=...` **不會被 activate 流程採用**，造成 webhook path 不一致等怪現象。

**規則**：
- ❌ `UPDATE n8n.workflow_entity SET nodes = ...` — 永遠不要
- ✅ `PUT /api/v1/workflows/{id}` 含 `{ name, nodes, connections, settings }` — n8n 會正確 bump version
- ✅ 寫回前先 `GET /api/v1/workflows/{id}` 取最新版，修改後再 PUT
- ✅ Activate / Deactivate 用 `POST /api/v1/workflows/{id}/(de)activate`

## 6. 安全約束

- ❌ **絕不**把 API key 寫進 workflow JSON 或 sticky note
- ❌ **絕不**把 N8N_API_URL / KEY 寫進 git commit
- ✅ 對 production instance 寫回前必須提示使用者確認
- ✅ 大量批次寫回（>5 workflows）必須 dry-run 預覽

---

## 7. 範例：完整讀寫循環

```python
# Pseudo-code (純 REST API，無任何 MCP 依賴)
import os, requests
N8N_URL = os.environ['N8N_API_URL']
HEADERS = {'X-N8N-API-KEY': os.environ['N8N_API_KEY']}

def regenerate_workflow_from_sticky(workflow_id):
    # 1. GET 取現有 workflow
    r = requests.get(f"{N8N_URL}/api/v1/workflows/{workflow_id}", headers=HEADERS)
    wf = r.json()

    # 2. 抽 user Layer 1 sticky (color=4)
    user_layer1 = [n for n in wf['nodes']
                   if n['type'] == 'n8n-nodes-base.stickyNote'
                   and n['parameters'].get('color') == 4]
    if not user_layer1:
        raise Exception("No user sticky note (color=4) found")

    layer1_text = "\n\n".join(sorted(user_layer1, key=lambda n: n['position'][0])
                              [0]['parameters']['content'] for n in user_layer1)

    # 3. 呼叫 sticky-note-to-workflow Skill 產出新 nodes (Layer 2 + Layer 3)
    result = invoke_skill('sticky-note-to-workflow', layer1=layer1_text)
    if not result['success']:
        return result['errors']

    # 4. 合併三層（保留 Layer 1）
    merged = merge_three_layers(wf, user_layer1, result['workflow'])

    # 5. PUT 寫回（n8n 自動 schema 驗證）
    requests.put(f"{N8N_URL}/api/v1/workflows/{workflow_id}",
                 headers=HEADERS, json=merged)

    return {'workflow_id': workflow_id, 'status': 'regenerated'}
```

---

## 8. 與其他 Skill 鏈接

- **被 `sticky-note-to-workflow` 呼叫**：寫回產出
- **呼叫 `n8n-validation-expert`**：寫回前驗證 JSON schema
- **被 `tigerai-enterprise-patterns` 呼叫**：企業情境下要求寫回前手動審查

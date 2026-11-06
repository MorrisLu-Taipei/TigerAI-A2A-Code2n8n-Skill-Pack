# n8n 升級與回滾 SOP

> 對應報告：[`tests/REPORT-4.md`](../tests/REPORT-4.md)

責任矩陣把「版本控制」標為 🟡（只有 SOP）。本文件補上升級前備份與回滾的步驟。**SQLite 流程在 2026-11-06 實際演練過；PostgreSQL 流程沒有演練，只是建議做法。**

## 原則

1. 先備份、再升級；備份沒有確認前不動容器。
2. 升級時保留前一版的容器與映像，不要直接 `docker rm` 再重建。
3. 資料庫遷移不可逆。降版前一定要還原升級前的備份，不能只換映像。
4. 先在測試實例升級，確認健康後才升級正式環境。

## A. SQLite 後端（已演練）

### 升級

```bash
# 1. 查磁碟空間，不夠就停手
df -h <資料目錄所在磁碟>

# 2. 停容器（SQLite 有 WAL，執行中複製可能不一致）
docker stop <容器名>

# 3. 備份整個資料目錄，名稱帶日期與舊版本號
cp -a <資料目錄> <資料目錄>.bak-<YYYYMMDDHHMM>-<舊版本>

# 4. 保留舊容器
docker rename <容器名> <容器名>-prev-<YYYYMMDDHHMM>

# 5. 拉新映像並以相同掛載、相同環境變數啟動
docker pull docker.n8n.io/n8nio/n8n:<新版本>
docker run -d --name <容器名> ... docker.n8n.io/n8nio/n8n:<新版本>

# 6. 檢查
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<port>/healthz   # 預期 200
docker exec <容器名> n8n --version
docker logs <容器名> 2>&1 | grep -i error
```

注意：環境變數（尤其是 `N8N_ENCRYPTION_KEY`）要與舊容器一致，否則已存的憑證無法解密。取得舊設定時，只讀欄位名稱，不要把值印出來或貼進對話。

### 回滾

```bash
docker stop <容器名>
docker rename <容器名> <容器名>-failed-<YYYYMMDDHHMM>
# 用備份還原資料（保留失敗版本的資料目錄供檢查，不要直接刪）
mv <資料目錄> <資料目錄>.failed-<YYYYMMDDHHMM>
cp -a <資料目錄>.bak-<YYYYMMDDHHMM>-<舊版本> <資料目錄>
docker rename <容器名>-prev-<YYYYMMDDHHMM> <容器名>
docker start <容器名>
```

### 演練結果（2026-11-06）

| 項目 | 結果 |
|---|---|
| 資料量 | 1.3 GB（SQLite，469 個 workflow、63 位使用者、520 組憑證） |
| 方式 | 把備份複製到新目錄，用舊版 2.37.3 映像啟動，容器不接網路 |
| 就緒時間 | 約 5 秒 |
| 筆數比對 | workflow、使用者、憑證的筆數與備份一致 |

演練用的容器不接網路，避免工作流程的觸發器使用真實憑證連到外部服務。

## B. PostgreSQL 後端（未實測）

以下是建議流程，**尚未在 Pack 的任何環境實際演練**，使用前請先在非正式環境走過一遍。

```bash
# 備份（升級前）
pg_dump -Fc -h <host> -U <user> -d <db> -f n8n-<YYYYMMDDHHMM>-<舊版本>.dump

# 還原到全新的空資料庫（回滾時）
createdb -h <host> -U <user> <db>_restore
pg_restore -h <host> -U <user> -d <db>_restore --no-owner n8n-<YYYYMMDDHHMM>-<舊版本>.dump
```

回滾時讓舊版 n8n 容器改連 `<db>_restore`，確認筆數後再決定是否換回原資料庫名稱。

## 升級後的自動化檢查

用 [`docs/n8n-version-compat.md`](n8n-version-compat.md) 的方法，在升級後的實例上對常用 workflow 重跑「匯入 → 啟用 → 觸發」，並與升級前的結果比對。已知會改變行為的項目：

- 已棄用的 `Function` 節點在 2.44.6 以上無法匯入。
- webhook 在執行失敗時的回應碼由 200 變成 500。
- 2.46.6 啟用時會檢查憑證是否存在。

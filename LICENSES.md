# 授權總覽（LICENSES）

本 Pack 同時包含三種來源的內容：TigerAI 自製內容（MIT）、社群 Skill（MIT，原作者版權）、n8n 官方 Skill（Apache-2.0，n8n GmbH 版權）。**我們不替任何人的作品改授權**：每份內容維持原作者選的授權，「統一」的是聲明的方式與位置。

- 每個會被安裝的 Skill 資料夾都自帶一份 `LICENSE`，安裝腳本整個資料夾一起複製，授權檔會跟著走。
- 本檔是集中清單；逐項的來源、釘選版本與義務對照見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 與 [`skills/_vendor/SOURCE.md`](skills/_vendor/SOURCE.md)。
- 機器可讀的對應見 [`plugin.json`](plugin.json) 的 `license`、`licenses`、`license_index` 欄位。

## 授權清單

| 路徑 | 授權 | 版權人 | 來源 | 釘選版本 | 授權檔位置 |
|---|---|---|---|---|---|
| 本 Pack 自有內容：`skills/tigerai/`（10 個 Skill）、`cookbook/`、`spec/`、`docs/`、`scripts/`、`tests/`、`research/`、`examples/templates/`、安裝與解除安裝腳本、根目錄文件，以及 `examples/` 內由 TigerAI 自製的部分 | MIT | Copyright (c) 2026 Morris Lu / TigerAI | 本 Pack | 不適用 | 根目錄 `LICENSE`；`skills/tigerai/<skill>/LICENSE`（每個 Skill 資料夾一份複本） |
| `skills/_vendor/` 內 6 個社群 Skill：`n8n-expression-syntax`、`n8n-workflow-patterns`、`n8n-validation-expert`、`n8n-node-configuration`、`n8n-code-javascript`、`n8n-code-python` | MIT | Copyright (c) 2025 Romuald Członkowski | [czlonkowski/n8n-skills](https://github.com/czlonkowski/n8n-skills) | tag `v1.37.1`（commit `e037563e101749e630e6688d121d04529fe6ee7b`，2026-10-24） | `skills/_vendor/<skill>/LICENSE`（上游 v1.37.1 根目錄 `LICENSE` 的完整複本）；目錄層另有 `skills/_vendor/LICENSE` |
| `skills/_vendor/*-official`（15 個 n8n 官方 Skill，名單見下） | Apache-2.0（Apache License, Version 2.0） | Copyright 2026 n8n GmbH | [n8n-io/skills](https://github.com/n8n-io/skills) | commit `27b6b9f`（2026-10-17），上游 plugin 版本 1.3.0 | `skills/_vendor/<skill>/LICENSE`（每個資料夾一份）；目錄層另有 `skills/_vendor/LICENSE-n8n-io-skills-APACHE-2.0` |
| `examples/line-ai-customer-service-onprem/`（地端 LINE 客服案例） | MIT | Copyright (c) 2026 scorpioliu0953（上游授權檔所載）；Pack 在其上的補充文件為 TigerAI MIT | [scorpioliu0953/ai_customer_service](https://github.com/scorpioliu0953/ai_customer_service) | 出處鏈見該資料夾 `CREDITS.md` | `examples/line-ai-customer-service-onprem/LICENSE` |
| `examples/einvoice-n8n/`（台灣電子發票案例） | Pack 自製部分為 MIT（TigerAI）；所用 SDK 為 MIT | SDK：Copyright (c) 2026 Yi-Ru Lin（上游授權檔所載）；Pack 自製層：Morris Lu / TigerAI | [paid-tw/einvoice](https://github.com/paid-tw/einvoice)，以 `npm install` 取用（`@paid-tw/einvoice*`），**未內含 SDK 原始碼** | 以 exact pin 固定於該範例的 `package.json`（依 SEC-017） | SDK 授權隨 npm 套件發佈；Pack 自製部分適用根目錄 `LICENSE` |
| `reference-workflows/`（**已移除**，約 2,061 個參考工作流程 JSON） | MIT | Copyright (c) 2024 Zie619 | [Zie619/n8n-workflows](https://github.com/Zie619/n8n-workflows) | 不適用（已不再散布） | 授權全文保留於 `THIRD_PARTY_NOTICES.md` 第 1 節，因為 git 歷史仍含這些檔案 |
| n8n.io 公開範本 | **無開源授權**（受 n8n 服務條款與各作者的範本分享條款約束） | 各範本作者 / n8n GmbH | [n8n.io/workflows](https://n8n.io/workflows/) 公開範本 API | 不適用 | 不適用：本 repo 只留彙總統計與少量引用的範本編號，**不散布範本 JSON**、完整標題索引或作者個資 |

### 15 個官方 Skill 名單（Apache-2.0）

`n8n-agents-official`、`n8n-ai-nodes-official`、`n8n-binary-and-data-official`、`n8n-code-nodes-official`、`n8n-credentials-and-security-official`、`n8n-data-tables-official`、`n8n-debugging-official`、`n8n-error-handling-official`、`n8n-expressions-official`、`n8n-extending-mcp-official`、`n8n-loops-official`、`n8n-node-configuration-official`、`n8n-subworkflows-official`、`n8n-workflow-lifecycle-official`、`using-n8n-skills-official`

這 15 個資料夾與上游逐位元組相同，只多一份上游 `LICENSE` 的複本。上游沒有 `NOTICE` 檔，所以沒有 NOTICE 內容需要轉載。

## 如何判斷某個檔案適用哪個授權

1. 先看該檔案所在的最近一層資料夾：若資料夾內有 `LICENSE`，以它為準。Skill 資料夾（`skills/tigerai/<skill>/`、`skills/_vendor/<skill>/`）都屬這一類。
2. 資料夾內沒有 `LICENSE` 時，往上層找，找不到就適用根目錄 `LICENSE`（MIT，TigerAI）。`examples/` 內只有 `line-ai-customer-service-onprem/` 自帶授權檔。
3. 路徑名稱帶 `-official` 的 `skills/_vendor/` 資料夾一律是 Apache-2.0；其餘 `skills/_vendor/` 資料夾是 MIT（Romuald Członkowski）。
4. 上述各層的授權檔與本表不一致時，以檔案本身的授權檔為準，並請回報修正本表。
5. 安裝到使用者機器後，同樣以各 Skill 資料夾內的 `LICENSE` 為準。

## 更新上游時要做什麼

1. 更新 [`skills/_vendor/upstream-pins.json`](skills/_vendor/upstream-pins.json)（tag 或 commit、日期、前一版）與 [`skills/_vendor/SOURCE.md`](skills/_vendor/SOURCE.md) 的釘選表。
2. 把新版上游根目錄的 `LICENSE` 重新複製到對應的每個 Skill 資料夾（社群 6 個、官方 15 個），並更新目錄層的 `skills/_vendor/LICENSE` 或 `skills/_vendor/LICENSE-n8n-io-skills-APACHE-2.0`。若上游版權年份或條文有變，同步修改本檔與 `THIRD_PARTY_NOTICES.md`。
3. 檢查上游是否新增 `NOTICE` 檔；有的話一併收錄並更新 `THIRD_PARTY_NOTICES.md`。
4. 用 `diff -r` 對上游同名資料夾比對，差異只能有我們新增的 `LICENSE`。
5. 若新增或移除 Skill，同步更新 `plugin.json`（`skills` 與 `licenses`）、安裝與解除安裝腳本、本檔。

## 商標聲明

「n8n」為 n8n GmbH 的商標，TigerAI 與 n8n GmbH 沒有隸屬、合作或背書關係，本專案僅以描述性方式使用該名稱。

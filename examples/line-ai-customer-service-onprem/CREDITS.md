# Credits / 致謝

## License

This example is distributed under the **MIT License** inherited from the upstream project.
Copyright (c) 2026 scorpioliu0953. See [LICENSE](LICENSE) for the full text.

## 出處鏈 / Attribution chain

```
upstream (cloud / Netlify + Supabase)
  scorpioliu0953/ai_customer_service        — MIT, original system design
                ↓
  Morris Lu + Claude Code (Opus 4.6)        — on-prem evolution
                — replaced Supabase with Postgres / Redis
                — added Qdrant vector RAG
                — added Ollama local LLM
                — added Docker Compose deployment (prod 3010 + dev 5173/3011)
                — added Dashboard real-user auth (Postgres `users`)
                — added 5-phase V&V plan (Infra / API / UI / HMR / E2E)
                — added 37-node n8n workflow (Switch-on-active_ai with three RAG paths)
                ↓
  TigerAI Code2n8n Skill Pack              — packaged as Code2n8n case study
                — kept upstream LICENSE + this attribution chain
                — sanitised hard-coded API key in docker-compose.yml
                — bundles next to the cloud LINE CS example for comparison
                — pairs with the marquee skill `code-to-workflow`
```

## Upstream / 原始作品

- **Project**: `ai_customer_service`
- **Author / GitHub**: [scorpioliu0953](https://github.com/scorpioliu0953)
- **Repository**: <https://github.com/scorpioliu0953/ai_customer_service>
- **License**: MIT
- **Original stack**: React + TypeScript + Vite (frontend), Netlify Functions (backend), Supabase (DB), OpenAI + Google Gemini, LINE Messaging API

## On-prem evolution / 地端版演化

- **Evolver**: Morris Lu, with Claude Code (Opus 4.6)
- **Date**: 2026-03-26 to 2026-03-29 (initial v2.3); ongoing
- **License**: inherits upstream MIT
- **Major changes**: see the on-prem [`docs/SDD.md`](docs/SDD.md), [`docs/LESSON_LEARNED.md`](docs/LESSON_LEARNED.md), and [`docs/DEV_LOG.md`](docs/DEV_LOG.md). The originals from upstream are preserved at [`UPSTREAM-README.md`](UPSTREAM-README.md) and [`docs/SDD-upstream.md`](docs/SDD-upstream.md).

## Packaging into TigerAI Code2n8n Skill Pack

- **Packager**: Morris Lu + Claude Code, 2026-06-10
- **License**: MIT inheritance preserved; this `CREDITS.md` + the upstream `LICENSE` file remain in the example folder
- **Sanitisation**: one hard-coded `OPENWEBUI_API_KEY` value in `docker-compose.yml` was replaced with an environment-variable placeholder before commit. No other API key / secret values were detected in the copied files. The `n8n-backup/` folder (containing `creds_backup.json`) was **not** copied.
- **Scope shipped**: docs, SDD, DEV_LOG, LESSON_LEARNED, WALKTHROUGH_N8N, n8n_workflow_export.json, docker-compose.yml + Dockerfiles, supabase_schema.sql, full React + Express src/ tree. **Not shipped**: `node_modules/`, `package-lock.json`, `uploads/`, `n8n-backup/`.
- **Security audit performed, NOT patched**: the pack performed a security audit *after* bundling and documented every finding in [`SECURITY-CAVEATS.md`](SECURITY-CAVEATS.md) — no real authentication on `/api/auth/me` or any `/api/*` data route, SQL identifier injection in `updateSettings`, plaintext passwords, exposed n8n credential names + Qdrant collection names, missing CSRF / rate limit / audit log / helmet / CORS. **We chose to disclose, not silently patch**, because the vulnerabilities themselves are part of the Code2n8n teaching: AI-written code that runs is not the same as code that's enterprise-deployable, and modifying upstream behaviour without disclosure would misrepresent the case study. To deploy, fork and apply the 10-step hardening checklist at the end of `SECURITY-CAVEATS.md`.

## How to cite this case study

If you reuse this example, please credit:

- The **upstream MIT project** by scorpioliu0953 (must, per MIT).
- The **on-prem evolution** by Morris Lu (optional but appreciated).
- The **packaging into the Code2n8n Skill Pack** as the venue you encountered it (optional but appreciated).

A complete one-line citation:

> Based on `scorpioliu0953/ai_customer_service` (MIT), on-prem evolution by Morris Lu, packaged in `TigerAI-Code2n8n-Skill-Pack` as a Code2n8n case study.

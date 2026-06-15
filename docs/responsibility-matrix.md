# Responsibility matrix & honest completion status

> Companion to [`enterprise-setup.md`](enterprise-setup.md). That doc draws the boundary; this one rates **how far each box in the hero diagram is actually shipped**.

> 🎯 **One-sentence positioning**: TigerAI Code2n8n Skill Pack is a **porting / review / governance methodology pack**; n8n (and your IT team) are the platforms that actually carry the enterprise capabilities. The hero diagram's third block (SSO / IAM / Audit Log / HA / Metrics / Source Control) is provided by **n8n editions + your IT deployment** — never reimplemented by the Pack.

The hero diagram makes claims across multiple layers. This page tells you, per claim, who owns it and how complete it is **as of v0.24.1**. Honest evidence beats inflated evidence — if a row says "partial," that's the truth, not a hedge.

---

## Who owns what

Per-capability ownership is finer-grained than "Pack vs Enterprise." This is the honest split:

| Layer | Owns | Notes |
| --- | --- | --- |
| **Pack (this repo)** | Porting methodology, Partition rules, Security Review SOP, Workflow Design rules, Validation SOP, versioning & release rules. | Never reimplements platform features. |
| **n8n Community / self-hosted** | Workflow runtime, nodes, integration execution, **queue mode** (Redis + worker), `/metrics` Prometheus endpoint. | Queue mode and `/metrics` are NOT Enterprise-only — they ship in the OSS image. |
| **n8n Business** | Adds **Source Control / Environments** (git-backed promotion between dev / prod), more advanced collaboration. | Often confused with Enterprise — Source Control is Business-tier and up, not Enterprise-only. |
| **n8n Enterprise** | Adds **SSO, RBAC/IAM, Audit Log, External Secrets, multi-main HA (active-active scheduler), LDAP/SAML, advanced support**. | "Multi-main HA" is the Enterprise-specific HA capability; the single-main + queue mode HA pattern is achievable on Community/Business with IT effort. |
| **Enterprise IT / DevOps** | Deploys Postgres, Redis, load balancer, backup, DR, real monitoring stack (Grafana / Datadog / ELK), the actual CI runner that consumes `/metrics`. | "Upgrading to Enterprise" does **not** automatically give you HA — you still need IT to deploy Postgres + Redis + worker + LB, and multi-main on top of that. |

What this nuance changes:

- **Source Control / Environments**: don't tell anyone "you need Enterprise for git-backed promotion" — Business already provides it.
- **Queue mode**: available on self-hosted Community; not a paywall feature. (It's also the same queue mode that introduces the [ghost-cron risk](https://community.n8n.io/t/cron-trigger-executing-multiple-times-after-updates-due-to-ghost-triggers-in-queue-mode-with-multiple-workers/244687) — relevant when writing rollback / kill-switch SOPs.)
- **HA**: a layered capability. Single-main + multiple workers + Postgres + Redis + LB = "operationally HA" on any tier with IT effort. **Multi-main active-active** is the Enterprise-only piece.
- **Metrics**: self-hosted n8n exposes `/metrics` (Prometheus). Actual observability — dashboards, alerting, SLO tracking — is IT's stack, not n8n's.
- **SSO / RBAC / Audit Log / External Secrets**: genuinely Enterprise-tier; the Pack must not pretend to provide these.

The Pack does **not** reimplement any of the above and does **not** try to be your IT department. It writes the rules, the tests, and the artefacts that land cleanly on top of whichever n8n tier + IT setup you have.

---

## Per-claim status (v0.24.1)

| Hero claim | Current state | Status |
| --- | --- | --- |
| Inventory, Partition, Workflow Design | Codified in `code-to-workflow` skill; three case studies demonstrate it end to end | ✅ Methodology done |
| Security Audit | Dedicated `n8n-security-governance` skill; `code-to-workflow` Step 1.5 enforces it; `SECURITY-REVIEW.md` (positive) + `SECURITY-CAVEATS.md` (negative) examples ship | ✅ Review methodology done |
| Production Validation | `_audit.mjs` lint + `_n8n_import_test.mjs` REST scripts exist; full validation still needs a live n8n + credentials | 🟡 Partial — works, but not unattended |
| Security scanning | Agent-driven SOP + checklists; **not** a deterministic scanner | 🟡 Not toolised |
| Version Control | Commit pinning, version stamping, release/rollback rules documented | 🟡 Has SOP, no full automation |
| CI/CD | Pack defines the gate; v0.24.1 ships `.github/workflows/security-gate.yml` (manifest consistency + JSON audit + secret scan + installer parse); broader pipelines (GitLab CI, full dep CVE, container scan) not yet | 🟡 First gate live, more to come |
| Retry, Approval, Handover | Enterprise Pattern designs exist | 🟡 No drop-in importable template |
| Logs, Alerts, Observability | Design requirements stated | ⛔ Execution belongs to n8n + monitoring stack + IT |
| SSO, RBAC/IAM, Audit Log, External Secrets | — | ⛔ n8n Enterprise platform feature — Pack must not implement |
| Source Control / Environments | — | ⛔ **n8n Business and up** (not Enterprise-only) — Pack must not implement |
| HA (multi-main active-active) | — | ⛔ n8n Enterprise feature — and **still requires IT to deploy Postgres + Redis + worker + LB** before multi-main matters |
| HA (single-main + queue mode + workers) | Pack writes rollback / kill-switch SOP that has to play nicely with queue mode (e.g., the [ghost-cron failure mode](https://community.n8n.io/t/cron-trigger-executing-multiple-times-after-updates-due-to-ghost-triggers-in-queue-mode-with-multiple-workers/244687)) | ⛔ Queue mode is **self-hosted Community-tier** feature; the operational HA topology is IT's job |
| Metrics endpoint (`/metrics`) | — | ⛔ Self-hosted n8n exposes Prometheus `/metrics`; **dashboards / alerting / SLO are IT's observability stack** |
| ERP / CRM / DB / SaaS / LLM integration | Design guidance on how to use them | ⛔ Actual integration = n8n nodes |
| 2,061 reference workflows | Search-and-design corpus mined from [Zie619/n8n-workflows](https://github.com/Zie619/n8n-workflows) (MIT, secrets scrubbed) | 🟡 Reference material — **not** all of them have been imported into n8n or validated in a production environment |
| Hero PNG self-attribution | README captions now state the Pack/n8n/Enterprise split; PNG itself does not yet bake in the "Platform capabilities by n8n / n8n Enterprise" subtext | 🟡 Re-render planned for v0.25 — until then, the README caption carries that line so the image is not stranded if it gets shared standalone |
| Installer ergonomics | `install.sh` / `install.ps1` copy files into every detected target (Claude + Antigravity) with no `--dry-run` and no per-target flag; verification after install is manual | 🟡 v0.25 backlog — add `--dry-run`, `--target=claude\|antigravity\|all`, and a post-install `ls` check that confirms 14/14 skill folders landed; ship an official `uninstall.sh` so users don't need the manual block in [`01-INSTALL.md`](../01-INSTALL.md) |

Legend: ✅ done · 🟡 partial / in progress · ⛔ explicitly out of Pack scope (owned elsewhere)

---

## What this means for readers

- If you came here because the hero promises "Security Audit" and "CI/CD gate" — yes, both exist; read [`skills/tigerai/n8n-security-governance/SKILL.md`](../skills/tigerai/n8n-security-governance/SKILL.md) and [`.github/workflows/security-gate.yml`](../.github/workflows/security-gate.yml).
- If you came expecting an out-of-the-box deterministic secret scanner or container CVE scanner — that's roadmap, not v0.24.1.
- If you came expecting SSO / Audit Log / External Secrets — that's **n8n Enterprise**.
- If you came expecting Source Control / Environments — that's **n8n Business and up** (not Enterprise-only).
- If you came expecting HA — partial answer: **queue mode + workers + Postgres/Redis** runs on any tier with IT effort; **multi-main active-active** is the Enterprise-specific bit. Either way IT still owns the deployment.
- The Pack's job is to make sure what it produces lands cleanly on top of all of the above.

The hero diagram is a positioning artefact; this page is the receipts. They should always be readable together.

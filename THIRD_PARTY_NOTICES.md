# Third-Party Notices

This project includes materials from third-party open-source projects.
Their original licenses are reproduced below.

---

## 1. `reference-workflows/` — Zie619/n8n-workflows (removed)

The 2,061 reference workflow JSON files that used to live under
`reference-workflows/` were derived from the public collection:

- **Source**: https://github.com/Zie619/n8n-workflows
- **License**: MIT License
- **Use in this repo**: **Removed.** Since 2026-11-06 this directory is no
  longer distributed with the repo. Earlier versions in the git history still
  contain those files, so the MIT license text and copyright notice below are
  kept here to satisfy the license for that history. Reference templates are now
  looked up live from n8n.io only with the user's consent (see section 5).

### MIT License (Zie619/n8n-workflows)

```
MIT License

Copyright (c) 2024 Zie619

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. `skills/_vendor/` — czlonkowski/n8n-skills

`skills/_vendor/` currently bundles 6 official n8n skills from:

- **Source**: https://github.com/czlonkowski/n8n-skills
- **Pinned version**: v1.37.1 (commit `e037563`, 2026-10-24)
- **License**: MIT License (see `skills/_vendor/LICENSE`)

---

## 3. `examples/line-ai-customer-service-onprem/` — scorpioliu0953/ai_customer_service

The on-prem LINE customer-service case is derived from:

- **Source**: https://github.com/scorpioliu0953/ai_customer_service
- **License**: MIT License
- **Attribution chain**: see [`examples/line-ai-customer-service-onprem/CREDITS.md`](examples/line-ai-customer-service-onprem/CREDITS.md)
- **Use in this repo**: Preserved as a teaching artefact with full security defects disclosed in [`examples/line-ai-customer-service-onprem/SECURITY-CAVEATS.md`](examples/line-ai-customer-service-onprem/SECURITY-CAVEATS.md) — **DO NOT DEPLOY AS-IS**.

---

## 4. `examples/einvoice-n8n/` — paid-tw/einvoice (SDK consumed via npm)

The Taiwan e-invoice case (the v1.0 milestone case) is built on top of:

- **Source**: https://github.com/paid-tw/einvoice
- **License**: MIT License
- **Packages consumed**: `@paid-tw/einvoice`, `@paid-tw/einvoice-amego`, `@paid-tw/einvoice-ecpay`, `@paid-tw/einvoice-ezpay`, `@paid-tw/einvoice-ezpay-crossborder`, `@paid-tw/einvoice-ezreceipt`
- **Use in this repo**: Consumed via `npm install` with exact pins (no caret/tilde; per [SEC-017](examples/einvoice-n8n/SECURITY-REVIEW.md)). **No SDK source is vendored into this repo.** Pack-authored layer is the 80-line Hono `svc/` wrapper + 14 n8n workflows + SECURITY-REVIEW + Amego sandbox runtime test runner — all MIT-licensed under TigerAI copyright.
- **Runtime verification scope**: Amego SDK capability runtime PASS against real Amego public sandbox (10/10, 11 invoice traces); 4 other providers (ECPay / ezPay / ezPay cross-border / ezReceipt) have no public sandbox accounts — structural OK, runtime open. See [`examples/einvoice-n8n/tests/v0.41-final-validation-report.md`](examples/einvoice-n8n/tests/v0.41-final-validation-report.md).

---

## 5. n8n.io public templates — statistics only (not redistributed)

Statistics and node-usage patterns in `research/` were derived from the public
template library at https://n8n.io/workflows/ (official template API). Those
templates carry no open-source license; they are governed by the n8n terms of
service and each author's template-sharing terms.

- **What is in this repo**: aggregate counts (node types, categories, tags, trigger
  and error-handling rates) and a small number of cited template IDs.
- **What is not in this repo**: the template JSON files, the full title index, and
  any author personal data (names, bios, avatars, links).

---

## License of the rest

The rest of this repository (TigerAI-authored skills, cookbook, specs,
docs, install scripts, Antigravity workflows, the Code2n8n manifesto,
and the marquee `code-to-workflow` skill) is licensed under **MIT**
(Copyright (c) 2026 Morris Lu / TigerAI). See the root [`LICENSE`](LICENSE)
file for the full text. The MIT-licensed third-party material listed
above retains its original copyright and is bundled per its respective
notice.

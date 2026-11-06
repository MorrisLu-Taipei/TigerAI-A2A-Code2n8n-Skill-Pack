# Third-Party Notices

> **Summary.** Three licenses apply in this repository: MIT for the Pack's own
> content (Copyright (c) 2026 Morris Lu / TigerAI), MIT for the 6 community
> skills from czlonkowski/n8n-skills, and Apache-2.0 for the 15 official skills
> from n8n-io/skills (Copyright 2026 n8n GmbH). Each skill folder carries its
> own `LICENSE`. The central index, with a per-path table, is
> [`LICENSES.md`](LICENSES.md). This file keeps the detailed notices and
> obligation checklists.

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

`skills/_vendor/` bundles 6 community n8n skills (not published by n8n GmbH) from:

- **Source**: https://github.com/czlonkowski/n8n-skills
- **Pinned version**: v1.37.1 (commit `e037563`, 2026-10-24)
- **Copyright**: Copyright (c) 2025 Romuald Członkowski
- **License**: MIT License (see `skills/_vendor/LICENSE`)
- **License copies**: each of the 6 skill folders (`n8n-expression-syntax`,
  `n8n-workflow-patterns`, `n8n-validation-expert`, `n8n-node-configuration`,
  `n8n-code-javascript`, `n8n-code-python`) contains a `LICENSE`, a full copy of
  the upstream v1.37.1 root `LICENSE`, so the license text travels with the
  folder when the installer copies it. No upstream file is modified.

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
- **License**: MIT License (Copyright (c) 2026 Yi-Ru Lin, as stated in the upstream `LICENSE`)
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

## 6. `skills/_vendor/*-official` — n8n-io/skills (n8n's official skills)

`skills/_vendor/` also bundles 15 skills published by n8n GmbH:

- **Source**: https://github.com/n8n-io/skills
- **Copyright**: Copyright 2026 n8n GmbH
- **License**: Apache License, Version 2.0
- **Pinned version**: commit `27b6b9f` (2026-10-17), plugin version 1.3.0
  (`.claude-plugin/plugin.json` upstream)
- **Skills included (15)**: `n8n-agents-official`, `n8n-ai-nodes-official`,
  `n8n-binary-and-data-official`, `n8n-code-nodes-official`,
  `n8n-credentials-and-security-official`, `n8n-data-tables-official`,
  `n8n-debugging-official`, `n8n-error-handling-official`,
  `n8n-expressions-official`, `n8n-extending-mcp-official`,
  `n8n-loops-official`, `n8n-node-configuration-official`,
  `n8n-subworkflows-official`, `n8n-workflow-lifecycle-official`,
  `using-n8n-skills-official`
- **Modifications**: None. The upstream files are included unchanged
  (byte for byte). The only file we add is a copy of the upstream `LICENSE` in
  each skill folder, so that the license text travels with the folder when the
  installer copies it to a user's machine.
- **NOTICE file**: The upstream repository has no `NOTICE` file, so there is
  no NOTICE content to reproduce. If upstream adds one later, it must be
  copied here when the pin is updated.
- **Not included**: Only the upstream `skills/` directory is bundled. The
  upstream `hooks/`, `opencode/`, `.claude-plugin/`, `.codex-plugin/`,
  `.agents/`, `package.json` and similar files are not copied. They are
  reminder hooks and platform plugin mechanisms for the n8n MCP, not
  knowledge content. See `skills/_vendor/SOURCE.md`.
- **Where the license text lives**: `skills/_vendor/LICENSE-n8n-io-skills-APACHE-2.0`
  (one copy for the whole directory) and `skills/_vendor/<skill-name>/LICENSE`
  (one copy in each of the 15 folders).

### Apache-2.0 section 4 checklist

| Obligation | How this repo meets it |
|---|---|
| 4(a) Give recipients a copy of the License | Full license text is in each of the 15 skill folders and in `skills/_vendor/LICENSE-n8n-io-skills-APACHE-2.0` |
| 4(b) Modified files carry prominent change notices | Not applicable: no upstream file is modified |
| 4(c) Retain copyright, patent, trademark and attribution notices in Source form | Upstream files are unchanged, so every notice they contain is kept; the copyright holder is named above |
| 4(d) Reproduce the contents of a NOTICE file | Not applicable: upstream has no NOTICE file |

### Trademarks (Apache-2.0 section 6)

The license does not grant permission to use the trade names, trademarks,
service marks or product names of n8n GmbH, except for reasonable and
customary use in describing the origin of the work. "n8n" is a trademark of
n8n GmbH. This project uses the name only descriptively. TigerAI is not
affiliated with, partnered with, or endorsed by n8n GmbH.

### Relationship to this Pack

The MIT license that covers the rest of this repository does **not** apply to
these 15 folders; they stay under Apache-2.0 with n8n GmbH as copyright holder.
These skills are written around the n8n MCP tools; this Pack is REST-only.
See `docs/mcp-to-rest-map.md` for the mapping.

---

## License of the rest

The rest of this repository (TigerAI-authored skills, cookbook, specs,
docs, install scripts, Antigravity workflows, the Code2n8n manifesto,
and the marquee `code-to-workflow` skill) is licensed under **MIT**
(Copyright (c) 2026 Morris Lu / TigerAI). See the root [`LICENSE`](LICENSE)
file for the full text. The MIT-licensed third-party material listed
above retains its original copyright and is bundled per its respective
notice. The one exception is section 6 (n8n-io/skills): that material is
licensed under **Apache-2.0**, not MIT, and stays under Apache-2.0 with its
own license text and copyright holder (n8n GmbH).

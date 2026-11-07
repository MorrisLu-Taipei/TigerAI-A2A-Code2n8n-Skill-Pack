# n8n.io Public Templates: Security-Related Community Practices

> 🌐 **English** | [繁體中文](n8n-templates-security.md)

> Security-related community practices measured over 13,947 public n8n.io templates (fetched 2026-11-05 to 2026-11-06, data version 2026-11-06; how the data was obtained and its completeness are in [`n8n-templates-method.en.md`](n8n-templates-method.en.md)), compared against the current version of this Pack's rule-based scanner [`scripts/security-scan.mjs`](../scripts/security-scan.mjs) to show which practices the scanner rules cover today and which they do not yet.
> **These are descriptive statistics over public templates. They are not a vulnerability list and not an accusation against any author.** This file contains no template IDs, authors, matched content or example secrets, only aggregate numbers. Scanner results are recommendations for the user (guardrail rules are warnings, and a default run does not fail because of them); the user decides whether to act on them.

---

## 1. How to read, and limitations

### 1.1 How to read the numbers

- **The unit is "templates"**, not nodes. Wherever a number counts nodes, the table says "nodes".
- **Every table states its denominator.** The default is 13,947 (all templates). Webhook figures use "templates with a Webhook (2,775)" or "Webhook nodes (3,318)"; HTTP figures use "templates with `httpRequest` (7,231)" or "`httpRequest` nodes (20,620)"; Code figures use "templates with a Code/Function node (8,699)".
- Percentages are rounded to one decimal; anything below 0.1% is written "<0.1%".
- **"Not set" means the default.** Exported templates omit default parameters, so a Webhook or Form Trigger with no `authentication` field has the default value, "none".
- A template can contain many nodes, so "at least one node matches" is higher than the node-level share. Each table says which one it uses.

### 1.2 Limitations and wording

- **Most templates are demos.** "No authentication" does not mean a real deployment is vulnerable: the user may restrict access at a reverse proxy or the network layer, run it only on an internal network, or follow the template's instructions to add settings.
- **A match ratio is not a confirmed vulnerability.** This file does not judge the real risk of any single template and does not single out authors.
- **"Placeholder-looking" is a heuristic** (contains `your`, `example`, runs of `x`, angle brackets, brace templates, very few distinct characters, and so on). It misjudges some values; it only gives an order of magnitude and cannot establish that a value is, or is not, a real secret.
- **Rule-based static matching:** nothing is executed and, except in §2.10, reachability through connections is not analyzed. For example, "an unauthenticated Webhook and `executeCommand` in the same template" does not mean they are wired together. Disabled nodes are counted (22 disabled Webhook nodes); the effect is small (see §2.1).
- **Public templates are not the same population as users' private workflows.** The few secret matches may reflect clean-up before publishing rather than authors' habits.
- **Year is the template's creation time on n8n.io**, not a node version. 2025 and 2026 together make up 91.7% of all templates, and 2019-2023 have small yearly samples, so only the broad direction of a trend is meaningful.
- Only `n8n-nodes-base.httpRequest` is counted; headers of the LangChain `toolHttpRequest` are outside the "hard-coded authorization" scope.
- **The statistics are descriptive and scan results are recommendations:** a guardrail match only means "here is a setting worth considering"; whether to act on it is the user's decision. This file does not treat match shares as a score of quality or risk.

### 1.3 Method and consistency

- The statistics script is read-only, lives in a working directory and is **not part of the repo**; all of its output is aggregate numbers.
- The regexes for secret patterns and Code-node malicious patterns are **loaded directly from the `security-scan.mjs` source**, not rewritten, so they match the scanner's judgement.
- In addition, the workflow graph of every one of the 13,947 templates was fed to the **current** scanner (results in §4.2). For rules that measure the same thing as the custom script, the number of matching templates is identical: `webhook:no-auth` (2,647), `form:no-auth` (1,589), `network:http-cleartext` (121), `credential:plaintext` (43), `exec:execute-command` (84), `exec:ssh` (59), and the Code rules `net-exfil-pattern` (15), `require-fs-with-write` (6), `base64-decode-suspect` (4), `require-child-process` (2) and `env-dump` (1). Where the numbers differ, the cause is a different scope or rule definition, noted in §4: the secret rules went from 16 to 25 templates because `pinData` is now scanned; `jscode:process-spawn` dropped sharply because its false matches were narrowed; `jscode:dynamic-eval` gained one match because `toolCode` and LangChain Code are now scanned; and `tls:allow-unauthorized-certs`, `file:rw-access` and the `ai:*` rules have a narrower scope or a different way of judging than the custom statistics in §2, so their numbers differ. Five other rules (`secret:github-pat`, `secret:slack-token`, `jscode:reverse-shell`, `jscode:fs-write-sensitive`, `schema:empty-nodes`) have zero matches in this dataset.

---

## 2. Metrics

### 2.1 Webhook nodes (`n8n-nodes-base.webhook`)

| Metric | Count | Share (denominator) |
|---|---|---|
| Templates with a Webhook | 2,775 | 19.9% (13,947) |
| Webhook nodes in total | 3,318 | 1.2 per template with a Webhook on average |
| At least one Webhook without authentication | 2,647 | **95.4%** (2,775) |
| Every Webhook has authentication configured | 128 | 4.6% (2,775) |
| At least one enabled Webhook without authentication, disabled nodes excluded | 2,633 | 95.4% (2,759, templates with an enabled Webhook) |
| Nodes with an IP allow-list (`options.ipWhitelist`) | 2 | 0.1% (3,318) |
| Templates with an IP allow-list | 2 | 0.1% (2,775) |
| Nodes with explicitly configured CORS allowed origins (`allowedOrigins`) | 69 | 2.1% (3,318) |
| 　of which set to the wildcard (`*`) | 66 | 2.0% (3,318) |

**Authentication mode distribution**

| Authentication setting | Nodes | Share of Webhook nodes (3,318) | Templates containing it | Share of templates with a Webhook (2,775) |
|---|---|---|---|---|
| None (not set, or none) | 3,167 | 95.4% | 2,647 | 95.4% |
| headerAuth | 120 | 3.6% | 103 | 3.7% |
| basicAuth | 30 | 0.9% | 28 | 1.0% |
| jwtAuth | 1 | <0.1% | 1 | <0.1% |

In the two right-hand columns a template can have several settings at once, so they do not add up.

**Response mode (`responseMode`, denominator 3,318 nodes)**

| Mode | Nodes | Share |
|---|---|---|
| Respond immediately (`onReceived`, including the unset default) | 1,609 | 48.5% |
| Respond via a Respond to Webhook node (`responseNode`) | 1,449 | 43.7% |
| Output of the last node (`lastNode`) | 254 | 7.7% |
| Streaming (`streaming`) | 6 | 0.2% |

**HTTP method (denominator 3,318 nodes)**

| Method | Nodes | Share |
|---|---|---|
| POST | 2,466 | 74.3% |
| GET (including the unset default) | 791 | 23.8% |
| Multiple methods (`multipleMethods`) | 50 | 1.5% |
| Other (PUT, DELETE, PATCH, HEAD and expressions) | 11 | 0.3% |

**Shape of the `path` (denominator 3,318 nodes; numbers only, no path content is listed)**

| Shape | Nodes | Share |
|---|---|---|
| Not set (empty) | 340 | 10.2% |
| 8 characters or fewer | 171 | 5.2% |
| 　of which a common word (test, webhook, hook, api, etc. list) | 13 | 0.4% |
| UUID-like | 653 | 19.7% |
| Expression | 9 | 0.3% |
| Other (custom string longer than 8) | 2,145 | 64.6% |

Paths of "8 characters or fewer" (empty excluded) appear in 145 templates (5.2%, denominator 2,775). Nodes with **no authentication, a very short path and no IP allow-list at the same time** number 161 (4.9% of 3,318 nodes); in templates the count is 135 (4.9% of 2,775).

**Unauthenticated Webhook co-occurring with high-risk elements in the same template** (denominator 2,647; presence in the same template only, not reachability)

| Co-occurring element | Templates | Share |
|---|---|---|
| High-risk nodes (`executeCommand`, `ssh`, file read/write) | 29 | 1.1% |
| 　of which `readWriteFile` | 16 | 0.6% |
| 　of which `executeCommand` | 11 | 0.4% |
| 　of which `ssh` | 5 | 0.2% |
| 　of which `readBinaryFile` | 4 | 0.2% |
| 　of which `writeBinaryFile` | 3 | 0.1% |
| SQL node whose query string contains an expression (see §2.8) | 35 | 1.3% |
| HTTP node calling the template author's own n8n instance API (see §2.7) | 22 | 0.8% |
| Code node containing `eval(` or `new Function` | 2 | 0.1% |

A template can contain several of the high-risk node types, so the breakdown does not add up to 29.

### 2.2 Other public entry points: Form, Chat, MCP and AI Agent

| Metric | Count | Share (denominator) |
|---|---|---|
| Templates with a Form Trigger (`formTrigger`) | 1,635 | 11.7% (13,947) |
| 　at least one Form Trigger without authentication | 1,589 | **97.2%** (1,635) |
| 　Form Trigger nodes: none / basicAuth / n8nUserAuth | 1,643 / 30 / 23 | 96.9% / 1.8% / 1.4% (1,696 nodes) |
| Templates with a Chat Trigger (`chatTrigger`) | 771 | 5.5% (13,947) |
| 　nodes set to public (`public: true`) | 192 | 24.9% (771) |
| 　public nodes without authentication | 184 | 95.8% (192) |
| Templates with an MCP Trigger (`mcpTrigger`) | 309 | 2.2% (13,947) |
| 　at least one MCP Trigger without authentication | 299 | 96.8% (309) |
| 　MCP Trigger nodes without authentication | 335 | 97.1% (345 nodes) |
| Templates with an AI Agent node | 4,336 | 31.1% (13,947) |
| 　also with an "unauthenticated public entry point" | 1,485 | 34.2% (4,336) |
| 　　and additionally an action-type tool (`toolCode`, `toolHttpRequest`, `httpRequestTool`, `executeCommand`) | 153 | 3.5% (4,336) |

Note: an "unauthenticated public entry point" means an unauthenticated Webhook, Form Trigger or MCP Trigger, or a Chat Trigger set to public without authentication. Forms and public chat are designed to be opened by people, so no authentication is not necessarily an oversight; but when wired to an AI Agent they let outside input reach the model and its tools directly, which is worth pointing out to the user in the explanation note (fuller Agent figures are in §2.10; the definitions differ between the two places).

### 2.3 Authorization hard-coded in headers or parameters

"Hard-coded" means the value is a literal string (it does not start with `=`, so it is not an expression). Only `httpRequest` nodes are counted.

| Metric | Templates | Share of all (13,947) | Share of templates with `httpRequest` (7,231) |
|---|---|---|---|
| `Authorization` header (case-insensitive) is a literal | 512 | 3.7% | 7.1% |
| 　at least one value is "not placeholder-looking" | 32 | 0.2% | 0.4% |
| `Authorization` written as a literal in a JSON headers field | 10 | 0.1% | 0.1% |
| Other headers whose name contains key, token, secret or auth, as a literal | 290 | 2.1% | 4.0% |
| 　at least one value is "not placeholder-looking" | 54 | 0.4% | 0.7% |
| URL has a token/apikey/key-style query parameter with a literal value | 122 | 0.9% | 1.7% |
| Query parameter field (`sendQuery`) has a same-style name with a literal value | 136 | 1.0% | 1.9% |
| 　either of the two above | 251 | 1.8% | 3.5% |
| 　　at least one value is "not placeholder-looking" | 34 | 0.2% | 0.5% |
| **Any of the above (any kind of hard-coded authorization)** | **961** | **6.9%** | **13.3%** |
| 　at least one value is "not placeholder-looking" | 81 | 0.6% | 1.1% |

Observations:

- There are 1,065 literal `Authorization` header values (counted per header). About 94% of them (1,001) look like placeholders, and 81% (864) begin with `Bearer`. So the common community practice is to **write the authorization header straight onto the node and let the user replace the placeholder with their own key**, instead of using n8n's credential mechanism.
- Of these 961 templates, only 4 also trigger the secret rules on node parameters or `credential:plaintext`. The reason is that headers and query parameters are stored as separate `name`/`value` pairs, so the key names that `credential:plaintext` compares (`token`, `password`, and so on) do not see them. The current version also has `header:hardcoded-authorization`, which looks only at the `Authorization` header and makes a recommendation only for values that start with `Bearer`, `Basic` or `Token`, are long enough and do not look like placeholders; it matches 21 templates (0.2%) in this dataset. The rest of the hard-coded authorization material (other key-like headers, query parameters) has no rule yet; see §5.2.
- Among `httpRequest` nodes that do not use the credential mechanism (11,320), 1,873 (16.5%) carry the hard-coded authorization material above.

### 2.4 Credential use (`authentication` on `httpRequest`)

| Metric | Count | Share (denominator) |
|---|---|---|
| Templates with `httpRequest` | 7,231 | 51.8% (13,947) |
| `httpRequest` nodes in total | 20,620 | n/a |
| Nodes using the credential mechanism (`predefinedCredentialType`, `genericCredentialType`, plus the legacy `headerAuth`, `basicAuth`, `oAuth1/2`, `queryAuth`) | 9,300 | 45.1% (20,620) |
| 　of which `predefinedCredentialType` | 3,416 | 16.6% (20,620) |
| 　of which `genericCredentialType` | 5,784 | 28.1% (20,620) |
| Nodes with it not set (default none) | 11,248 | 54.5% (20,620) |
| Nodes explicitly set to none | 63 | 0.3% (20,620) |
| Nodes with another value (not any known option) | 9 | <0.1% (20,620) |
| Templates with at least one node using the credential mechanism | 3,571 | 49.4% (7,231) |
| Templates where no node uses the credential mechanism | 3,660 | 50.6% (7,231) |
| Templates with both kinds of node | 987 | 13.6% (7,231) |

Generic types under `genericCredentialType` (denominator 5,784): `httpHeaderAuth` 4,007 (69.3%), `httpBearerAuth` 694 (12.0%), `httpBasicAuth` 390 (6.7%), `httpQueryAuth` 260 (4.5%), `oAuth2Api` 258 (4.5%), `httpCustomAuth` 102 (1.8%); the rest together are about 1.3%.

Note: an `httpRequest` with authentication "not set" is not always a problem; many call public APIs that need none. This share therefore cannot be read directly as "authentication is missing".

### 2.5 TLS certificate checking

| Metric | Templates | Share of all (13,947) | Share of templates with `httpRequest` (7,231) |
|---|---|---|---|
| `options.allowUnauthorizedCerts` is true on `httpRequest` | 82 | 0.6% | 1.1% |
| Any node with a "skip certificate check" style option (`allowUnauthorizedCerts`, `ignoreSSL`, `rejectUnauthorized` set to false, etc.) | 118 | 0.8% | n/a |

At node level there are 136 `httpRequest` nodes. Similar options on other nodes are spread over RSS reading (`ignoreSSL`), sending email, IMAP reading and HTTP tool nodes, with node counts ranging from single digits to a little over twenty.

### 2.6 High-risk nodes and Code nodes

**High-risk nodes (denominator 13,947)**

| Node | Templates | Share | Nodes |
|---|---|---|---|
| `executeCommand` | 84 | 0.6% | 219 |
| `ssh` | 59 | 0.4% | 178 |
| `readWriteFile` | 175 | 1.3% | 334 |
| `readBinaryFile` | 42 | 0.3% | 54 |
| `writeBinaryFile` | 41 | 0.3% | 54 |
| Any of the above (including the legacy `readBinaryFiles`, 6 templates) | 325 | 2.3% | n/a |

Templates whose `executeCommand` command string contains a `{{ }}` expression number 63, which is 75.0% of the `executeCommand` templates (84).

**Code/Function nodes (denominator 8,699, the templates containing such nodes, 62.4% of all)**

| Simple pattern (supplementary) | Templates | Share |
|---|---|---|
| Contains `$env` | 40 | 0.5% |
| Contains `process.env` | 6 | 0.1% |
| Contains `require(` | 156 | 1.8% |
| Contains `eval(` | 4 | <0.1% |
| Contains `new Function` | 2 | <0.1% |
| Contains `child_process` | 3 | <0.1% |

Of the 156 templates with `require(`, 102 load `crypto`; the rest are scattered over cheerio, luxon, zlib, fs and others; 2 load `child_process` and 6 load `fs`. The mere presence of `require(` therefore means little; what matters is which module is loaded.

| Scanner Code rule (current version, consistent with §4.2) | Severity | Templates | Share (denominator 8,699; includes matches in `toolCode` and LangChain Code) |
|---|---|---|---|
| `jscode:process-spawn` | warning | 3 | <0.1% |
| `jscode:net-exfil-pattern` | error | 15 | 0.2% |
| `jscode:dynamic-eval` | error | 7 | 0.1% |
| `jscode:require-fs-with-write` | warning | 6 | 0.1% |
| `jscode:base64-decode-suspect` | warning | 4 | <0.1% |
| `jscode:require-child-process` | error | 2 | <0.1% |
| `jscode:env-dump` | error | 1 | <0.1% |
| `jscode:reverse-shell`, `jscode:fs-write-sensitive` | error | 0 | 0.0% |

- With the current version, 25 templates have an error-level Code rule match and 11 have a warning-level one. Of the 7 `jscode:dynamic-eval` templates, 1 comes from a `toolCode` or LangChain Code node (the current version also scans the JavaScript of those two node types) and the other 6 from Code/Function nodes.
- Before the change, `jscode:process-spawn` matched 243 templates covering 523 Code nodes. Only 4 of those nodes contain `child_process`, `.spawn(` or `.execSync(`; the other 519 matched only on `.exec(`, and 502 of those have `RegExp`-style `.exec(` usage in their code (heuristic). The old regex counted a bare `.exec(`. The scanner now matches only real subprocess calls (`child_process`, `exec`/`fork`/`spawn` on `cp`-style objects, `.spawn(`, `.execSync(` and so on), and the current version matches 4 nodes (3 templates); see §4.2 and §5.1.
- None of the 15 `jscode:net-exfil-pattern` templates contains `process.env`; they match because words like token, password or credential appear within 500 characters after a fetch/axios call. This file did not review them one by one, so how many are normal usage is unknown.

**Other**

| Metric | Templates | Share (denominator) |
|---|---|---|
| `$env` used anywhere (Code, or expressions in any node) | 211 | 1.5% (13,947) |
| 　of which in parameters of non-Code nodes | 193 | 1.4% (13,947) |
| Templates with Python code (`pythonCode`) | 83 | 0.6% (13,947) |
| 　of which containing `os`/`subprocess`/`eval`/`exec`-style patterns | 3 | 3.6% (83) |

The current scanner reads the `jsCode`/`functionCode` of Code, Function and Function Item nodes and the JavaScript of `toolCode` and LangChain Code nodes; it still does not read `pythonCode`. Whether a node can read environment variables depends on the n8n version and deployment settings; this file makes no claim about it.

### 2.7 Calls to the author's own n8n API

| Metric | Templates | Share (13,947) |
|---|---|---|
| HTTP node URL contains `/api/v1/` or `/rest/` with a local host (localhost, loopback, `host.docker.internal`) or an n8n environment variable | 14 | 0.1% |
| 　of which a local address | 13 | 0.1% |
| 　of which an n8n environment variable | 1 | <0.1% |
| URL contains `/rest/` or `/api/v1/` on an `n8n.cloud` subdomain (not included above) | 3 | <0.1% |
| URL on any host carrying an n8n public API resource path (workflows, executions, credentials, etc.) | 54 | 0.4% |
| Uses the official n8n node (`n8n-nodes-base.n8n`, managing an instance through an API credential) | 180 | 1.3% |
| Hard-codes an `X-N8N-API-KEY` header as a literal | 4 | <0.1% |

### 2.8 Other observations

| Metric | Templates | Share (denominator) |
|---|---|---|
| Templates with SQL-type nodes (postgres, mySql, microsoftSql, etc.) | 409 | 2.9% (13,947) |
| 　`executeQuery` query string contains a `{{ }}` expression | 115 | 28.1% (409) |
| 　has the query parameterization option (`queryReplacement`) | 87 | 21.3% (409) |
| Templates with non-empty `pinData` (pinned data exported with the workflow) | 935 | 6.7% (13,947) |
| 　`pinData` matches one of the 8 secret rules | 9 | 1.0% (935) |
| 　`pinData` contains email-like strings | 318 | 34.0% (935) |
| 　　of which the domain does not look like a demo domain | 225 | 24.1% (935) |

An expression inside a SQL query is not necessarily an injection risk (it may be a table name, constant or number), and the two figures are not mutually exclusive, so only the order of magnitude is shown. The emails in `pinData` are probably fake data, and whether they are personal data needs a separate judgement; the current scanner includes `pinData` in its secret-pattern scan (a match is an error) but does not judge whether email-shaped strings are personal data.

### 2.9 Secret-leak patterns

**The 8 secret regexes from `security-scan.mjs` are reused** and applied to every string in every node's parameters (as the scanner does).

| Rule | Matching templates | Share (13,947) | Note |
|---|---|---|---|
| `secret:openai-key` | 2 | <0.1% | 1 of them not placeholder-looking |
| `secret:aws-access-key` | 2 | <0.1% | both placeholder-looking (heuristic) |
| `secret:github-pat` | 0 | 0.0% | |
| `secret:slack-token` | 0 | 0.0% | |
| `secret:google-api-key` | 3 | <0.1% | 2 of them not placeholder-looking |
| `secret:pem-private` | 4 | <0.1% | header only; nothing after it that could form a key body |
| `secret:jwt-literal` | 3 | <0.1% | all 3 not placeholder-looking (they may be expired, revoked or sample tokens; cannot tell) |
| `secret:basic-auth-url` | 3 | <0.1% | all placeholder-looking (generic credentials wording or templates, heuristic) |
| **Any rule** | **16** | **0.1%** | 6 of them (<0.1%) have at least one match that is not placeholder-looking |

- Of the 16 templates, 5 match only inside the text of sticky notes; excluding those leaves 11 (0.1%).
- The current scanner also scans `pinData`: 9 more templates match a secret rule inside `pinData` (no overlap with the 16 above), 25 in total (0.2%).
- `credential:plaintext` (a key named password, token, secret, etc. with a literal string value) matches 43 templates (0.3%); by the heuristic all 43 look like placeholders.
- Real secrets are rare in community templates, but that does not mean users will not make the mistake; when generating a workflow, the suggested default is not to hard-code them.

**Secret shapes the scanner does not yet cover (supplementary probe, numbers only)**

| Shape | Matching templates | At least one not placeholder-looking |
|---|---|---|
| Literal `Bearer <token>` string (20+ characters, not an expression) | 36 | 4 |
| Slack incoming-webhook URL shape | 7 | 7 |
| Telegram bot token shape | 3 | 3 |
| Discord webhook URL shape | 3 | 3 |
| Newer OpenAI/Anthropic project key shapes, other GitHub tokens, GitLab, Stripe live keys, SendGrid, Notion, Airtable, Hugging Face, etc. | 0 | 0 |
| **Any** | **48 (0.3%)** | **16 (0.1%)** |

The current `secret:openai-key` regex does not allow hyphens, so it does not match the newer hyphenated project-key format. This dataset has no such match, but generation tools may still meet that format.

### 2.10 AI guardrails and Agent risk

Templates with an Agent are those containing an `@n8n/n8n-nodes-langchain.agent` or `agentTool` node (all 149 `agentTool` templates also contain `agent`, so the union is still 4,336). In this section tools and triggers are judged by **connections** wherever possible (a tool counts when it reaches the Agent through `ai_tool`; a trigger counts when it can reach the Agent along `main` connections). This differs from §2.2, which goes by "in the same template", so the two sets of figures cannot be compared directly.

| Metric | Count | Share (denominator) |
|---|---|---|
| Templates with an Agent | 4,336 | 31.1% (13,947) |
| Agent nodes in total | 7,050 | 1.6 per template with an Agent on average |
| Templates with a **native Guardrails node** (`@n8n/n8n-nodes-langchain.guardrails`) | 19 | **0.4%** (4,336) |
| 　templates with native Guardrails among all templates | 24 | 0.2% (13,947), of which 5 have no Agent |
| 　templates with the third-party PII guardrail node (`n8n-nodes-piiguardrails`) | 2 | <0.1% (13,947), neither has an Agent |
| 　Agent templates with Guardrails, by creation year | 8 in 2025, 11 in 2026 | 0.3% (2,493), 0.6% (1,764) |

**Tools connected to the Agent** (through `ai_tool`; denominator 4,336)

| Tool | Templates | Share |
|---|---|---|
| `toolCode` | 95 | 2.2% |
| `toolWorkflow` | 218 | 5.0% |
| `toolHttpRequest` (including `httpRequestTool`) | 313 | 7.2% |
| MCP client tool (`mcpClientTool`, including the community `n8n-nodes-mcp`) | 208 | 4.8% |
| **Any of the above (action-type tools)** | **765** | **17.6%** |
| 　counting only presence of these nodes, ignoring connections | 784 | 18.1% |
| Also connected to other service-type tools (for example per-service `*Tool` nodes) | 860 | 19.8% |
| No tool connected to the Agent at all | 2,453 | 56.6% |

**Agents and triggers facing external users**

"Triggers facing external users" means `chatTrigger`, `webhook`, `telegramTrigger`, `whatsAppTrigger`, `formTrigger`, `slackTrigger`, `twilioTrigger`, `facebookTrigger`, `jotFormTrigger`, `typeformTrigger`, the Tally form trigger and `mcpTrigger`.

| Metric | Templates | Share (denominator) |
|---|---|---|
| Same template has one of the external triggers above | 2,542 | **58.6%** (4,336) |
| 　adding mailbox triggers (Gmail, IMAP, Outlook) | 2,733 | 63.0% (4,336) |
| 　an external trigger can reach the Agent along `main` connections | 2,440 | 56.3% (4,336) |
| External trigger + Agent, **also with Guardrails** | 17 | **0.7%** (2,542) |
| 　counting only templates where the Agent is reachable | 16 | 0.7% (2,440) |
| External trigger + a connected action-type tool | 526 | 12.1% (4,336) |
| 　of which with Guardrails | 2 | 0.4% (526) |
| 　of which with no Guardrails and no `sendAndWait` human approval | 505 | 11.6% (4,336) |
| 　counting reachable Agents only: no Guardrails and no `sendAndWait` | 486 | 11.2% (4,336) |

**Iteration limit and human approval**

| Metric | Count | Share (denominator) |
|---|---|---|
| Agent nodes with `options.maxIterations` set | 311 | 4.4% (7,050 Agent nodes) |
| 　by template (at least one Agent has it set) | 222 | 5.1% (4,336) |
| Contains a Wait node | 757 | 17.5% (4,336) |
| Contains a `sendAndWait`-style human approval operation (Telegram, Gmail, Slack, etc.) | 153 | 3.5% (4,336) |
| 　either of the above | 874 | 20.2% (4,336) |
| Among Agent templates with a connected action-type tool, has Wait or `sendAndWait` | 115 | 15.0% (765) |
| Among Agent templates with an external trigger, has Wait or `sendAndWait` | 502 | 19.7% (2,542) |

Notes:

- A Wait node is commonly used for delays and rate limiting and is **not the same as human approval**; `sendAndWait` is the explicit "send a message and wait for a person to reply". The table lists them separately.
- The native Guardrails node is very recent (among templates with an Agent it appears only in 2025 and 2026). The common state in community templates is that **an Agent facing external input almost always lacks a guardrail**. This reflects that templates are mostly demos and that the node is new; it does not mean every real deployment lacks other protection (for example checks in the prompt or downstream).
- The current scanner recognizes some AI nodes (`ai:agent-no-guardrails` and `ai:agent-code-tool`, see §4), and the `jscode:*` rules also scan the JavaScript of `toolCode` and `@n8n/n8n-nodes-langchain.code`. These two node types appear in 104 templates (0.7%) and 15 templates (0.1%). Before the change their code was outside the scan; run with the current version, the two node types add just one match (`jscode:dynamic-eval`).
- A guardrail is only one layer of risk reduction: having one does not mean prompt injection cannot happen, and this share cannot be used to judge the real risk of any single template.

---

## 3. Trend by creation year

Denominators differ per column and are named in the headers. "Webhook without authentication" means at least one Webhook has none.

| Year | Templates | With Webhook | Webhook without authentication | With `httpRequest` | of which using credentials | of which hard-coded authorization | TLS check skipped (share of the year's templates) |
|---|---|---|---|---|---|---|---|
| 2019 | 24 | 5 | 4 (80.0%) | 6 | 0 (0.0%) | 0 (0.0%) | 2 (8.3%) |
| 2020 | 307 | 13 | 10 (76.9%) | 42 | 3 (7.1%) | 0 (0.0%) | 2 (0.7%) |
| 2021 | 136 | 18 | 15 (83.3%) | 24 | 7 (29.2%) | 0 (0.0%) | 1 (0.7%) |
| 2022 | 143 | 26 | 26 (100.0%) | 44 | 18 (40.9%) | 3 (6.8%) | 4 (2.8%) |
| 2023 | 86 | 19 | 18 (94.7%) | 37 | 22 (59.5%) | 2 (5.4%) | 1 (1.2%) |
| 2024 | 462 | 93 | 90 (96.8%) | 266 | 160 (60.2%) | 25 (9.4%) | 8 (1.7%) |
| 2025 | 6,564 | 1,057 | 1,021 (96.6%) | 3,340 | 1,410 (42.2%) | 555 (16.6%) | 70 (1.1%) |
| 2026 | 6,225 | 1,544 | 1,463 (94.8%) | 3,472 | 1,951 (56.2%) | 376 (10.8%) | 30 (0.5%) |

The denominator for "of which using credentials" and "of which hard-coded authorization" is that year's templates with `httpRequest`; "hard-coded authorization" is the combined figure of §2.3 (any kind).

- **No clear improvement for unauthenticated Webhooks:** 2024 to 2026 sit steadily between 94.8% and 96.8%. 2019-2023 combined is 73 of 81 (90.1%), but that sample is too small to read as "early templates were better". 2026 is 1.8 percentage points below 2025, which at this sample size is not enough to call a trend.
- Templates from 2026 show slightly better **credential use** (56.2%; 42.2% in 2025, but 60.2% in 2024, so not a steady rise) and a lower share of **hard-coded authorization** (10.8%, against 16.6% in 2025); the share skipping the TLS check also fell from 1.1% to 0.5%. Year-to-year gaps depend on the mix of templates and should not be over-read.
- The share of templates containing a Webhook is 24.8% in 2026, up from 16.1% in 2025, so the absolute amount of exposed surface is growing.

---

## 4. Comparison with the current scanning rules

### 4.1 Scanner rules at a glance (current `scripts/security-scan.mjs`)

> **Baseline for the comparison:** this section and the full run in §4.2 use the current version of `security-scan.mjs`. An earlier revision of this file compared against the older scanner (which had no guardrail rules); the older numbers appear only in §4.2, to show what changed. Rule IDs are the same set used in [`../spec/security-guardrails.en.md`](../spec/security-guardrails.en.md).

The current rules fall into two classes of **different nature**:

- **Guardrail rules (recommendations, all warnings):** they point out "a setting worth considering". A default run does not fail because of them. A user can write `guardrail-ack: <rule-id>` (with an optional note) in a node's notes to say they are aware, and acknowledged items are no longer listed as open. `--strict` is only an optional flag and is not used by the Pack's workflow.
  - `webhook:no-auth`: `authentication` unset or none on `n8n-nodes-base.webhook`.
  - `form:no-auth`: a Form Trigger without authentication.
  - `tls:allow-unauthorized-certs`: `allowUnauthorizedCerts` is true on any node (also inside `options`).
  - `network:http-cleartext`: a string starting with `http://` that is not a local address.
  - `exec:execute-command`, `exec:ssh`: use of the Execute Command or SSH node.
  - `file:rw-access`: use of a local-file node (`readWriteFile`, `readBinaryFile(s)`, `writeBinaryFile`, `localFileTrigger`).
  - `header:hardcoded-authorization`: the `Authorization` header of `httpRequest`/`httpRequestTool` (including the JSON header form) is a literal value that starts with `Bearer`, `Basic` or `Token`, is long enough and does not look like a placeholder.
  - `ai:agent-code-tool`: the same workflow has an AI Agent and a `toolCode`.
  - `ai:agent-no-guardrails`: the workflow has an AI Agent and an external trigger (Webhook, Chat, MCP, Form, messaging platforms, mailbox and so on) but no Guardrails node.
  - `error:no-handling`: the workflow has external-call nodes but no `onError`/`retryOnFail` setting, no Error Trigger and no `settings.errorWorkflow`.
  - None of these guardrail rules looks at `connections`; they only check whether the same workflow contains a given kind of node or setting.
- **Detection rules (pattern findings, mostly error):** they describe patterns that look like secrets or like malicious code, and serve the Pack's own CI that checks files in this repo. A default run that meets an error exits with a non-zero code. Detection rules do not accept `guardrail-ack`.
  - Secret patterns (error): 8 `secret:*` rules (`openai-key`, `aws-access-key`, `github-pat`, `slack-token`, `google-api-key`, `pem-private`, `jwt-literal`, `basic-auth-url`), matched against every string in the node `parameters` and in `pinData`.
  - `credential:plaintext` (error): key named password, secret, apikey, token, client_secret, private_key and similar, with a value of 4+ characters that is not an expression or a `$credentials` reference.
  - Code rules `jscode:*`: `reverse-shell`, `env-dump`, `dynamic-eval`, `require-child-process`, `fs-write-sensitive`, `net-exfil-pattern` (all error), and `process-spawn`, `base64-decode-suspect`, `require-fs-with-write` (all warning). The scope is the JavaScript of Code, Function and Function Item nodes plus `toolCode` and LangChain Code nodes; Python code is not scanned.
  - There are also errors for unreadable files and JSON parse failures, and a warning for an empty node list (`schema:empty-nodes`); none of these occurs in this dataset.

### 4.2 The current scanner run over all templates

Default mode (without `--strict`), over the workflow graph of all 13,947 templates:

| Result in default mode | Templates | Share (13,947) | Before the change (older scanner) |
|---|---|---|---|
| At least one error | 91 | 0.7% | 82 |
| Warnings only (no error) | 10,834 | 77.7% | 2,910 |
| No findings | 3,022 | 21.7% | 10,955 |

Of the 10,834 "warnings only" templates, 10,830 carry guardrail recommendations and the other 4 have only Code-rule warnings. All 91 templates with an error come from the detection class.

**Guardrail rules (recommendations, warning)**

| Rule | Templates | Share (13,947) | Nodes |
|---|---|---|---|
| `error:no-handling` | 8,633 | 61.9% | (one per workflow) |
| `webhook:no-auth` | 2,647 | 19.0% | 3,167 |
| `ai:agent-no-guardrails` | 2,644 | 19.0% | (one per workflow) |
| `form:no-auth` | 1,589 | 11.4% | 1,643 |
| `file:rw-access` | 246 | 1.8% | 462 |
| `network:http-cleartext` | 121 | 0.9% | 190 |
| `tls:allow-unauthorized-certs` | 105 | 0.8% | 164 |
| `ai:agent-code-tool` | 99 | 0.7% | 144 |
| `exec:execute-command` | 84 | 0.6% | 219 |
| `exec:ssh` | 59 | 0.4% | 178 |
| `header:hardcoded-authorization` | 21 | 0.2% | 33 |
| **At least one of the above** | **10,910** | **78.2%** | n/a |

**Detection rules**

| Rule | Severity | Templates | Share (13,947) |
|---|---|---|---|
| `credential:plaintext` | error | 43 | 0.3% |
| `secret:*` total (including `pinData`) | error | 25 | 0.2% |
| 　`secret:jwt-literal` | error | 10 | <0.1% |
| 　`secret:google-api-key`, `secret:pem-private` | error | 4 each | <0.1% |
| 　`secret:aws-access-key`, `secret:basic-auth-url` | error | 3 each | <0.1% |
| 　`secret:openai-key` | error | 2 | <0.1% |
| 　`secret:github-pat`, `secret:slack-token` | error | 0 | 0.0% |
| `jscode:*` error-level total | error | 25 | 0.2% |
| 　`jscode:net-exfil-pattern` | error | 15 | 0.1% |
| 　`jscode:dynamic-eval` | error | 7 | <0.1% |
| 　`jscode:require-child-process` | error | 2 | <0.1% |
| 　`jscode:env-dump` | error | 1 | <0.1% |
| 　`jscode:reverse-shell`, `jscode:fs-write-sensitive` | error | 0 | 0.0% |
| `jscode:*` warning-level total | warning | 11 | <0.1% |
| 　`jscode:require-fs-with-write` | warning | 6 | <0.1% |
| 　`jscode:base64-decode-suspect` | warning | 4 | <0.1% |
| 　`jscode:process-spawn` | warning | 3 (4 nodes) | <0.1% |
| **At least one error** | error | **91** | **0.7%** |

The 91 templates break down as `credential:plaintext` 43, `secret:*` 25 and error-level `jscode:*` 25, with a little overlap.

**What changed compared with the older scanner**

| Item | Before | Current | Reason |
|---|---|---|---|
| Templates with an error | 82 | 91 | `pinData` is now scanned for secrets; 9 more templates (no overlap with the earlier secret matches) |
| Templates matching `secret:*` | 16 | 25 | same as above |
| `jscode:process-spawn` | 523 nodes, 243 templates | 4 nodes, 3 templates | only real subprocess calls match; a bare `.exec(` (regex usage) no longer does |
| `jscode:dynamic-eval` | 7 nodes, 6 templates | 8 nodes, 7 templates | the JavaScript of `toolCode` and LangChain Code nodes is now scanned; one more match |
| The 11 guardrail rules | did not exist | see the tables above | new |

### 4.3 Risk-type comparison table

In the "class" notes, "guardrail" means a recommendation (warning) and "detection" means a pattern finding. Numbers are carried over from §2 and §4.2.

| Risk type | How common in community templates | Rule that covers it today (class, severity) | Scope and notes |
|---|---|---|---|
| Webhook without authentication | 95.4% of templates with a Webhook (2,647; 19.0% of all) | `webhook:no-auth` (guardrail, warning) | Looks only at the Webhook node's authentication setting; not at IP allow-lists, path strength, or high-risk nodes in the same template |
| Form Trigger without authentication | 97.2% of templates with a Form (1,589; 11.4% of all) | `form:no-auth` (guardrail, warning) | Forms are often meant to be filled in by the public; the user can mark it known with `guardrail-ack` |
| MCP Trigger / public Chat without authentication | MCP 96.8%, public Chat 95.8% | None yet | Not implemented; see §5 |
| Hard-coded `Authorization` header | 3.7% of all templates, 7.1% of HTTP templates; about 94% look like placeholders | `header:hardcoded-authorization` (guardrail, warning) | Only values starting with `Bearer`/`Basic`/`Token` that do not look like placeholders get a recommendation, so it matches 21 templates (0.2%), far fewer than the 512 with a literal value |
| Other key-like headers and query parameters hard-coded | Headers 2.1%, query parameters 1.8% | None yet | Name and value are stored separately, so `credential:plaintext` does not see them; not implemented |
| Secrets in specific formats | 0.1% (16) in node parameters, 0.2% (25) including `pinData`; the not-placeholder-looking subset is counted separately | `secret:*`, 8 rules (detection, error), including `pinData` | No rule for literal Bearer, Slack/Discord Webhook, Telegram token or newer key formats; see §5 |
| Plaintext password keys | 0.3% (43), all placeholder-looking | `credential:plaintext` (detection, error) | |
| Cleartext `http://` | 0.9% (121); 166 (1.2%) with expressions starting with `=` | `network:http-cleartext` (guardrail, warning) | Expressions starting with `=` are out of scope (45 more templates) |
| TLS certificate checks skipped | 0.8% (118) | `tls:allow-unauthorized-certs` (guardrail, warning) | Looks only at `allowUnauthorizedCerts` (105 templates); `ignoreSSL` and `rejectUnauthorized: false` are out of scope |
| `executeCommand`, `ssh`, file read/write nodes | 2.3% (325) for the three groups together; 75.0% of `executeCommand` commands contain expressions | `exec:execute-command` (84), `exec:ssh` (59), `file:rw-access` (246, including `localFileTrigger`) (guardrail, warning) | A separate flag for "command contains an expression" is not implemented |
| `child_process`, `eval`, whole `process.env` and so on in Code nodes | <=0.1% | `jscode:*` error-level (detection, error) | Scope covers the JavaScript of Code, Function, Function Item, `toolCode` and LangChain Code |
| Subprocess calls in Code nodes | Many false matches before the change (243 templates; 519 of 523 nodes matched only on `.exec(`) | `jscode:process-spawn` (detection, warning) | Narrowed; now 3 templates (4 nodes) |
| Reading a single `$env` / `process.env` variable in Code or expressions | 1.5% (211) | None yet (`jscode:env-dump` catches only whole-object dumps) | Not implemented |
| Python Code nodes | 0.6% (83); 3 with high-risk patterns | None yet | Only JavaScript is read; `pythonCode` is not |
| Expressions concatenated into SQL queries | 28.1% of SQL templates (115) | None yet | Not implemented |
| Calling the user's own n8n API / instance | 0.1% (14); n8n node used by 1.3% (180) | None yet (a literal `X-N8N-API-KEY` falls under "other key-like headers") | Not under consideration for now |
| Secrets and personal data in `pinData` | Secrets in 9 templates, email-shaped strings in 318 | Secrets: `secret:*` (detection, error); personal data: none yet | Email-shaped strings are out of scope; see §5 |
| Public entry points wired to an AI Agent | 34.2% of Agent templates (1,485); only 0.7% (17/2,542) of Agent templates facing external input have Guardrails | `ai:agent-no-guardrails` (guardrail, warning): 2,644 templates (19.0%) | Judged by "an external trigger exists in the same workflow", not by connections, and without distinguishing action-type tools or `sendAndWait` approval |
| Agent with `toolCode` | 2.2% of Agent templates (95) connect one | `ai:agent-code-tool` (guardrail, warning): 99 templates (0.7%) | Judged by "an Agent and a `toolCode` in the same workflow"; the code inside `toolCode` is scanned separately by `jscode:*` |
| External calls without error handling | Not counted separately in §2 | `error:no-handling` (guardrail, warning): 8,633 templates (61.9%) | A coarse check, see §4.1; templates are mostly demos, so the share is high |
| `maxIterations`, human approval (`sendAndWait`) | 5.1% and 3.5% of Agent templates | None yet (corresponds to `approval:destructive-needs-gate`, handled by the AI and manual review) | Not implemented |
| Personal-data minimization | See §2.8 | None yet (corresponds to `data:pii-minimization`, handled by the AI and manual review) | Not implemented |
| Use of the credential mechanism (positive indicator) | 49.4% of HTTP templates have at least one such node | Not applicable | The default way to generate workflows |

---

## 5. Rule coverage today and ideas for later

An earlier revision of this file listed 14 proposed rules (R1-R14). The tables below check each one against the current scanner and say which are implemented and how the implementation differs from the proposal. An "R number" is only the earlier proposal number; **the actual rule IDs are the ones in §4**.

### 5.1 Implemented

| Earlier proposal | Current rule (class, severity) | How it differs from the proposal |
|---|---|---|
| R3 hard-coded `Authorization` header | `header:hardcoded-authorization` (guardrail, warning) | Only values starting with `Bearer`/`Basic`/`Token`, long enough and not placeholder-looking get a recommendation, so it matches 21 templates rather than the 512 the proposal estimated; severity is fixed at warning, with no "escalate to error when the value looks real" |
| R5 TLS checks skipped | `tls:allow-unauthorized-certs` (guardrail, warning) | Covers only `allowUnauthorizedCerts`: 105 templates against the 118 estimated |
| R6 high-risk nodes | `exec:execute-command`, `exec:ssh`, `file:rw-access` (guardrail, warning) | Split into three rules; the file rule matches 246 templates (including `localFileTrigger`); the separate "command contains an expression" flag is not implemented |
| R2, Form part | `form:no-auth` (guardrail, warning) | The proposal suggested only disclosing Forms at hand-over; it is now a recommendation-level warning like Webhook, and the user can mark it known with `guardrail-ack` |
| R9, `pinData` part | `secret:*` also scans `pinData` (detection, error) | 9 more templates match; email-shaped strings in `pinData` are not implemented |
| R12 `process-spawn` tuning | `jscode:process-spawn` (detection, warning) | Now matches only real subprocess calls; 523 nodes (243 templates) became 4 nodes (3 templates) |
| R13 Agent without Guardrails | `ai:agent-no-guardrails` (guardrail, warning) | Judged by "an external trigger in the same workflow", not by connections: 2,644 templates against the 2,424 estimated for the connection-based version; action-type tools and `sendAndWait` are not distinguished |
| R14 Agent with `toolCode`, plus wider `jscode:*` scope | `ai:agent-code-tool` (guardrail, warning); `jscode:*` now scans `toolCode` and LangChain Code | Judged by "an Agent and a `toolCode` in the same workflow": 99 templates against the 95 estimated by connections; the wider scan adds one `jscode:dynamic-eval` match |

A guardrail rule that was not in the original proposals but exists today: `error:no-handling` (external calls without error handling; 8,633 templates).

### 5.2 Not implemented; for discussion only

The current scanner has no rule for the items below, and whether and how to implement them is still open. If they are implemented later, putting them in the guardrail class (recommendation-level warning) is suggested. The "community baseline" is the number of templates that would match if the rule were simulated on this dataset, and helps estimate how many reminders it would produce.

| Earlier proposal | Idea | Community baseline (templates) | Possible sources of false matches |
|---|---|---|---|
| R1 | In one workflow, an unauthenticated Webhook together with `executeCommand`, `ssh`, file read/write nodes or an `eval` in Code; ideally use `connections` to check they are really wired together | 29 (1.1% of unauthenticated-Webhook templates); Code `eval` 2 more | Elements in the same template are not necessarily connected |
| R2, MCP and public Chat part | `mcpTrigger` without authentication; `chatTrigger` with `public: true` and no authentication | MCP 299; public Chat 184 | Public chat is meant to be public |
| R4 | Header names containing key/token/secret/auth (excluding `Authorization`), or token/apikey/key/secret/password in the URL or query-parameter fields, with a literal value | Headers 290, query parameters 251; 961 (6.9%) together with R3 | `key` can be a non-secret identifier |
| R7 | Reading a single `$env` or `process.env` variable in Code or in any node's expression | 211 (1.5%) | Putting settings in environment variables is common; whether they can be read depends on the n8n version and deployment settings |
| R8 | A SQL node's `executeQuery` string contains `{{ }}` and `queryReplacement` is not set | 115 (28.1% of SQL templates; fewer once those with `queryReplacement` are excluded) | Constants, table names and numbers also match |
| R9, extra patterns | Literal `Bearer` tokens, Slack/Discord Webhook URLs, Telegram bot tokens, newer hyphenated OpenAI/Anthropic keys and so on; email-shaped strings in `pinData` listed separately | Extra patterns 48 (16 not placeholder-looking); `pinData` emails 318 | Email shapes are high (demo data is common) |
| R10 | Read `pythonCode` and match `import os`, `subprocess`, `os.system`, `eval(`, `exec(` and so on | 3 (of 83 Python templates) | Low |
| R11 | Also include expressions starting with `=http://` in `network:http-cleartext` | 45 more (121 becomes 166) | Low |
| Iteration limits and human approval | `maxIterations`, `sendAndWait` and so on; corresponds to `approval:destructive-needs-gate` in the spec | See §2.10 | It is hard to tell from node types alone which actions are destructive or financial |
| Personal-data minimization | Corresponds to `data:pii-minimization` in the spec | See §2.8 | Depends on data content, so not suited to rule-based matching |

Note: the current scanner is rule-based static matching, not an AI auditor. For items with no rule, the AI makes suggestions at generation time based on this file and says at hand-over which parts were reviewed manually.

---

## 6. What a recommendation-first default means

This section uses the numbers of this dataset to explain why guardrail rules are recommendations (warnings, and a default run does not fail). It is a descriptive calculation, not an evaluation of any template or author; templates are mostly demos, so the numbers reflect community habits, not the state of users' private workflows.

**Hypothetical:** if the rule were changed to "any guardrail finding makes the scan fail", this is what would happen across all 13,947 templates:

| Scenario | Templates | Share (13,947) |
|---|---|---|
| At least one guardrail finding | 10,910 | 78.2% |
| 　of which no detection-class error (would fail only because of guardrails) | 10,830 | 77.7% |
| Guardrail findings plus detection errors, failing together | 10,921 | 78.3% |
| Still passing (no guardrail finding, no error) | 3,026 | 21.7% |
| At least 2 guardrail rules matched | 4,254 | 30.5% |
| At least 3 guardrail rules matched | 1,007 | 7.2% |

From another angle, leaving out the most common rules one at a time:

| Guardrail rules counted | Templates with at least one match | Share (13,947) |
|---|---|---|
| All 11 | 10,910 | 78.2% |
| Without `error:no-handling` | 5,931 | 42.5% |
| Also without `ai:agent-no-guardrails` | 4,646 | 33.3% |
| Also without `webhook:no-auth` and `form:no-auth` | 649 | 4.7% |

Observations:

- Guardrail findings are the norm in community templates, not a rare exception. If failing were the default, the large majority of templates (roughly three quarters or more) would first have to be handled or annotated one by one, which clearly increases the work a user has before hand-over.
- The practices behind guardrail rules mostly have legitimate uses: public forms meant for the general public, self-signed certificates on an internal network, local files and SSH in self-hosted setups, demo Webhooks. Users know their own environment best, so letting the user decide fits reality better than a blanket rule.
- Detection-class matches (secret patterns, malicious-code patterns) are only 0.7% (91 templates), and what they mean is simpler, so they stay as errors for the Pack's own CI that checks files in this repo.
- The recommendation-first approach works like this: the AI proposes suggestions with reasons, the user decides whether to adopt them, and when the user declines the decision is noted in the annotations (`guardrail-ack`). A scanner warning is a list of reminders, not a gate; `--strict` stays as an optional flag for users or teams that want a stricter setting.

---

## 7. How to use this knowledge

The purpose of these statistics is to let the Skill, the "brain", know **which practices are common in community templates**, so that when generating a workflow it can proactively offer more careful suggestions instead of copying the template. Common in the community does not mean suitable, and it does not mean every user should accept every suggestion.

**When the AI generates a workflow, it proactively offers suggestions** and writes them into the workflow's annotations: overall suggestions go in the "Recommendations" part of the Layer 3 note, and node-specific ones go in that node's notes. When the user chooses not to adopt a suggestion, the AI follows the user's decision and marks it in the annotations (a `guardrail-ack: <rule-id>` line in the node's notes, with an optional ` -- note`). The directions below are derived from this file's numbers:

1. **Public entry points:** suggest an authentication mechanism for Webhooks (one of `headerAuth`, `basicAuth`, `jwtAuth`); the same for the MCP Trigger and public Chat Trigger. For an entry point that really has to be public (for example a form for the general public), suggest recording the reason in the explanation note; origin restrictions (IP allow-list, CORS allowed origins) can be set too, and short or common words are best avoided as paths.
2. **Secrets:** suggest n8n's credential mechanism (`predefinedCredentialType` or `genericCredentialType`) for keys, tokens, passwords and `Authorization` headers, and avoid putting them in headers, query parameters, URLs or Code nodes. Even a placeholder such as "YOUR_API_KEY" is best avoided: about 94% of the literal `Authorization` values in community templates are such placeholders, and they are exactly the spot where a user pastes a real key.
3. **TLS certificate checks:** suggest keeping them on; when the user says it is an internal self-signed certificate, follow the user's decision and record it in the note.
4. **High-risk nodes:** unless the user needs them, suggest not using `executeCommand`, `ssh` or file read/write nodes; suggest not concatenating external input (especially data from unauthenticated entry points) into command strings or SQL queries, and using query parameters for SQL.
5. **Code nodes:** suggest avoiding `eval`, `new Function` and `child_process`; for settings, suggest n8n credentials or variables rather than reading `$env`/`process.env`.
6. **No real data on export:** suggest not exporting `pinData` that holds real personal data or secrets.
7. **AI Agents facing external input:** when an Agent takes external input from chat, a Webhook, a messaging platform or a form, suggest considering a Guardrails node (or an equivalent input check), setting `maxIterations`, and giving only the tools the task needs; for tools that write, delete, send mail or call out, suggest a human approval such as `sendAndWait`, or stating in the explanation note why it is not needed. Only 0.7% of the Agent templates with an external entry point have Guardrails and 5.1% set `maxIterations`; that is common, but not a habit worth copying. Input inside `toolCode` comes from the model, so suggest treating it as untrusted data.
8. **Error handling for external calls:** suggest setting `onError`, `retryOnFail` or `settings.errorWorkflow` so that someone learns about failures.

**At hand-over, explain the scan result:**

- Run `scripts/security-scan.mjs` and report the result (the number of errors and warnings and the rule names) to the user as it is. If nothing was found, say "nothing found"; do not pad it, and do not present the scan result as a guarantee that nothing is wrong. A guardrail warning is a recommendation, and the user decides whether to act on it; a detection error means a secret-like or malicious-code-like pattern was found, and handling it first is suggested.
- For the items that have no rule yet in §4.3 and §5.2 (MCP and public Chat entry points, other key-like headers, `$env`, SQL concatenation, Python, personal data in `pinData`, human approval, data minimization and so on), the AI makes suggestions itself based on this file and says which parts were reviewed manually and which are scanner results.
- For how rule IDs, acknowledgement lines and the hand-over checklist are written, see [`../spec/security-guardrails.en.md`](../spec/security-guardrails.en.md); for how scan results and reference material are disclosed, see [`../spec/references-disclosure.en.md`](../spec/references-disclosure.en.md). If this file's statistics influenced a design decision (for example "because community templates mostly skip authentication, an authentication suggestion was added here"), list it under "which references were used this time".

---

## 8. What remains uncertain

- Whether a matched template really carries risk (the placeholder judgement is a heuristic; the 15 `jscode:net-exfil-pattern` templates were also not reviewed one by one).
- Whether an unauthenticated entry point has a reverse proxy, network restrictions or other protection in a real deployment cannot be seen from template data.
- Whether nodes can read environment variables, and whether newer n8n versions disable some high-risk nodes by default, depends on version and settings and was not checked here.
- The "external trigger" list in §2.10 is defined by hand (it excludes schedule, manual, Google Drive, spreadsheet and similar triggers); change the list and the shares change. For Guardrails only the existence of the node is counted, not what it is configured to check or whether it sits on the input path.
- The guardrail rules of the current scanner (especially `error:no-handling` and `ai:agent-no-guardrails`) are coarse checks that do not look at `connections`; their high match rates on templates do not mean the same would hold for users' real workflows. The scenario in §6 describes this dataset only.
- Whether n8n.io filters what it publishes as public templates is not speculated on here; it may make secret matches rarer than in private workflows.

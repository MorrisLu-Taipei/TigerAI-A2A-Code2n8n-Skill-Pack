# Security Guardrail Recommendations v1.1

> 🌐 **English** | [繁體中文](security-guardrails.md)

> **Audience**: every Skill that generates or modifies n8n workflows, AI agents using this Skill Pack, integration engineers who review workflows
> **Positioning**: in this Pack, a "guardrail" means **a recommendation or risk reminder the AI raises on its own initiative**. While building a workflow, the AI adopts reasonable secure defaults and explains why. If the user wants something different, the AI follows the user's decision. This spec offers recommendations only; the final decision and responsibility rest with the user
> **Closing item**: security recommendations are written by rule ID into the "Recommendations" block of the Layer 3 note and into the relevant node `notes`; format and order always follow the unified definition in Chapter 4 of [`references-disclosure.en.md`](references-disclosure.en.md) (Section 5 here only adds judgment hints specific to this spec)

---

## 1. Purpose and principles

### 1.1 The problem

Scanning only after delivery means a questionable setting is built first and picked out later. A scan can only catch problems with a recognizable pattern, such as a string shaped like a key or a webhook with no authentication. It cannot tell whether an AI agent can be steered by outside text, or whether anyone confirmed a delete. So the recommendations should come earlier: **at the moment the AI creates a node, the safer choice is the default, and the reason is stated.**

n8n ships a native Guardrails node (type: `@n8n/n8n-nodes-langchain.guardrails`) that can check for prompt injection, personal data, secret keys and more. Yet among the public n8n.io templates this Pack has collected, only 19 of the 4,336 templates that contain an AI Agent (about 0.4%) use it. This is a descriptive statistic, not a judgment of any author. What it says is: if the generator does not raise the option itself, community convention will usually not bring it to the user's attention. How the statistic was gathered, and its limits, are in [`../research/n8n-templates-security.en.md`](../research/n8n-templates-security.en.md).

### 1.2 Three stages

| Stage | When | What it does | Section |
|---|---|---|---|
| 1. Recommendations at generation | While the AI creates or edits a workflow | Adopt the safer choice by default, by rule ID, and explain why; if the user picks another approach, follow it | 2, 3 |
| 2. Scan reminders | Before delivery | Run `node scripts/security-scan.mjs` on the exact JSON being delivered, report the results to the user as they are, and add recommendations | 4 |
| 3. Annotation record | At delivery | The status of each recommendation is written into the "Recommendations" block of the Layer 3 note and the relevant node `notes`, including ones the user chose not to adopt and ones that cannot be checked automatically; the conversation carries only a summary, and the annotations are the official record | 5 |

The three stages complement each other. Without the first, the scan is only an after-the-fact reminder. Without the second, the AI's own account has nothing to be compared against. Without the third, the user later cannot tell which recommendations were not taken (annotations travel with the workflow when it is exported or handed over; the conversation does not).

### 1.3 How the AI behaves

- **Adopt by default; the user may decline.** If the user says nothing special, the AI follows the recommendations in this file and gives the reason in a sentence or two.
- **When the user asks for a different approach, the AI follows the user's decision.** It does not refuse, does not block, does not ask the user to justify the choice, and does not keep arguing.
- **The AI does three things**: explain the risk clearly, offer an alternative, and record the user's choice in the annotations (Sections 3 and 5).
- **No hiding, and no switching off reminders on the user's behalf.** Every guardrail is only a recommendation: none of them is a mandatory rule, and none of them makes a Skill refuse delivery. The risk is explained before the user decides, not afterwards, and the AI does not decide on its own that a reminder is unimportant and leave it out.
- Guardrails cover the design and configuration of the workflow. They do not replace the user's own network controls, permissions and operations.

---

## 2. Recommendations at generation

The rule IDs below are fixed and are not renamed. The scanner, the "Recommendations" block of the sticky note, node notes and acknowledgement lines all use the same set of IDs.

| Rule ID | Recommendation in one line | Scan rule |
|---|---|---|
| `secret:hardcoded` | Secrets go only through n8n credentials | Yes: `secret:*`, `credential:plaintext` (detection rules, error, including `pinData`; `guardrail-ack:` has no effect on them) |
| `webhook:no-auth` | Set authentication on Webhooks | Yes: `webhook:no-auth` (recommendation reminder) |
| `form:no-auth` | Set authentication on externally exposed Form Triggers | Yes: `form:no-auth` (recommendation reminder) |
| `tls:allow-unauthorized-certs` | Keep TLS certificate checks on | Yes: `tls:allow-unauthorized-certs` (recommendation reminder); non-local `http://` is covered by `network:http-cleartext` (recommendation reminder) |
| `exec:execute-command` | Prefer not to use Execute Command | Yes: `exec:execute-command` (recommendation reminder) |
| `exec:ssh` | Prefer not to use the SSH node | Yes: `exec:ssh` (recommendation reminder) |
| `file:rw-access` | Prefer not to use nodes that read or write local files | Yes: `file:rw-access` (recommendation reminder) |
| `header:hardcoded-authorization` | Use credentials for the HTTP Authorization header | Yes: `header:hardcoded-authorization` (recommendation reminder) |
| `approval:destructive-needs-gate` | Add a human approval step before destructive or money-moving actions | No scan rule yet; relies on AI and human checks |
| `error:no-handling` | Add error handling to external calls | Yes (coarse): `error:no-handling` (recommendation reminder) |
| `ai:agent-no-guardrails` | Pass an externally facing AI Agent's input and output through native Guardrails | Yes (coarse): `ai:agent-no-guardrails` (recommendation reminder) |
| `ai:agent-code-tool` | Prefer not to give an Agent tools that run arbitrary code | Yes (partial): `ai:agent-code-tool` (recommendation reminder) |
| `data:pii-minimization` | Minimize personal data | No scan rule yet; relies on AI and human checks (secret-shaped content in `pinData` is covered by `secret:*`) |

**Reminder rules (added by ADR-014; three; reminder only)**: besides the 13 recommendations above, the scanner has three "reminder" rules. They are not practices the AI should adopt while building; they point at "places the approver should look at once". Details are in 2.13 to 2.15.

| Rule ID | Reminder in one line | Scan rule |
|---|---|---|
| `egress:external-domain` | List the external domains the workflow talks to; the approver checks them against the allow-list | Yes: `egress:external-domain` (reminder, severity `info`) |
| `impact:high-impact-node` | Mark nodes that send mail, write or delete database rows, use HTTP write methods, or run system commands | Yes: `impact:high-impact-node` (reminder, severity `info`) |
| `notes:missing-change-log` | The Layer 3 sticky note carries a "Change log" section | Yes: `notes:missing-change-log` (reminder, severity `info`) |

Behavior shared by the reminder rules: **reminder only, never enforced**. The severity is `info`; the scan prints an `INFO` line and the summary line counts them separately as `reminder`; they do not count toward `warning`, **neither a default run nor `--strict` ever fails because of them**, and in CI they land in the advisory list only, with no blocking code added. When the user already knows, the same `guardrail-ack: <rule ID>` line acknowledges them (Chapter 3) and the scanner prints an `ACK` line instead. The reminder rules do not need a line each in the "Recommendations" block of the Layer 3 note; when the scan reports them, write them into the "Security scan result" block as in Chapter 5, with the status "reminder".

> **About the "Scan rule" column**: it records what the scanner implemented when this spec was written; actual behavior is whatever `scripts/security-scan.mjs` outputs. Guardrail rules are always "recommendation reminders" (the scanner labels them warning internally) and a default run never fails because of them; only detection rules (`secret:*`, `jscode:*`, `credential:plaintext`, plus read or JSON-parse failures) are labelled error, meant for the Pack's own CI checking files in the repo, while the Skill flow just tells the user the result. The scanner's labels are not a threshold that decides whether delivery may go ahead. "Coarse" and "partial" mean the scanner covers only part of the recommendation, so no finding does not mean the whole recommendation is met. Items with no scanner rule are listed in the "Recommendations" block as "cannot be checked automatically yet" (Section 5). Update this table when the scanner changes.

Every recommendation has the same shape: **situation**, **recommended practice**, **why**, **risk** (if not adopted), **what the AI does if the user does not adopt it**, **scan rule**.

The part common to all rules, "what the AI does if the user does not adopt it": follow the user's decision; explain the risk and the alternative first; mark the item "User chose not to adopt" in the "Recommendations" block of the Layer 3 note (the user does not need to give a reason); write a one-line recommendation in that node's notes (form in §4.4 of [`references-disclosure.en.md`](references-disclosure.en.md)); and, if the user agrees, leave an acknowledgement line as well (Section 3). The entries below only add what is specific to each rule.

### 2.1 `secret:hardcoded`: secrets go only through credentials

- **Situation**: any node that needs a key, token, password, private key, connection string, signing secret or similar.
- **Recommended practice**:
  1. Use the n8n Credentials mechanism. The node references the credential and does not contain the secret.
  2. Avoid putting secrets in: node parameters, HTTP headers or query parameters, URLs (including the `https://user:pass@` form), Code nodes, Set nodes, `pinData`, sticky notes, or node notes.
  3. First check whether the user already has a matching credential to bind. If not, tell the user which credential type to create in the UI and let the user create it.
  4. If the user pastes a secret into the conversation, recommend not writing it into the workflow, and remind the user to treat it as leaked and rotate it soon (consistent with the vendored `n8n-credentials-and-security-official` Skill).
  5. Examples and test data use obviously fake values; the AI does not invent strings shaped like real keys.
- **Why**: workflow JSON is exported, copied, screenshotted and committed to version control. A secret written inside travels with it. The credential mechanism leaves only a reference in the export.
- **Risk**: the secret leaves with the JSON, and the extent of the exposure is hard to trace afterwards.
- **If the user does not adopt it**: for example the user wants to paste a key straight into a node. The AI explains the risk above and shows the credential approach; if the user still chooses to paste it, the AI does so, and reminds the user that the key now appears in the conversation and the JSON and is worth rotating later. The scanner raises a reminder (a detection-rule error, which is information and not a block); the AI passes that on honestly with a suggestion, and the user decides.
- **Scan rule**: `secret:*` (key patterns, scanned in node parameters and `pinData`) and `credential:plaintext` (plaintext under sensitive field names). A scan only catches patterns and will miss passwords in a made-up format.

### 2.2 `webhook:no-auth`: set authentication on Webhooks

- **Situation**: the workflow contains a Webhook node (`n8n-nodes-base.webhook`).
- **Recommended practice**:
  1. Set Header Auth, Basic Auth or JWT, with the matching credential created through the credential mechanism.
  2. Where feasible, add an IP allowlist (a Webhook node option), especially when the callers are known.
  3. Use a long random path instead of guessable ones such as `/test`, `/webhook` or `/api`. This only lowers the chance of being found by scanners and **does not replace authentication**.
  4. When the caller is a third-party service that signs its requests (for example a signature header), check the signature in the flow, or use that service's native Trigger node instead.
- **Why**: with no authentication, anyone who knows the URL can start the workflow, and workflows often go on to write to databases, send mail or call paid APIs.
- **Risk**: strangers or bots trigger it, causing junk data, cost, or unauthorized actions.
- **If the user does not adopt it**: for example an internal health check whose source is already restricted by a firewall or reverse proxy. The AI builds it as the user decides and reminds them that the entry point currently relies on network-layer protection.
- **Scan rule**: `webhook:no-auth` (recommendation reminder; fires when `authentication` is empty or `none`).

### 2.3 `form:no-auth`: set authentication on public forms

- **Situation**: the workflow contains a Form Trigger (`n8n-nodes-base.formTrigger`) and the form URL will be given to people who are not n8n users.
- **Recommended practice**:
  1. For a form used externally, enable the authentication option the Form Trigger offers (for example Basic Auth; the exact options depend on the n8n version), or put the form behind a reverse proxy that requires login.
  2. Purely internal use (internal network only, team members only) can go without; a sentence in the node's notes saying "internal use only" and how the source is restricted is recommended.
  3. Treat submitted content as untrusted input. If it flows into a database, a file or an AI model, apply `ai:agent-code-tool` and ordinary input checks.
- **Why**: an open form is an open entry point for pushing data into the workflow, commonly used for junk data, probing internal fields or triggering paid actions.
- **Risk**: junk data, runaway cost, internal fields being probed.
- **If the user does not adopt it**: follow the user's decision and note in the annotations (the "Recommendations" block and that node's notes) that the form currently has no authentication.
- **Scan rule**: `form:no-auth` (recommendation reminder; fires when the Form Trigger's `authentication` is empty or `none`).

### 2.4 `tls:allow-unauthorized-certs`: keep TLS certificate checks on

- **Situation**: an HTTP Request node has `allowUnauthorizedCerts` (the option labeled "Ignore SSL Issues") set to `true`, any credential or node has an option that disables certificate checks, or a URL uses non-local `http://`.
- **Recommended practice**:
  1. For a self-signed certificate, recommend making the environment running n8n trust that root certificate instead of turning the check off.
  2. Use `https://` for non-local addresses.
  3. Local testing (`localhost`, `127.0.0.1`) may use `http://`; stating it under "Known limitations" in the Layer 3 sticky note is recommended.
- **Why**: with checks off, the connection can be impersonated by a man in the middle and data in transit loses protection. These settings are also easily forgotten in long-running environments.
- **Risk**: traffic is eavesdropped or tampered with; accounts and data leak.
- **If the user does not adopt it**: for example an internal test machine that only has a self-signed certificate and the user chooses to turn the check off. The AI does so, and reminds them to keep it on a trusted network segment and to switch to a trusted certificate later.
- **Scan rule**: `tls:allow-unauthorized-certs` (recommendation reminder; fires when `allowUnauthorizedCerts` is true) and `network:http-cleartext` (recommendation reminder).

### 2.5 `exec:execute-command`, `exec:ssh`: prefer not to use

- **Situation**: the design would use an Execute Command node (`n8n-nodes-base.executeCommand`) or an SSH node (`n8n-nodes-base.ssh`), including their tool variants.
- **Recommended practice**:
  1. By default look for alternatives first: native nodes, HTTP Request, sub-workflows, an API the user already has.
  2. If the user genuinely needs one, the AI builds it and recommends a sentence of reasoning in the node's notes (why there is no alternative, who controls the command content).
  3. Avoid splicing external input (URLs, user text, AI output) into a command; if a variable has to be substituted, check its format against an allowlist and quote it.
  4. SSH uses the credential mechanism; keep the target host and account privileges as small as possible.
- **Why**: these nodes run arbitrary commands on the n8n host or a remote host. If input is tainted, that amounts to remote code execution.
- **Risk**: host takeover, data leakage, lateral movement.
- **If the user does not adopt it**: build it as the user decides, and remind them where the command content comes from and what privileges the host account has.
- **Scan rule**: `exec:execute-command`, `exec:ssh` (both recommendation reminders; they detect the nodes themselves, and tool variants and equivalent approaches are left to human checks).

### 2.6 `file:rw-access`: prefer not to use local file nodes

- **Situation**: any node that reads or writes the n8n host's file system, for example Read/Write Files from Disk (`n8n-nodes-base.readWriteFile`) and the older Read/Write Binary File nodes.
- **Recommended practice**:
  1. By default consider data tables, object storage, cloud drive nodes, or n8n's internal binary data first.
  2. If the user genuinely needs file access, recommend confining paths to a dedicated directory, not building paths from external input (to avoid path traversal), and writing a sentence of reasoning in the notes.
  3. Avoid reading n8n configuration files, credential files, user home directories and system directories.
- **Why**: file nodes can reach any file on the n8n host, including configuration and secrets. If the path comes from external input, files that should be left alone can be read or overwritten.
- **Risk**: secret files leak; system files get overwritten.
- **If the user does not adopt it**: build it as the user decides, and remind them of the directory scope and file permissions.
- **Scan rule**: `file:rw-access` (recommendation reminder; detects file-access nodes and does not judge whether the path is safe).

### 2.7 `header:hardcoded-authorization`: use credentials for the Authorization header

- **Situation**: an HTTP Request node (or any custom header) carries an authentication header such as `Authorization` or `X-API-Key` whose value is literal text.
- **Recommended practice**:
  1. Use the node's authentication option with a credential (Bearer Auth, Header Auth, Basic Auth, OAuth2, and so on).
  2. When several headers, or headers plus query parameters, are needed, use a custom auth credential type.
  3. Avoid passing the secret through a Set node, `$vars` or an environment variable and then filling it into the header.
- **Why**: a header value in node parameters is a secret in the workflow JSON. Passing it through another node does not change the fact that it is stored in plaintext.
- **Risk**: same as `secret:hardcoded`.
- **If the user does not adopt it**: same as `secret:hardcoded`: explain the risk and show the credential approach; if the user still chooses to write it in, do so and remind them to rotate the key. A fixed header whose value carries no credential is not flagged by the scanner in the first place.
- **Scan rule**: `header:hardcoded-authorization` (recommendation reminder; detects literal values starting with `Bearer`, `Basic` or `Token` in HTTP Request nodes; expressions and obvious placeholders do not count).

### 2.8 `approval:destructive-needs-gate`: a human approval step before destructive or money-moving actions

- **Situation**: the workflow deletes or overwrites data, runs bulk updates, sends mass external messages, transfers money, refunds, charges, places orders, or changes authorizations or permissions.
- **Recommended practice**:
  1. Put a human approval step before the action: a Wait node that resumes on a webhook, with the approver choosing approve or reject from a notification, and a timeout that goes to the reject branch. See the pattern in [`../examples/templates/human-approval-gate.workflow.json`](../examples/templates/human-approval-gate.workflow.json).
  2. Record both approvals and rejections (who, when, decision).
  3. If the action runs as an AI Agent tool, recommend wrapping that tool in an n8n Human Review tool node, so the tool runs only after approval.
  4. Preferably the approver is not the person who initiated the action.
- **Why**: a wrong destructive action usually cannot be undone, and automation and AI amplify small mistakes. A person's confirmation is the last dependable brake.
- **Risk**: wrongful deletes, payments or messages that cannot be reversed.
- **If the user does not adopt it**: for example the user explains the downstream system has its own approval or rollback, or wants fully automatic execution. The AI follows that, and notes in the annotations that this action does not pass through human confirmation.
- **Scan rule**: no scan rule yet; relies on AI and human checks.

### 2.9 `error:no-handling`: add error handling to external calls

- **Situation**: any node that calls an external system (HTTP Request, databases, cloud services, messaging, AI models, and so on).
- **Recommended practice**:
  1. Do at least one of: set the node's `onError` behavior (for example route errors to an error output branch), or set an Error Workflow for the whole workflow (a flow that starts with an Error Trigger node) to send notifications.
  2. When retrying, use backoff: wait longer each time and cap the number of attempts. The node's built-in retry waits a fixed interval, so for increasing waits see the pattern in [`../examples/templates/retry-with-backoff.workflow.json`](../examples/templates/retry-with-backoff.workflow.json).
  3. Avoid silent failures: do not set it to continue on failure while recording nothing. An error should at least notify the responsible person or leave a record.
  4. Keep secrets and personal data out of error messages and notifications.
- **Why**: a silent failure means nobody knows something went wrong: data goes missing, books stop matching, authorization expires. Retries without backoff can also amplify load while the other side is down.
- **Risk**: problems are noticed late, or automatic retries add load on the other side.
- **If the user does not adopt it**: for example a one-off manual tool where the user sees the failure immediately. The AI follows that.
- **Scan rule**: `error:no-handling` (recommendation reminder, workflow level). Detection is coarse: it fires only when there are external-call nodes but no `onError` setting, `retryOnFail`, Error Trigger or Error Workflow anywhere. Finding any one of them silences it, so it does not mean every external call is handled, and it cannot tell whether retries use backoff.

### 2.10 `ai:agent-no-guardrails`: pass an externally facing AI Agent's input and output through native Guardrails

- **Situation**: the workflow contains an AI Agent whose input comes from external users or external content (a chat widget, a public form, an externally exposed webhook, email, or fetched web pages and documents).
- **Recommended practice**:
  1. **Input side**: before external text reaches the Agent, run it through the native n8n Guardrails node (`@n8n/n8n-nodes-langchain.guardrails`). Checks worth considering: prompt injection and jailbreak, personal data, secret keys, inappropriate content, and malicious URLs. Which checks exist and how they are wired depends on the n8n version and what the node actually offers.
  2. **Output side**: before the Agent's response goes to the user or into a downstream system, run it through Guardrails again (at least secret keys and personal data).
  3. When a check fails, recommend an explicit branch: refuse, hand off to a person, or return a fixed message, rather than letting the content continue downstream.
  4. Prefer the native n8n node over a hand-written Code node that blocks with regular expressions. The reasoning matches [`native-first.en.md`](native-first.en.md): the next person can read a native node and it is maintained upstream, while a homemade regex is easy to bypass and easy to let go stale.
  5. Some checks need a chat model attached, which adds cost and latency; the AI says so in the "Recommendations" note.
  6. Guardrails are one layer, not the whole defense. Pair them with the least privilege and human approval from `ai:agent-code-tool`.
- **Why**: an externally facing Agent reads text from strangers, and prompt injection, jailbreaks and data leakage all enter through that door. Among the public templates this Pack collected, only 19 of the 4,336 that contain an AI Agent use the native Guardrails node (about 0.4%), so if the AI does not raise it, users will usually not know the option exists.
- **Risk**: the Agent is talked into leaking data, taking actions it should not, or producing inappropriate output.
- **If the user does not adopt it**: for example the Agent handles only data produced inside the workflow that the user trusts, or is for internal use only. The AI follows that, and reminds them that this Agent's input and output are currently unchecked.
- **Scan rule**: `ai:agent-no-guardrails` (recommendation reminder, workflow level). Detection: it fires when there is an AI Agent and an externally facing trigger but no Guardrails node anywhere in the workflow. It does not look at whether Guardrails sits before or after the Agent or whether the checks are sufficient; those are left to human checks.

### 2.11 `ai:agent-code-tool`: least privilege for Agent tools

- **Situation**: the workflow contains an AI Agent with tools attached (`ai_tool` connections).
- **Recommended practice**:
  1. By default, do not attach tools that can run arbitrary code: the Code Tool (`@n8n/n8n-nodes-langchain.toolCode`), tool variants of Execute Command and SSH, or anything equivalent.
  2. Keep tool permissions as small as possible. Expose only the tools the task needs. Database tools use a read-only account on specific tables; HTTP tools are limited to specific domains and methods.
  3. For tool actions with side effects (write, delete, send mail, pay, change permissions), recommend human approval: wrap them in a Human Review tool node so they run only after approval (see `approval:destructive-needs-gate`).
  4. Treat all external text as **untrusted input** to guard against indirect prompt injection. Web pages, email, documents, search results and tool output can carry instructions like "ignore your previous instructions". Keep such content in the data area, not the system prompt; do not let it directly decide parameters of tools with side effects; and try not to give one Agent both "read private data" and "send data out" unless a human approval sits between them.
  5. Limit iterations and cost. Set a maximum iteration count on the AI Agent node, and set a budget or usage cap when model call volume can be large. For n8n Agents, see the budget settings in the vendored `n8n-agents-official` Skill; that Skill advises leaving the maximum iteration setting unset unless the user asks, so on that surface the user's decision applies.
  6. When custom logic is needed, prefer wrapping it as a sub-workflow tool and checking inputs inside the sub-workflow, rather than handing the Agent a way to run arbitrary code.
- **Why**: an Agent's behavior is decided by a model reading text, and text can be poisoned from outside. Tool permissions are the scope of damage when something goes wrong; the fewer you grant, the less a hijacked Agent can do.
- **Risk**: a hijacked Agent runs arbitrary code, leaks data, or runs up large costs.
- **If the user does not adopt it**: for example the user explicitly wants a tool that can run code. The AI builds it, and reminds the user where the code comes from, what the Agent can pass in, and that pairing it with human approval is recommended.
- **Scan rule**: `ai:agent-code-tool` (recommendation reminder). It only detects "the workflow has an AI Agent and contains a Code Tool". Whether tool permissions are minimal, whether side-effect tools have approval, and iteration and cost limits are beyond the scanner and are left to human checks.

### 2.12 `data:pii-minimization`: minimize personal data

- **Situation**: the workflow handles names, phone numbers, email addresses, home addresses, ID numbers, accounts, health or financial data, or it logs data, writes to `pinData`, or writes to a sticky note.
- **Recommended practice**:
  1. Take only the fields the task needs. Drop unused fields early, for example with an Edit Fields node.
  2. Avoid putting real data in `pinData` or explanatory sticky notes; demo data should be obviously fake.
  3. Logs, error notifications and audit records should not contain secrets or personal data; where needed, record an identifier or a masked value only.
  4. Before sending data to an external AI model, assess whether it is necessary, and de-identify it when possible.
  5. State the retention period and deletion method under "Known limitations" or the assumptions of the Layer 3 sticky note.
- **Why**: the more places data lives, the more places it can leak. `pinData` and sticky notes are exported and shared along with the workflow, and are often overlooked.
- **Risk**: personal data leaks, or compliance burden grows because it is kept too long.
- **If the user does not adopt it**: for example the user wants to keep full fields, or to put their own real data in `pinData`. The AI follows that, and reminds them to clear it before exporting or sharing.
- **Scan rule**: no scan rule yet; relies on AI and human checks (secret-shaped content in `pinData` is covered by `secret:*`).

### 2.13 `egress:external-domain`: external domain reminder (reminder only)

- **Situation**: the URL parameters (`url`, `endpoint`, `baseUrl`, `nextURL`, including those in nested options) of HTTP Request nodes (tool and legacy versions too), the LangChain HTTP Request tool and GraphQL nodes point at a non-internal domain. Literal URLs inside expressions (for example `={{ 'https://api.example.invalid/x' }}`, or a fallback URL in an expression) are read as well.
- **Recommended practice**:
  1. The approver checks whether these domains are on the organization's egress allow-list; for any that are not, first confirm the purpose and the data being sent.
  2. When an allow-list exists, hand it to the scanner: `--egress-allow <comma-separated domains>`, `--egress-allow-file <file>` (one per line or comma-separated; `#` starts a comment), or the environment variable `SKILLPACK_EGRESS_ALLOW`; the flags win over the variable. The CI script `scripts/ci/check-workflows.mjs` accepts the first two flags too and passes the variable on to the scanner. Domains on the list are no longer reminded; **with no list the domains are only listed, with no judgement**.
  3. Matching: case-insensitive; `api.example.invalid` matches only that domain; `*.example.invalid` matches its sub-domains at any depth and **not** `example.invalid` itself; ports, paths and query strings are not part of the match.
  4. When the URL is built by an expression and the scanner cannot tell the destination (for example `={{ $json.target }}`, `=https://{{ $json.host }}/v1`), it says "cannot be judged statically" and **never** reports it as some fixed domain; check by hand where it really connects. A fixed domain with only the path in an expression (`=https://api.example.invalid/items/{{ $json.id }}`) counts as a fixed domain.
  5. Write the domain as a fixed URL where you can, so the approver can see it.
- **Not counted as egress**: `localhost` and loopback addresses, private ranges (RFC 1918), link-local, CGNAT shared addresses, IPv6 `::1`, `fc00::/7` and `fe80::/10`, names ending in `.local`, `.internal`, `.lan`, `.intranet`, `.corp`, `.home.arpa`, `.svc` or `.cluster.local`, single-label names with no dot (for example Docker Compose service names), and n8n's own address (`$execution.resumeUrl`, `$execution.resumeFormUrl`, `$env.WEBHOOK_URL`, `$env.N8N_EDITOR_BASE_URL`). Public IP addresses are listed.
- **Why**: egress is how data leaves the organization; with the domains pulled out of node parameters, the approver sees them in one place without reading every node.
- **Risk**: data goes to a domain nobody approved.
- **If the user does not adopt it**: follow the user's decision; for a node the user knows about, write `guardrail-ack: egress:external-domain -- note` in that node's notes and the scanner prints `ACK`.
- **Scan rule**: `egress:external-domain` (reminder, node level). It reads only the URL parameters above; URLs inside request bodies, inside Code node source, inside credentials, or in calls made by sub-workflows are not seen, so no reminder does not mean no egress. The output carries the domain only, never the path or query string, and host names with odd characters are not echoed.

### 2.14 `impact:high-impact-node`: high-impact action reminder (reminder only)

- **Situation** (each node is reminded at most once, and the text says which kind it is):
  1. **Sending mail**: Email Send (SMTP) and Mailgun always count; Gmail, Microsoft Outlook, SendGrid, Mailjet, Mandrill and Brevo (`sendInBlue`) count when `operation` starts with `send`, `reply` or `forward` (including `sendAndWait`).
  2. **Writing or deleting database data**: Postgres, MySQL, MongoDB, Redis, Microsoft SQL, Oracle Database, Snowflake, CrateDB, QuestDB, TimescaleDB, Supabase, Elasticsearch, NocoDB, Baserow and DynamoDB (and the `...Tool` versions where they exist) count when `operation` is not a read: `executeQuery` (arbitrary SQL, whatever the statement), `insert`, `update`, `upsert`, `delete...`, `create`, `set`, `push`, `pop`, `publish` and the like. Reads such as `select`, `find`, `get`, `getAll` do not count.
  3. **HTTP write methods**: HTTP Request (tool and legacy `requestMethod` too) and the LangChain HTTP Request tool with `method` POST, PUT, PATCH or DELETE. They count **whether the destination is internal or external** (a POST to an internal service can change data as well).
  4. **Running system commands**: Execute Command and SSH.
  5. When `operation` or `method` is an expression and cannot be judged statically, the node is reminded too, with "cannot be judged statically".
- **Not listed**: nodes with no `operation` or `method` written (exports do not record defaults, so the scanner cannot see the action); the Human Review tool versions (`...HitlTool`, which already include human approval); GraphQL nodes (no method field to judge); write actions of cloud-service nodes such as Slack or Google Sheets; vector store and memory nodes. These rely on human checks and `approval:destructive-needs-gate`.
- **Recommended practice**: the approver confirms these nodes specially on the ticket: is the target right, is the data source trustworthy, is a human approval step needed first (see `approval:destructive-needs-gate`).
- **Why**: these actions are usually hard to undo (sent mail, rewritten data, requests already made); marking them in one place saves the approver from hunting node by node.
- **If the user does not adopt it**: follow the user's decision; for a node the user knows about, write `guardrail-ack: impact:high-impact-node -- note` in that node's notes.
- **Where the node classification comes from**: node names were looked up in the node catalogs under `docs/node-versions/` (all three of 2.37.3, 2.44.6 and 2.46.6 contain them); `n8n-nodes-base.executeCommand` is not in the default catalogs (a default instance does not offer it), so the name already used by the `exec:execute-command` rule is kept. The catalogs hold no "operation value" data, so operation values come from the vendored official Skill text (`skills/_vendor/n8n-node-configuration-official/references/DATABASE_NODES.md` and others) plus general verb matching; operation names that are not recognized are **not listed**, so this rule prefers missing a case to covering everything.
- **Scan rule**: `impact:high-impact-node` (reminder, node level).

### 2.15 `notes:missing-change-log`: the change log on the Layer 3 note (reminder only)

- **Situation**: the workflow has a Layer 3 sticky note (a note with `color` 5), but the note has no "Change log" section, or has the heading and no row of data.
- **Recommended practice**: follow [`sticky-note-three-layer.en.md`](sticky-note-three-layer.en.md) §4.4 and add a "Change log" section to the Layer 3 note: each row has a date (YYYY-MM-DD), a change summary, who proposed it (user or AI) and the reason; the first row of a new workflow is "Created"; changing an existing workflow adds one row; no secrets.
- **How it is recognized**: a heading of "修改記錄" (or "修改紀錄"), `Change log` or `Changelog`, with at least one row (a table row or a list item) under it containing a date in `YYYY-MM-DD` form. With several Layer 3 notes, any one that qualifies is enough.
- **When there is no Layer 3 note at all**: this rule **does not repeat the reminder**; the existing sticky-note reminders stand (the Skill flow requires a Layer 3 note on every workflow).
- **What the scanner cannot see**: whether what the log says matches the real change needs a comparison with the previous version, which the Pack cannot do; the pipeline compares at pull-request level later, outside this rule.
- **Why**: after export a workflow is separated from Git, and people in production see only the workflow itself; a history on the note saves the approver and later maintainers from looking elsewhere.
- **If the user does not adopt it**: follow the user's decision; write `guardrail-ack: notes:missing-change-log -- note` in the notes of any node (the trigger node is recommended).
- **Scan rule**: `notes:missing-change-log` (reminder, workflow level).

---

## 3. User acknowledgement

### 3.1 What it is for

After the user chooses not to adopt a recommendation, the AI may suggest leaving a one-line acknowledgement in that node's `notes`, so that someone scanning or taking over later can see "the user knew and chose this", and so the scan need not repeat the same reminder. **This line is optional.** If the user prefers not to write it, it is not written, delivery is unaffected, and the AI still discloses the item at the close.

### 3.2 Format

```text
guardrail-ack: <rule ID> -- <the user's explanation, may be omitted>
```

For example:

```text
guardrail-ack: webhook:no-auth -- internal health check only, source restricted by the firewall
```

An explanation is not required:

```text
guardrail-ack: webhook:no-auth
```

- The explanation has no length requirement and need not be written; when present, it helps whoever takes over later.
- One line per rule ID; to record several, write several lines.
- It is meaningful only for that node and that rule; it does not quietly cover other nodes or other rules.
- For rules that concern the whole workflow (for example `error:no-handling`, `ai:agent-no-guardrails`, `data:pii-minimization`), putting the line in the trigger node's (first node's) notes is recommended.
- Avoid putting secrets, internal addresses or personal data in the line.

> **Relation to the scanner** (matches what `scripts/security-scan.mjs` does today):
>
> - **It prints an ACK line**: a line in a node's notes of the form `guardrail-ack: <rule ID>` (leading whitespace allowed, optionally followed by ` -- note`; the note may be omitted and has no minimum length) is read by the scanner. The matching reminder is printed as an `ACK` line (rule ID, node name and note) instead, **does not count toward the reminders**, and the summary line reports the number acknowledged.
> - **It works only for guardrail-rule recommendation reminders**: node-level rules (for example `webhook:no-auth`, `form:no-auth`, `exec:*`, `file:rw-access`, `egress:external-domain`, `impact:high-impact-node`) must be written in **that node's** notes; workflow-level rules (`error:no-handling`, `ai:agent-no-guardrails`, `notes:missing-change-log`) can go in any node's notes, with the trigger node recommended. The reminder rules (severity `info`) can be acknowledged with `guardrail-ack:` too.
> - **It has no effect on detection-rule errors**: `secret:*`, `jscode:*`, `credential:plaintext` and similar detection rules are not recommendations, and `guardrail-ack:` does not make them go away; the scanner prints a `NOTE` line saying the acknowledgement was ignored. A mistyped rule ID, or one with no matching reminder, also produces a `NOTE` line.
> - **`--strict` is an optional flag**: with it, un-acknowledged recommendation reminders (`warning`) also make the exit code 1; the reminder rules (`info`) are **not counted** and never make it 1. The Pack's Skill flow **does not use it and does not ask for it**; it is for a user or CI that wants stricter behavior.
> - For items with no scanner rule (for example `approval:destructive-needs-gate`, `data:pii-minimization`), the line is a record only and the scanner does nothing with it.
> - The scanner reads only `guardrail-ack:` today, not the earlier `guardrail-waiver:` form.

### 3.3 Writing it in node notes

Node notes are a JSON string, so separate the acknowledgement line from other text with `\n`; do not put a literal newline character in it:

```json
{
  "name": "Health check",
  "type": "n8n-nodes-base.webhook",
  "notes": "Internal health check entry point.\nguardrail-ack: webhook:no-auth -- internal health check only, source restricted by the firewall"
}
```

General node-notes style still follows Section 7 of [`references-disclosure.en.md`](references-disclosure.en.md): short, explain "why".

### 3.4 Acknowledged is not fixed

An item the user chose not to adopt is still a risk. It should be visible in these places:

- the node's notes (the recommendation line, and the acknowledgement line if the user agrees to leave one);
- the "Recommendations" block of the Layer 3 note, with status "User chose not to adopt" (Section 5);
- the `ACK` line in the scan output (when the user left an acknowledgement line).

If the "Recommendations" block and the scan output do not match (for example the scan shows a reminder but the block does not list it), the record is incomplete and the AI fills the gap.

---

## 4. Scan: information and recommendations

### 4.1 How to scan

Before delivery, run this on the **exact workflow JSON being delivered** (from the Pack root):

```bash
node scripts/security-scan.mjs <workflow.json>
```

The default mode is the advisory mode. The scanner also has an optional `--strict` flag (it counts un-acknowledged recommendation reminders toward the exit code). **The Pack's Skill flow does not use it and does not ask for it**; it is for a user or CI that wants stricter behavior.

### 4.2 How to read the result

- Scan output is **information and recommendations**. The AI reports the results to the user as they are, explains what risk each item represents, and suggests how to handle it; **the user decides whether to act**.
- Scan output has three levels: `ERROR` (detection rules), `WARNING` (guardrail recommendations) and `INFO` (reminder rules: `egress:external-domain`, `impact:high-impact-node`, `notes:missing-change-log`). Write `INFO` lines into the "Security scan result" block as they are (status "reminder"); the external domains and high-impact actions are there precisely so the approver sees them.
- Findings do not cause delivery to be refused. Exit code 1 only means there are detection-rule reminders (for example a suspected secret pattern); it does not mean delivery cannot proceed.
- Where the user decides to act, rescan the final JSON after the change; the last result is the one that counts. Where the user decides not to act, record it honestly in the "Recommendations" block of the Layer 3 note (Section 5).
- After any further change to the JSON (including writing the recommendations into a sticky note or adding acknowledgement lines), rescan the final file.
- For items with no scanner rule, "the scan found nothing" does not mean they were done; they go under "cannot be checked automatically yet" in the "Recommendations" block.
- If there is no Node.js environment, the script is missing, or the exit code is 2 (no file scanned), treat the scan as **not run**: say "security scan not run" with the reason, and do not imply it passed.

---

## 5. Closing record: see the unified definition

This spec **does not define its own closing format** for security recommendations. The order, location, statuses and note format all follow the unified definition in Chapter 4 of [`references-disclosure.en.md`](references-disclosure.en.md):

- The three blocks always come in the order "References -> Recommendations -> Security scan result".
- The 13 security recommendations use the rule IDs from Chapter 2 of this spec and are written in the "Recommendations" block of the Layer 3 note, one line each, with a status (Adopted / User chose not to adopt / Not applicable / Cannot be checked automatically yet). "User chose not to adopt" needs no reason from the user.
- A recommendation about a specific node (for example a Webhook's authentication or an Agent's Guardrails) is also written as one short line in that node's `notes`; the form is in §4.4 of the same spec.
- How to write the scan result is in Chapter 8 of the same spec; the conversation carries only a 3-5 line summary that points to the annotations, and the annotations are the official record.

### 5.1 Judgment hints specific to this spec

- **When unsure, do not choose "Adopted"**: choose "Cannot be checked automatically yet" and say what is uncertain.
- **No scan hit does not mean it was done**: for items with no scanner rule (`approval:destructive-needs-gate`, `data:pii-minimization`) and items the scanner covers only in part ("coarse", "partial"), use "Cannot be checked automatically yet", or note in the "Adopted" line what a human should confirm.
- **Workflow-level recommendations** (`error:no-handling`, `ai:agent-no-guardrails`, `data:pii-minimization`) live in the Layer 3 note only; if the user wants an acknowledgement line, put it in the trigger node's notes (Chapter 3).
- **For non-technical users** (for example in Q&A mode), the conversation summary may replace a rule ID with a plain description (for example "whether the Webhook has authentication"); the annotations still use the rule IDs.
- Rule IDs, status names and the annotation content are **not listed again in this spec**; for a template see §4.3 of [`references-disclosure.en.md`](references-disclosure.en.md).

---

## 6. Honesty rules

1. **Guardrails do not mean security.** Adopting the recommendations here only deals with known, common risks at design time. It does not promise there are no other risks, and it does not promise every attack is stopped.
2. **A scan only catches patterns.** It cannot see a secret that does not look like a key, authentication that is set up falsely, or an Agent that was talked into doing something it should not.
3. **Avoid claims like "security is ensured".** Do not write "fully secured", "no security risk" or "security sign-off complete". Say what was done, what the scan showed, and what was not checked.
4. **Say plainly what was not checked.** A recommendation with no matching scanner rule is "cannot be checked automatically yet". A scan with no findings does not turn it into "Adopted".
5. **The Guardrails node has misses and false positives too.** It lowers risk and offers no guarantee. State the checks, thresholds and model used in the "Recommendations" block, so the user knows what it handles and what it does not.
6. **List the items the user did not adopt honestly.** Do not bury them in other text or describe them as "handled".
7. **When unsure, say so.** If you are unsure about version differences or option names, write "please confirm against your n8n version" instead of guessing.
8. **The "Recommendations" block matches the actual JSON.** For an item marked "Adopted", the matching setting can be found in the JSON. Cross-check before delivery.
9. **This spec offers recommendations only; the final decision and responsibility rest with the user.** The AI's job is to explain the risk clearly, offer an alternative and record the choice, not to decide for the user.

---

## 7. Positive and negative examples

### Positive 1: an externally facing support Agent, raised and adopted by the AI

The user wants a workflow that receives chat messages and lets an AI answer product questions. While building, the AI applies the recommendations on its own: the Webhook gets Header authentication and a random path; the native Guardrails node goes in front of the Agent to check for prompt injection and personal data, and another goes after it to check for secret keys and personal data; the Agent gets only a read-only product lookup tool and an iteration limit; external calls get an error output and an Error Workflow. The AI explains in a few sentences why each was done that way, and the user has no objection. Before delivery it runs the scan and reports the results to the user. The AI writes the status of each recommendation into the "Recommendations" block of the Layer 3 note, with the Agent-related items marked "Adopted" and a note that the scan covers only part of them, adds a one-line recommendation to the Agent node's notes, puts only a short summary in the conversation, and ends with a reminder that Guardrails can miss things.

**Why this is a positive example**: the recommendations were raised and explained as the workflow was built, every item is accounted for, and the parts the scan does not cover were not dressed up as passed.

### Positive 2: the user chooses no authentication; the AI warns, complies and records it

The user wants a health-check Webhook for an internal monitoring system and says they do not want authentication. The AI first explains the risk of an unauthenticated endpoint and offers an alternative (at least an IP allowlist). The user says the firewall already restricts the source and still chooses to skip it. The AI builds it as the user decided, then asks whether to leave a line `guardrail-ack: webhook:no-auth -- internal health check only, source restricted by the firewall` in the node's notes, and writes it once the user agrees. The scan prints one `ACK` line and the AI passes it on; the "Recommendations" block marks the item "User chose not to adopt" with the same sentence.

**Why this is a positive example**: the risk was explained before the user decided, the user's choice was respected and recorded honestly, and it was not described as fixed.

### Negative 1: the AI refuses outright, or quietly switches off a reminder

The user wants an internal test machine with a self-signed certificate and asks to turn the certificate check off. The AI answers "that is not allowed" and declines to build it. Or the opposite: to keep the output tidy, the AI quietly drops the reminder from the scan output and does not list the item in the annotations.

**What went wrong**: the first turns a recommendation into a block and does not respect the user's decision. The second switches off an important reminder on the user's behalf, so the user carries a risk without knowing. The right approach is to explain the risk, offer an alternative (for example making the environment trust that root certificate), and if the user still wants the check off, do it and mark the item "User chose not to adopt" in the annotations.

### Negative 2: hiding the risk and claiming security

To show the user a result quickly, the AI pastes an API key directly into the Authorization header of an HTTP Request node, tells the user nothing and offers no credential approach. It skips the scan and closes with "security is ensured".

**What went wrong**: the user never had a chance to decide because the risk was never raised; passing is implied without a scan; and the wording breaks the honesty rules. The right approach is to explain it up front, show the credential approach, and let the user choose; if the user already pasted the key in chat, remind them to rotate it.

---

## 8. References

- [`../research/n8n-templates-security.en.md`](../research/n8n-templates-security.en.md): statistics on security-related practices in public n8n.io templates (descriptive, not a vulnerability list).
- [`references-disclosure.en.md`](references-disclosure.en.md): the unified definition of the closing block (Chapter 4) and how to write the scan result (Chapter 8); recommendations go into the annotations, which are the official record.
- [`native-first.en.md`](native-first.en.md): the native-first spec; the basis for using the native Guardrails node.
- [`../skills/tigerai/n8n-security-governance/SKILL.md`](../skills/tigerai/n8n-security-governance/SKILL.md): the n8n security and change-governance Skill; reviewing and generating both use the rule IDs in this file.
- [`../skills/_vendor/n8n-credentials-and-security-official/SKILL.md`](../skills/_vendor/n8n-credentials-and-security-official/SKILL.md): the vendor's approach to credentials and secrets.
- [`../skills/_vendor/n8n-ai-nodes-official/references/HUMAN_REVIEW.md`](../skills/_vendor/n8n-ai-nodes-official/references/HUMAN_REVIEW.md): how to wire human review around Agent tools.
- [`../examples/templates/human-approval-gate.workflow.json`](../examples/templates/human-approval-gate.workflow.json), [`../examples/templates/retry-with-backoff.workflow.json`](../examples/templates/retry-with-backoff.workflow.json): pattern templates for human approval and retry with backoff.
- `scripts/security-scan.mjs`: the rule-based scanner; the flags and rules it actually supports are whatever its output shows.

---

**Version**: v1.1
**Status**: draft spec. The "Scan rule" column in Section 2 and the description of the scanner in Section 3.2 will be updated as `scripts/security-scan.mjs` changes; where they differ from the scanner's actual output, the scanner prevails. Sections 2.13 to 2.15 are reminder rules added after ADR-014 (reminder only, never enforced).

#!/usr/bin/env node
// Deterministic n8n workflow security scanner.
//
// Usage:
//   node scripts/security-scan.mjs <workflow.json> [<workflow.json> ...]
//   node scripts/security-scan.mjs --glob "examples/**/n8n_workflow_export.json"
//   node scripts/security-scan.mjs --glob "examples/**/*.workflow.json" --format markdown
//   node scripts/security-scan.mjs --strict <workflow.json>   (optional; not required by the Pack's skills)
//
// Guardrail rules are recommendations: they never make a default run fail (warnings only).
// Exit code: 0 unless a detection-class "error" (secret:*, jscode:*, credential:plaintext, parse/io failure) is found.
// --strict (optional): warnings count as failures too; acknowledged findings do not.
// Acknowledge: put a line `guardrail-ack: <rule-id>` (optionally ` -- <note>`) in a node's notes.
// It only applies to warning-level guardrail rules; acks on detection rules are ignored.
//
// This is intentionally a rule-based, regex-driven check — NOT an AI auditor.
// It catches the 90% of "AI wrote this and it leaked secrets" failure modes
// that the n8n-security-governance skill describes. Deep review still belongs
// to the Skill + human reviewer.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// ---- Rule definitions ----------------------------------------------------

const SECRET_PATTERNS = [
  { name: 'openai-key',     re: /\bsk-[A-Za-z0-9]{20,}\b/g,                       severity: 'error'   },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g,                          severity: 'error'   },
  { name: 'github-pat',     re: /\bghp_[A-Za-z0-9]{30,}\b/g,                      severity: 'error'   },
  { name: 'slack-token',    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,              severity: 'error'   },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_\-]{30,}\b/g,                   severity: 'error'   },
  { name: 'pem-private',    re: /-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, severity: 'error' },
  { name: 'jwt-literal',    re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, severity: 'error' },
  { name: 'basic-auth-url', re: /\b(?:https?:\/\/)[^\s\/:@"']+:[^\s\/@"']+@/g,    severity: 'error' },
];

const PLAINTEXT_PASSWORD_KEYS = /^(password|passwd|secret|api[_-]?key|apikey|token|access[_-]?token|client[_-]?secret|private[_-]?key)$/i;
const EXPRESSION_RE = /=\{\{[\s\S]*?\}\}/;
const CREDENTIAL_REF_RE = /\$credentials\b|\$node\b/;

// ---- v0.36.0 SEC-017: Code-node malicious jsCode pattern detector ---------
// Treats jsCode in n8n Code (and Function) nodes as code-to-be-executed.
// regex is intentionally aggressive — false positives flagged as warnings,
// clearly-malicious patterns flagged as errors so they fail the gate.
//
// Categories (each with `severity` and explanation):
//  - process-spawn: child_process / spawn / exec — only red-flag for non-Pack contexts
//  - fs-write-sensitive: writeFileSync / appendFileSync targeting / out of /tmp
//  - env-dump: serialising process.env wholesale (single-var read is fine)
//  - net-exfil: fetch / http.request to non-localhost hostnames carrying env or credential
//  - dynamic-eval: eval / Function() / vm.runInNewContext
//  - reverse-shell: net.Socket connect + spawn shell pattern
//  - require-suspect: require('child_process') / require('vm') in workflow code is unusual
const MALICIOUS_JS_PATTERNS = [
  // High-risk — almost certainly malicious in a workflow Code node:
  { name: 'jscode:reverse-shell',
    re: /(?:net\.createConnection|net\.Socket)[\s\S]{0,200}(?:exec|spawn|sh\b|bash\b|cmd\.exe)/i,
    severity: 'error',
    why: 'reverse-shell pattern: opens TCP socket then spawns a shell' },
  { name: 'jscode:env-dump',
    re: /JSON\.stringify\s*\(\s*process\.env\s*\)|Object\.entries\s*\(\s*process\.env\s*\)|Object\.keys\s*\(\s*process\.env\s*\)|process\.env(?!\s*[\.\[])/,
    severity: 'error',
    why: 'wholesale process.env dump — single-var reads OK, but stringifying all of env is exfil-shaped' },
  { name: 'jscode:dynamic-eval',
    re: /\beval\s*\(|new\s+Function\s*\(|vm\.runIn(?:New|This)Context\b/,
    severity: 'error',
    why: 'eval / Function() / vm.runInNewContext — dynamic code execution from a workflow Code node is rarely needed and high-RCE-risk' },
  { name: 'jscode:require-child-process',
    re: /require\s*\(\s*['"`](?:child_process|vm|dgram|cluster|worker_threads)['"`]\s*\)/,
    severity: 'error',
    why: 'requiring child_process / vm / dgram / cluster from a workflow Code node is almost always malicious — n8n provides node-native helpers' },
  { name: 'jscode:fs-write-sensitive',
    re: /\.(?:writeFile|appendFile|writeFileSync|appendFileSync|createWriteStream)\s*\(\s*['"`](?:\/etc\/|\/root\/|\/home\/|\/var\/(?!log\/)|C:\\\\Windows|C:\\\\Users|C:\\\\ProgramData)/i,
    severity: 'error',
    why: 'writing to system / home dirs from workflow code is RCE persistence' },
  // Medium-risk — flag but only fail if explicitly env+net combined:
  { name: 'jscode:net-exfil-pattern',
    re: /(?:fetch|axios|https?\.request|https?\.get)\s*\([^)]{0,500}(?:process\.env|credential|token|password|apiKey|secret)/i,
    severity: 'error',
    why: 'HTTP call carrying env vars / credential-like names — likely data exfiltration' },
  // Low-risk — warnings only:
  { name: 'jscode:process-spawn',
    // bare `x.exec(` is deliberately NOT matched (RegExp.prototype.exec); it only counts via a child_process mention or a known cp-style receiver
    re: /\bchild_process\b|['"`]child['"`]\s*\+\s*['"`]_process|\b(?:cp|childProcess|childproc)\s*\.\s*(?:exec|execFile|fork|spawn)\s*\(|\.(?:spawn|spawnSync|execSync|execFileSync)\s*\(|\bDeno\s*\.\s*(?:run|Command)\s*\(|\bBun\s*\.\s*(?:spawn|spawnSync)\s*\(|\bprocess\s*\.\s*binding\s*\(\s*['"`](?:spawn_sync|process_wrap)['"`]/,
    severity: 'warning',
    why: 'spawning subprocesses from workflow code is unusual; verify intent' },
  { name: 'jscode:base64-decode-suspect',
    re: /Buffer\.from\s*\(\s*['"`][A-Za-z0-9+\/=]{40,}['"`]\s*,\s*['"`]base64['"`]\s*\)/,
    severity: 'warning',
    why: 'large hard-coded base64 blob decoded in code — could be obfuscated payload' },
  { name: 'jscode:require-fs-with-write',
    re: /require\s*\(\s*['"`]fs['"`]\s*\)/,
    severity: 'warning',
    why: 'require("fs") in workflow code — n8n provides built-in file operations; flag for review' },
];

// Node types whose JavaScript we scan through MALICIOUS_JS_PATTERNS.
// Limitation: Python code (Code node pythonCode, toolCode pythonCode) is NOT scanned.
const CODE_NODE_TYPES = new Set([
  'n8n-nodes-base.code',
  'n8n-nodes-base.function',
  'n8n-nodes-base.functionItem',
  '@n8n/n8n-nodes-langchain.toolCode',
  '@n8n/n8n-nodes-langchain.code',
]);

function jsSources(n) {
  const p = n?.parameters ?? {};
  if (n?.type === '@n8n/n8n-nodes-langchain.code') return [p.code?.execute?.code, p.code?.supplyData?.code];
  return [p.jsCode ?? p.functionCode];
}

// ---- Guardrail rules (generation-time guardrails, see spec/security-guardrails.md) ----
const EXTERNAL_TRIGGER_TYPES = new Set([
  '@n8n/n8n-nodes-langchain.chatTrigger',
  '@n8n/n8n-nodes-langchain.mcpTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.telegramTrigger',
  'n8n-nodes-base.whatsAppTrigger',
  'n8n-nodes-base.slackTrigger',
  'n8n-nodes-base.gmailTrigger',
  'n8n-nodes-base.emailReadImap',
  'n8n-nodes-base.microsoftTeamsTrigger',
]);
const AGENT_TYPE = '@n8n/n8n-nodes-langchain.agent';
const GUARDRAIL_TYPES = new Set(['@n8n/n8n-nodes-langchain.guardrails', 'n8n-nodes-piiguardrails.piiGuardrails']);
const FILE_ACCESS_TYPES = new Set([
  'n8n-nodes-base.readWriteFile',
  'n8n-nodes-base.readBinaryFile',
  'n8n-nodes-base.readBinaryFiles',
  'n8n-nodes-base.writeBinaryFile',
  'n8n-nodes-base.localFileTrigger',
]);
const EXTERNAL_CALL_TYPES = new Set([
  'n8n-nodes-base.httpRequest', 'n8n-nodes-base.httpRequestTool', 'n8n-nodes-base.graphql',
  'n8n-nodes-base.slack', 'n8n-nodes-base.telegram', 'n8n-nodes-base.discord', 'n8n-nodes-base.whatsApp',
  'n8n-nodes-base.twilio', 'n8n-nodes-base.microsoftTeams', 'n8n-nodes-base.emailSend',
  'n8n-nodes-base.gmail', 'n8n-nodes-base.microsoftOutlook',
  'n8n-nodes-base.googleSheets', 'n8n-nodes-base.googleDrive', 'n8n-nodes-base.googleCalendar',
  'n8n-nodes-base.notion', 'n8n-nodes-base.airtable', 'n8n-nodes-base.github', 'n8n-nodes-base.gitlab',
  'n8n-nodes-base.jira', 'n8n-nodes-base.hubspot', 'n8n-nodes-base.salesforce', 'n8n-nodes-base.stripe',
  'n8n-nodes-base.openAi', '@n8n/n8n-nodes-langchain.openAi',
]);
const AUTH_VALUE_RE = /^(?:Bearer|Basic|Token)\s+(\S.*)$/i;
const PLACEHOLDER_RE = /^(?:[‹<\[{(].*[›>\]})]|YOUR[_\- ].*|x{3,}|\*{3,}|\.{3}|REPLACE.*|CHANGE.?ME.*|TODO.*|PLACEHOLDER.*)$/i;
const ACK_LINE_RE = /^\s*guardrail-ack:\s*(\S+)(?:\s+--\s*(.*?))?\s*$/;
const ACKABLE_RULES = new Set([
  'form:no-auth', 'tls:allow-unauthorized-certs', 'exec:execute-command', 'exec:ssh', 'file:rw-access',
  'header:hardcoded-authorization', 'ai:agent-code-tool', 'ai:agent-no-guardrails', 'error:no-handling',
  'webhook:no-auth', 'network:http-cleartext',
]);
const NODE = Symbol('node');
const WF_LEVEL = Symbol('workflowLevel');

const isTrue = v => v === true || (typeof v === 'string' && /^true$/i.test(v.trim()));
const mask = v => String(v).slice(0, 4) + '***';

function hardcodedAuthValue(v) {
  if (typeof v !== 'string' || v.startsWith('=') || v.includes('{{')) return false;
  const m = v.trim().match(AUTH_VALUE_RE);
  if (!m) return false;
  const token = m[1].trim();
  return token.length >= 6 && !PLACEHOLDER_RE.test(token);
}

function authHeaderValues(p) {
  const out = [];
  for (const h of [...(p?.headerParameters?.parameters ?? []), ...(p?.headerParametersUi?.parameter ?? [])]) {
    if (typeof h?.name === 'string' && h.name.trim().toLowerCase() === 'authorization') out.push(h.value);
  }
  if (typeof p?.jsonHeaders === 'string') {
    for (const m of p.jsonHeaders.matchAll(/"authorization"\s*:\s*"([^"]*)"/gi)) out.push(m[1]);
  }
  return out;
}

function scanGuardrails(nodes, wf, findings) {
  const add = (rule, severity, n, sample, wfLevel = false) => {
    const f = { rule, severity, where: wfLevel ? 'workflow' : `node:${n?.name ?? '(unnamed)'}`, sample };
    f[NODE] = n?.name;
    if (wfLevel) f[WF_LEVEL] = true;
    findings.push(f);
  };
  const types = new Set(nodes.map(n => n?.type));
  for (const n of nodes) {
    const t = n?.type ?? '';
    const p = n?.parameters ?? {};
    if (t === 'n8n-nodes-base.formTrigger') {
      const auth = p.authentication;
      if (!auth || auth === 'none') add('form:no-auth', 'warning', n, 'form trigger without authentication');
    }
    if (isTrue(p.options?.allowUnauthorizedCerts) || isTrue(p.allowUnauthorizedCerts)) {
      add('tls:allow-unauthorized-certs', 'warning', n, 'recommend: keep TLS certificate validation on (allowUnauthorizedCerts is set)');
    }
    if (t === 'n8n-nodes-base.executeCommand') add('exec:execute-command', 'warning', n, 'Execute Command node runs shell commands on the n8n host');
    if (t === 'n8n-nodes-base.ssh') add('exec:ssh', 'warning', n, 'SSH node runs remote commands');
    if (FILE_ACCESS_TYPES.has(t)) add('file:rw-access', 'warning', n, `${t.split('.').pop()} accesses the local file system`);
    if (t === 'n8n-nodes-base.httpRequest' || t === 'n8n-nodes-base.httpRequestTool') {
      for (const v of authHeaderValues(p)) {
        if (hardcodedAuthValue(v)) add('header:hardcoded-authorization', 'warning', n, `recommend: use a credential instead of a literal Authorization header (${mask(v)})`);
      }
    }
    if (t === '@n8n/n8n-nodes-langchain.toolCode' && types.has(AGENT_TYPE)) {
      add('ai:agent-code-tool', 'warning', n, 'agent can invoke a Code tool (model-driven code execution)');
    }
  }

  const hasTrigger = nodes.some(n => EXTERNAL_TRIGGER_TYPES.has(n?.type));
  if (types.has(AGENT_TYPE) && hasTrigger && !nodes.some(n => GUARDRAIL_TYPES.has(n?.type))) {
    add('ai:agent-no-guardrails', 'warning', null, 'AI agent reachable from an external trigger but no guardrails node in workflow', true);
  }

  const calls = nodes.filter(n => EXTERNAL_CALL_TYPES.has(n?.type));
  const handled = wf?.settings?.errorWorkflow || types.has('n8n-nodes-base.errorTrigger') ||
    nodes.some(n => n?.onError === 'continueRegularOutput' || n?.onError === 'continueErrorOutput' || isTrue(n?.retryOnFail));
  if (calls.length > 0 && !handled) {
    add('error:no-handling', 'warning', null, `${calls.length} external-call node(s) but no onError/retryOnFail, errorTrigger or settings.errorWorkflow`, true);
  }
}

function scanPinData(pin, findings) {
  const walk = (val, path) => {
    if (typeof val === 'string') {
      for (const { name, re, severity } of SECRET_PATTERNS) {
        const m = val.match(re);
        if (m) findings.push({ rule: `secret:${name}`, severity, where: path, sample: mask(m[0]) });
      }
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) walk(v, `${path}.${k}`);
    }
  };
  if (pin && typeof pin === 'object') walk(pin, 'pinData');
}

// Split findings into kept / acknowledged. Only warning-level guardrail rules can be acknowledged.
function applyAcks(nodes, findings) {
  const acks = [];
  for (const n of nodes) {
    if (typeof n?.notes !== 'string') continue;
    for (const line of n.notes.split(/\r?\n/)) {
      const m = line.match(ACK_LINE_RE);
      if (m) acks.push({ node: n.name ?? '(unnamed)', rule: m[1], note: (m[2] ?? '').slice(0, 120) });
    }
  }
  const inScope = (a, f) => a.rule === f.rule && (f[WF_LEVEL] || a.node === f[NODE]);
  const kept = [], acknowledged = [], notices = [];
  for (const f of findings) {
    const ok = ACKABLE_RULES.has(f.rule) && f.severity === 'warning' ? acks.find(a => inScope(a, f)) : null;
    if (ok) acknowledged.push({ rule: f.rule, where: `node:${ok.node}`, note: ok.note });
    else kept.push(f);
  }
  for (const a of acks) {
    const ackable = ACKABLE_RULES.has(a.rule);
    const detectionHit = !ackable && findings.some(f => f.rule === a.rule);
    const used = ackable && findings.some(f => inScope(a, f));
    if (used) continue;
    notices.push({
      rule: a.rule, where: `node:${a.node}`,
      text: detectionHit ? 'ack ignored: detection rule, not a recommendation' : 'ack ignored: rule id mismatch or no such finding',
    });
  }
  return { kept, acknowledged, notices };
}

function scanJsCode(jsCode, findings, nodeWhere) {
  if (typeof jsCode !== 'string' || jsCode.length === 0) return;
  for (const { name, re, severity, why } of MALICIOUS_JS_PATTERNS) {
    const m = jsCode.match(re);
    if (m) {
      const sample = m[0].slice(0, 60) + (m[0].length > 60 ? '…' : '');
      findings.push({ rule: name, severity, where: nodeWhere, sample: `${sample}  — ${why}` });
    }
  }
}

// ---- IO ------------------------------------------------------------------

const args = process.argv.slice(2);
let format = 'text';
let globPattern = null;
let strict = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--format') { format = args[++i]; continue; }
  if (a === '--glob')   { globPattern = args[++i]; continue; }
  if (a === '--strict') { strict = true; continue; }
  if (a === '--help' || a === '-h') {
    console.log(`Usage: node scripts/security-scan.mjs [--glob <pattern>] [--format text|markdown|json] [--strict] [file ...]`);
    process.exit(0);
  }
  files.push(a);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function matchGlob(pattern) {
  // Minimal glob: support "**" and "*" segments, plus literal segments.
  // Anchored at repo root.
  const root = process.cwd();
  const re = new RegExp(
    '^' +
    pattern
      .replace(/[.+^$()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.+')
      .replace(/\*/g, '[^/\\\\]*')
      .replace(/\?/g, '.') +
    '$'
  );
  const matches = [];
  for (const f of walk(root)) {
    const rel = relative(root, f).replace(/\\/g, '/');
    if (re.test(rel)) matches.push(f);
  }
  return matches;
}

const targets = globPattern ? matchGlob(globPattern) : files.map(f => resolve(f));
if (targets.length === 0) {
  console.error('No workflow files matched.');
  process.exit(2);
}

// ---- Scan ----------------------------------------------------------------

function scanNodeParameters(node, findings, path) {
  if (!node || typeof node !== 'object') return;
  for (const [key, val] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;
    if (val == null) continue;
    if (typeof val === 'string') {
      // Secret patterns
      for (const { name, re, severity } of SECRET_PATTERNS) {
        const m = val.match(re);
        if (m) {
          findings.push({ rule: `secret:${name}`, severity, where: here, sample: mask(m[0]) });
        }
      }
      // Plaintext-looking password under a sensitive key, where the value
      // is NOT a credential reference / expression — that's a literal.
      if (PLAINTEXT_PASSWORD_KEYS.test(key) &&
          val.length >= 4 &&
          !EXPRESSION_RE.test('=' + val) &&
          !CREDENTIAL_REF_RE.test(val) &&
          val !== '={{ $credentials.password }}' &&
          !/^\$\{/.test(val)) {
        findings.push({ rule: 'credential:plaintext', severity: 'error', where: here, sample: '<redacted>' });
      }
      // HTTP (not HTTPS) URLs in non-localhost positions
      if (/^http:\/\//i.test(val) && !/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)/i.test(val)) {
        findings.push({ rule: 'network:http-cleartext', severity: 'warning', where: here, sample: val.slice(0, 60) });
      }
    } else if (typeof val === 'object') {
      scanNodeParameters(val, findings, here);
    }
  }
}

function scanWorkflow(filePath) {
  const findings = [];
  let raw;
  try { raw = readFileSync(filePath, 'utf8'); }
  catch (e) { return { findings: [{ rule: 'io:read-failed', severity: 'error', where: filePath, sample: e.message }], acknowledged: [], notices: [] }; }
  let wf;
  try { wf = JSON.parse(raw); }
  catch (e) { return { findings: [{ rule: 'json:parse-failed', severity: 'error', where: filePath, sample: e.message.slice(0, 80) }], acknowledged: [], notices: [] }; }

  const nodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
  if (nodes.length === 0) {
    findings.push({ rule: 'schema:empty-nodes', severity: 'warning', where: 'nodes', sample: '0 nodes' });
  }

  // Webhook nodes without authentication
  for (const n of nodes) {
    const t = n?.type ?? '';
    if (t === 'n8n-nodes-base.webhook') {
      const auth = n?.parameters?.authentication ?? n?.parameters?.options?.authentication;
      if (!auth || auth === 'none') {
        findings.push({
          rule: 'webhook:no-auth',
          severity: 'warning',
          where: `node:${n.name ?? '(unnamed)'}`,
          sample: `webhook without authentication`,
          [NODE]: n.name,
        });
      }
    }
  }

  // Full parameter walk for secret / cleartext rules
  for (const n of nodes) {
    const before = findings.length;
    scanNodeParameters(n?.parameters ?? {}, findings, `node:${n?.name ?? '?'}`);
    for (let i = before; i < findings.length; i++) findings[i][NODE] = n?.name;
  }

  // v0.36.0 SEC-017: scan Code-node jsCode for malicious / suspicious patterns
  for (const n of nodes) {
    if (!CODE_NODE_TYPES.has(n?.type)) continue;
    const before = findings.length;
    for (const jsCode of jsSources(n)) scanJsCode(jsCode, findings, `node:${n?.name ?? '?'}`);
    for (let i = before; i < findings.length; i++) findings[i][NODE] = n?.name;
  }

  scanGuardrails(nodes, wf, findings);
  scanPinData(wf?.pinData, findings);

  const { kept, acknowledged, notices } = applyAcks(nodes, findings);
  return { findings: kept, acknowledged, notices };
}

// ---- Report --------------------------------------------------------------

const results = targets.map(t => ({ file: relative(process.cwd(), t).replace(/\\/g,'/'), ...scanWorkflow(t) }));
const totalErrors = results.reduce((n, r) => n + r.findings.filter(f => f.severity === 'error').length, 0);
const totalWarnings = results.reduce((n, r) => n + r.findings.filter(f => f.severity === 'warning').length, 0);
const totalAcked = results.reduce((n, r) => n + r.acknowledged.length, 0);

if (format === 'json') {
  console.log(JSON.stringify({ summary: { files: results.length, errors: totalErrors, warnings: totalWarnings, acknowledged: totalAcked }, results }, null, 2));
} else if (format === 'markdown') {
  console.log(`# Security scan — ${results.length} file(s) · ${totalErrors} error / ${totalWarnings} warning / ${totalAcked} acknowledged\n`);
  for (const r of results) {
    if (r.findings.length === 0) {
      console.log(`- ${r.acknowledged.length ? '🛡️' : '✅'} \`${r.file}\``);
    } else {
      console.log(`- ${r.findings.some(f => f.severity === 'error') ? '❌' : '⚠️'} \`${r.file}\``);
      for (const f of r.findings) {
        console.log(`  - **${f.severity}** \`${f.rule}\` @ ${f.where} — ${f.sample}`);
      }
    }
    for (const a of r.acknowledged) console.log(`  - **acknowledged** \`${a.rule}\` @ ${a.where}${a.note ? ` — ${a.note}` : ''}`);
    for (const t of r.notices) console.log(`  - **note** \`${t.rule}\` @ ${t.where} — ${t.text}`);
  }
} else {
  for (const r of results) {
    if (r.findings.length === 0 && r.acknowledged.length === 0) {
      console.log(`OK  ${r.file}`);
    }
    for (const f of r.findings) {
      console.log(`${f.severity.toUpperCase().padEnd(7)} ${r.file}  [${f.rule}]  ${f.where}  ${f.sample}`);
    }
    for (const a of r.acknowledged) {
      console.log(`${'ACK'.padEnd(7)} ${r.file}  [${a.rule}]  ${a.where}${a.note ? `  note:${a.note}` : ''}`);
    }
    for (const t of r.notices) {
      console.log(`${'NOTE'.padEnd(7)} ${r.file}  [${t.rule}]  ${t.where}  ${t.text}`);
    }
  }
  console.log(`---`);
  console.log(`Summary: ${results.length} file(s) scanned · ${totalErrors} error · ${totalWarnings} warning · ${totalAcked} acknowledged`);
}

process.exit(totalErrors > 0 || (strict && totalWarnings > 0) ? 1 : 0);

#!/usr/bin/env node
// Deterministic n8n workflow security scanner.
//
// Usage:
//   node scripts/security-scan.mjs <workflow.json> [<workflow.json> ...]
//   node scripts/security-scan.mjs --glob "examples/**/n8n_workflow_export.json"
//   node scripts/security-scan.mjs --glob "examples/**/*.workflow.json" --format markdown
//
// Exit code: 0 if no findings at "error" severity, 1 otherwise.
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

// ---- IO ------------------------------------------------------------------

const args = process.argv.slice(2);
let format = 'text';
let globPattern = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--format') { format = args[++i]; continue; }
  if (a === '--glob')   { globPattern = args[++i]; continue; }
  if (a === '--help' || a === '-h') {
    console.log(`Usage: node scripts/security-scan.mjs [--glob <pattern>] [--format text|markdown|json] [file ...]`);
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
          findings.push({ rule: `secret:${name}`, severity, where: here, sample: m[0].slice(0, 40) + (m[0].length > 40 ? '…' : '') });
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
  catch (e) { return [{ rule: 'io:read-failed', severity: 'error', where: filePath, sample: e.message }]; }
  let wf;
  try { wf = JSON.parse(raw); }
  catch (e) { return [{ rule: 'json:parse-failed', severity: 'error', where: filePath, sample: e.message.slice(0, 80) }]; }

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
        });
      }
    }
  }

  // Full parameter walk for secret / cleartext rules
  for (const n of nodes) {
    scanNodeParameters(n?.parameters ?? {}, findings, `node:${n?.name ?? '?'}`);
  }

  return findings;
}

// ---- Report --------------------------------------------------------------

const results = targets.map(t => ({ file: relative(process.cwd(), t).replace(/\\/g,'/'), findings: scanWorkflow(t) }));
const totalErrors = results.reduce((n, r) => n + r.findings.filter(f => f.severity === 'error').length, 0);
const totalWarnings = results.reduce((n, r) => n + r.findings.filter(f => f.severity === 'warning').length, 0);

if (format === 'json') {
  console.log(JSON.stringify({ summary: { files: results.length, errors: totalErrors, warnings: totalWarnings }, results }, null, 2));
} else if (format === 'markdown') {
  console.log(`# Security scan — ${results.length} file(s) · ${totalErrors} error / ${totalWarnings} warning\n`);
  for (const r of results) {
    if (r.findings.length === 0) {
      console.log(`- ✅ \`${r.file}\``);
    } else {
      console.log(`- ${r.findings.some(f => f.severity === 'error') ? '❌' : '⚠️'} \`${r.file}\``);
      for (const f of r.findings) {
        console.log(`  - **${f.severity}** \`${f.rule}\` @ ${f.where} — ${f.sample}`);
      }
    }
  }
} else {
  for (const r of results) {
    if (r.findings.length === 0) {
      console.log(`OK  ${r.file}`);
    } else {
      for (const f of r.findings) {
        console.log(`${f.severity.toUpperCase().padEnd(7)} ${r.file}  [${f.rule}]  ${f.where}  ${f.sample}`);
      }
    }
  }
  console.log(`---`);
  console.log(`Summary: ${results.length} file(s) scanned · ${totalErrors} error · ${totalWarnings} warning`);
}

process.exit(totalErrors > 0 ? 1 : 0);

// Static audit for n8n workflow JSON files.
// Encodes rules from:
//   skills/_vendor/n8n-validation-expert/SKILL.md
//   skills/_vendor/n8n-expression-syntax/COMMON_MISTAKES.md
// Not a substitute for n8n MCP validate_workflow, but catches the structural issues
// you can detect without a running n8n instance.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const findings = [];
function add(file, severity, rule, msg) { findings.push({ file, severity, rule, msg }); }

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (e.endsWith('.workflow.json')) out.push(p);
  }
  return out;
}

const ALLOWED_NODE_TYPES = new Set([
  'n8n-nodes-base.executeWorkflowTrigger',
  'n8n-nodes-base.executeWorkflow',
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.formTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.respondToWebhook',
  'n8n-nodes-base.code',
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.if',
  'n8n-nodes-base.gmail',
  'n8n-nodes-base.stickyNote',
  'n8n-nodes-base.googleDrive',
  'n8n-nodes-base.googleSheets',
  'n8n-nodes-base.googleDocs',
  'n8n-nodes-base.googleCalendar'
]);

function auditOne(file) {
  let wf;
  try { wf = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { add(file, 'error', 'JSON', 'parse error: ' + e.message); return; }

  const rel = basename(file);

  // ---- Top-level structure ----
  for (const k of ['name', 'nodes', 'connections']) {
    if (!(k in wf)) add(rel, 'error', 'STRUCT', 'missing top-level field: ' + k);
  }
  if (!Array.isArray(wf.nodes)) {
    add(rel, 'error', 'STRUCT', 'nodes must be an array');
    return;
  }

  // ---- Per-node checks ----
  const namesSeen = new Set();
  const idsSeen = new Set();
  const nodesByName = new Map();
  const triggerNodes = [];

  for (const node of wf.nodes) {
    if (!node.name) { add(rel, 'error', 'NODE', 'node missing name'); continue; }
    if (namesSeen.has(node.name)) add(rel, 'error', 'NODE', 'duplicate node name: ' + node.name);
    namesSeen.add(node.name);
    if (node.id) {
      if (idsSeen.has(node.id)) add(rel, 'error', 'NODE', 'duplicate node id: ' + node.id);
      idsSeen.add(node.id);
    }
    nodesByName.set(node.name, node);

    if (!node.type) add(rel, 'error', 'NODE', node.name + ': missing type');
    else if (!ALLOWED_NODE_TYPES.has(node.type)) {
      add(rel, 'warn', 'NODE', `${node.name}: unrecognized node type "${node.type}"`);
    }
    if (typeof node.typeVersion !== 'number') add(rel, 'error', 'NODE', node.name + ': typeVersion must be a number');
    if (!Array.isArray(node.position) || node.position.length !== 2) {
      add(rel, 'error', 'NODE', node.name + ': position must be [x, y]');
    }

    // Triggers (no incoming connection expected)
    if (/Trigger$/.test(node.type) || node.type === 'n8n-nodes-base.webhook' || node.type === 'n8n-nodes-base.manualTrigger') {
      triggerNodes.push(node.name);
    }

    // ---- Code node — syntactic check ----
    if (node.type === 'n8n-nodes-base.code') {
      const code = node.parameters?.jsCode;
      if (!code || typeof code !== 'string') {
        add(rel, 'error', 'CODE', node.name + ': missing jsCode');
      } else {
        // Rule #8 from COMMON_MISTAKES: must NOT contain literal {{ ... }} expression wrappers
        if (/\{\{\s*\$/.test(code)) {
          add(rel, 'warn', 'CODE-EXPR', node.name + ': contains "{{$..." which is expression syntax leaking into JS — use $json / $input direct access');
        }
        try { new Function(code); }
        catch (e) { add(rel, 'error', 'CODE', node.name + ': JS parse error — ' + e.message); }
      }
    }

    // ---- Expressions (any string value starting with "=") ----
    walkValues(node.parameters || {}, (path, v) => {
      if (typeof v !== 'string') return;
      // Rule #6: triple-brace
      if (/\{\{\{/.test(v)) add(rel, 'error', 'EXPR', `${node.name}.${path}: triple {{{ in "${trunc(v)}"`);
      // Rule #15: empty {{ }}
      if (/\{\{\s*\}\}/.test(v)) add(rel, 'warn', 'EXPR', `${node.name}.${path}: empty {{ }} in "${trunc(v)}"`);
      // Rule #11: "= " in front when there is no {{
      if (v.startsWith('=') && !/\{\{/.test(v)) {
        // Bare "=..." with no expression body. Allow simple "={}" or "={ ... static json ... }" for jsonBody.
        if (!path.includes('jsonBody') && !path.includes('responseBody')) {
          add(rel, 'warn', 'EXPR', `${node.name}.${path}: leading "=" without {{ }} in "${trunc(v)}"`);
        }
      }
      // Rule #14: template literal usage
      if (/`[^`]*\$\{/.test(v) && !path.includes('jsCode')) {
        add(rel, 'warn', 'EXPR', `${node.name}.${path}: template-literal \`\${} in expression — use {{ }} instead`);
      }
      // Rule #2: webhook body — flag suspicious $json.X where X is a field we POST in body
      // (only relevant for webhook entry workflows)
    });

    // ---- IF node — operator sanitization (validation-expert rule) ----
    if (node.type === 'n8n-nodes-base.if') {
      const conds = node.parameters?.conditions?.conditions || [];
      for (const c of conds) {
        const op = c.operator?.operation;
        const single = c.operator?.singleValue;
        const UNARY = new Set(['true','false','isEmpty','isNotEmpty','exists','notExists']);
        const BINARY = new Set(['equals','notEquals','contains','notContains','greaterThan','lessThan','startsWith','endsWith']);
        if (UNARY.has(op) && single !== true) add(rel, 'warn', 'IF-OP', `${node.name}: unary "${op}" needs singleValue:true (auto-sanitize will fix at runtime)`);
        if (BINARY.has(op) && single === true) add(rel, 'warn', 'IF-OP', `${node.name}: binary "${op}" should not have singleValue:true (auto-sanitize will fix)`);
      }
    }

    // ---- Webhook node — must have a path ----
    if (node.type === 'n8n-nodes-base.webhook') {
      if (!node.parameters?.path) add(rel, 'error', 'WEBHOOK', node.name + ': missing path');
    }

    // ---- Gmail node — must have sendTo + subject ----
    if (node.type === 'n8n-nodes-base.gmail') {
      const p = node.parameters || {};
      for (const k of ['sendTo','subject','message']) {
        if (!p[k]) add(rel, 'error', 'GMAIL', `${node.name}: missing ${k}`);
      }
    }
  }

  // ---- Connections — every referenced node must exist ----
  for (const [from, conns] of Object.entries(wf.connections || {})) {
    if (!nodesByName.has(from)) {
      add(rel, 'error', 'CONN', `connection source "${from}" does not match any node name`);
    }
    for (const branch of (conns.main || [])) {
      for (const link of branch) {
        if (!nodesByName.has(link.node)) {
          add(rel, 'error', 'CONN', `connection from "${from}" → "${link.node}" target node not found`);
        }
      }
    }
  }

  // ---- Disconnected non-trigger nodes ----
  const inbound = new Set();
  for (const [, conns] of Object.entries(wf.connections || {})) {
    for (const branch of (conns.main || [])) {
      for (const link of branch) inbound.add(link.node);
    }
  }
  for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.stickyNote') continue;
    if (triggerNodes.includes(node.name)) continue;
    if (!inbound.has(node.name)) {
      add(rel, 'warn', 'FLOW', `node "${node.name}" has no incoming connection (orphaned?)`);
    }
  }

  // ---- Multiple triggers? ----
  if (triggerNodes.length > 1) add(rel, 'warn', 'FLOW', 'multiple trigger nodes: ' + triggerNodes.join(', '));
  if (triggerNodes.length === 0) add(rel, 'error', 'FLOW', 'no trigger node found');
}

function walkValues(obj, fn, path = '') {
  if (obj == null) return;
  if (typeof obj === 'string') { fn(path || '<root>', obj); return; }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkValues(v, fn, path + '[' + i + ']'));
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      walkValues(v, fn, path ? path + '.' + k : k);
    }
  }
}
function trunc(s) { return s.length > 80 ? s.slice(0, 77) + '...' : s; }

// ---- run ----
const files = walk(ROOT);
files.sort();
for (const f of files) auditOne(f);

const errors = findings.filter(f => f.severity === 'error');
const warns  = findings.filter(f => f.severity === 'warn');

const grouped = {};
for (const f of findings) {
  if (!grouped[f.file]) grouped[f.file] = [];
  grouped[f.file].push(f);
}
console.log('# Audit report — ' + files.length + ' workflow files scanned\n');
for (const f of files) {
  const items = grouped[basename(f)] || [];
  const e = items.filter(x => x.severity === 'error').length;
  const w = items.filter(x => x.severity === 'warn').length;
  const tag = e ? '❌' : (w ? '⚠️ ' : '✅');
  console.log(`${tag} ${basename(f)}  (${e} error / ${w} warn)`);
  for (const it of items) {
    const icon = it.severity === 'error' ? 'ERR ' : 'warn';
    console.log(`    [${icon} ${it.rule}] ${it.msg}`);
  }
}
console.log(`\nTotal: ${errors.length} errors, ${warns.length} warnings`);
process.exit(errors.length ? 1 : 0);

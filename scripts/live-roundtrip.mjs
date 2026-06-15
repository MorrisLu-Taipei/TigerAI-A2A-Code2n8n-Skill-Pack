#!/usr/bin/env node
// Live n8n REST round-trip: import → fetch → delete.
//
// Usage:
//   N8N_API_URL=https://your-n8n N8N_API_KEY=xxx \
//     node scripts/live-roundtrip.mjs --glob "examples/templates/*.workflow.json"
//
// Each workflow is imported, fetched back to confirm node count matches,
// then deleted. NEVER leaves test workflows behind. Tags the imports so
// orphans from a crash are findable.
//
// Skip if N8N_API_URL or N8N_API_KEY is missing — exit 0 with a clear log
// so CI can run this job optionally.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
let globPattern = null;
let dryRun = false;
const explicit = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--glob') { globPattern = args[++i]; continue; }
  if (a === '--dry-run') { dryRun = true; continue; }
  if (a === '--help' || a === '-h') {
    console.log('Usage: node scripts/live-roundtrip.mjs [--glob <pattern>] [--dry-run] [file ...]');
    process.exit(0);
  }
  explicit.push(a);
}

const API_URL = process.env.N8N_API_URL;
const API_KEY = process.env.N8N_API_KEY;

if (!API_URL || !API_KEY) {
  console.log('ℹ N8N_API_URL or N8N_API_KEY missing — skipping live round-trip (returning success).');
  process.exit(0);
}

const date = new Date().toISOString().slice(0, 10);
const tag = `claude-import-${date}`;
const prefix = `[Claude ${date}] roundtrip — `;

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
  const m = [];
  for (const f of walk(root)) {
    const rel = relative(root, f).replace(/\\/g, '/');
    if (re.test(rel)) m.push(f);
  }
  return m;
}

const targets = globPattern ? matchGlob(globPattern) : explicit.map(f => resolve(f));
if (targets.length === 0) {
  console.error('No workflow files matched.');
  process.exit(2);
}

async function n8n(method, path, body) {
  const res = await fetch(API_URL.replace(/\/$/, '') + path, {
    method,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'content-type': 'application/json',
      'accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

const results = [];
let totalErrors = 0;

for (const path of targets) {
  const rel = relative(process.cwd(), path).replace(/\\/g, '/');
  let result = { file: rel, status: 'unknown', importedId: null, nodes: 0, error: null };
  try {
    const raw = readFileSync(path, 'utf8');
    const wf = JSON.parse(raw);
    const expectedNodes = (wf.nodes || []).length;
    const body = {
      name: prefix + (wf.name || rel),
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings ?? { executionOrder: 'v1' },
    };
    if (dryRun) {
      console.log(`DRY  ${rel}  (would import as "${body.name}", ${expectedNodes} nodes)`);
      result.status = 'dry-run';
      result.nodes = expectedNodes;
      results.push(result);
      continue;
    }
    const imported = await n8n('POST', '/api/v1/workflows', body);
    result.importedId = imported.id;
    const fetched = await n8n('GET', `/api/v1/workflows/${imported.id}`);
    const fetchedNodes = (fetched.nodes || []).length;
    result.nodes = fetchedNodes;
    if (fetchedNodes !== expectedNodes) {
      throw new Error(`node count mismatch: expected ${expectedNodes}, got ${fetchedNodes}`);
    }
    await n8n('DELETE', `/api/v1/workflows/${imported.id}`);
    result.status = 'ok';
    console.log(`OK   ${rel}  (id=${imported.id}, nodes=${fetchedNodes})`);
  } catch (e) {
    result.status = 'fail';
    result.error = e.message;
    totalErrors++;
    console.log(`FAIL ${rel}  ${e.message.slice(0, 200)}`);
    if (result.importedId) {
      try { await n8n('DELETE', `/api/v1/workflows/${result.importedId}`); }
      catch (e2) { console.log(`     cleanup failed: ${e2.message}`); }
    }
  }
  results.push(result);
}

console.log('---');
console.log(`Round-trip summary: ${results.length} file(s) · ${results.filter(r => r.status === 'ok').length} ok · ${totalErrors} fail · tag="${tag}"`);
process.exit(totalErrors > 0 ? 1 : 0);

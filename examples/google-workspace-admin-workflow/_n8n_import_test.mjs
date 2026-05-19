// Import each workflow into the local n8n via the public REST API to surface
// errors that static lint cannot see (unknown parameter, missing required
// field for a typeVersion, etc.). Cleans up imports afterwards.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const API = 'http://localhost:5678/api/v1';
const KEY = process.env.N8N_API_KEY;
if (!KEY) {
  console.error('Set N8N_API_KEY env var (get it from n8n Settings → API).');
  process.exit(2);
}

const ROOT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (e.endsWith('.workflow.json')) out.push(p);
  }
  return out;
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'X-N8N-API-KEY': KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

const files = walk(ROOT).sort();
const created = [];
const report = [];

console.log(`# n8n import test — ${files.length} workflows\n`);
console.log(`Target: ${API}\n`);

for (const file of files) {
  const wf = JSON.parse(readFileSync(file, 'utf8'));
  // n8n REST refuses POST with `active`, `id`, `tags`, etc — strip to allowed fields.
  const payload = {
    name: '__AUDIT__ ' + wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {}
  };
  const r = await api('POST', '/workflows', payload);
  if (r.status >= 200 && r.status < 300 && r.json.id) {
    created.push(r.json.id);
    report.push({ file: basename(file), ok: true, id: r.json.id });
    console.log(`✅ ${basename(file)}  → id=${r.json.id}`);
  } else {
    report.push({ file: basename(file), ok: false, status: r.status, error: r.json });
    console.log(`❌ ${basename(file)}  → HTTP ${r.status}`);
    console.log('   ' + JSON.stringify(r.json).slice(0, 600));
  }
}

// Cleanup
console.log(`\n# Cleanup`);
for (const id of created) {
  const r = await api('DELETE', '/workflows/' + id);
  console.log(`  delete ${id} → HTTP ${r.status}`);
}

const fails = report.filter(r => !r.ok);
console.log(`\nTotal: ${report.length - fails.length}/${report.length} accepted by n8n.`);
process.exit(fails.length ? 1 : 0);

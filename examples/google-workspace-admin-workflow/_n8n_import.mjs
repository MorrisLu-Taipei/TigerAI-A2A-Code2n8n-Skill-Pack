// Import all 7 workflows into local n8n, leave them inactive for inspection.
// Does NOT clean up afterwards. Re-running will create duplicates by name.

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

const STAMP = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
const PREFIX = `[Claude ${STAMP}] `;
const TAG_NAME = `claude-import-${STAMP}`;

// ---- Get or create the tag, so all imports share one tag ----
let tagId = null;
{
  const list = await api('GET', '/tags');
  const existing = (list.json.data || []).find(t => t.name === TAG_NAME);
  if (existing) {
    tagId = existing.id;
    console.log(`Reusing tag: ${TAG_NAME} (id=${tagId})`);
  } else {
    const r = await api('POST', '/tags', { name: TAG_NAME });
    if (r.status >= 200 && r.status < 300) {
      tagId = r.json.id;
      console.log(`Created tag: ${TAG_NAME} (id=${tagId})`);
    } else {
      console.log(`⚠️  Tag create failed (HTTP ${r.status}) — continuing without tag`);
    }
  }
}

const files = walk(ROOT).sort();
const created = [];

console.log(`# n8n permanent import — ${files.length} workflows\n`);
for (const file of files) {
  const wf = JSON.parse(readFileSync(file, 'utf8'));
  const payload = {
    name: PREFIX + wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {}
  };
  const r = await api('POST', '/workflows', payload);
  if (r.status >= 200 && r.status < 300 && r.json.id) {
    created.push({ id: r.json.id, name: payload.name });
    console.log(`✅ ${payload.name}`);
    console.log(`   id=${r.json.id}  url=http://localhost:5678/workflow/${r.json.id}`);
    // Attach tag if we have one
    if (tagId) {
      const tagRes = await api('PUT', `/workflows/${r.json.id}/tags`, [{ id: tagId }]);
      if (tagRes.status < 200 || tagRes.status >= 300) {
        console.log(`   ⚠️  tag attach failed (HTTP ${tagRes.status})`);
      }
    }
  } else {
    console.log(`❌ ${payload.name} → HTTP ${r.status}`);
    console.log('   ' + JSON.stringify(r.json).slice(0, 500));
  }
}

console.log(`\nDone. ${created.length}/${files.length} imported, all inactive.`);
console.log(`Name prefix : "${PREFIX}"`);
console.log(`Tag         : "${TAG_NAME}"`);
console.log(`UI          : http://localhost:5678/workflows`);
console.log(`\nTo bulk delete later:`);
console.log(`  curl -X GET 'http://localhost:5678/api/v1/workflows?tags=${TAG_NAME}' -H 'X-N8N-API-KEY: $KEY' \\`);
console.log(`    | node -e '...' | xargs -I{} curl -X DELETE ... /workflows/{}`);

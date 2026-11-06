#!/usr/bin/env node
// 用法：N8N_URL=http://localhost:5678 N8N_OWNER_EMAIL=... N8N_OWNER_PASSWORD=... node scripts/dump-node-versions.mjs --out docs/node-versions/<版本>.json [--n8n-version <版本>]
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(`dump-node-versions: ${msg}`);
  process.exit(1);
};

const base = (process.env.N8N_URL || '').replace(/\/+$/, '');
const email = process.env.N8N_OWNER_EMAIL;
const password = process.env.N8N_OWNER_PASSWORD;
const out = opt('--out');
if (!base || !email || !password) fail('需要環境變數 N8N_URL、N8N_OWNER_EMAIL、N8N_OWNER_PASSWORD');
if (!out) fail('需要 --out <檔案>');

async function login() {
  // 不同 n8n 版本的登入欄位不同，依序嘗試
  for (const field of ['emailOrLdapLoginId', 'email']) {
    const res = await fetch(`${base}/rest/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: email, password }),
    });
    if (res.ok) return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    if (res.status !== 400) fail(`登入失敗（HTTP ${res.status}）`);
  }
  fail('登入失敗：兩種欄位格式都被拒絕');
}

const cookie = await login();
const get = async (path) => {
  const res = await fetch(base + path, { headers: { cookie } });
  if (!res.ok) fail(`GET ${path} 失敗（HTTP ${res.status}）`);
  return res.json();
};

let n8nVersion = opt('--n8n-version');
if (!n8nVersion) {
  try {
    n8nVersion = (await get('/rest/settings')).data?.versionCli;
  } catch {
    /* 取不到就走下面的錯誤 */
  }
}
if (!n8nVersion) fail('取不到 n8n 版本，請用 --n8n-version 指定');

const catalog = await get('/types/nodes.json');
if (!Array.isArray(catalog)) fail('節點目錄格式不是陣列');

const num = (a, b) => a - b;
const byName = new Map();
for (const entry of catalog) {
  if (!entry?.name) continue;
  if (!byName.has(entry.name)) byName.set(entry.name, []);
  byName.get(entry.name).push(entry);
}

// 憑證需求：條目的 credentials 為 [{name, required, displayOptions?}]。
// 同名多筆取聯集：任一條目 required 為真則為真；conditional 表示「所有 required 的條目都帶 displayOptions」，
// 也就是只有在某些參數組合下才需要（例如 authentication 選了該憑證才要），沒有 conditional 才是無條件需要。
function credentialNeeds(entries) {
  const needs = new Map();
  for (const e of entries) {
    for (const c of Array.isArray(e.credentials) ? e.credentials : []) {
      if (typeof c?.name !== 'string') continue;
      const cur = needs.get(c.name) ?? { required: false, unconditional: false };
      if (c.required === true) {
        cur.required = true;
        if (!c.displayOptions) cur.unconditional = true;
      }
      needs.set(c.name, cur);
    }
  }
  return [...needs]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, v]) => (v.required && !v.unconditional ? { name, required: true, conditional: true } : { name, required: v.required }));
}

const nodes = [];
for (const [name, entries] of byName) {
  const versions = [...new Set(entries.flatMap((e) => [].concat(e.version ?? [])))].sort(num);
  const defaults = entries.map((e) => e.defaultVersion).filter((v) => typeof v === 'number');
  const node = {
    name,
    displayName: entries[0].displayName,
    latest: versions.length ? versions[versions.length - 1] : null,
    versions,
    default: defaults.length ? Math.max(...defaults) : null,
    group: [...new Set(entries.flatMap((e) => e.group ?? []))],
    // 目錄明確標示才為 true：deprecated 任一條目為 true；hidden 須所有條目皆為 true
    deprecated: entries.some((e) => e.deprecated === true),
    hidden: entries.every((e) => e.hidden === true),
    credentials: credentialNeeds(entries),
  };
  const replacedBy = entries.find((e) => e.replacedByNodeType)?.replacedByNodeType;
  if (replacedBy) node.replacedBy = replacedBy;
  nodes.push(node);
}
nodes.sort((a, b) => (a.name < b.name ? -1 : 1));

const head = { n8nVersion, generatedAt: new Date().toISOString(), source: '/types/nodes.json', nodeCount: nodes.length };
// 一個節點一行，方便 diff 與閱讀
const headText = Object.entries(head).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
const nodeText = nodes.map((n) => '  ' + JSON.stringify(n)).join(',\n');
writeFileSync(out, `{\n${headText.join(',\n')},\n"nodes": [\n${nodeText}\n]\n}\n`);
console.log(`wrote ${out}: ${nodes.length} nodes (n8n ${n8nVersion})`);

#!/usr/bin/env node
// Compare the pinned upstream versions in skills/_vendor/upstream-pins.json with the latest ones online.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const warnOnly = process.argv.includes('--warn-only');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pins = JSON.parse(readFileSync(join(root, 'skills/_vendor/upstream-pins.json'), 'utf8'));

const ghHeaders = { Accept: 'application/vnd.github+json', 'User-Agent': 'tigerai-check-upstream' };
if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} <- ${url}`);
  return res.json();
}

const parse = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
function cmp(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
function gap(pinned, latest) {
  const x = parse(pinned), y = parse(latest);
  if (y[0] !== x[0]) return `主版號差 ${y[0] - x[0]}`;
  if (y[1] !== x[1]) return `次版號差 ${y[1] - x[1]}`;
  return `修訂號差 ${y[2] - x[2]}`;
}

const rows = [];
const errors = [];

async function check(name, fn) {
  try { rows.push({ name, ...(await fn()) }); }
  catch (e) { errors.push(`${name}: ${e.message}`); rows.push({ name, pinned: '-', latest: '(查詢失敗)', behind: null, note: '網路或 API 錯誤，不當成落後' }); }
}

const vend = pins.upstreams['czlonkowski/n8n-skills'];
await check('czlonkowski/n8n-skills (release)', async () => {
  let latest;
  try { latest = (await getJson('https://api.github.com/repos/czlonkowski/n8n-skills/releases/latest', ghHeaders)).tag_name; }
  catch {
    const tags = await getJson('https://api.github.com/repos/czlonkowski/n8n-skills/tags?per_page=100', ghHeaders);
    latest = tags.map((t) => t.name).sort((a, b) => cmp(b, a))[0];
  }
  const behind = cmp(latest, vend.pinned.tag) > 0;
  return { pinned: vend.pinned.tag, latest, behind, note: behind ? gap(vend.pinned.tag, latest) : '' };
});

const off = pins.upstreams['n8n-io/skills'];
await check('n8n-io/skills (plugin.json)', async () => {
  const file = await getJson('https://api.github.com/repos/n8n-io/skills/contents/.claude-plugin/plugin.json', ghHeaders);
  const latest = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')).version;
  const repo = await getJson('https://api.github.com/repos/n8n-io/skills', ghHeaders);
  const seen = off.observed?.plugin_version ?? null;
  const behind = seen ? cmp(latest, seen) > 0 : false;
  const pushed = repo.pushed_at ? repo.pushed_at.slice(0, 10) : '?';
  return { pinned: off.pinned ? String(off.pinned) : `未收錄 (記錄時為 ${seen ?? '?'})`, latest,
    behind, note: `最近推送 ${pushed}（記錄時 ${off.observed?.last_push ?? '?'}）${behind ? '；' + gap(seen, latest) : ''}` };
});

await check('n8n (npm latest)', async () => {
  const latest = (await getJson('https://registry.npmjs.org/n8n/latest')).version;
  const tested = [...pins.n8n.exercised_versions].sort(cmp);
  const top = tested[tested.length - 1];
  const behind = cmp(latest, top) > 0;
  return { pinned: tested.join(' / '), latest, behind, note: behind ? `最新版高於實測最高版 ${top}，${gap(top, latest)}` : '' };
});

const w = Math.max(...rows.map((r) => r.name.length));
console.log('上游版本對照（釘選 vs 最新）\n');
for (const r of rows) {
  const flag = r.behind === null ? '??' : r.behind ? '落後' : '最新';
  console.log(`${r.name.padEnd(w)}  釘選: ${r.pinned}  最新: ${r.latest}  [${flag}]${r.note ? '  ' + r.note : ''}`);
}
if (errors.length) { console.error('\n查詢錯誤：'); errors.forEach((e) => console.error('  ' + e)); }

const behindAny = rows.some((r) => r.behind === true);
console.log(`\n結果：${behindAny ? '有項目落後' : errors.length ? '無法確認（有查詢失敗）' : '全部為最新'}`);
process.exit(warnOnly ? 0 : behindAny ? 1 : errors.length ? 2 : 0);

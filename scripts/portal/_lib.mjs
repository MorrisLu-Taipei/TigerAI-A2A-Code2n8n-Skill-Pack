// flatten-bundle.mjs 與 check-bundle.mjs 共用的函式（只用 Node 內建模組）。

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export class UsageError extends Error {}

export const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 這兩個檔記錄整包的指紋，所以不納入指紋與 BUNDLE_MANIFEST 的檔案清單
export const META_FILES = ['VENDOR_SOURCE.md', 'BUNDLE_MANIFEST.json'];

// 隨附聲明檔：bundle 內路徑 -> PACK 內來源路徑（散布時必須跟著走）
export const NOTICE_MAP = {
  '_notices/LICENSES.md': 'LICENSES.md',
  '_notices/THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
  '_notices/LICENSE-n8n-io-skills-APACHE-2.0': 'skills/_vendor/LICENSE-n8n-io-skills-APACHE-2.0',
  '_notices/LICENSE-czlonkowski-n8n-skills-MIT': 'skills/_vendor/LICENSE',
  '_notices/LICENSE-TigerAI-MIT': 'LICENSE',
};

export const SPEC_DIR = '_spec';
export const RESTRICTED_SPEC = 'spec/agent-restricted-mode.md';

// 這些 Skill 在受限 Agent 模式下需要明文規則（供 check-bundle 第 f 項使用）
export const RESTRICTED_SKILLS = [
  'sticky-note-to-workflow', 'n8n-api-bridge', 'code-to-workflow',
  'code2n8n-pipeline', 'n8n-code-to-native', 'tigerai-example-finder',
];

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
export const sha256File = p => sha256(readFileSync(p));

export function parseArgs(argv, spec) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`不認得的參數：${a}`);
    let [k, v] = a.slice(2).split(/=(.*)/s, 2);
    const def = spec[k];
    if (!def) throw new UsageError(`不認得的選項：--${k}`);
    if (def === 'bool') { out[k] = true; continue; }
    if (v === undefined) {
      v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`--${k} 需要一個值`);
    }
    out[k] = v;
  }
  return out;
}

// 回傳檔案的相對路徑（POSIX 斜線、已排序）；遇到符號連結直接報錯，避免把 PACK 外的檔案帶進來
export function walkFiles(dir) {
  const res = [];
  const rec = rel => {
    const abs = rel ? join(dir, rel) : dir;
    for (const name of readdirSync(abs).sort()) {
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(dir, r));
      if (st.isSymbolicLink()) throw new Error(`不允許符號連結：${join(dir, r)}`);
      if (st.isDirectory()) rec(r);
      else if (st.isFile()) res.push(r);
    }
  };
  rec('');
  return res.sort(cmp);
}

export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function readJson(p, label) {
  let txt;
  try { txt = readFileSync(p, 'utf8'); } catch (e) { throw new UsageError(`讀不到${label}：${p}`); }
  try { return JSON.parse(txt); } catch (e) { throw new UsageError(`${label}不是合法 JSON：${p}（${e.message}）`); }
}

export function loadAllowlist(p) {
  let raw;
  try { raw = readFileSync(p); } catch { throw new UsageError(`讀不到白名單：${p}`); }
  let j;
  try { j = JSON.parse(raw.toString('utf8')); } catch (e) { throw new UsageError(`白名單不是合法 JSON：${p}（${e.message}）`); }
  if (!j || !Array.isArray(j.skills) || j.skills.length === 0) throw new UsageError('白名單需要非空的 skills 陣列');
  for (const s of j.skills) {
    if (typeof s !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s)) throw new UsageError(`白名單的 Skill 名稱不合法：${JSON.stringify(s)}（不可以底線開頭，也不可含路徑符號）`);
  }
  const notices = j.notices ?? { include: true };
  const specs = Array.isArray(notices.restricted_mode_spec) ? notices.restricted_mode_spec : [RESTRICTED_SPEC, 'spec/agent-restricted-mode.en.md'];
  for (const s of specs) {
    if (typeof s !== 'string' || !/^spec\/[A-Za-z0-9._-]+$/.test(s)) throw new UsageError(`restricted_mode_spec 只能列 spec/ 底下的檔案：${JSON.stringify(s)}`);
  }
  return { skills: j.skills, include: notices.include !== false, specs, sha256: sha256(raw), raw: j };
}

// 在 PACK 內找 Skill 資料夾；回傳 { dirs: {name: {dir, origin}}, errors: [] }
export function resolveSkills(source, names) {
  const dirs = {}, errors = [];
  const seen = new Map();
  for (const n of names) {
    const low = n.toLowerCase();
    if (seen.has(low)) { errors.push(`白名單內名稱重複（含大小寫差異）：${seen.get(low)} 與 ${n}`); continue; }
    seen.set(low, n);
    const hits = [];
    for (const origin of ['_vendor', 'tigerai']) {
      const d = join(source, 'skills', origin, n);
      if (existsSync(d) && lstatSync(d).isDirectory()) hits.push({ dir: d, origin });
    }
    if (hits.length === 0) errors.push(`白名單含不存在的 Skill：${n}（skills/_vendor 與 skills/tigerai 都找不到）`);
    else if (hits.length > 1) errors.push(`名稱衝突：${n} 同時存在於 skills/_vendor 與 skills/tigerai，攤平後會互相覆蓋`);
    else dirs[n] = hits[0];
  }
  return { dirs, errors };
}

// 不該出現在 bundle 的路徑；回傳原因字串或 null
export function forbiddenReason(rel) {
  const segs = rel.split('/');
  const base = segs[segs.length - 1];
  const lower = base.toLowerCase();
  for (const s of segs.slice(0, -1)) {
    if (s === 'reference-workflows') return '含 reference-workflows（已移除的參考工作流程語料）';
    if (s === 'research') return '含 research 目錄（研究索引不隨附）';
    if (s === 'node_modules' || s === '.git') return `含 ${s} 目錄`;
  }
  if (lower === 'reference-workflows') return '含 reference-workflows';
  if (/^(workflow|workflows|template|templates)[-_]?index.*\.json$/.test(lower) || /[-_](workflow|template)s?[-_]index\.json$/.test(lower)) return '範例索引檔（不再隨附，改為即時查詢）';
  if (/^\.env/.test(lower) && !/^\.env\.(example|sample|template)$/.test(lower)) return '.env 類檔案';
  const ext = extname(lower);
  if (['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.ppk'].includes(ext)) return `金鑰類副檔名 ${ext}`;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(lower)) return 'SSH 私鑰檔名';
  if (['credentials.json', '.npmrc', '.netrc'].includes(lower)) return '憑證類檔名';
  return null;
}

export function fingerprint(entries) {
  const lines = [...entries].sort((a, b) => cmp(a.path, b.path)).map(e => `${e.sha256}  ${e.path}\n`);
  return sha256(lines.join(''));
}

function git(source, args) {
  const r = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// 只有當 source 本身就是 git 工作樹的根目錄才採信，避免暫存目錄意外讀到上層 repo
export function gitInfo(source) {
  const unknown = { commit: 'unknown', date: 'unknown', dirty: false, known: false };
  const top = git(source, ['rev-parse', '--show-toplevel']);
  if (!top) return unknown;
  try { if (realpathSync(top) !== realpathSync(source)) return unknown; } catch { return unknown; }
  const commit = git(source, ['rev-parse', 'HEAD']);
  if (!commit) return unknown;
  const date = git(source, ['log', '-1', '--format=%cI']) ?? 'unknown';
  const st = git(source, ['status', '--porcelain']);
  return { commit, date, dirty: !!st, known: true };
}

export function readPackMeta(source) {
  const plugin = readJson(join(source, 'plugin.json'), 'plugin.json');
  let versionFile = null;
  try { versionFile = readFileSync(join(source, 'VERSION'), 'utf8').trim(); } catch { /* 沒有 VERSION 檔 */ }
  return { name: plugin.name, version: plugin.version, versionFile };
}

export function buildVendorSource(m) {
  const skillLines = m.skills.map(s => `  - ${s.name}  # ${s.origin}`).join('\n');
  return `---
vendor_source_schema: 1
pack_name: ${m.packName}
pack_version: ${m.packVersion}
source_commit: ${m.commit}
source_commit_date: ${m.commitDate}
source_dirty: ${m.dirty}
stamp: ${m.stamp}
allowlist_sha256: ${m.allowlistSha}
tree_fingerprint: ${m.fingerprint}
skill_count: ${m.skills.length}
file_count: ${m.fileCount}
total_bytes: ${m.totalBytes}
skills:
${skillLines}
---

# VENDOR_SOURCE

這份 bundle 是把 Pack（\`${m.packName}\`）的 Skill 攤平成一層的不可變複本，由 \`scripts/portal/flatten-bundle.mjs\` 產生，請勿手動修改。上方的區塊是給程式讀的，\`check-bundle.mjs\` 會拿它對照 Pack 的版本與 commit。

| 欄位 | 值 |
|---|---|
| Pack 版本 | ${m.packVersion} |
| 來源 commit | \`${m.commit}\`（${m.commitDate}） |
| 來源工作樹有未提交變更 | ${m.dirty ? '是（不應用於正式出貨）' : '否'} |
| 產生標記（stamp） | ${m.stamp} |
| Skill 數量 | ${m.skills.length} |
| 檔案數量／總大小 | ${m.fileCount} 個／${m.totalBytes} 位元組 |
| 整體樹狀指紋 | \`${m.fingerprint}\` |

## 指紋算法

把 bundle 內除了 \`VENDOR_SOURCE.md\` 與 \`BUNDLE_MANIFEST.json\` 以外的每個檔案寫成一行 \`<sha256><兩個空白><相對路徑>\\n\`，依路徑排序後串接，再取 sha256。換言之，只要任何檔案的內容、路徑或有無不同，指紋就會不同。

## 內容

- \`<skill>/\`：白名單內的 Skill，檔案內容與 Pack 逐位元組相同（含各資料夾的 \`LICENSE\`）。
- \`_notices/\`：授權全文與歸屬聲明，散布時必須一起帶走。
- \`_spec/\`：受限 Agent 模式規格（Pack 有提供時才有）。
- \`BUNDLE_MANIFEST.json\`：逐檔的 sha256 與大小。
`;
}

// 解析 VENDOR_SOURCE.md 最上方的 --- 區塊（簡單的 key: value 與 skills 清單）
export function parseVendorSource(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = { skills: [] };
  let inSkills = false;
  for (const line of m[1].split(/\r?\n/)) {
    if (inSkills && /^\s+-\s+/.test(line)) { out.skills.push(line.replace(/^\s+-\s+/, '').split(/\s+/)[0]); continue; }
    inSkills = false;
    const kv = /^([a-z_0-9]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    if (kv[1] === 'skills') inSkills = true;
    else out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function frontmatterOf(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ''));
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const get = key => {
    const i = lines.findIndex(l => l.startsWith(`${key}:`));
    if (i < 0) return null;
    let v = lines[i].slice(key.length + 1).trim();
    if (v === '' || /^[>|][+-]?$/.test(v)) v = lines.slice(i + 1).filter(l => /^\s+\S/.test(l)).map(l => l.trim()).join(' ');
    return v.replace(/^(['"])(.*)\1$/, '$2');
  };
  return { name: get('name'), description: get('description') };
}

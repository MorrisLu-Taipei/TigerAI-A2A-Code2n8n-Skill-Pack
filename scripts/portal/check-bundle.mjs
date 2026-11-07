#!/usr/bin/env node
// 檢查攤平後的 bundle：Skill 完整性、與 Pack 逐位元組相同、授權檔、禁止項目、版本與 commit、受限模式必備段落。
// 用法：node scripts/portal/check-bundle.mjs --bundle <目錄> [--source <PACK 根目錄>] [--allowlist <檔>]
//        [--expect-commit <sha>] [--previous <BUNDLE_MANIFEST.json>] [--max-file-kb <數字>] [--allow-dirty] [--format json|text]
// 退出碼：0 全部通過（略過不算失敗）；1 有失敗；2 使用錯誤。
// 本腳本只看檔案；Portal 端的工具白名單是否生效，要由 Portal 自己的測試處理（見 docs/portal-bundle-sync.md）。

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  UsageError, SELF_ROOT, META_FILES, NOTICE_MAP, SPEC_DIR, RESTRICTED_SPEC, RESTRICTED_SKILLS,
  parseArgs, loadAllowlist, readJson, resolveSkills, walkFiles, forbiddenReason, sha256File, fingerprint,
  gitInfo, readPackMeta, parseVendorSource, frontmatterOf, cmp,
} from './_lib.mjs';

const checks = [];
const add = (id, title, status, detail = []) => checks.push({ id, title, status, detail: [].concat(detail) });
const cap = (arr, n = 20) => (arr.length > n ? [...arr.slice(0, n), `…還有 ${arr.length - n} 項`] : arr);

function usage(msg) {
  console.error(`使用錯誤：${msg}`);
  process.exit(2);
}

let args;
try {
  args = parseArgs(process.argv.slice(2), {
    bundle: 'str', source: 'str', allowlist: 'str', 'expect-commit': 'str', previous: 'str',
    'max-file-kb': 'str', format: 'str', 'allow-dirty': 'bool', help: 'bool',
  });
  if (args.help) {
    console.log('用法：node scripts/portal/check-bundle.mjs --bundle <目錄> [--source <PACK 根目錄>] [--allowlist <檔>] [--expect-commit <sha>] [--previous <BUNDLE_MANIFEST.json>] [--max-file-kb <數字>] [--allow-dirty] [--format json|text]');
    process.exit(0);
  }
  if (!args.bundle) throw new UsageError('需要 --bundle');
  if (args.format && !['json', 'text'].includes(args.format)) throw new UsageError('--format 只能是 json 或 text');
  if (args['max-file-kb'] !== undefined && !(Number(args['max-file-kb']) > 0)) throw new UsageError('--max-file-kb 需要正數');
  if (args['expect-commit'] !== undefined && !/^[0-9a-f]{7,40}$/i.test(args['expect-commit'])) throw new UsageError('--expect-commit 需要 7 到 40 位的十六進位 sha');
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  usage(e.message);
}

const bundle = resolve(args.bundle);
const source = resolve(args.source ?? SELF_ROOT);
const maxBytes = Math.round(Number(args['max-file-kb'] ?? 1024) * 1024);
const format = args.format ?? 'text';

let allow = null, packMeta;
try {
  if (!existsSync(bundle) || !statSync(bundle).isDirectory()) throw new UsageError(`bundle 目錄不存在：${bundle}`);
  if (!existsSync(join(source, 'plugin.json'))) throw new UsageError(`不像 Pack 根目錄（缺 plugin.json）：${source}`);
  if (args.allowlist) allow = loadAllowlist(resolve(args.allowlist));
  packMeta = readPackMeta(source);
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  usage(e.message);
}

// ---- 讀 bundle ----
let bundleFiles;
try { bundleFiles = walkFiles(bundle); } catch (e) { usage(e.message); }
const contentFiles = bundleFiles.filter(f => !META_FILES.includes(f));
const bundleSet = new Set(bundleFiles);
const hash = {};
for (const f of contentFiles) hash[f] = sha256File(join(bundle, f));

// VENDOR_SOURCE.md 與 BUNDLE_MANIFEST.json
let vs = null, manifest = null;
const vsProblems = [];
if (!bundleSet.has('VENDOR_SOURCE.md')) vsProblems.push('缺少 VENDOR_SOURCE.md');
else {
  vs = parseVendorSource(readFileSync(join(bundle, 'VENDOR_SOURCE.md'), 'utf8'));
  if (!vs) vsProblems.push('VENDOR_SOURCE.md 開頭沒有可解析的 --- 區塊');
}
if (!bundleSet.has('BUNDLE_MANIFEST.json')) vsProblems.push('缺少 BUNDLE_MANIFEST.json');
else {
  try { manifest = JSON.parse(readFileSync(join(bundle, 'BUNDLE_MANIFEST.json'), 'utf8')); } catch (e) { vsProblems.push(`BUNDLE_MANIFEST.json 不是合法 JSON：${e.message}`); }
}

// 白名單：優先用傳入的檔；沒有就用 VENDOR_SOURCE 記錄的清單
let skillNames;
const allowDetail = [];
if (allow) {
  skillNames = allow.skills;
  if (vs) {
    const a = [...allow.skills].sort(cmp).join(','), b = [...vs.skills].sort(cmp).join(',');
    if (a !== b) {
      const miss = vs.skills.filter(s => !allow.skills.includes(s)), extra = allow.skills.filter(s => !vs.skills.includes(s));
      allowDetail.push(`白名單與 VENDOR_SOURCE.md 記錄的 Skill 不一致：白名單多 [${extra.join(', ')}]，VENDOR_SOURCE 多 [${miss.join(', ')}]`);
    }
  }
} else if (vs && vs.skills.length) skillNames = vs.skills;
else skillNames = [...new Set(contentFiles.filter(f => !f.startsWith('_')).map(f => f.split('/')[0]))];

const { dirs: srcDirs, errors: resolveErrors } = resolveSkills(source, skillNames);

// ---- (a) Skill 與 frontmatter ----
{
  const bad = [...allowDetail, ...resolveErrors.map(e => `Pack 來源：${e}`)];
  for (const n of skillNames) {
    const p = `${n}/SKILL.md`;
    if (!bundleSet.has(p)) { bad.push(`${n}：bundle 內沒有 SKILL.md`); continue; }
    const fm = frontmatterOf(readFileSync(join(bundle, p), 'utf8'));
    if (!fm) { bad.push(`${n}：SKILL.md 沒有 frontmatter`); continue; }
    if (!fm.name) bad.push(`${n}：frontmatter 缺 name`);
    else if (fm.name !== n) bad.push(`${n}：frontmatter name「${fm.name}」與資料夾名不一致`);
    if (!fm.description) bad.push(`${n}：frontmatter 缺 description`);
  }
  const extraDirs = [...new Set(contentFiles.filter(f => !f.startsWith('_')).map(f => f.split('/')[0]))].filter(d => !skillNames.includes(d));
  for (const d of extraDirs) bad.push(`${d}：不在白名單內卻出現在 bundle`);
  add('a-skills', `白名單內 ${skillNames.length} 個 Skill 都在，且 SKILL.md 的 frontmatter 完整（name 與資料夾名一致）`, bad.length ? 'fail' : 'pass', bad);
}

// ---- (b) 與 BUNDLE_MANIFEST、與 Pack 來源比對 ----
{
  const bad = [...vsProblems];
  if (manifest && Array.isArray(manifest.files)) {
    const m = new Map(manifest.files.map(e => [e.path, e]));
    for (const f of contentFiles) {
      const e = m.get(f);
      if (!e) bad.push(`多出（MANIFEST 沒有）：${f}`);
      else if (e.sha256 !== hash[f]) bad.push(`內容與 MANIFEST 不同：${f}`);
      else if (e.size !== statSync(join(bundle, f)).size) bad.push(`大小與 MANIFEST 不同：${f}`);
    }
    for (const p of m.keys()) if (!bundleSet.has(p)) bad.push(`缺少（MANIFEST 有）：${p}`);
  } else if (!bad.length) bad.push('BUNDLE_MANIFEST.json 沒有 files 陣列');
  add('b-manifest', '檔案與 BUNDLE_MANIFEST.json 記錄一致（無被改動、缺少、多出）', bad.length ? 'fail' : 'pass', cap(bad));

  const fpBad = [];
  const fp = `sha256:${fingerprint(contentFiles.map(f => ({ path: f, sha256: hash[f] })))}`;
  if (!vs) fpBad.push('讀不到 VENDOR_SOURCE.md，無法比對指紋');
  else if (vs.tree_fingerprint !== fp) fpBad.push(`樹狀指紋不符：VENDOR_SOURCE.md 記 ${vs.tree_fingerprint}，重新計算得 ${fp}`);
  if (manifest && manifest.tree_fingerprint !== fp) fpBad.push(`樹狀指紋不符：BUNDLE_MANIFEST.json 記 ${manifest.tree_fingerprint}，重新計算得 ${fp}`);
  add('b-fingerprint', '樹狀指紋與 VENDOR_SOURCE.md、BUNDLE_MANIFEST.json 相符', fpBad.length ? 'fail' : 'pass', fpBad);

  // 逐檔對照 Pack 來源
  const expected = new Map(); // bundle 路徑 -> 來源絕對路徑
  const srcBad = [];
  for (const n of skillNames) {
    const d = srcDirs[n];
    if (!d) continue;
    for (const f of walkFiles(d.dir)) expected.set(`${n}/${f}`, join(d.dir, f));
  }
  for (const [to, rel] of Object.entries(NOTICE_MAP)) {
    if (existsSync(join(source, rel))) expected.set(to, join(source, rel));
    else srcBad.push(`Pack 來源缺少授權聲明檔：${rel}`);
  }
  const specRels = allow ? allow.specs : contentFiles.filter(f => f.startsWith(`${SPEC_DIR}/`)).map(f => `spec/${f.slice(SPEC_DIR.length + 1)}`);
  for (const rel of specRels) if (existsSync(join(source, rel))) expected.set(`${SPEC_DIR}/${rel.slice(5)}`, join(source, rel));
  for (const [to, abs] of expected) {
    if (!bundleSet.has(to)) srcBad.push(`缺少：${to}`);
    else if (hash[to] !== sha256File(abs)) srcBad.push(`被改動（與 Pack 不同）：${to}`);
  }
  for (const f of contentFiles) if (!expected.has(f)) srcBad.push(`多出（Pack 來源沒有對應）：${f}`);
  add('b-source', `內容與 Pack 來源逐位元組相同（比對 ${expected.size} 個檔案）`, srcBad.length ? 'fail' : 'pass', cap(srcBad, 30));
}

// ---- (c) 授權 ----
{
  const bad = [];
  for (const n of skillNames) {
    const p = `${n}/LICENSE`;
    const d = srcDirs[n];
    if (!bundleSet.has(p)) { bad.push(`${n}：資料夾內沒有 LICENSE`); continue; }
    if (d && existsSync(join(d.dir, 'LICENSE')) && sha256File(join(d.dir, 'LICENSE')) !== hash[p]) bad.push(`${n}：LICENSE 與 Pack 來源不同`);
    const txt = readFileSync(join(bundle, p), 'utf8');
    const official = n.endsWith('-official');
    const community = d?.origin === '_vendor' && !official;
    if (official && !(/Apache License/.test(txt) && /n8n GmbH/.test(txt))) bad.push(`${n}：官方 Skill 的 LICENSE 應為 Apache-2.0 全文並載明 n8n GmbH`);
    if (community && !(/MIT License/.test(txt) && /Permission is hereby granted/.test(txt))) bad.push(`${n}：社群 Skill 的 LICENSE 應為 MIT 全文`);
  }
  add('c-skill-license', '每個 Skill 資料夾都有 LICENSE，且與來源相同（官方為 Apache-2.0、社群為 MIT）', bad.length ? 'fail' : 'pass', cap(bad));

  const nb = [];
  for (const to of Object.keys(NOTICE_MAP)) if (!bundleSet.has(to)) nb.push(`缺少：${to}`);
  const apache = '_notices/LICENSE-n8n-io-skills-APACHE-2.0';
  if (bundleSet.has(apache) && !/Apache License[\s\S]*Version 2\.0/.test(readFileSync(join(bundle, apache), 'utf8'))) nb.push(`${apache} 看起來不是 Apache-2.0 全文`);
  add('c-notices', '_notices/ 內有 LICENSES.md、THIRD_PARTY_NOTICES.md 與 Apache-2.0、MIT 授權全文', nb.length ? 'fail' : 'pass', nb);
}

// ---- (d) 禁止項目 ----
{
  const bad = [], big = [];
  for (const f of bundleFiles) {
    const why = forbiddenReason(f);
    if (why) bad.push(`${f}：${why}`);
    const size = statSync(join(bundle, f)).size;
    if (size > maxBytes) big.push(`${f}：${size} 位元組，超過上限 ${maxBytes}`);
  }
  add('d-forbidden', '不含 reference-workflows、範例索引、.env、金鑰類檔案', bad.length ? 'fail' : 'pass', cap(bad));
  add('d-size-limit', `沒有超過 ${Math.round(maxBytes / 1024)} KB 的單一檔案`, big.length ? 'fail' : 'pass', cap(big));
}

// ---- (e) 版本與 commit ----
{
  const bad = [];
  if (!vs) bad.push('讀不到 VENDOR_SOURCE.md');
  else {
    if (vs.pack_name !== packMeta.name) bad.push(`pack_name 不符：VENDOR_SOURCE 記 ${vs.pack_name}，plugin.json 為 ${packMeta.name}`);
    if (vs.pack_version !== packMeta.version) bad.push(`版本不符：VENDOR_SOURCE 記 ${vs.pack_version}，plugin.json 為 ${packMeta.version}`);
  }
  if (packMeta.versionFile !== null && packMeta.versionFile !== packMeta.version) bad.push(`Pack 自身不一致：VERSION ${packMeta.versionFile} 與 plugin.json ${packMeta.version}`);
  if (manifest?.pack && vs && manifest.pack.version !== vs.pack_version) bad.push(`BUNDLE_MANIFEST 版本 ${manifest.pack.version} 與 VENDOR_SOURCE ${vs.pack_version} 不同`);
  add('e-version', 'VENDOR_SOURCE.md 的 Pack 名稱與版本，和 plugin.json、VERSION 一致', bad.length ? 'fail' : 'pass', bad);

  const git = gitInfo(source);
  const cb = [];
  let status = 'pass';
  const recorded = vs?.source_commit;
  if (!recorded) cb.push('VENDOR_SOURCE.md 沒有 source_commit');
  else if (git.known) {
    if (recorded !== git.commit) cb.push(`commit 不符：VENDOR_SOURCE 記 ${recorded}，Pack 目前 HEAD 為 ${git.commit}`);
  } else if (recorded !== 'unknown') cb.push(`Pack 來源不在 git 內，無法確認 VENDOR_SOURCE 記的 commit ${recorded}`);
  if (cb.length) status = 'fail';
  else if (!git.known && recorded === 'unknown') status = 'skip';
  add('e-commit', 'VENDOR_SOURCE.md 的 commit 與 Pack 目前的 HEAD 一致', status, status === 'skip' ? ['Pack 與 bundle 都沒有 git 資訊（unknown），無法比對'] : cb);

  if (args['expect-commit']) {
    const e = args['expect-commit'].toLowerCase(), r = (recorded ?? '').toLowerCase();
    const ok = r !== 'unknown' && r.length >= 7 && (r.startsWith(e) || e.startsWith(r));
    add('e-expect-commit', `VENDOR_SOURCE.md 的 commit 等於 --expect-commit（${args['expect-commit']}）`, ok ? 'pass' : 'fail', ok ? [] : [`VENDOR_SOURCE 記的 commit 是 ${recorded ?? '（無）'}`]);
  }

  const dirty = vs?.source_dirty === 'true';
  if (dirty) add('e-clean-tree', 'bundle 產生時 Pack 工作樹沒有未提交變更', args['allow-dirty'] ? 'skip' : 'fail', [args['allow-dirty'] ? '來源有未提交變更；已用 --allow-dirty 放行，這份 bundle 不應用於出貨' : 'source_dirty: true，正式出貨的 bundle 必須由乾淨的 checkout 產生']);
  else add('e-clean-tree', 'bundle 產生時 Pack 工作樹沒有未提交變更', 'pass');
}

// ---- (f) 受限 Agent 模式 ----
{
  const need = skillNames.filter(n => RESTRICTED_SKILLS.includes(n));
  const specInSource = existsSync(join(source, RESTRICTED_SPEC));
  const specInBundle = bundleSet.has(`${SPEC_DIR}/${RESTRICTED_SPEC.slice(5)}`);
  const title = '需要受限模式的 Skill 含「受限 Agent 模式」小節並引用 spec/agent-restricted-mode.md，且隨附規格檔';
  if (!need.length) add('f-restricted-mode', title, 'pass', ['白名單不含需要受限模式小節的 Skill']);
  else if (!specInSource && !specInBundle) add('f-restricted-mode', title, 'skip', ['略過（規格尚未提供）：Pack 與 bundle 都沒有 spec/agent-restricted-mode.md']);
  else {
    const bad = [];
    if (!specInBundle) bad.push(`bundle 缺少 ${SPEC_DIR}/${RESTRICTED_SPEC.slice(5)}`);
    for (const n of need) {
      const p = `${n}/SKILL.md`;
      if (!bundleSet.has(p)) continue; // 第 a 項已回報
      const txt = readFileSync(join(bundle, p), 'utf8');
      // 小節標題，或以粗體開頭的引用區塊；英文為主的 Skill 允許 Restricted Agent mode
      if (!/^(?:#{1,6}[ \t]+.*|>[ \t]*\*\*)(?:受限 Agent 模式|Restricted Agent mode)/mi.test(txt)) bad.push(`${n}：SKILL.md 沒有「受限 Agent 模式」小節標題`);
      // 英文為主的 Skill 可以引用 .en.md
      if (!/spec\/agent-restricted-mode(?:\.en)?\.md/.test(txt)) bad.push(`${n}：SKILL.md 沒有引用 ${RESTRICTED_SPEC}`);
    }
    add('f-restricted-mode', title, bad.length ? 'fail' : 'pass', bad);
  }
}

// ---- (g) 大小報告 ----
{
  const sizes = bundleFiles.map(f => ({ f, s: statSync(join(bundle, f)).size })).sort((a, b) => b.s - a.s || cmp(a.f, b.f));
  const total = sizes.reduce((n, x) => n + x.s, 0);
  add('g-size-report', `大小報告：${bundleFiles.length} 個檔案、共 ${total} 位元組（${(total / 1024).toFixed(1)} KB）`, 'info',
    ['最大的 10 個檔案：', ...sizes.slice(0, 10).map(x => `  ${String(x.s).padStart(8)}  ${x.f}`)]);
}

// ---- (h) 與前一版比較 ----
if (args.previous) {
  let prev = null;
  try { prev = JSON.parse(readFileSync(resolve(args.previous), 'utf8')); } catch (e) { /* 下面回報 */ }
  if (!prev || !Array.isArray(prev.files)) add('h-diff', `與前一版（${args.previous}）的差異`, 'fail', ['讀不到前一版 BUNDLE_MANIFEST.json，或格式不對']);
  else {
    const before = new Map(prev.files.map(e => [e.path, e.sha256]));
    const after = new Map(contentFiles.map(f => [f, hash[f]]));
    const bySkill = {};
    const bucket = p => {
      const k = p.split('/')[0];
      return (bySkill[k] ??= { added: 0, removed: 0, changed: 0 });
    };
    for (const [p, h] of after) { if (!before.has(p)) bucket(p).added++; else if (before.get(p) !== h) bucket(p).changed++; }
    for (const p of before.keys()) if (!after.has(p)) bucket(p).removed++;
    const prevSkills = new Set([...before.keys()].map(p => p.split('/')[0])), curSkills = new Set([...after.keys()].map(p => p.split('/')[0]));
    const addedS = [...curSkills].filter(s => !prevSkills.has(s)).sort(cmp), removedS = [...prevSkills].filter(s => !curSkills.has(s)).sort(cmp);
    const changedS = Object.keys(bySkill).filter(s => !addedS.includes(s) && !removedS.includes(s)).sort(cmp);
    const sum = Object.values(bySkill).reduce((t, x) => ({ added: t.added + x.added, removed: t.removed + x.removed, changed: t.changed + x.changed }), { added: 0, removed: 0, changed: 0 });
    const d = [`前一版：Pack ${prev.pack?.version ?? '?'}，commit ${prev.pack?.commit ?? '?'}；這一版：${vs?.pack_version ?? '?'}，commit ${vs?.source_commit ?? '?'}`];
    if (!Object.keys(bySkill).length) d.push('兩版的檔案內容完全相同');
    else {
      d.push(`新增 Skill：${addedS.join(', ') || '無'}`, `刪除 Skill：${removedS.join(', ') || '無'}`);
      d.push(`檔案合計：新增 ${sum.added}、刪除 ${sum.removed}、變動 ${sum.changed}`);
      for (const s of changedS) d.push(`  變動的 Skill ${s}：新增 ${bySkill[s].added}、刪除 ${bySkill[s].removed}、變動 ${bySkill[s].changed}`);
    }
    add('h-diff', '與前一版 BUNDLE_MANIFEST 的差異摘要（供審閱，不影響通過與否）', 'info', d);
  }
}

// ---- 輸出 ----
const count = s => checks.filter(c => c.status === s).length;
const summary = { pass: count('pass'), fail: count('fail'), skip: count('skip'), info: count('info') };
const ok = summary.fail === 0;
if (format === 'json') {
  console.log(JSON.stringify({ ok, bundle, source, summary, checks }, null, 2));
} else {
  const tag = { pass: '通過', fail: '失敗', skip: '略過', info: '資訊' };
  for (const c of checks) {
    console.log(`[${tag[c.status]}] ${c.id}：${c.title}`);
    for (const l of c.detail) console.log(`    ${l}`);
  }
  console.log(`\n共 ${checks.length} 項：通過 ${summary.pass}、失敗 ${summary.fail}、略過 ${summary.skip}、資訊 ${summary.info}`);
  console.log(ok ? '結果：沒有失敗項目' : '結果：有失敗項目');
}
process.exit(ok ? 0 : 1);

#!/usr/bin/env node
// 把 Pack 的 skills/_vendor/<name> 與 skills/tigerai/<name> 攤平成 <out>/<name>/，供 Portal 內建（vendored）。
// 用法：node scripts/portal/flatten-bundle.mjs --allowlist <檔> --out <目錄> [--source <PACK 根目錄>] [--stamp <字串>]
// 退出碼：0 成功；1 內容問題（名稱衝突、Skill 不存在等，不會留下半成品）；2 使用錯誤。
// 文件：docs/portal-bundle-sync.md

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  UsageError, SELF_ROOT, NOTICE_MAP, SPEC_DIR, parseArgs, loadAllowlist, resolveSkills,
  walkFiles, forbiddenReason, sha256File, fingerprint, gitInfo, readPackMeta, buildVendorSource,
} from './_lib.mjs';

function fail(lines) {
  for (const l of [].concat(lines)) console.error(`錯誤：${l}`);
  process.exit(1);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { allowlist: 'str', out: 'str', source: 'str', stamp: 'str', help: 'bool' });
    if (args.help) {
      console.log('用法：node scripts/portal/flatten-bundle.mjs --allowlist <檔> --out <目錄> [--source <PACK 根目錄>] [--stamp <字串>]');
      process.exit(0);
    }
    if (!args.allowlist || !args.out) throw new UsageError('需要 --allowlist 與 --out');
    if (args.stamp !== undefined && /[\r\n]/.test(args.stamp)) throw new UsageError('--stamp 不可含換行');
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`使用錯誤：${e.message}`);
    process.exit(2);
  }

  const source = resolve(args.source ?? SELF_ROOT);
  const out = resolve(args.out);
  let allow, meta;
  try {
    if (!existsSync(join(source, 'plugin.json')) || !existsSync(join(source, 'skills'))) throw new UsageError(`不像 Pack 根目錄（缺 plugin.json 或 skills/）：${source}`);
    allow = loadAllowlist(resolve(args.allowlist));
    meta = readPackMeta(source);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`使用錯誤：${e.message}`);
    process.exit(2);
  }

  if (!allow.include) fail('白名單把 notices.include 設為 false：授權全文與歸屬聲明散布時必須跟著走，不能略過');
  if (!meta.version) fail('plugin.json 沒有 version');

  // 先把所有問題找完再動手，不留半成品
  const { dirs, errors } = resolveSkills(source, allow.skills);
  const plan = []; // { from, to }
  const used = new Map();
  const add = (to, from) => {
    if (used.has(to)) errors.push(`攤平後路徑重複：${to}（${used.get(to)} 與 ${from}）`);
    else { used.set(to, from); plan.push({ from, to }); }
  };
  for (const [name, { dir }] of Object.entries(dirs)) {
    const files = walkFiles(dir);
    if (!files.includes('SKILL.md')) errors.push(`${name} 缺少 SKILL.md`);
    for (const f of files) {
      const to = `${name}/${f}`;
      const why = forbiddenReason(to);
      if (why) errors.push(`${to}：${why}（上游檔案不能修改，請改用白名單排除這個 Skill，或先在 Pack 內處理）`);
      add(to, join(dir, f));
    }
  }
  for (const [to, rel] of Object.entries(NOTICE_MAP)) {
    if (!existsSync(join(source, rel))) errors.push(`缺少授權聲明來源檔：${rel}`);
    else add(to, join(source, rel));
  }
  const skippedSpecs = [];
  for (const rel of allow.specs) {
    if (existsSync(join(source, rel))) add(`${SPEC_DIR}/${rel.slice('spec/'.length)}`, join(source, rel));
    else skippedSpecs.push(rel);
  }
  if (existsSync(out) && readdirSync(out).length > 0) errors.push(`輸出目錄不是空的：${out}（不覆寫，請指定新目錄）`);
  if (errors.length) fail(errors);

  try {
    mkdirSync(out, { recursive: true });
    for (const { from, to } of plan) {
      const dest = join(out, to);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(from, dest);
    }

    const entries = plan.map(({ to }) => ({ path: to, sha256: sha256File(join(out, to)), size: statSync(join(out, to)).size }));
    entries.sort((a, b) => (a.path < b.path ? -1 : 1));
    const fp = `sha256:${fingerprint(entries)}`;
    const totalBytes = entries.reduce((n, e) => n + e.size, 0);
    const git = gitInfo(source);
    const skills = Object.entries(dirs).map(([name, d]) => ({ name, origin: `skills/${d.origin}` })).sort((a, b) => (a.name < b.name ? -1 : 1));
    const stamp = args.stamp ?? 'unstamped';

    const manifest = {
      schema: 1,
      pack: { name: meta.name, version: meta.version, commit: git.commit, commit_date: git.date, dirty: git.dirty },
      stamp,
      tree_fingerprint: fp,
      total_bytes: totalBytes,
      skills: skills.map(s => ({
        ...s,
        files: entries.filter(e => e.path.startsWith(`${s.name}/`)).length,
        bytes: entries.filter(e => e.path.startsWith(`${s.name}/`)).reduce((n, e) => n + e.size, 0),
      })),
      files: entries,
    };
    writeFileSync(join(out, 'BUNDLE_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(join(out, 'VENDOR_SOURCE.md'), buildVendorSource({
      packName: meta.name, packVersion: meta.version, commit: git.commit, commitDate: git.date, dirty: git.dirty,
      stamp, allowlistSha: allow.sha256, fingerprint: fp, skills, fileCount: entries.length, totalBytes,
    }));

    console.log(`已攤平 ${skills.length} 個 Skill、${entries.length} 個檔案（${totalBytes} 位元組）到 ${out}`);
    console.log(`Pack ${meta.name} ${meta.version}，commit ${git.commit}${git.dirty ? '（工作樹有未提交變更）' : ''}`);
    console.log(`樹狀指紋 ${fp}`);
    for (const s of skippedSpecs) console.log(`略過：Pack 內沒有 ${s}（尚未提供，check-bundle 的受限模式項目會標為略過）`);
    console.log(`下一步：node scripts/portal/check-bundle.mjs --bundle ${args.out}`);
  } catch (e) {
    // 失敗時不留半成品
    try { rmSync(out, { recursive: true, force: true }); } catch { /* 盡力清理 */ }
    console.error(`錯誤：${e.message}`);
    process.exit(1);
  }
}

main();

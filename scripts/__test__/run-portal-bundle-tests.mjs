#!/usr/bin/env node
// scripts/portal/flatten-bundle.mjs 與 check-bundle.mjs 的回歸測試（只用 Node 內建模組）。
// 用法：node scripts/__test__/run-portal-bundle-tests.mjs
// 正向：用範例白名單攤平真正的 Pack 並跑 check-bundle。
// 負向：刪授權檔、改一個位元組、放禁止項目、改壞 VENDOR_SOURCE、名稱衝突、白名單含不存在的 Skill 等，
// 每一項都必須被指出。受限模式與無 git 的情況用暫存的迷你 Pack 測，不受 Pack 內容進度影響。

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const flatten = join(root, 'scripts', 'portal', 'flatten-bundle.mjs');
const checker = join(root, 'scripts', 'portal', 'check-bundle.mjs');
const allowFile = join(root, 'scripts', 'portal', 'portal-bundle-allowlist.example.json');

const failures = [];
let checks = 0;
function expect(cond, msg) { checks++; if (!cond) failures.push(msg); }

const tmp = mkdtempSync(join(tmpdir(), 'portal-bundle-'));
let seq = 0;
const fresh = name => join(tmp, `${name}-${++seq}`);

function run(script, ...args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '' };
}
const doFlatten = (out, extra = [], allow = allowFile) => run(flatten, '--allowlist', allow, '--out', out, '--stamp', 'test-stamp', ...extra);
function doCheck(bundle, extra = []) {
  const r = run(checker, '--bundle', bundle, '--format', 'json', ...extra);
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* 使用錯誤時沒有 JSON */ }
  return { ...r, j, st: id => j?.checks.find(c => c.id === id)?.status, detail: id => (j?.checks.find(c => c.id === id)?.detail ?? []).join('\n') };
}
function put(base, rel, content) { const p = join(base, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
function edit(base, rel, fn) { const p = join(base, rel); writeFileSync(p, fn(readFileSync(p, 'utf8'))); }

try {
  // ======== 正向：真正的 Pack ========
  const base = fresh('base');
  const f1 = doFlatten(base);
  expect(f1.code === 0, `flatten 真實 Pack：預期退出碼 0，實得 ${f1.code}\n${f1.out}`);
  const dirty = /source_dirty: true/.test(readFileSync(join(base, 'VENDOR_SOURCE.md'), 'utf8'));
  const okArgs = ['--allowlist', allowFile, ...(dirty ? ['--allow-dirty'] : [])];
  const pos = doCheck(base, okArgs);
  expect(pos.code === 0, `check-bundle 真實 Pack：預期退出碼 0，實得 ${pos.code}\n${pos.j?.checks.filter(c => c.status === 'fail').map(c => `${c.id}: ${c.detail.join('; ')}`).join('\n') ?? pos.out}`);
  for (const id of ['a-skills', 'b-manifest', 'b-fingerprint', 'b-source', 'c-skill-license', 'c-notices', 'd-forbidden', 'd-size-limit', 'e-version']) {
    expect(pos.st(id) === 'pass', `正向：${id} 應通過，實得 ${pos.st(id)}\n${pos.detail(id)}`);
  }
  expect(['pass', 'skip'].includes(pos.st('f-restricted-mode')), `正向：f-restricted-mode 應通過或略過，實得 ${pos.st('f-restricted-mode')}\n${pos.detail('f-restricted-mode')}`);
  expect(pos.st('g-size-report') === 'info', 'g-size-report 應為資訊項目');

  // 內容：28 個 Skill、白名單外的不在、禁止項目不在、位元組相同、授權檔都在
  const allow = JSON.parse(readFileSync(allowFile, 'utf8'));
  expect(allow.skills.length === 28, `範例白名單應有 28 個 Skill，實得 ${allow.skills.length}`);
  for (const s of allow.skills) expect(existsSync(join(base, s, 'SKILL.md')) && existsSync(join(base, s, 'LICENSE')), `bundle 應有 ${s}/SKILL.md 與 LICENSE`);
  for (const s of ['code-to-workflow', 'code2n8n-pipeline', 'tigerai-example-finder', 'reference-workflows', 'research']) expect(!existsSync(join(base, s)), `bundle 不應含 ${s}`);
  for (const f of ['LICENSES.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE-n8n-io-skills-APACHE-2.0']) expect(existsSync(join(base, '_notices', f)), `_notices/${f} 應存在`);
  expect(readFileSync(join(base, 'n8n-agents-official', 'SKILL.md')).equals(readFileSync(join(root, 'skills', '_vendor', 'n8n-agents-official', 'SKILL.md'))), '上游 SKILL.md 應逐位元組相同');
  expect(readFileSync(join(base, 'n8n-api-bridge', 'LICENSE')).equals(readFileSync(join(root, 'skills', 'tigerai', 'n8n-api-bridge', 'LICENSE'))), 'LICENSE 應逐位元組相同');
  const vsText = readFileSync(join(base, 'VENDOR_SOURCE.md'), 'utf8');
  expect(/^pack_version: \S+$/m.test(vsText) && /^tree_fingerprint: sha256:[0-9a-f]{64}$/m.test(vsText) && /^stamp: test-stamp$/m.test(vsText), 'VENDOR_SOURCE.md 應含版本、指紋與傳入的 stamp');

  // 可重現：同樣輸入兩次，輸出逐位元組相同
  const base2 = fresh('base');
  expect(doFlatten(base2).code === 0, '第二次 flatten 應成功');
  for (const f of ['VENDOR_SOURCE.md', 'BUNDLE_MANIFEST.json']) expect(readFileSync(join(base, f)).equals(readFileSync(join(base2, f))), `${f} 在相同輸入下應逐位元組相同`);

  // 沒帶 --allowlist 也能檢查（改用 VENDOR_SOURCE.md 的清單）
  const noAllow = doCheck(base, dirty ? ['--allow-dirty'] : []);
  expect(noAllow.code === 0, `不帶 --allowlist 也應通過，實得 ${noAllow.code}\n${noAllow.out}`);

  // 文字輸出
  const txt = run(checker, '--bundle', base, ...(dirty ? ['--allow-dirty'] : []));
  expect(/\[通過\] a-skills/.test(txt.out) && /共 \d+ 項：通過 \d+/.test(txt.out), 'text 格式應列出每項結果與合計');

  // 複製一份可被改壞的 bundle
  const mutate = (name, fn) => { const d = fresh(name); cpSync(base, d, { recursive: true }); fn(d); return d; };

  // ======== 負向：改壞 bundle ========
  {
    const d = mutate('lic', d => rmSync(join(d, 'n8n-agents-official', 'LICENSE')));
    const r = doCheck(d, okArgs);
    expect(r.code === 1, '刪除 LICENSE：退出碼應為 1');
    expect(r.st('c-skill-license') === 'fail' && r.detail('c-skill-license').includes('n8n-agents-official：資料夾內沒有 LICENSE'), `刪除 LICENSE：c-skill-license 應指出 n8n-agents-official\n${r.detail('c-skill-license')}`);
    expect(r.st('b-source') === 'fail' && r.detail('b-source').includes('缺少：n8n-agents-official/LICENSE'), '刪除 LICENSE：b-source 應列出缺少的檔案');
    expect(r.st('b-manifest') === 'fail' && r.st('b-fingerprint') === 'fail', '刪除 LICENSE：MANIFEST 與指紋都應失敗');
  }
  {
    const d = mutate('mm', d => { const p = join(d, 'n8n-loops-official', 'LICENSE'); const b = readFileSync(p); b[10] ^= 1; writeFileSync(p, b); });
    const r = doCheck(d, okArgs);
    expect(r.code === 1 && r.detail('c-skill-license').includes('n8n-loops-official：LICENSE 與 Pack 來源不同'), `改動 LICENSE 一個位元組：應被 c-skill-license 指出\n${r.detail('c-skill-license')}`);
  }
  {
    const d = mutate('skill1', d => { const p = join(d, 'n8n-code-python', 'SKILL.md'); const b = readFileSync(p); b[b.length - 1] ^= 1; writeFileSync(p, b); });
    const r = doCheck(d, okArgs);
    expect(r.code === 1, '改動 SKILL.md 一個位元組：退出碼應為 1');
    expect(r.detail('b-source').includes('被改動（與 Pack 不同）：n8n-code-python/SKILL.md'), `改動 SKILL.md：b-source 應指名該檔\n${r.detail('b-source')}`);
    expect(r.detail('b-manifest').includes('n8n-code-python/SKILL.md') && r.st('b-fingerprint') === 'fail', '改動 SKILL.md：MANIFEST 與指紋都應失敗');
  }
  {
    const d = mutate('rw', d => put(d, 'reference-workflows/fake.json', '{}'));
    const r = doCheck(d, okArgs);
    expect(r.code === 1 && r.st('d-forbidden') === 'fail' && r.detail('d-forbidden').includes('reference-workflows/fake.json'), `放入 reference-workflows：d-forbidden 應失敗\n${r.detail('d-forbidden')}`);
    expect(r.detail('b-source').includes('多出（Pack 來源沒有對應）：reference-workflows/fake.json'), '放入 reference-workflows：b-source 應列為多出');
  }
  {
    const d = mutate('idx', d => put(d, 'n8n-api-bridge/research/workflow-index.json', '[]'));
    const r = doCheck(d, okArgs);
    expect(r.st('d-forbidden') === 'fail' && r.detail('d-forbidden').includes('research/workflow-index.json'), '放入範例索引檔：d-forbidden 應失敗');
  }
  {
    const d = mutate('idx2', d => put(d, 'tigerai-qa-mode/workflow-index.json', '[]'));
    expect(doCheck(d, okArgs).detail('d-forbidden').includes('tigerai-qa-mode/workflow-index.json'), '根層的 workflow-index.json 也應被擋');
  }
  {
    const d = mutate('env', d => { put(d, 'n8n-api-bridge/.env', 'X=1\n'); put(d, 'n8n-api-bridge/deploy.pem', 'x'); put(d, 'n8n-api-bridge/.env.example', 'X=\n'); });
    const r = doCheck(d, okArgs);
    const dd = r.detail('d-forbidden');
    expect(r.st('d-forbidden') === 'fail' && dd.includes('n8n-api-bridge/.env：') && dd.includes('deploy.pem'), `.env 與 .pem 都應被擋\n${dd}`);
    expect(!dd.includes('.env.example'), '.env.example 不應被當成機密檔');
  }
  {
    const d = mutate('big', d => put(d, 'n8n-api-bridge/big.bin', Buffer.alloc(1100 * 1024, 65)));
    const r = doCheck(d, okArgs);
    expect(r.st('d-size-limit') === 'fail' && r.detail('d-size-limit').includes('n8n-api-bridge/big.bin'), '超過 1 MB 的單檔：d-size-limit 應失敗');
    const r2 = doCheck(d, [...okArgs, '--max-file-kb', '2048']);
    expect(r2.st('d-size-limit') === 'pass', '--max-file-kb 2048：d-size-limit 應通過');
  }
  {
    const d = mutate('vs-commit', d => edit(d, 'VENDOR_SOURCE.md', t => t.replace(/^source_commit: .*$/m, 'source_commit: 0000000000000000000000000000000000000000')));
    const r = doCheck(d, okArgs);
    expect(r.code === 1 && r.st('e-commit') === 'fail', `改壞 VENDOR_SOURCE 的 commit：e-commit 應失敗\n${r.detail('e-commit')}`);
  }
  {
    const d = mutate('vs-ver', d => edit(d, 'VENDOR_SOURCE.md', t => t.replace(/^pack_version: .*$/m, 'pack_version: 0.0.1')));
    const r = doCheck(d, okArgs);
    expect(r.code === 1 && r.st('e-version') === 'fail' && r.detail('e-version').includes('0.0.1'), '改壞 VENDOR_SOURCE 的版本：e-version 應失敗');
  }
  {
    const d = mutate('vs-fp', d => edit(d, 'VENDOR_SOURCE.md', t => t.replace(/^tree_fingerprint: .*$/m, `tree_fingerprint: sha256:${'0'.repeat(64)}`)));
    expect(doCheck(d, okArgs).st('b-fingerprint') === 'fail', '改壞 VENDOR_SOURCE 的指紋：b-fingerprint 應失敗');
  }
  {
    const d = mutate('vs-gone', d => rmSync(join(d, 'VENDOR_SOURCE.md')));
    const r = doCheck(d, okArgs);
    expect(r.code === 1 && r.detail('b-manifest').includes('缺少 VENDOR_SOURCE.md'), '刪除 VENDOR_SOURCE.md：應被指出');
  }
  {
    const d = mutate('dirty', d => edit(d, 'VENDOR_SOURCE.md', t => t.replace(/^source_dirty: .*$/m, 'source_dirty: true')));
    expect(doCheck(d, ['--allowlist', allowFile]).st('e-clean-tree') === 'fail', 'source_dirty: true 且未加 --allow-dirty：e-clean-tree 應失敗');
    expect(doCheck(d, ['--allowlist', allowFile, '--allow-dirty']).st('e-clean-tree') === 'skip', '加 --allow-dirty：e-clean-tree 應為略過');
    const clean = mutate('clean', d => edit(d, 'VENDOR_SOURCE.md', t => t.replace(/^source_dirty: .*$/m, 'source_dirty: false')));
    expect(doCheck(clean, ['--allowlist', allowFile]).st('e-clean-tree') === 'pass', 'source_dirty: false：e-clean-tree 應通過');
  }
  {
    const recorded = /^source_commit: (\S+)$/m.exec(vsText)[1];
    if (recorded !== 'unknown') {
      expect(doCheck(base, [...okArgs, '--expect-commit', recorded.slice(0, 7)]).st('e-expect-commit') === 'pass', '--expect-commit 前 7 碼相符：應通過');
      const bad = doCheck(base, [...okArgs, '--expect-commit', 'abcdef1']);
      expect(bad.code === 1 && bad.st('e-expect-commit') === 'fail', '--expect-commit 不符：應失敗');
    } else {
      expect(doCheck(base, [...okArgs, '--expect-commit', 'abcdef1']).st('e-expect-commit') === 'fail', '沒有 git 資訊時 --expect-commit 應失敗');
    }
  }
  {
    const d = mutate('notice', d => rmSync(join(d, '_notices', 'LICENSE-n8n-io-skills-APACHE-2.0')));
    const r = doCheck(d, okArgs);
    expect(r.code === 1 && r.st('c-notices') === 'fail' && r.detail('c-notices').includes('APACHE-2.0'), '刪除 Apache-2.0 授權全文：c-notices 應失敗');
    const d2 = mutate('notice2', d => { rmSync(join(d, '_notices', 'THIRD_PARTY_NOTICES.md')); rmSync(join(d, '_notices', 'LICENSES.md')); });
    const r2 = doCheck(d2, okArgs);
    expect(r2.detail('c-notices').includes('THIRD_PARTY_NOTICES.md') && r2.detail('c-notices').includes('LICENSES.md'), '刪除兩份聲明檔：c-notices 應都指出');
  }
  {
    const d = mutate('fm', d => edit(d, 'n8n-loops-official/SKILL.md', t => t.replace(/^name: .*$/m, 'name: wrong-name')));
    const r = doCheck(d, okArgs);
    expect(r.st('a-skills') === 'fail' && r.detail('a-skills').includes('wrong-name'), 'frontmatter name 與資料夾名不一致：a-skills 應失敗');
  }
  {
    const d = mutate('nofm', d => writeFileSync(join(d, 'n8n-loops-official', 'SKILL.md'), '# 沒有 frontmatter\n'));
    expect(doCheck(d, okArgs).detail('a-skills').includes('沒有 frontmatter'), '沒有 frontmatter：a-skills 應指出');
  }
  {
    const d = mutate('gone', d => rmSync(join(d, 'n8n-debugging-official'), { recursive: true }));
    const r = doCheck(d, okArgs);
    expect(r.st('a-skills') === 'fail' && r.detail('a-skills').includes('n8n-debugging-official：bundle 內沒有 SKILL.md'), '少一個 Skill：a-skills 應指出');
    expect(r.st('c-skill-license') === 'fail' && r.detail('b-source').includes('缺少：n8n-debugging-official/SKILL.md'), '少一個 Skill：授權與來源比對也應指出');
  }
  {
    const d = mutate('extra', d => { put(d, 'surprise-skill/SKILL.md', '---\nname: surprise-skill\ndescription: x\n---\n'); });
    const r = doCheck(d, okArgs);
    expect(r.st('a-skills') === 'fail' && r.detail('a-skills').includes('surprise-skill：不在白名單內'), '多出白名單外的 Skill：應被指出');
    // 同一份 bundle 若不帶 --allowlist，改用 VENDOR_SOURCE 的清單，仍然要抓到
    expect(doCheck(d, dirty ? ['--allow-dirty'] : []).st('a-skills') === 'fail', '不帶 --allowlist 時也應抓到多出的 Skill');
  }
  {
    const alt = fresh('alt') + '.json';
    writeFileSync(alt, JSON.stringify({ skills: [...allow.skills, 'tigerai-example-finder'] }));
    const r = doCheck(base, ['--allowlist', alt, ...(dirty ? ['--allow-dirty'] : [])]);
    expect(r.code === 1 && r.detail('a-skills').includes('白名單與 VENDOR_SOURCE.md 記錄的 Skill 不一致'), '白名單與 VENDOR_SOURCE 不一致：應被指出');
  }
  {
    const d = mutate('manifest', d => edit(d, 'BUNDLE_MANIFEST.json', t => t.replace(/"sha256": "[0-9a-f]{64}"/, `"sha256": "${'1'.repeat(64)}"`)));
    expect(doCheck(d, okArgs).st('b-manifest') === 'fail', '竄改 MANIFEST 的 sha256：b-manifest 應失敗');
  }
  {
    const d = mutate('symlink', d => symlinkSync('/etc/hostname', join(d, 'n8n-api-bridge', 'link.md')));
    const r = run(checker, '--bundle', d);
    expect(r.code === 2 && r.out.includes('不允許符號連結'), `bundle 內有符號連結：應拒絕檢查（退出碼 2）\n${r.out}`);
  }

  // ======== 與前一版比較 ========
  {
    const prev = fresh('prev') + '.json';
    const m = JSON.parse(readFileSync(join(base, 'BUNDLE_MANIFEST.json'), 'utf8'));
    m.files = m.files.filter(f => f.path !== 'n8n-code-python/README.md');
    m.files.find(f => f.path === 'n8n-loops-official/SKILL.md').sha256 = 'f'.repeat(64);
    m.files.push({ path: 'old-skill/SKILL.md', sha256: 'a'.repeat(64), size: 1 });
    writeFileSync(prev, JSON.stringify(m));
    const r = doCheck(base, [...okArgs, '--previous', prev]);
    const dd = r.detail('h-diff');
    expect(r.st('h-diff') === 'info', '--previous：h-diff 應為資訊項目');
    expect(dd.includes('刪除 Skill：old-skill') && dd.includes('檔案合計：新增 1、刪除 1、變動 1') && dd.includes('n8n-loops-official：新增 0、刪除 0、變動 1'), `--previous：差異摘要內容不對\n${dd}`);
    const same = doCheck(base, [...okArgs, '--previous', join(base, 'BUNDLE_MANIFEST.json')]);
    expect(same.detail('h-diff').includes('完全相同'), '與自己比較：應說完全相同');
    const badPrev = doCheck(base, [...okArgs, '--previous', join(tmp, 'nope.json')]);
    expect(badPrev.code === 1 && badPrev.st('h-diff') === 'fail', '前一版 MANIFEST 讀不到：h-diff 應失敗');
    expect(pos.j.checks.every(c => c.id !== 'h-diff'), '沒帶 --previous 時不應有 h-diff');
  }

  // ======== 使用錯誤（退出碼 2）========
  expect(run(checker).code === 2, 'check-bundle 沒有 --bundle：退出碼應為 2');
  expect(run(checker, '--bundle', join(tmp, 'not-there')).code === 2, 'check-bundle bundle 不存在：退出碼應為 2');
  expect(run(checker, '--bundle', base, '--format', 'xml').code === 2, 'check-bundle --format 不合法：退出碼應為 2');
  expect(run(checker, '--bundle', base, '--bogus').code === 2, 'check-bundle 不認得的選項：退出碼應為 2');
  expect(run(checker, '--bundle', base, '--expect-commit', 'zz').code === 2, 'check-bundle --expect-commit 不是 sha：退出碼應為 2');
  expect(run(flatten, '--out', fresh('x')).code === 2, 'flatten 沒有 --allowlist：退出碼應為 2');
  expect(run(flatten, '--allowlist', join(tmp, 'nope.json'), '--out', fresh('x')).code === 2, 'flatten 白名單不存在：退出碼應為 2');
  {
    const bad = fresh('bad') + '.json';
    writeFileSync(bad, JSON.stringify({ skills: ['../etc'] }));
    expect(doFlatten(fresh('x'), [], bad).code === 2, 'flatten 白名單含路徑符號：退出碼應為 2');
    writeFileSync(bad, JSON.stringify({ skills: ['_notices'] }));
    expect(doFlatten(fresh('x'), [], bad).code === 2, 'flatten 白名單含底線開頭的名稱：退出碼應為 2');
  }

  // ======== flatten 的錯誤處理 ========
  {
    const out = fresh('missing');
    const a = fresh('allow') + '.json';
    writeFileSync(a, JSON.stringify({ skills: ['n8n-api-bridge', 'does-not-exist'] }));
    const r = doFlatten(out, [], a);
    expect(r.code === 1 && r.out.includes('白名單含不存在的 Skill：does-not-exist'), `白名單含不存在的 Skill：應報錯\n${r.out}`);
    expect(!existsSync(out), '白名單含不存在的 Skill：不應留下輸出目錄');
  }
  {
    const out = fresh('dup');
    const a = fresh('allow') + '.json';
    writeFileSync(a, JSON.stringify({ skills: ['n8n-api-bridge', 'N8N-API-bridge'] }));
    const r = doFlatten(out, [], a);
    expect(r.code === 1 && r.out.includes('名稱重複'), '白名單內名稱重複：應報錯');
  }
  {
    const out = fresh('nonempty');
    put(out, 'keep.txt', 'x');
    const r = doFlatten(out);
    expect(r.code === 1 && r.out.includes('輸出目錄不是空的') && existsSync(join(out, 'keep.txt')), '輸出目錄非空：應拒絕且不動原檔');
  }
  {
    const a = fresh('allow') + '.json';
    writeFileSync(a, JSON.stringify({ skills: ['n8n-api-bridge'], notices: { include: false } }));
    const r = doFlatten(fresh('nonotice'), [], a);
    expect(r.code === 1 && r.out.includes('notices.include'), 'notices.include 為 false：應拒絕');
  }

  // ======== 迷你 Pack：名稱衝突、受限模式、無 git ========
  const MIT = 'MIT License\n\nCopyright (c) 2025 Example\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n';
  const APACHE = '                                 Apache License\n                           Version 2.0, January 2004\n\nCopyright 2026 n8n GmbH\n';
  const mini = name => {
    const p = fresh(name);
    put(p, 'plugin.json', JSON.stringify({ name: 'mini-pack', version: '9.9.9' }));
    put(p, 'VERSION', '9.9.9\n');
    put(p, 'LICENSE', MIT);
    put(p, 'LICENSES.md', '# 授權\n');
    put(p, 'THIRD_PARTY_NOTICES.md', '# Notices\n');
    put(p, 'skills/_vendor/LICENSE', MIT);
    put(p, 'skills/_vendor/LICENSE-n8n-io-skills-APACHE-2.0', APACHE);
    put(p, 'skills/_vendor/n8n-foo-official/SKILL.md', '---\nname: n8n-foo-official\ndescription: foo\n---\n# foo\n');
    put(p, 'skills/_vendor/n8n-foo-official/LICENSE', APACHE);
    put(p, 'skills/_vendor/n8n-bar/SKILL.md', '---\nname: n8n-bar\ndescription: >\n  bar\n  multi-line\n---\n# bar\n');
    put(p, 'skills/_vendor/n8n-bar/LICENSE', MIT);
    put(p, 'skills/tigerai/n8n-api-bridge/SKILL.md', '---\nname: n8n-api-bridge\ndescription: bridge\n---\n# bridge\n');
    put(p, 'skills/tigerai/n8n-api-bridge/LICENSE', MIT);
    return p;
  };
  const miniAllow = fresh('mallow') + '.json';
  writeFileSync(miniAllow, JSON.stringify({ skills: ['n8n-foo-official', 'n8n-bar', 'n8n-api-bridge'] }));
  const mFlat = (src, out, extra = []) => run(flatten, '--allowlist', miniAllow, '--out', out, '--source', src, '--stamp', 's', ...extra);
  const mCheck = (src, out, extra = []) => doCheck(out, ['--source', src, '--allowlist', miniAllow, ...extra]);

  {
    const src = mini('mini-conflict');
    put(src, 'skills/tigerai/n8n-bar/SKILL.md', '---\nname: n8n-bar\ndescription: dup\n---\n');
    put(src, 'skills/tigerai/n8n-bar/LICENSE', MIT);
    const out = fresh('mout');
    const r = mFlat(src, out);
    expect(r.code === 1 && r.out.includes('名稱衝突：n8n-bar'), `名稱衝突：應報錯並停止\n${r.out}`);
    expect(!existsSync(out), '名稱衝突：不應留下輸出目錄');
  }
  {
    const src = mini('mini-forbidden');
    put(src, 'skills/tigerai/n8n-api-bridge/.env', 'A=1\n');
    const r = mFlat(src, fresh('mout'));
    expect(r.code === 1 && r.out.includes('n8n-api-bridge/.env'), '來源 Skill 含 .env：flatten 應拒絕');
  }
  {
    const src = mini('mini-nosk');
    rmSync(join(src, 'skills/tigerai/n8n-api-bridge/SKILL.md'));
    const r = mFlat(src, fresh('mout'));
    expect(r.code === 1 && r.out.includes('n8n-api-bridge 缺少 SKILL.md'), '來源 Skill 沒有 SKILL.md：flatten 應拒絕');
  }
  {
    const src = mini('mini-nonotice');
    rmSync(join(src, 'THIRD_PARTY_NOTICES.md'));
    const r = mFlat(src, fresh('mout'));
    expect(r.code === 1 && r.out.includes('缺少授權聲明來源檔：THIRD_PARTY_NOTICES.md'), '來源缺授權聲明檔：flatten 應拒絕');
  }
  {
    // 無規格：略過；無 git：commit 略過
    const src = mini('mini-nospec');
    const out = fresh('mout');
    const fr = mFlat(src, out);
    expect(fr.code === 0 && fr.out.includes('略過：Pack 內沒有 spec/agent-restricted-mode.md'), `迷你 Pack 攤平應成功並提示規格缺少\n${fr.out}`);
    expect(/source_commit: unknown/.test(readFileSync(join(out, 'VENDOR_SOURCE.md'), 'utf8')), '不在 git 內：commit 應標 unknown');
    const r = mCheck(src, out);
    expect(r.code === 0 && r.st('f-restricted-mode') === 'skip' && r.detail('f-restricted-mode').includes('規格尚未提供'), `規格尚未提供：f 項應為略過，且整體通過\n${r.out}`);
    expect(r.st('e-commit') === 'skip', '不在 git 內：e-commit 應略過');
    expect(r.st('a-skills') === 'pass' && r.st('c-skill-license') === 'pass', '迷你 Pack 的 a、c 項應通過（含多行 description）');
    expect(mCheck(src, out, ['--expect-commit', 'abcdef1']).st('e-expect-commit') === 'fail', '沒有 commit 時 --expect-commit 應失敗');
  }
  {
    // 有規格但 Skill 沒有小節：失敗
    const src = mini('mini-spec-bad');
    put(src, 'spec/agent-restricted-mode.md', '# 受限 Agent 模式規格\n');
    const out = fresh('mout');
    expect(mFlat(src, out).code === 0, '迷你 Pack（有規格）攤平應成功');
    expect(existsSync(join(out, '_spec', 'agent-restricted-mode.md')), '規格應複製到 _spec/');
    const r = mCheck(src, out);
    expect(r.code === 1 && r.st('f-restricted-mode') === 'fail' && r.detail('f-restricted-mode').includes('n8n-api-bridge：SKILL.md 沒有「受限 Agent 模式」小節標題'), `有規格但 Skill 缺小節：f 項應失敗\n${r.detail('f-restricted-mode')}`);
    expect(r.detail('f-restricted-mode').includes('沒有引用 spec/agent-restricted-mode.md'), '有規格但 Skill 沒引用規格路徑：應指出');
  }
  {
    // 有規格且小節完整：通過；之後把規格從 bundle 拿掉：失敗
    const src = mini('mini-spec-ok');
    put(src, 'spec/agent-restricted-mode.md', '# 受限 Agent 模式規格\n');
    appendFileSync(join(src, 'skills/tigerai/n8n-api-bridge/SKILL.md'), '\n## 受限 Agent 模式\n\n規格見 spec/agent-restricted-mode.md。\n');
    const out = fresh('mout');
    expect(mFlat(src, out).code === 0, '迷你 Pack（規格與小節齊全）攤平應成功');
    const r = mCheck(src, out);
    expect(r.code === 0 && r.st('f-restricted-mode') === 'pass', `規格與小節齊全：f 項應通過\n${r.out}`);
    rmSync(join(out, '_spec'), { recursive: true });
    const r2 = mCheck(src, out);
    expect(r2.code === 1 && r2.detail('f-restricted-mode').includes('bundle 缺少 _spec/agent-restricted-mode.md'), '規格沒有隨附：f 項應失敗');
    // 引用區塊的粗體標題與英文標題也接受
    writeFileSync(join(src, 'skills/tigerai/n8n-api-bridge/SKILL.md'), '---\nname: n8n-api-bridge\ndescription: b\n---\n> **受限 Agent 模式（Portal）：寫入停用。** 見 spec/agent-restricted-mode.md\n');
    const outA = fresh('mout');
    mFlat(src, outA);
    expect(mCheck(src, outA).st('f-restricted-mode') === 'pass', '以粗體引用區塊標示受限 Agent 模式：應接受');
    writeFileSync(join(src, 'skills/tigerai/n8n-api-bridge/SKILL.md'), '---\nname: n8n-api-bridge\ndescription: b\n---\n## Restricted Agent mode (Portal)\n\nSee ../../../spec/agent-restricted-mode.en.md\n');
    const outB = fresh('mout');
    mFlat(src, outB);
    expect(mCheck(src, outB).st('f-restricted-mode') === 'pass', '英文標題 Restricted Agent mode 與 .en.md 引用：應接受');
    // 只提到小節標題、沒有放在標題上（散文中提到）不算
    writeFileSync(join(src, 'skills/tigerai/n8n-api-bridge/SKILL.md'), '---\nname: n8n-api-bridge\ndescription: b\n---\n文中提到受限 Agent 模式與 spec/agent-restricted-mode.md\n');
    const out2 = fresh('mout');
    mFlat(src, out2);
    expect(mCheck(src, out2).detail('f-restricted-mode').includes('沒有「受限 Agent 模式」小節標題'), '只在散文提到而沒有標題：應失敗');
  }
  {
    // 白名單不含需要受限模式的 Skill：通過（有規格也一樣）
    const src = mini('mini-spec-na');
    put(src, 'spec/agent-restricted-mode.md', '# x\n');
    const a = fresh('allow') + '.json';
    writeFileSync(a, JSON.stringify({ skills: ['n8n-foo-official'] }));
    const out = fresh('mout');
    run(flatten, '--allowlist', a, '--out', out, '--source', src, '--stamp', 's');
    const r = doCheck(out, ['--source', src, '--allowlist', a]);
    expect(r.code === 0 && r.st('f-restricted-mode') === 'pass', `白名單不含需受限模式的 Skill：f 項應通過\n${r.out}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`FAIL：${failures.length} / ${checks} 項不符`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK：portal bundle 測試 ${checks} 項全部符合預期`);

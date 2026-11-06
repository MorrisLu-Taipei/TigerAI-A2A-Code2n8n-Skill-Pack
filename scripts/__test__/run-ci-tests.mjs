#!/usr/bin/env node
// scripts/ci/ 的回歸測試與 meta 測試（只用 Node 內建模組）。
// 用法：
//   node scripts/__test__/run-ci-tests.mjs                         只跑靜態部分（不需要 docker 或 n8n）
//   node scripts/__test__/run-ci-tests.mjs --with-n8n [--n8n-versions "2.37.3 2.44.6 2.46.6"]
//                                                                  另跑動態部分：用 scripts/ci/matrix.sh 起拋棄式容器（映像要先存在本機）
// 動態部分用 matrix.sh --offline（容器 --network none，不對外連線）。
// 檔名與預期結果寫在 scripts/__test__/expected.json。夾具內的 __FAKE_SECRET__ 在暫存目錄展開成假金鑰，不會出現在 repo 裡。
// 印一行摘要；退出碼 0 全過、1 有失敗。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const fixtureDir = join(here, 'ci-fixtures');
const checker = join(root, 'scripts', 'ci', 'check-workflows.mjs');
const expected = JSON.parse(readFileSync(join(here, 'expected.json'), 'utf8'));

const args = process.argv.slice(2);
const withN8n = args.includes('--with-n8n');
const vi = args.indexOf('--n8n-versions');
const n8nVersions = (vi >= 0 ? args[vi + 1] : '2.37.3 2.44.6 2.46.6').split(/\s+/).filter(Boolean);

const failures = [];
const counts = { static: 0, dynamic: 0 };
let section = 'static';
function expect(cond, msg) { counts[section]++; if (!cond) failures.push(`[${section}] ${msg}`); }

const sameSet = (a, b) => [...new Set(a)].sort().join('|') === [...new Set(b)].sort().join('|');
const FAKE_SECRET = ['sk', 'FAKE'.repeat(6)].join('-');
const ALLOWED_CODES = new Set(['JSON_INVALID', 'STRUCTURE_INVALID', 'SECRET_DETECTED', 'MALICIOUS_CODE', 'CREDENTIAL_PLAINTEXT',
  'NODE_NOT_FOUND', 'NODE_DEPRECATED', 'TYPEVERSION_INVALID', 'CREDENTIAL_MISSING', 'WEBHOOK_PATH_CONFLICT']);

const tmpRoot = mkdtempSync(join(tmpdir(), 'ci-tests-'));
let seq = 0;
const mkdir = () => { const d = join(tmpRoot, `d${seq++}`); mkdirSync(d, { recursive: true }); return d; };

function stage(files) {
  const d = mkdir();
  for (const f of files) {
    writeFileSync(join(d, f), readFileSync(join(fixtureDir, f), 'utf8').replaceAll('__FAKE_SECRET__', FAKE_SECRET));
  }
  return d;
}

function check(dir, extra = [], { map = true, target = expected.target } = {}) {
  const out = join(dir, '..', `r${seq++}.json`);
  const cm = join(dir, '..', `c${seq++}.md`);
  const mapFile = join(dir, '..', `m${seq++}.json`);
  writeFileSync(mapFile, JSON.stringify(expected.credentialMap));
  const argv = [checker, '--dir', dir, '--target-version', target, '--out', out, '--comment', cm, ...(map ? ['--credential-map', mapFile] : []), ...extra];
  const r = spawnSync(process.execPath, argv, { cwd: root, encoding: 'utf8' });
  return {
    code: r.status, text: (r.stdout ?? '') + (r.stderr ?? ''),
    report: existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null,
    comment: existsSync(cm) ? readFileSync(cm, 'utf8') : null,
  };
}

const lib = await import(pathToFileURL(join(root, 'scripts', 'ci', 'lib.mjs')).href);
const run0 = (...a) => spawnSync(process.execPath, [checker, '--dir', fixtureDir, '--target-version', expected.target, ...a], { cwd: root, encoding: 'utf8' }).status;

try {
  // ---- 夾具與預期互相對得上 ---------------------------------------------------
  const onDisk = readdirSync(fixtureDir).filter(f => f.endsWith('.json')).sort();
  const listed = Object.keys(expected.static).sort();
  expect(sameSet(onDisk, listed), `夾具與 expected.json 的 static 清單不一致：${onDisk.filter(f => !listed.includes(f)).concat(listed.filter(f => !onDisk.includes(f))).join('、')}`);
  expect(onDisk.filter(f => f.startsWith('pass-')).length >= 3, 'pass-* 夾具少於 3 個');
  expect(onDisk.some(f => f.startsWith('advisory-')), '沒有 advisory-* 夾具');
  for (const f of onDisk) {
    const raw = readFileSync(join(fixtureDir, f), 'utf8');
    expect(!/sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(raw), `${f}：夾具含有金鑰樣式`);
    expect(!/\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/.test(raw), `${f}：夾具含有內網位址`);
  }

  // ---- 逐檔：每個 fail-* 恰好得到預期阻擋碼；pass-*／advisory-* 退出碼 0 -------------
  for (const [file, exp] of Object.entries(expected.static)) {
    const r = check(stage([file, ...(exp.with ?? [])]));
    const here_ = r.report?.blocking.filter(b => b.file === file) ?? [];
    const codes = here_.map(b => b.code);
    expect(r.report !== null, `${file}：沒有產生 ci-report.json\n${r.text}`);
    if (!r.report) continue;
    expect(r.report.status === exp.status, `${file}：status 應為 ${exp.status}，實際 ${r.report.status}`);
    expect(r.code === (exp.status === 'pass' ? 0 : 1), `${file}：退出碼應為 ${exp.status === 'pass' ? 0 : 1}，實際 ${r.code}`);
    expect(sameSet(codes, exp.blocking), `${file}：阻擋碼應為 [${exp.blocking}]，實際 [${[...new Set(codes)]}]`);
    expect(r.report.blocking.every(b => ALLOWED_CODES.has(b.code)), `${file}：出現不在清單內的阻擋碼`);
    if (exp.advisories) {
      const adv = r.report.advisories.filter(a => a.file === file).map(a => `${a.source}:${a.rule}`);
      expect(sameSet(adv, exp.advisories), `${file}：建議項應為 [${exp.advisories}]，實際 [${adv}]`);
    }
    if (exp.status === 'pass') {
      expect(r.report.blocking.length === 0, `${file}：pass 的檔案不應有阻擋項`);
      expect(r.report.counts.blocking === 0, `${file}：counts.blocking 應為 0`);
    }
  }

  // ---- 整批：全部夾具放在同一個目錄 -----------------------------------------------
  const all = check(stage(onDisk));
  expect(all.code === 1 && all.report?.status === 'fail', `整批：應為 fail／退出碼 1，實際 ${all.code}`);
  for (const [file, exp] of Object.entries(expected.static)) {
    const codes = (all.report?.blocking ?? []).filter(b => b.file === file).map(b => b.code);
    expect(sameSet(codes, exp.blocking), `整批：${file} 阻擋碼應為 [${exp.blocking}]，實際 [${[...new Set(codes)]}]`);
  }
  expect(all.report.counts.files === onDisk.length, '整批：counts.files 與檔案數不符');

  // ---- 建議項永遠不會讓狀態變 fail ---------------------------------------------------
  const okFiles = onDisk.filter(f => f.startsWith('pass-') || f.startsWith('advisory-'));
  const advFiles = onDisk.filter(f => f.startsWith('advisory-'));
  const adv = check(stage(advFiles));
  expect(adv.code === 0 && adv.report?.status === 'pass', `advisory 整批：應為 pass／退出碼 0，實際 ${adv.code}`);
  expect(adv.report.advisories.length >= advFiles.length, 'advisory 整批：建議項數量少於檔案數');
  expect(adv.report.blocking.length === 0, 'advisory 整批：不應有阻擋項');
  const ok = check(stage(okFiles));
  expect(ok.code === 0 && ok.report?.status === 'pass', `pass＋advisory 整批：應為 pass／退出碼 0，實際 ${ok.code}\n${ok.text}`);
  expect(ok.comment.split('\n')[0].includes('建議項不會讓 CI 失敗'), '註解第一行應說明建議項不會讓 CI 失敗');
  expect(!ok.comment.includes('### 阻擋項'), 'pass 的註解不應有阻擋項區塊');
  expect(ok.comment.includes('### 建議項') && ok.comment.includes('資安護欄') && ok.comment.includes('原生節點'), 'pass 的註解應列出資安護欄與原生節點建議');
  // 建議項與阻擋項同批：阻擋項數量不因建議項增加
  const mixed = check(stage([...advFiles, 'fail-function-node.workflow.json']));
  expect(mixed.report?.blocking.length === 1 && mixed.report.blocking[0].code === 'NODE_DEPRECATED', 'advisory 與 fail 同批：阻擋項應只有 NODE_DEPRECATED 一項');

  // ---- hidden 舊節點只是建議；deprecated 才是阻擋 ----------------------------------------------
  const hid = check(stage(['advisory-hidden-legacy-node.workflow.json']));
  expect(hid.code === 0 && hid.report.status === 'pass' && hid.report.blocking.length === 0, 'hidden 舊節點：應為 pass 且沒有阻擋項');
  const hadv = hid.report.advisories.find(a => a.rule === 'node:hidden-legacy');
  expect(hadv && hadv.node === 'Remove Duplicates' && /已隱藏.*舊節點.*不使檢查失敗/.test(hadv.message), 'hidden 舊節點：建議項的節點名稱或訊息不對');
  expect(hid.comment.includes('node:hidden-legacy') && hid.comment.includes('### 建議項') && !hid.comment.includes('### 阻擋項'), 'hidden 舊節點：註解的建議區應列出 node:hidden-legacy，且沒有阻擋區塊');
  const dep = check(stage(['fail-function-node.workflow.json']));
  expect(dep.code === 1 && dep.report.blocking.some(b => b.code === 'NODE_DEPRECATED') && !dep.report.advisories.some(a => a.rule === 'node:hidden-legacy'), 'deprecated 且 hidden 的節點：只應是 NODE_DEPRECATED 阻擋，不重複列為 hidden 建議');

  // ---- credentials:missing-field（建議，不阻擋） ----------------------------------------------------
  const cf = check(stage(['advisory-credential-field-missing.workflow.json']));
  expect(cf.code === 0 && cf.report.status === 'pass' && cf.report.blocking.length === 0, 'credentials:missing-field：應為 pass 且沒有阻擋項');
  const cfa = cf.report.advisories.filter(a => a.rule === 'credentials:missing-field');
  expect(cfa.length === 1 && cfa[0].node === 'Send message' && /telegramApi/.test(cfa[0].message) && /待補憑證/.test(cfa[0].message) && /可能誤報/.test(cfa[0].message), 'credentials:missing-field：建議項的節點或訊息不對');
  expect(cf.comment.includes('憑證欄位（建議）') && cf.comment.includes('credentials:missing-field') && !cf.comment.includes('### 阻擋項'), 'credentials:missing-field：註解的建議區應列出該規則');
  const cx = check(stage(['pass-credential-field-exempt.workflow.json']));
  expect(cx.code === 0 && !cx.report.advisories.some(a => a.rule === 'credentials:missing-field'), 'credentials:missing-field：有 credentials 欄位、authentication 為 none、已停用的節點都不應被提醒');
  const cmix = check(stage(['advisory-credential-field-missing.workflow.json', 'fail-function-node.workflow.json']));
  expect(cmix.report.blocking.length === 1 && cmix.report.blocking[0].code === 'NODE_DEPRECATED', 'credentials:missing-field 與 fail 同批：阻擋項不因此增加');

  // ---- 外連網域／高影響動作／修改記錄（ADR-014：建議，不阻擋） ---------------------------------------------------
  const rem = stage(['advisory-egress-impact-changelog.workflow.json']);
  const remF = 'advisory-egress-impact-changelog.workflow.json';
  const rr = check(rem);
  const ra = rule => rr.report.advisories.filter(a => a.rule === rule);
  expect(rr.code === 0 && rr.report.status === 'pass' && rr.report.blocking.length === 0, '三條提醒：應為 pass、沒有阻擋項');
  expect(ra('egress:external-domain').length === 1 && /api\.example\.invalid/.test(ra('egress:external-domain')[0].message) && /請核准人確認這些網域是否在允許清單內/.test(ra('egress:external-domain')[0].message), 'egress:external-domain：建議項要列出網域並提醒核准人');
  expect(ra('impact:high-impact-node').length === 1 && ra('impact:high-impact-node')[0].node === 'Create item' && /POST/.test(ra('impact:high-impact-node')[0].message) && /特別確認/.test(ra('impact:high-impact-node')[0].message), 'impact:high-impact-node：建議項要指出節點與動作');
  expect(ra('notes:missing-change-log').length === 1 && /修改記錄/.test(ra('notes:missing-change-log')[0].message), 'notes:missing-change-log：建議項要提到修改記錄');
  expect(rr.report.advisories.filter(a => a.file === remF).every(a => a.source === 'security-scan'), '三條提醒：來源應為 security-scan');
  expect(['egress:external-domain', 'impact:high-impact-node', 'notes:missing-change-log'].every(r => rr.comment.includes(r)) && rr.comment.includes('資安護欄（建議）') && !rr.comment.includes('### 阻擋項'), '三條提醒：註解的建議區應列出且沒有阻擋區塊');
  expect(!(rr.text + rr.comment).includes('/v1/items'), '三條提醒：輸出只寫網域，不寫網址路徑');
  const rmap = check(rem, ['--egress-allow', 'other.example.invalid,*.example.invalid']);
  expect(rmap.code === 0 && !rmap.report.advisories.some(a => a.rule === 'egress:external-domain') && rmap.report.advisories.some(a => a.rule === 'impact:high-impact-node'), '--egress-allow：萬用字元涵蓋的網域不再提醒，其他兩條不受影響，退出碼仍為 0');
  const rbare = check(rem, ['--egress-allow', 'example.invalid']);
  expect(rbare.report.advisories.some(a => a.rule === 'egress:external-domain' && /不在允許清單/.test(a.message)), '--egress-allow：裸網域不涵蓋子網域，提醒改為「不在允許清單」');
  const allowFile = join(tmpRoot, 'egress-allow.txt');
  writeFileSync(allowFile, '# 核准的外連網域\napi.example.invalid\n');
  const rfile = check(rem, ['--egress-allow-file', allowFile]);
  expect(rfile.code === 0 && !rfile.report.advisories.some(a => a.rule === 'egress:external-domain'), '--egress-allow-file：檔案內的網域不再提醒');
  const renv = spawnSync(process.execPath, [checker, '--dir', rem, '--target-version', expected.target], { cwd: root, encoding: 'utf8', env: { ...process.env, SKILLPACK_EGRESS_ALLOW: 'api.example.invalid' } });
  expect(renv.status === 0 && !/egress:external-domain/.test(renv.stdout), 'SKILLPACK_EGRESS_ALLOW 環境變數會傳給資安掃描');
  expect(run0('--egress-allow-file', join(tmpRoot, 'nope.txt')) === 2, '--egress-allow-file 讀不到檔案：退出碼應為 2');
  expect(run0('--egress-allow') === 2, '--egress-allow 缺值：退出碼應為 2');
  const rmix = check(stage([remF, 'fail-function-node.workflow.json']));
  expect(rmix.report.blocking.length === 1 && rmix.report.blocking[0].code === 'NODE_DEPRECATED', '三條提醒與 fail 同批：阻擋項不因此增加');

  // ---- sub-workflow 引用 ------------------------------------------------------------------------
  const sub = stage(['advisory-unknown-subworkflow.workflow.json']);
  const sub1 = check(sub);
  expect(sub1.code === 0 && sub1.report.advisories.some(a => a.rule === 'workflow:unknown-subworkflow-reference' && a.node === 'Run Sub-workflow'), '找不到的 sub-workflow：應為建議項且退出碼 0');
  const sub2 = check(sub, ['--existing-workflow-ids', '["ci-missing-sub-0001"]']);
  expect(sub2.code === 0 && !sub2.report.advisories.some(a => a.rule === 'workflow:unknown-subworkflow-reference'), '--existing-workflow-ids 列出該 id：不應再提示');
  expect(run0('--existing-workflow-ids', '{"a":1}') === 2, '--existing-workflow-ids 格式錯：退出碼應為 2');

  // ---- 對外註冊型觸發節點（靜態只提醒） ------------------------------------------------------------
  const ext = check(stage(['advisory-external-trigger.workflow.json']));
  expect(ext.code === 0 && ext.report.blocking.length === 0, '外部註冊型觸發：應為 pass');
  const eadv = ext.report.advisories.find(a => a.rule === 'trigger:external-registration');
  expect(eadv && eadv.node === 'Telegram Trigger' && /無法在無網路測試環境驗證啟用.*staging/.test(eadv.message), '外部註冊型觸發：建議項的節點或訊息不對');
  expect(!check(stage(['pass-webhook-echo.workflow.json', 'pass-schedule-http.workflow.json', 'pass-manual-set.workflow.json'])).report.advisories.some(a => a.rule === 'trigger:external-registration'), 'webhook／排程／手動觸發不應被當成外部註冊型');

  // ---- 啟用失敗分類（訊息取自實測，見 docs/ci-for-n8n-workflows.md） -----------------------------------
  const N = (...types) => types.map((t, i) => ({ name: `n${i}`, type: t }));
  const cases = [
    ['Cannot publish workflow: 1 node have configuration issues:\n\nNode "N":\n  - Missing or invalid required parameters: fieldToSplitOut', N('n8n-nodes-base.webhook'), 'structural'],
    ['Cannot publish workflow: 1 node have configuration issues:\n\nNode "T":\n  - Missing required credential: telegramApi', N('n8n-nodes-base.telegramTrigger'), 'credential'],
    ['Cannot publish workflow: Credential "nope" no longer exists. Update the node to use a different credential.', N('n8n-nodes-base.webhook'), 'credential'],
    ['Node type "if" is not available in version 2.4. Available versions: 1, 2, 2.1, 2.2, 2.3. Use the latest version 2.3.', N('n8n-nodes-base.if'), 'structural'],
    ['Cannot use a "n8n-nodes-base.function" node ("Old Function"): this node type is deprecated. Replace the node with a supported alternative or remove it from the workflow.', N('n8n-nodes-base.function'), 'structural'],
    ['The DNS server returned an error, perhaps the server is offline', N('n8n-nodes-base.telegramTrigger'), 'external'],
    ['The resource you are requesting could not be found', N('n8n-nodes-base.telegramTrigger'), 'external'],
    ['The Webhook can not work on "localhost". Please setup n8n on a custom domain.', N('n8n-nodes-base.githubTrigger'), 'external'],
    ['There was a problem activating the workflow: "getaddrinfo EAI_AGAIN imap.invalid"', N('n8n-nodes-base.emailReadImap'), 'external'],
    ['There was a problem activating the workflow: "getaddrinfo ENOTFOUND imap.invalid"', N('n8n-nodes-base.emailReadImap'), 'external'],
    ['Request failed with status code 401', N('n8n-nodes-base.slackTrigger'), 'external'],
    ['connect ECONNREFUSED 127.0.0.1:443', N('n8n-nodes-base.webhook'), 'unknown'],
    ['The DNS server returned an error, perhaps the server is offline', N('n8n-nodes-base.webhook', 'n8n-nodes-base.set'), 'unknown'],
    ['Something went wrong', N('n8n-nodes-base.githubTrigger'), 'unknown'],
    ['', N('n8n-nodes-base.webhook'), 'unknown'],
  ];
  for (const [msg, nodes, want] of cases) {
    const got = lib.classifyActivation(msg, nodes);
    expect(got === want, `啟用失敗分類：「${msg.replace(/\s+/g, ' ').slice(0, 60)}」應為 ${want}，實際 ${got}`);
  }
  expect(lib.isExternalTrigger('n8n-nodes-base.telegramTrigger') && lib.isExternalTrigger('n8n-nodes-base.emailReadImap') && lib.isExternalTrigger('n8n-nodes-base.githubTrigger'), 'isExternalTrigger：Telegram、GitHub、IMAP 應為外部註冊型');
  expect(!['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook', 'n8n-nodes-base.executeWorkflowTrigger', '@n8n/n8n-nodes-langchain.chatTrigger'].some(lib.isExternalTrigger), 'isExternalTrigger：本機型觸發不應被判為外部註冊型');

  // ---- PR 註解防注入 ----------------------------------------------------------------------------------
  const hostile = join(mkdir(), 'x');
  mkdirSync(hostile);
  const evilFile = 'a[x](http:__evil)`<b>@admin.json';
  writeFileSync(join(hostile, evilFile), readFileSync(join(fixtureDir, 'fail-hostile-names.workflow.json'), 'utf8'));
  writeFileSync(join(hostile, `${'L'.repeat(230)}.json`), readFileSync(join(fixtureDir, 'fail-hostile-names.workflow.json'), 'utf8'));
  const hr = check(hostile);
  expect(hr.code === 1 && hr.report !== null && hr.comment !== null, '惡意名稱：應能產生報告與註解且 fail');
  const cm = hr.comment;
  for (const bad of ['](http', '[x]', '@admin', '@all', 'www.evil', '://evil', 'A'.repeat(201), 'L'.repeat(201)]) {
    expect(!cm.includes(bad), `惡意名稱：註解仍含未跳脫的「${bad.slice(0, 20)}」`);
  }
  expect(!/^## 假標題/m.test(cm) && !cm.split('\n').some(l => /^\s*#+ 假標題/.test(l)), '惡意名稱：換行不應讓內容成為獨立的標題');
  expect(!/(?<!\\)[<>]/.test(cm.replace(/^> .*$/m, '')), '惡意名稱：註解不應有未跳脫的角括號');
  expect(!/(?<![\\])\[[^\]]*\]\(/.test(cm), '惡意名稱：註解不應有可形成連結的 [文字](網址)');
  expect(cm.split('\n').every(l => l.length < 2500), '惡意名稱：單行過長');
  const fieldLens = [...hr.report.blocking, ...hr.report.advisories].flatMap(x => [x.file, x.node, x.message]).filter(Boolean).map(v => v.length);
  expect(Math.max(...fieldLens) <= 201, `惡意名稱：報告欄位長度應限制在 200 字元內（最長 ${Math.max(...fieldLens)}）`);
  expect([...hr.report.blocking, ...hr.report.advisories].every(x => ![x.file, x.node, x.message].some(v => /[\r\n]/.test(v ?? ''))), '惡意名稱：報告欄位不應含換行');
  expect(/\\\[b\\\]\\\(c\\\) \\<d\\> \\`e\\`/.test(lib.mdText('[b](c) <d> `e`')), 'mdText：方括號、圓括號、角括號與反引號應被反斜線跳脫');
  expect(!lib.mdText('@admin').includes('@admin') && lib.mdText('x'.repeat(500)).length <= 201, 'mdText：@mention 要被拆開、長度要被限制');

  // ---- 三態結果（通過／未完成／失敗）與註解 ---------------------------------------------------------------
  const rf = n => lib.finalizeReport(JSON.parse(readFileSync(join(here, 'ci-report-fixtures', n), 'utf8')));
  const rp = rf('pass.report.json'), rfail = rf('fail.report.json'), rinc = rf('incomplete-timeout.report.json');
  const runk = rf('incomplete-unknown.report.json'), rboth = rf('fail-and-incomplete.report.json');
  expect(rp.status === 'pass' && rfail.status === 'fail' && rinc.status === 'incomplete' && runk.status === 'incomplete', '三態：finalizeReport 的 status 不對');
  expect(rboth.status === 'fail', '三態：有阻擋項時即使未完成也應為 fail');
  expect(rinc.counts.incomplete === 1 && rinc.counts.blocking === 0 && rp.counts.incomplete === 0, '三態：counts.incomplete 不對');
  const cPass = lib.renderComment(rp), cFail = lib.renderComment(rfail), cInc = lib.renderComment(rinc), cUnk = lib.renderComment(runk), cBoth = lib.renderComment(rboth);
  expect(cPass.includes('結果：通過') && !cPass.includes('未完成') && !cPass.includes('結果：失敗'), '三態：pass 的註解應顯示通過');
  expect(cFail.includes('結果：失敗') && !cFail.includes('結果：通過'), '三態：fail 的註解應顯示失敗');
  expect(cInc.includes('結果：未完成') && cInc.includes('需重跑或人工複核') && !cInc.includes('結果：通過') && !cInc.includes('結果：失敗'), '三態：incomplete 的註解應顯示未完成，不得顯示通過');
  expect(cInc.includes('### 未完成項') && cInc.includes('workflow-timeout') && cInc.includes('### 建議項'), '三態：未完成的註解應列出未完成項與建議項');
  expect(cUnk.includes('結果：未完成') && cUnk.includes('activate-unverified-unknown'), '三態：啟用失敗無法歸類也應顯示未完成');
  expect(cBoth.includes('結果：失敗') && cBoth.includes('### 未完成項') && cBoth.indexOf('### 阻擋項') < cBoth.indexOf('### 未完成項'), '三態：失敗且未完成時，結果為失敗並仍列出未完成項');
  for (const c of [cPass, cFail, cInc, cUnk, cBoth]) expect(c.split('\n')[0].includes('建議項不會讓 CI 失敗'), '三態：註解第一行都應有建議項說明');
  expect(cInc.includes('多版本對照（建議）') && !cInc.includes('#### matrix'), 'matrix 來源的建議項應顯示中文標題，不是原始鍵值');
  for (const src of ['security-scan', 'native-first', 'node-catalog', 'workflow-refs', 'activation', 'credentials', 'matrix', 'n8n-run', 'ci']) {
    const c = lib.renderComment(lib.finalizeReport({ target: '2.44.6', blocking: [], advisories: [{ source: src, rule: 'x:y', file: 'f.json', node: null, message: 'm' }], counts: { files: 1 } }));
    expect(!c.includes(`#### ${src}`), `來源 ${src}：註解的標題不應是原始鍵值`);
  }

  // ---- 報告格式與註解 ------------------------------------------------------------------
  const rep = all.report;
  expect(['status', 'target', 'blocking', 'advisories', 'counts'].every(k => k in rep), '報告缺少必要欄位');
  expect(rep.target === expected.target, '報告 target 不符');
  expect(rep.blocking.every(b => ['code', 'file', 'node', 'message'].every(k => k in b)), 'blocking 項目欄位不齊');
  expect(rep.advisories.every(a => ['source', 'rule', 'file', 'node', 'message'].every(k => k in a)), 'advisories 項目欄位不齊');
  expect(rep.counts.blocking === rep.blocking.length && rep.counts.advisories === rep.advisories.length, 'counts 與陣列長度不符');
  expect(all.comment.split('\n')[0].includes('建議項不會讓 CI 失敗'), '含阻擋項的註解第一行也應有建議項說明');
  expect(all.comment.includes('### 阻擋項') && all.comment.indexOf('### 阻擋項') < all.comment.indexOf('### 建議項'), '註解應先列阻擋項再列建議項');

  // ---- 不洩漏疑似機密 ----------------------------------------------------------------
  const sec = check(stage(['fail-secret.workflow.json']));
  const everything = sec.text + JSON.stringify(sec.report) + sec.comment;
  expect(!everything.includes(FAKE_SECRET) && !everything.includes('FAKEFAKEFAKE'), 'fail-secret：輸出、報告或註解含有假金鑰原文');
  const pw = check(stage(['fail-credential-plaintext.workflow.json']));
  expect(!(pw.text + JSON.stringify(pw.report) + pw.comment).includes('not-a-real-password'), 'fail-credential-plaintext：輸出含有明文欄位內容');
  const bad = check(stage(['fail-json-invalid.workflow.json']));
  expect(!(bad.text + JSON.stringify(bad.report)).includes('ci-fixture fail invalid json'), 'fail-json-invalid：輸出含有檔案內容片段');

  // ---- webhook 與既有清單比對、憑證清單參數 ------------------------------------------------
  const one = stage(['pass-webhook-echo.workflow.json']);
  const ex1 = check(one, ['--existing-webhook-paths', '["POST /ci-fixture-echo"]']);
  expect(ex1.code === 1 && ex1.report.blocking.some(b => b.code === 'WEBHOOK_PATH_CONFLICT'), '既有 webhook 清單：同方法同 path 應為 WEBHOOK_PATH_CONFLICT');
  const ex2 = check(one, ['--existing-webhook-paths', '["GET ci-fixture-echo"]']);
  expect(ex2.code === 0, '既有 webhook 清單：不同 HTTP 方法不應衝突');
  const ex3 = check(one, ['--existing-webhook-paths', '["ci-fixture-echo/"]']);
  expect(ex3.code === 1, '既有 webhook 清單：未標方法的項目視為任何方法，應衝突');
  const nomap = check(one, [], { map: false });
  expect(nomap.code === 0 && nomap.report.advisories.some(a => a.rule === 'credential-map-not-provided'), '未提供 --credential-map：應略過檢查並以建議項說明');
  const inlineMap = check(one, ['--credential-map', '{"httpHeaderAuth":["only-this-one"]}'], { map: false });
  expect(inlineMap.code === 1 && inlineMap.report.blocking.some(b => b.code === 'CREDENTIAL_MISSING'), '行內 JSON 的 --credential-map：名稱不在清單應為 CREDENTIAL_MISSING');

  // 受限 Agent 模式：STUB 假憑證在提供 credentialMap 時一律被擋；未提供清單時此檢查略過（所以宿主必須提供）
  const stub = check(stage(['fail-stub-credential.workflow.json']));
  expect(stub.code === 1 && stub.report.blocking.some(b => b.code === 'CREDENTIAL_MISSING' && /STUB-openAiApi/.test(b.message ?? '')), 'STUB 假憑證：應為 CREDENTIAL_MISSING 且訊息點名該憑證名稱');
  const stubNoMap = check(stage(['fail-stub-credential.workflow.json']), [], { map: false });
  expect(stubNoMap.code === 0 && stubNoMap.report.advisories.some(a => a.rule === 'credential-map-not-provided'), 'STUB 假憑證：未提供 --credential-map 時不會被擋，僅以建議項說明（受限模式要求宿主一定提供）');

  // ---- 使用錯誤與缺少版本目錄 ---------------------------------------------------------------
  const run = (...a) => spawnSync(process.execPath, [checker, ...a], { cwd: root, encoding: 'utf8' });
  expect(run().status === 2, '沒有參數：退出碼應為 2');
  expect(run('--dir', one).status === 2, '缺少 --target-version：退出碼應為 2');
  expect(run('--target-version', expected.target).status === 2, '缺少 --dir：退出碼應為 2');
  expect(run('--dir', join(tmpRoot, 'nope'), '--target-version', expected.target).status === 2, '目錄不存在：退出碼應為 2');
  expect(run('--dir', one, '--target-version', expected.target, '--bogus').status === 2, '未知選項：退出碼應為 2');
  const nv = run('--dir', one, '--target-version', '9.9.9');
  expect(nv.status === 2 && /node-versions\/9\.9\.9\.json/.test(nv.stderr), '找不到版本目錄：應以退出碼 2 並指出 docs/node-versions/<版本>.json');
  expect(run('--dir', one, '--target-version', expected.target, '--credential-map', '{"a":1}').status === 2, '憑證清單格式錯：退出碼應為 2');

  // ---- 動態部分 ----------------------------------------------------------------------------
  if (withN8n) {
    section = 'dynamic';
    const dyn = expected.dynamic;
    const dir = stage(Object.keys(dyn));
    const outDir = mkdir();
    const dockerPs = () => (spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout ?? '').split('\n').filter(n => n.startsWith('ci-matrix-'));
    const before = dockerPs();
    const m = spawnSync('bash', [join(root, 'scripts', 'ci', 'matrix.sh'), '--dir', dir, '--versions', n8nVersions.join(' '), '--out-dir', outDir, '--offline'],
      { cwd: root, encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    const mtext = (m.stdout ?? '') + (m.stderr ?? '');
    expect(m.status === 0 || m.status === 1, `matrix.sh 非預期退出碼 ${m.status}\n${mtext.slice(-1500)}`);
    expect(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(mtext), 'matrix.sh 輸出含有疑似 token');
    for (const v of n8nVersions) {
      const f = join(outDir, `ci-report-${v}.json`);
      expect(existsSync(f), `${v}：沒有產生 ci-report`);
      if (!existsSync(f)) continue;
      const raw = readFileSync(f, 'utf8');
      expect(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(raw), `${v}：報告含有疑似 token`);
      const rep2 = JSON.parse(raw);
      expect(rep2.cleanup.workflowsCreated === rep2.cleanup.workflowsDeleted + rep2.cleanup.workflowsAbandoned && rep2.cleanup.credentialsCreated === rep2.cleanup.credentialsDeleted, `${v}：建立數量應等於刪除加放棄的數量`);
      expect(rep2.cleanup.disposable === true && rep2.cleanup.holdActive === false, `${v}：matrix.sh 預設應使用 --disposable，且不使用 --hold-active`);
      expect(rep2.status === 'pass' || rep2.status === 'fail', `${v}：整批夾具不應是 incomplete（實際 ${rep2.status}）`);
      expect(rep2.cleanup.workflowsCreated > 0, `${v}：沒有建立任何 workflow`);
      for (const [file, exp0] of Object.entries(dyn)) {
        const exp = { ...exp0, ...(exp0.overrides?.[v] ?? {}) };
        const d = rep2.dynamic.find(x => x.file === file);
        expect(d !== undefined, `${v} ${file}：報告沒有這個檔案`);
        if (!d) continue;
        expect(d.import === exp.import, `${v} ${file}：匯入應為 ${exp.import}，實際 ${d.import}`);
        expect(d.activate === exp.activate, `${v} ${file}：啟用應為 ${exp.activate}，實際 ${d.activate}`);
      }
      const codes = rep2.blocking.map(b => b.code);
      expect(codes.every(c => ['IMPORT_FAILED', 'ACTIVATE_FAILED', 'WEBHOOK_PATH_CONFLICT'].includes(c)), `${v}：動態阻擋碼超出預期`);
      expect(rep2.advisories.every(a => a.source === 'n8n-run'), `${v}：動態報告的建議項來源應為 n8n-run`);
    }
    // 逾時：極短的 --workflow-timeout 應只產生建議項 workflow:timeout，不算失敗，且清理完整
    const tdir = stage(['pass-webhook-echo.workflow.json', 'pass-schedule-http.workflow.json']);
    const tout = mkdir();
    const tv = n8nVersions.includes('2.44.6') ? '2.44.6' : n8nVersions[0];
    const tm = spawnSync('bash', [join(root, 'scripts', 'ci', 'matrix.sh'), '--dir', tdir, '--versions', tv, '--out-dir', tout, '--offline', '--workflow-timeout', '0.001'],
      { cwd: root, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    expect(tm.status === 0, `逾時測試：matrix.sh 應以 0 結束，實際 ${tm.status}\n${((tm.stdout ?? '') + (tm.stderr ?? '')).slice(-800)}`);
    const tf = join(tout, `ci-report-${tv}.json`);
    expect(existsSync(tf), '逾時測試：沒有產生報告');
    if (existsSync(tf)) {
      const tr = JSON.parse(readFileSync(tf, 'utf8'));
      expect(tr.status === 'incomplete' && tr.blocking.length === 0 && tr.counts.incomplete === 2, `逾時測試：逾時不應產生阻擋項，狀態應為 incomplete（實際 ${tr.status}）`);
      expect(tr.incomplete.every(x => x.reason === 'workflow-timeout'), '逾時測試：未完成原因應為 workflow-timeout');
      const tc = lib.renderComment(tr);
      expect(tc.includes('結果：未完成') && !tc.includes('結果：通過'), '逾時測試：註解不得顯示通過');
      expect(tr.advisories.filter(a => a.rule === 'workflow:timeout').length === 2, '逾時測試：每個逾時的 workflow 應有一則 workflow:timeout 建議項');
      expect(tr.cleanup.workflowsCreated === tr.cleanup.workflowsDeleted + tr.cleanup.workflowsAbandoned && tr.cleanup.credentialsCreated === tr.cleanup.credentialsDeleted, '逾時測試：逾時後建立數量應等於刪除加放棄的數量');
      expect(tr.dynamic.every(d => d.timeout === true), '逾時測試：dynamic 項目應標示 timeout');
    }
    if (existsSync(join(outDir, 'matrix-report.json'))) {
      const mr = JSON.parse(readFileSync(join(outDir, 'matrix-report.json'), 'utf8'));
      expect(Array.isArray(mr.advisories) && mr.advisories.every(a => a.source === 'matrix'), 'matrix-report.json：advisories 的來源應為 matrix');
      expect(mr.advisories.some(a => a.rule === 'matrix:version-difference' && a.file === 'pass-webhook-branch.workflow.json'), 'matrix-report.json：pass-webhook-branch 在 2.37.3 的結果不同，應有跨版本差異建議');
      expect(readFileSync(join(outDir, 'matrix-report.md'), 'utf8').includes('跨版本差異'), 'matrix-report.md：應列出跨版本差異');
    }
    expect(existsSync(join(outDir, 'matrix-report.json')) && existsSync(join(outDir, 'matrix-report.md')), '沒有產生 matrix-report.json 或 matrix-report.md');
    // --hold-active：同批路徑衝突要在啟用時出現 409；預設（逐檔清理）則不會
    const hv = n8nVersions.includes('2.44.6') ? '2.44.6' : n8nVersions[0];
    const dupFiles = ['fail-webhook-dup-a.workflow.json', 'fail-webhook-dup-b.workflow.json'];
    const runDup = flags => {
      const od = mkdir();
      const r = spawnSync('bash', [join(root, 'scripts', 'ci', 'matrix.sh'), '--dir', stage(dupFiles), '--versions', hv, '--out-dir', od, '--offline', ...flags],
        { cwd: root, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
      const f = join(od, `ci-report-${hv}.json`);
      return { status: r.status, rep: existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null, text: (r.stdout ?? '') + (r.stderr ?? '') };
    };
    const hold = runDup(['--hold-active']);
    expect(hold.status === 1 && hold.rep?.blocking.some(b => b.code === 'WEBHOOK_PATH_CONFLICT'), `--hold-active：同批路徑重複應在動態階段出現 WEBHOOK_PATH_CONFLICT（退出碼 ${hold.status}）\n${hold.text.slice(-600)}`);
    expect(hold.rep?.cleanup.holdActive === true && hold.rep.cleanup.workflowsCreated === hold.rep.cleanup.workflowsDeleted + hold.rep.cleanup.workflowsAbandoned, '--hold-active：整批結束後應全部清理');
    const nohold = runDup([]);
    expect(nohold.status === 0 && !nohold.rep?.blocking.some(b => b.code === 'WEBHOOK_PATH_CONFLICT'), `預設逐檔清理：動態階段不應看到同批路徑衝突（退出碼 ${nohold.status}）`);

    // 預設（非拋棄式）清理：外部註冊型觸發要等取消註冊完成，不放棄任何 workflow
    const nd = mkdir();
    const ndr = spawnSync('bash', [join(root, 'scripts', 'ci', 'matrix.sh'), '--dir', stage(['advisory-external-trigger.workflow.json']), '--versions', hv, '--out-dir', nd, '--offline', '--no-disposable'],
      { cwd: root, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    const ndf = join(nd, `ci-report-${hv}.json`);
    expect(ndr.status === 0 && existsSync(ndf), `非拋棄式：應正常完成（退出碼 ${ndr.status}）`);
    if (existsSync(ndf)) {
      const c = JSON.parse(readFileSync(ndf, 'utf8')).cleanup;
      expect(c.disposable === false && c.workflowsAbandoned === 0 && c.workflowsCreated === c.workflowsDeleted, '非拋棄式：應等到全部刪除，不放棄任何 workflow');
    }
    const dd = mkdir();
    const t0 = Date.now();
    const dsp = spawnSync('bash', [join(root, 'scripts', 'ci', 'matrix.sh'), '--dir', stage(['advisory-external-trigger.workflow.json']), '--versions', hv, '--out-dir', dd, '--offline'],
      { cwd: root, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    const dspSec = (Date.now() - t0) / 1000;
    expect(dsp.status === 0, `拋棄式：應正常完成（退出碼 ${dsp.status}）`);
    if (existsSync(join(dd, `ci-report-${hv}.json`))) {
      const c = JSON.parse(readFileSync(join(dd, `ci-report-${hv}.json`), 'utf8')).cleanup;
      expect(c.disposable === true && c.workflowsCreated === c.workflowsDeleted + c.workflowsAbandoned, '拋棄式：建立數量應等於刪除加放棄的數量');
    }
    if (process.env.CI_TESTS_SHOW_MATRIX) console.log(`外部觸發夾具清理耗時：拋棄式約 ${Math.round(dspSec)} 秒（含起停容器）`);
    expect(sameSet(dockerPs(), before), `測試後有殘留容器：${dockerPs().filter(n => !before.includes(n)).join('、')}`);
    if (process.env.CI_TESTS_SHOW_MATRIX) console.log(readFileSync(join(outDir, 'matrix-report.md'), 'utf8'));
  }
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

const total = counts.static + counts.dynamic;
const dynPart = withN8n ? `、動態 ${counts.dynamic}（n8n ${n8nVersions.join('／')}）` : '（未跑動態部分）';
for (const f of failures) console.error(`FAIL ${f}`);
console.log(`ci-tests: ${total} 項檢查，${failures.length} 項失敗（靜態 ${counts.static}${dynPart}）`);
process.exit(failures.length === 0 ? 0 : 1);

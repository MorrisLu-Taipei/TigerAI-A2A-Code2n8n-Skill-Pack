#!/usr/bin/env node
// n8n workflow 靜態檢查（CI 用，不需要 docker 或 n8n 實例）。
//
// 用法：
//   node scripts/ci/check-workflows.mjs --dir <workflows目錄> --target-version <例如 2.44.6>
//        [--credential-map <json檔或JSON字串>] [--existing-webhook-paths <json檔或JSON字串>] [--existing-workflow-ids <json檔或JSON字串>]
//        [--egress-allow <逗號分隔網域>] [--egress-allow-file <檔>] [--out <ci-report.json>] [--comment <ci-comment.md>]
//
// 阻擋項（使 CI 失敗）：JSON_INVALID、STRUCTURE_INVALID、SECRET_DETECTED、MALICIOUS_CODE、CREDENTIAL_PLAINTEXT、
//   NODE_NOT_FOUND、NODE_DEPRECATED、TYPEVERSION_INVALID、CREDENTIAL_MISSING、WEBHOOK_PATH_CONFLICT。
// 建議項（永遠不使 CI 失敗）：scripts/security-scan.mjs 的護欄警告、scripts/native-first-check.mjs 的原生節點提醒、
//   node:hidden-legacy（目錄標示 hidden 但未 deprecated 的舊節點，實測仍可匯入啟用）、
//   workflow:unknown-subworkflow-reference（Execute Workflow 指向的 workflow 在同批與既有清單都找不到）、
//   trigger:external-registration（觸發節點需要對外註冊，無法在無網路環境測試啟用）、
//   credentials:missing-field（節點類型在目錄中有「無條件需要」的憑證，但節點沒有 credentials 欄位；可能誤報，見 docs/ci-for-n8n-workflows.md）、
//   egress:external-domain（外連網域提醒，可用 --egress-allow 提供允許清單）、impact:high-impact-node（高影響動作提醒）、
//   notes:missing-change-log（Layer 3 說明便條缺修改記錄）；這三條是 scripts/security-scan.mjs 的護欄建議，一律只提醒。
// 退出碼：0 無阻擋項；1 有阻擋項；2 使用錯誤或內部工具失敗。
// 輸出與日誌只寫規則名稱、檔名、節點名，不印任何疑似機密的原文。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeReport, isExternalTrigger, listJsonFiles, parseArgs, renderComment, scrub, writeJson } from './lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE = 'node scripts/ci/check-workflows.mjs --dir <目錄> --target-version <版本> [--credential-map <json>] [--existing-webhook-paths <json>] [--existing-workflow-ids <json>] [--egress-allow <網域,...>] [--egress-allow-file <檔>] [--out <檔>] [--comment <檔>]';

const die = msg => { console.error(`錯誤：${msg}`); console.error(`用法：${USAGE}`); process.exit(2); };

const { opts, errors } = parseArgs(process.argv.slice(2), {
  dir: 'string', 'target-version': 'string', 'credential-map': 'string', 'existing-webhook-paths': 'string', 'existing-workflow-ids': 'string',
  'egress-allow': 'string', 'egress-allow-file': 'string', out: 'string', comment: 'string', help: 'boolean',
});
if (opts.help) { console.log(`用法：${USAGE}`); process.exit(0); }
if (errors.length) die(errors.join('；'));
if (!opts.dir) die('缺少 --dir');
if (!opts['target-version']) die('缺少 --target-version');
if (!existsSync(opts.dir)) die(`找不到目錄：${opts.dir}`);

const target = opts['target-version'];
if (!/^\d+\.\d+\.\d+$/.test(target)) die(`--target-version 格式不對（需為 x.y.z）：${target}`);
const catalogPath = join(root, 'docs', 'node-versions', `${target}.json`);
if (!existsSync(catalogPath)) {
  die(`找不到節點版本目錄 docs/node-versions/${target}.json；請先依 docs/node-versions/README.md 對該版本實例重產`);
}

function loadJsonArg(flag, v) {
  try {
    return JSON.parse(/^\s*[[{]/.test(v) ? v : readFileSync(v, 'utf8'));
  } catch {
    return die(`${flag} 不是合法 JSON（或找不到檔案）`);
  }
}

let existingWorkflowIds = [];
if (opts['existing-workflow-ids'] !== undefined) {
  existingWorkflowIds = loadJsonArg('--existing-workflow-ids', opts['existing-workflow-ids']);
  if (!Array.isArray(existingWorkflowIds) || !existingWorkflowIds.every(s => typeof s === 'string')) {
    die('--existing-workflow-ids 格式需為 ["<workflow id>", ...]');
  }
}

let credentialMap = null;
if (opts['credential-map'] !== undefined) {
  credentialMap = loadJsonArg('--credential-map', opts['credential-map']);
  const ok = credentialMap && typeof credentialMap === 'object' && !Array.isArray(credentialMap) &&
    Object.values(credentialMap).every(a => Array.isArray(a) && a.every(s => typeof s === 'string'));
  if (!ok) die('--credential-map 格式需為 {"<憑證type>":["<名稱>", ...]}');
}
let existingPaths = [];
if (opts['existing-webhook-paths'] !== undefined) {
  existingPaths = loadJsonArg('--existing-webhook-paths', opts['existing-webhook-paths']);
  if (!Array.isArray(existingPaths) || !existingPaths.every(s => typeof s === 'string')) {
    die('--existing-webhook-paths 格式需為 ["METHOD path", ...]');
  }
}

// 外連網域允許清單（選用）：沒給就只列出外連網域、不判斷；檔案內容直接當參數轉交 security-scan（逗號、空白、換行分隔，# 開頭為註解）
const egressArgs = [];
if (opts['egress-allow'] !== undefined) egressArgs.push('--egress-allow', opts['egress-allow']);
if (opts['egress-allow-file'] !== undefined) {
  let text;
  try { text = readFileSync(opts['egress-allow-file'], 'utf8'); } catch { die('--egress-allow-file 讀不到檔案'); }
  egressArgs.push('--egress-allow', text);
}

let catalog;
try {
  const j = JSON.parse(readFileSync(catalogPath, 'utf8'));
  catalog = new Map(j.nodes.map(n => [n.name, n]));
} catch {
  die(`節點版本目錄 ${target}.json 無法讀取或格式不對`);
}

// ---- 小工具 ---------------------------------------------------------------

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const blocking = [];
const advisories = [];
const clean = v => (v == null ? null : scrub(v));
const block = (code, file, node, message) => blocking.push({ code, file, node: clean(node), message: scrub(message) });
const advise = (source, rule, file, node, message) => advisories.push({ source, rule, file, node: clean(node), message: scrub(message) });

// 目錄的 credentials 需求：required 且不帶 conditional（不依參數組合）的才算「一定要有」；authentication 明示不用預定義憑證時排除
const NO_PREDEFINED_AUTH = new Set(['none', 'genericCredentialType']);
const unconditionalCreds = entry =>
  (Array.isArray(entry?.credentials) ? entry.credentials : []).filter(c => c?.required === true && c.conditional !== true).map(c => c.name);
const hasCredentialField = n => isObj(n.credentials) && Object.keys(n.credentials).length > 0;

const normPath = p => String(p).trim().replace(/^\/+|\/+$/g, '');
const normMethod = m => String(m).trim().toUpperCase();

// ---- 結構檢查 --------------------------------------------------------------

function structureProblems(wf) {
  const probs = [];
  const add = (message, node) => probs.push({ message, node: node ?? null });
  if (!isObj(wf)) { add('最外層必須是物件'); return probs; }
  if (typeof wf.name !== 'string' || wf.name.trim() === '') add('缺少 name（需為非空字串）');
  if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) { add('缺少 nodes（需為非空陣列）'); }
  if (!isObj(wf.connections)) add('缺少 connections（需為物件，沒有連線請給 {}）');
  if (wf.settings !== undefined && !isObj(wf.settings)) add('settings 需為物件');
  if (!Array.isArray(wf.nodes)) return probs;

  const names = new Set();
  wf.nodes.forEach((n, i) => {
    const label = isObj(n) && typeof n.name === 'string' && n.name ? n.name : null;
    const where = label ?? `#${i + 1}`;
    if (!isObj(n)) { add(`第 ${i + 1} 個節點不是物件`); return; }
    if (typeof n.name !== 'string' || n.name === '') { add(`第 ${i + 1} 個節點缺少 name`); return; }
    if (names.has(n.name)) add('節點名稱重複', n.name);
    names.add(n.name);
    if (typeof n.type !== 'string' || n.type === '') add('缺少 type', where);
    if (typeof n.typeVersion !== 'number' || !Number.isFinite(n.typeVersion)) add('typeVersion 需為數字', where);
    if (!Array.isArray(n.position) || n.position.length !== 2 || !n.position.every(x => typeof x === 'number')) {
      add('position 需為 [x, y] 兩個數字', where);
    }
    if (!isObj(n.parameters)) add('缺少 parameters（需為物件）', where);
    if (n.credentials !== undefined && !isObj(n.credentials)) add('credentials 需為物件', where);
  });

  if (isObj(wf.connections)) {
    for (const [src, outs] of Object.entries(wf.connections)) {
      if (!names.has(src)) add('connections 的來源節點不存在', src);
      if (!isObj(outs)) { add('connections 的內容格式不對', src); continue; }
      for (const lists of Object.values(outs)) {
        if (!Array.isArray(lists)) { add('connections 的輸出格式不對', src); continue; }
        for (const list of lists) {
          if (list === null) continue;
          if (!Array.isArray(list)) { add('connections 的輸出格式不對', src); continue; }
          for (const t of list) {
            if (!isObj(t) || typeof t.node !== 'string') add('connections 的目標格式不對', src);
            else if (!names.has(t.node)) add(`connections 指向不存在的節點「${t.node}」`, src);
          }
        }
      }
    }
  }
  return probs;
}

// ---- 讀檔與逐檔檢查 ---------------------------------------------------------

const files = listJsonFiles(opts.dir);
if (files.length === 0) die(`目錄內找不到任何 .json 檔：${opts.dir}`);

const parsed = [];            // { rel, abs, wf }（JSON 可解析者）
const subRefs = [];            // Execute Workflow 引用：{ id, file, node }
const webhookEntries = [];     // { key, method, path, file, node }
const skippedNotes = [];
let credsUsedWithoutMap = false;

for (const f of files) {
  let raw;
  try { raw = readFileSync(f.abs, 'utf8'); }
  catch { block('JSON_INVALID', f.rel, null, '檔案讀取失敗'); continue; }
  let wf;
  try { wf = JSON.parse(raw); }
  catch (e) {
    const pos = /position (\d+)/.exec(e.message);
    block('JSON_INVALID', f.rel, null, `JSON 無法解析${pos ? `（約第 ${pos[1]} 個字元）` : ''}`);
    continue;
  }
  parsed.push({ ...f, wf });

  const probs = structureProblems(wf);
  for (const p of probs.slice(0, 10)) block('STRUCTURE_INVALID', f.rel, p.node, p.message);
  if (probs.length > 10) block('STRUCTURE_INVALID', f.rel, null, `另有 ${probs.length - 10} 項結構問題未列出`);
  if (probs.length > 0) continue;

  for (const n of wf.nodes) {
    const entry = catalog.get(n.type);
    if (!entry) {
      block('NODE_NOT_FOUND', f.rel, n.name, `節點類型 ${n.type} 不在 ${target} 的節點目錄中`);
    } else {
      if (entry.deprecated) {
        const alt = entry.replacedBy ? `，請改用 ${entry.replacedBy}` : '';
        block('NODE_DEPRECATED', f.rel, n.name, `節點類型 ${n.type} 在 ${target} 已標示棄用${alt}`);
      } else if (entry.hidden) {
        const alt = entry.replacedBy ? `（目錄建議的替代：${entry.replacedBy}）` : '';
        advise('node-catalog', 'node:hidden-legacy', f.rel, n.name,
          `${n.type} 在節點面板中已隱藏，屬舊節點，建議評估新版替代；不使檢查失敗${alt}`);
      }
      if (!entry.versions.includes(n.typeVersion)) {
        block('TYPEVERSION_INVALID', f.rel, n.name,
          `${n.type} 的 typeVersion ${n.typeVersion} 不在 ${target} 支援的版本內（可用：${entry.versions.join('、')}）`);
      }
    }

    if (!n.disabled && isExternalTrigger(n.type)) {
      advise('activation', 'trigger:external-registration', f.rel, n.name,
        '此 workflow 的觸發節點需要對外註冊，無法在無網路測試環境驗證啟用，建議在 staging 實測');
    }

    if (entry && !n.disabled && !hasCredentialField(n) && !NO_PREDEFINED_AUTH.has(n.parameters.authentication)) {
      const need = unconditionalCreds(entry);
      if (need.length > 0) {
        advise('credentials', 'credentials:missing-field', f.rel, n.name,
          `${n.type} 需要憑證（${need.slice(0, 3).join('、')}），但沒有 credentials 欄位；若憑證尚未建立，請依受限模式在節點 notes 與 Layer 3「待補憑證」說明，需管理員建立。依目錄判斷，可能誤報`);
      }
    }

    for (const [ctype, ref] of Object.entries(n.credentials ?? {})) {
      if (credentialMap === null) { credsUsedWithoutMap = true; continue; }
      const cname = isObj(ref) && typeof ref.name === 'string' ? ref.name : null;
      const allowed = credentialMap[ctype];
      if (!allowed) block('CREDENTIAL_MISSING', f.rel, n.name, `憑證類型 ${ctype} 不在允許清單`);
      else if (cname === null || !allowed.includes(cname)) {
        block('CREDENTIAL_MISSING', f.rel, n.name, `${ctype} 憑證${cname === null ? '未指定名稱' : `「${cname}」`}不在允許清單`);
      }
    }

    if (n.type === 'n8n-nodes-base.executeWorkflow' && !n.disabled) {
      const src = n.parameters.source;
      const wid = n.parameters.workflowId;
      const value = isObj(wid) ? (wid.value ?? wid.cachedResultName) : wid;
      if ((src === undefined || src === 'database') && typeof value === 'string' && value.trim() !== '' && !value.startsWith('=') && !value.includes('{{')) {
        subRefs.push({ id: value.trim(), name: isObj(wid) && typeof wid.cachedResultName === 'string' ? wid.cachedResultName : null, file: f.rel, node: n.name });
      }
    }

    if (n.type === 'n8n-nodes-base.webhook' && !n.disabled) {
      const p = n.parameters.path;
      if (typeof p === 'string' && p.trim() !== '' && !p.startsWith('=') && !p.includes('{{')) {
        const m = n.parameters.httpMethod ?? 'GET';
        for (const method of (Array.isArray(m) ? m : [m]).map(normMethod)) {
          webhookEntries.push({ method, path: normPath(p), file: f.rel, node: n.name });
        }
      } else if (typeof p === 'string' && p.trim() !== '') {
        skippedNotes.push(`${f.rel}：節點「${n.name}」的 webhook path 是運算式，無法靜態比對`);
      }
    }
  }
}

// ---- webhook path 唯一性 ---------------------------------------------------

const byKey = new Map();
for (const w of webhookEntries) {
  const k = `${w.method} ${w.path}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(w);
}
for (const [k, list] of byKey) {
  if (list.length > 1) {
    for (const w of list) {
      const others = list.filter(x => x !== w).map(x => `${x.file}（${x.node}）`).join('、');
      block('WEBHOOK_PATH_CONFLICT', w.file, w.node, `「${k}」與同批的 ${others} 重複`);
    }
  }
}
const existing = existingPaths.map(s => {
  const m = /^\s*(\S+)\s+(\S.*)$/.exec(s);
  return m ? { method: normMethod(m[1]), path: normPath(m[2]) } : { method: null, path: normPath(s) };
});
for (const w of webhookEntries) {
  if (existing.some(e => e.path === w.path && (e.method === null || e.method === w.method))) {
    block('WEBHOOK_PATH_CONFLICT', w.file, w.node, `「${w.method} ${w.path}」已被目標環境的既有 workflow 使用`);
  }
}

// ---- Execute Workflow 引用（只提醒，因為可能指向目標環境既有的 workflow） ----

const knownIds = new Set(existingWorkflowIds.map(x => x.trim()));
const knownNames = new Set();
for (const p of parsed) {
  if (typeof p.wf?.id === 'string') knownIds.add(p.wf.id);
  if (typeof p.wf?.name === 'string') knownNames.add(p.wf.name);
}
for (const r of subRefs) {
  if (knownIds.has(r.id) || knownNames.has(r.id) || (r.name && knownNames.has(r.name))) continue;
  advise('workflow-refs', 'workflow:unknown-subworkflow-reference', r.file, r.node,
    '引用的 sub-workflow 在同一批檔案與既有清單中都找不到；若它已存在於目標環境可忽略，否則請一併提交或修正 workflowId');
}

// ---- 呼叫既有腳本：資安掃描（偵測類 error 為阻擋，其餘為建議）與原生節點提醒（建議） ----

function runTool(script, targets, tmp, tag, extraArgs = []) {
  const out = [];
  for (let i = 0; i < targets.length; i += 40) {
    const outFile = join(tmp, `${tag}-${i}.json`);
    const fd = openSync(outFile, 'w');
    let r;
    try {
      r = spawnSync(process.execPath, [join(root, 'scripts', script), '--format', 'json', ...extraArgs, ...targets.slice(i, i + 40)],
        { cwd: root, stdio: ['ignore', fd, 'pipe'], encoding: 'utf8' });
    } finally { closeSync(fd); }
    let j;
    try { j = JSON.parse(readFileSync(outFile, 'utf8')); } catch { j = null; }
    const okCodes = script === 'security-scan.mjs' ? [0, 1] : [0, 2];
    if (!j || !okCodes.includes(r.status)) {
      console.error(`錯誤：${script} 執行失敗（退出碼 ${r.status}）`);
      process.exit(2);
    }
    out.push(...j.results);
  }
  return out;
}

const SCAN_MESSAGES = {
  'webhook:no-auth': 'Webhook 沒有設定認證，建議加上 Header 認證等機制',
  'form:no-auth': '對外的 Form Trigger 沒有設定認證',
  'tls:allow-unauthorized-certs': '關閉了 TLS 憑證檢查，建議保持開啟',
  'exec:execute-command': '使用 Execute Command 節點，會在 n8n 主機執行命令',
  'exec:ssh': '使用 SSH 節點，會執行遠端命令',
  'file:rw-access': '節點會讀寫本機檔案系統',
  'header:hardcoded-authorization': 'HTTP 標頭的 Authorization 寫成固定值，建議改用憑證',
  'ai:agent-code-tool': 'AI Agent 接了可執行程式碼的工具',
  'ai:agent-no-guardrails': '對外觸發的 AI Agent 沒有 Guardrails 節點',
  'error:no-handling': '有外部呼叫但沒有錯誤處理（onError、重試、Error Trigger 或 errorWorkflow）',
  'network:http-cleartext': '使用非本機的 http:// 明文連線',
  'jscode:process-spawn': 'Code 節點內有啟動子行程的寫法，請確認用意',
  'jscode:base64-decode-suspect': 'Code 節點內有大段固定的 base64 內容被解碼，請確認用意',
  'jscode:require-fs-with-write': 'Code 節點內 require("fs")，建議改用原生檔案節點',
  'schema:empty-nodes': 'workflow 沒有任何節點',
  'egress:external-domain': '節點會連到外部網域，請核准人確認是否在允許清單內',
  'impact:high-impact-node': '高影響動作（寄信、寫入或刪除資料庫、HTTP 寫入方法、執行系統指令），請核准人在工單上特別確認',
  'notes:missing-change-log': 'Layer 3 說明便條沒有填寫「修改記錄」',
};
// 這三條的說明文字本身帶有節點的具體內容（網域清單、動作種類、缺漏狀況），直接用掃描器的說明
const SAMPLE_AS_MESSAGE = new Set(['egress:external-domain', 'impact:high-impact-node', 'notes:missing-change-log']);

function scanNodeOf(where, nodeNames) {
  if (typeof where !== 'string' || !where.startsWith('node:')) return null;
  const rest = where.slice(5);
  let best = null;
  for (const name of nodeNames) {
    if ((rest === name || rest.startsWith(`${name}.`)) && (best === null || name.length > best.length)) best = name;
  }
  return best;
}

const tmp = mkdtempSync(join(tmpdir(), 'ci-check-'));
try {
  const valid = parsed;
  const byAbs = new Map(valid.map(p => [p.abs, p]));

  for (const r of runTool('security-scan.mjs', valid.map(p => p.abs), tmp, 'scan', egressArgs)) {
    const p = byAbs.get(resolve(root, r.file));
    if (!p) continue;
    const names = Array.isArray(p.wf?.nodes) ? p.wf.nodes.map(n => n?.name).filter(x => typeof x === 'string') : [];
    for (const f of r.findings) {
      const node = scanNodeOf(f.where, names);
      const rule = f.rule;
      if (f.severity === 'error') {
        if (rule.startsWith('secret:')) block('SECRET_DETECTED', p.rel, node, `命中資安規則 ${rule}（內容不顯示）`);
        else if (rule.startsWith('jscode:')) block('MALICIOUS_CODE', p.rel, node, `命中程式碼規則 ${rule}`);
        else if (rule === 'credential:plaintext') block('CREDENTIAL_PLAINTEXT', p.rel, node, '敏感欄位寫成明文，請改用 n8n 憑證（內容不顯示）');
        else if (rule === 'json:parse-failed' || rule === 'io:read-failed') block('JSON_INVALID', p.rel, null, '檔案無法讀取或解析');
        else advise('security-scan', rule, p.rel, node, SCAN_MESSAGES[rule] ?? '資安掃描提醒，請參考 spec/security-guardrails.md');
      } else {
        const msg = SAMPLE_AS_MESSAGE.has(rule) && typeof f.sample === 'string' && f.sample !== '' ? f.sample : SCAN_MESSAGES[rule];
        advise('security-scan', rule, p.rel, node, msg ?? '資安護欄建議，請參考 spec/security-guardrails.md');
      }
    }
  }

  const nf = valid.filter(p => Array.isArray(p.wf?.nodes));
  for (const r of runTool('native-first-check.mjs', nf.map(p => p.abs), tmp, 'native')) {
    const p = byAbs.get(resolve(root, r.file));
    if (!p || r.error) continue;
    for (const it of r.items ?? []) {
      if (it.suggestion) {
        advise('native-first', 'code-node-replaceable', p.rel, it.name, `${it.suggestion.text}（樣式比對的提醒，可能有誤）`);
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (credsUsedWithoutMap) {
  advise('ci', 'credential-map-not-provided', null, null, '未提供 --credential-map，略過憑證允許清單檢查');
}
for (const s of skippedNotes) advise('ci', 'webhook-path-dynamic', null, null, s);

// ---- 輸出 ------------------------------------------------------------------

const report = finalizeReport({ status: 'pass', target, blocking, advisories, counts: { files: files.length } });

for (const b of report.blocking) console.log(`BLOCK   ${b.file ?? '-'}  [${b.code}]  ${b.node ?? '-'}  ${b.message}`);
for (const a of report.advisories) console.log(`ADVISE  ${a.file ?? '-'}  [${a.source}:${a.rule}]  ${a.node ?? '-'}`);
console.log('---');
console.log(`Summary: ${report.counts.files} file(s) · 目標 ${target} · ${report.counts.blocking} 阻擋 · ${report.counts.advisories} 建議 · ${report.status.toUpperCase()}`);

if (opts.out) writeJson(opts.out, report);
if (opts.comment) writeFileSync(opts.comment, renderComment(report));
process.exit(report.status === 'fail' ? 1 : 0);

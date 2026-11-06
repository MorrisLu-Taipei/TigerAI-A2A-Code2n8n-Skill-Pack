#!/usr/bin/env node
// n8n workflow 動態檢查：在一個「可丟棄」的 n8n 實例上匯入、補假憑證、啟用、觸發 webhook、讀執行紀錄、停用、刪除。
//
// 用法：
//   N8N_URL=<實例網址> N8N_API_KEY=<金鑰> node scripts/ci/run-on-n8n.mjs --dir <workflows目錄>
//        [--target-version <版本>] [--out <ci-report.json>] [--merge-into <ci-report.json>] [--comment <ci-comment.md>]
//   N8N_URL=<實例網址> node scripts/ci/run-on-n8n.mjs --bootstrap --dir <目錄> ...
//        --bootstrap：對「全新空實例」用隨機密碼建立擁有者與 API 金鑰（只放記憶體，結束時嘗試刪除金鑰）。
//   其他選項：--settle-seconds <秒，預設 3>（觸發 webhook 後等執行紀錄）、--wait-seconds <秒，預設 30>（等 /healthz）、
//   --workflow-timeout <秒，預設 60>（單一 workflow 的總時限；逾時只列建議項 workflow:timeout，請重跑）。
//
// 阻擋項：IMPORT_FAILED；ACTIVATE_FAILED（結構性：節點設定缺漏或無效、節點類型不存在或已棄用、版本不支援等）；
//   CREDENTIAL_MISSING（啟用時回報憑證不存在或缺少）；WEBHOOK_PATH_CONFLICT（啟用時回 409）。
// 提示（不使 CI 失敗）：NO_TRIGGER（沒有觸發節點）、activate:unverified-external（觸發節點需對外註冊，無網路或假憑證下必然失敗）、
//   activate:unverified-unknown（啟用失敗但無法歸類，需人工複核）、workflow:timeout、執行失敗、假憑證建立失敗。
// 只刪自己建立的 workflow 與憑證；無論成功失敗都會清理。退出碼：0 無阻擋項、1 有阻擋項、2 使用錯誤或連不上。
// 任何輸出都不含 API 金鑰、密碼或 cookie。

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { classifyActivation, finalizeReport, listJsonFiles, parseArgs, renderComment, scrub, writeJson } from './lib.mjs';

const USAGE = 'N8N_URL=… N8N_API_KEY=… node scripts/ci/run-on-n8n.mjs --dir <目錄> [--bootstrap] [--target-version <版本>] [--workflow-timeout <秒>] [--out <檔>] [--merge-into <檔>] [--comment <檔>]';
const die = msg => { console.error(`錯誤：${msg}`); console.error(`用法：${USAGE}`); process.exit(2); };

const { opts, errors } = parseArgs(process.argv.slice(2), {
  dir: 'string', out: 'string', 'merge-into': 'string', comment: 'string', 'target-version': 'string',
  bootstrap: 'boolean', 'settle-seconds': 'string', 'wait-seconds': 'string', 'workflow-timeout': 'string', help: 'boolean',
});
if (opts.help) { console.log(`用法：${USAGE}`); process.exit(0); }
if (errors.length) die(errors.join('；'));
if (!opts.dir) die('缺少 --dir');
if (!existsSync(opts.dir)) die(`找不到目錄：${opts.dir}`);
const baseUrl = (process.env.N8N_URL ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(baseUrl)) die('缺少環境變數 N8N_URL（例如 http://127.0.0.1:5678）');
let apiKey = process.env.N8N_API_KEY ?? '';
if (!opts.bootstrap && !apiKey) die('缺少環境變數 N8N_API_KEY（或改用 --bootstrap 對全新空實例自動建立）');
const settleMs = Math.max(0, Number(opts['settle-seconds'] ?? 3)) * 1000;
const waitSeconds = Math.max(0, Number(opts['wait-seconds'] ?? 30));
const timeoutSeconds = Number(opts['workflow-timeout'] ?? 60);
if (!(timeoutSeconds > 0)) die('--workflow-timeout 需為大於 0 的秒數');

const secrets = [apiKey];   // 所有輸出前都過 scrub
const safe = t => scrub(t, secrets);
const runId = randomBytes(3).toString('hex');
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- HTTP -----------------------------------------------------------------

class WorkflowTimeout extends Error {}
let deadline = Infinity;   // 單一 workflow 的截止時間；清理用的請求不受限（noDeadline）

let cookie = '';
async function http(method, path, { body, auth = 'key', timeout = 60000, headers: extra = {}, noDeadline = false } = {}) {
  const limited = !noDeadline && deadline !== Infinity;
  if (limited) {
    const left = deadline - Date.now();
    if (left <= 0) throw new WorkflowTimeout();
    timeout = Math.min(timeout, left);
  }
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (auth === 'key') headers['X-N8N-API-KEY'] = apiKey;
  if (auth === 'cookie') headers.Cookie = cookie;
  try {
    const res = await fetch(baseUrl + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 回應 */ }
    return { status: res.status, json, text, res };
  } catch (e) {
    if (limited && Date.now() >= deadline) throw new WorkflowTimeout();
    return { status: 0, json: null, text: safe(e.cause?.code ?? e.name), res: null };
  }
}
const msgOf = r => safe(String(r.json?.message ?? r.text ?? '').replace(/\s+/g, ' ').slice(0, 200));

// ---- 連線與金鑰 --------------------------------------------------------------

// /healthz 先於 /rest 路由就緒，所以兩個都要等到
async function waitHealthy() {
  const until = Date.now() + waitSeconds * 1000;
  for (;;) {
    const r = await http('GET', '/healthz', { auth: 'none', timeout: 5000 });
    const s = r.status === 200 ? await http('GET', '/rest/settings', { auth: 'none', timeout: 5000 }) : r;
    if (r.status === 200 && s.status === 200 && s.json?.data) return;
    if (Date.now() >= until) die(`連不上 n8n 實例（/healthz 或 /rest/settings 未就緒，最後狀態 ${s.status || '無回應'}）`);
    await sleep(1000);
  }
}

// Node 18.0～18.13 沒有 getSetCookie：退回單一 set-cookie 標頭（n8n 只送一個登入 cookie）
const cookiesOf = res => (res?.headers.getSetCookie?.() ?? [res?.headers.get('set-cookie')]).filter(Boolean).map(c => c.split(';')[0]).join('; ');

let bootstrapKeyId = null;
async function bootstrap() {
  const password = `Ci-${randomBytes(18).toString('base64url')}-9aA`;
  secrets.push(password);
  const email = `ci-owner-${runId}@example.com`;
  let setup;
  for (let i = 0; i < 10; i++) {
    setup = await http('POST', '/rest/owner/setup', { auth: 'none', body: { email, firstName: 'CI', lastName: 'Runner', password } });
    cookie = cookiesOf(setup.res);
    if (setup.status !== 200 || cookie) break;
    // 建立成功但沒帶 cookie：改用剛設定的帳密登入
    const login = await http('POST', '/rest/login', { auth: 'none', body: { emailOrLdapLoginId: email, email, password } });
    cookie = cookiesOf(login.res);
    if (cookie) break;
    await sleep(1000);
  }
  if (setup.status !== 200) die(`--bootstrap 失敗（/rest/owner/setup 回 ${setup.status}）；只能用在全新空實例`);
  if (!cookie) die('--bootstrap 失敗（沒有取得登入 cookie）');
  secrets.push(cookie);
  const sc = await http('GET', '/rest/api-keys/scopes', { auth: 'cookie' });
  const scopes = sc.json?.data;
  if (sc.status !== 200 || !Array.isArray(scopes)) die(`--bootstrap 失敗（讀取 scope 回 ${sc.status}）`);
  const k = await http('POST', '/rest/api-keys', { auth: 'cookie', body: { label: `ci-${runId}`, scopes, expiresAt: null } });
  const raw = k.json?.data?.rawApiKey ?? k.json?.rawApiKey;
  if (k.status !== 200 || !raw) die(`--bootstrap 失敗（建立 API 金鑰回 ${k.status}）`);
  apiKey = raw;
  secrets.push(raw);
  bootstrapKeyId = k.json?.data?.id ?? null;
}

// ---- 假憑證 -------------------------------------------------------------------

const created = { workflows: new Map(), credentials: new Map() };   // id -> 描述
const stats = { workflowsCreated: 0, workflowsDeleted: 0, credentialsCreated: 0, credentialsDeleted: 0 };
const credCache = new Map();   // `${type} ${name}` -> { id, name } | null
const advisories = [];
const blocking = [];
const advise = (rule, file, node, message) => advisories.push({ source: 'n8n-run', rule, file: file ?? null, node: node ?? null, message: safe(message) });
const block = (code, file, node, message) => blocking.push({ code, file, node: node ?? null, message: safe(message) });

// 依實例回報的憑證 schema 先填必填欄位；header／basic 認證欄位固定給假值，之後可帶進 webhook 呼叫
async function seedFor(type) {
  const seed = {};
  if (type === 'httpHeaderAuth') Object.assign(seed, { name: 'x-ci-fake', value: 'ci-fake-value' });
  if (type === 'httpBasicAuth') Object.assign(seed, { user: 'ci-fake', password: 'ci-fake-value' });
  const r = await http('GET', `/api/v1/credentials/schema/${encodeURIComponent(type)}`);
  const props = r.json?.properties;
  if (r.status === 200 && isObj(props) && Array.isArray(r.json.required)) {
    for (const k of r.json.required) {
      if (k in seed || !isObj(props[k])) continue;
      const p = props[k];
      seed[k] = Array.isArray(p.enum) ? p.enum[0] : p.type === 'boolean' ? false : p.type === 'number' ? 1 : 'ci-fake-value';
    }
  }
  return seed;
}

const stubData = new Map();   // 假憑證 id -> 建立時送出的 data

async function ensureCredential(type, name) {
  const key = `${type} ${name}`;
  if (credCache.has(key)) return credCache.get(key);
  const fakeName = `ci-fake-${runId}-${name}`.slice(0, 120);
  const data = await seedFor(type);
  let result = null;
  let lastMsg = '';
  for (let i = 0; i < 12; i++) {
    const r = await http('POST', '/api/v1/credentials', { body: { name: fakeName, type, data } });
    if (r.status === 200 && r.json?.id) {
      result = { id: String(r.json.id), name: fakeName };
      created.credentials.set(result.id, fakeName);
      stubData.set(result.id, { ...data });
      stats.credentialsCreated++;
      break;
    }
    lastMsg = msgOf(r);
    const m = /requires property \\?"([^"\\]+)\\?"/.exec(r.text ?? '');
    if (!m || m[1] in data) break;
    data[m[1]] = 'ci-fake-value';
  }
  if (!result) advise('credential-stub-failed', null, null, `無法建立憑證類型 ${type} 的假憑證：${lastMsg}`);
  credCache.set(key, result);
  return result;
}

// ---- 單一 workflow --------------------------------------------------------------

function webhookTargets(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n?.type !== 'n8n-nodes-base.webhook' || n.disabled) continue;
    const p = n.parameters?.path;
    if (typeof p !== 'string' || p.trim() === '' || p.startsWith('=') || p.includes('{{') || p.includes(':')) continue;
    const m = n.parameters?.httpMethod ?? 'GET';
    const headers = {};
    const auth = n.parameters?.authentication;
    if (auth === 'headerAuth') {
      const d = stubData.get(n.credentials?.httpHeaderAuth?.id);
      if (d?.name) headers[d.name] = d.value ?? '';
    } else if (auth === 'basicAuth') {
      const d = stubData.get(n.credentials?.httpBasicAuth?.id);
      if (d?.user) headers.Authorization = `Basic ${Buffer.from(`${d.user}:${d.password ?? ''}`).toString('base64')}`;
    }
    out.push({ node: n.name, path: p.trim().replace(/^\/+|\/+$/g, ''), method: String(Array.isArray(m) ? m[0] : m).toUpperCase(), headers });
  }
  return out;
}

// 外部註冊型觸發節點停用後，n8n 還要花時間對外取消註冊，期間刪除回 409 "still being unpublished"
// （實測：預設網路約 20 秒、無網路約 70 秒）。逐檔清理遇到 409 先延後，全部跑完再統一重試。
async function cleanupWorkflow(id, activated, { defer = false } = {}) {
  if (activated) await http('POST', `/api/v1/workflows/${id}/deactivate`, { noDeadline: true });
  let r;
  for (let i = 0; i < 4; i++) {
    r = await http('DELETE', `/api/v1/workflows/${id}`, { noDeadline: true });
    if (r.status === 200 || r.status === 404) break;
    if (r.status === 409 && defer) return 'deferred';
    await sleep(500);
  }
  if (r.status === 200) { created.workflows.delete(id); stats.workflowsDeleted++; }
  return r.status === 200 ? '' : `HTTP ${r.status} ${msgOf(r)}`;
}

async function runOneGuarded(f) {
  const entry = { file: f.rel, import: 'skipped', importStatus: null, activate: 'skipped', activateStatus: null, webhook: null, executions: [] };
  deadline = Date.now() + timeoutSeconds * 1000;
  try {
    return await runOne(f, entry);
  } catch (e) {
    if (!(e instanceof WorkflowTimeout)) throw e;
    entry.timeout = true;
    advise('workflow:timeout', f.rel, null, `超過 ${timeoutSeconds} 秒仍未完成，已中止並清理；逾時屬基礎設施問題，不算 workflow 的錯，請重跑一次（持續發生再調高 --workflow-timeout）`);
    return entry;
  } finally {
    deadline = Infinity;
  }
}

async function runOne(f, entry) {
  let wf;
  try { wf = JSON.parse(readFileSync(f.abs, 'utf8')); } catch { wf = null; }
  if (!isObj(wf) || !Array.isArray(wf.nodes)) {
    entry.import = 'skipped';
    advise('skipped-invalid-file', f.rel, null, '檔案不是可解析的 workflow，動態檢查略過（由靜態檢查回報）');
    return entry;
  }
  wf = structuredClone(wf);
  for (const n of wf.nodes) {
    if (!isObj(n) || !isObj(n.credentials)) continue;
    for (const [type, ref] of Object.entries(n.credentials)) {
      const stub = await ensureCredential(type, isObj(ref) && typeof ref.name === 'string' ? ref.name : type);
      if (stub) n.credentials[type] = stub;
    }
  }

  const body = { name: `[ci-${runId}] ${String(wf.name ?? f.rel).slice(0, 100)}`, nodes: wf.nodes, connections: wf.connections ?? {}, settings: wf.settings ?? {} };
  const imp = await http('POST', '/api/v1/workflows', { body });
  entry.importStatus = imp.status;
  if (imp.status !== 200 || !imp.json?.id) {
    entry.import = 'failed';
    block('IMPORT_FAILED', f.rel, null, `匯入失敗（HTTP ${imp.status}）：${msgOf(imp)}`);
    return entry;
  }
  entry.import = 'ok';
  const id = String(imp.json.id);
  created.workflows.set(id, f.rel);
  stats.workflowsCreated++;
  let activated = true;   // 啟用請求送出前就先假設可能已啟用，逾時時 finally 才會一併停用
  try {
    const act = await http('POST', `/api/v1/workflows/${id}/activate`);
    entry.activateStatus = act.status;
    activated = act.status === 200;
    if (act.status === 200) entry.activate = 'ok';
    else if (act.status === 409) {
      entry.activate = 'conflict';
      block('WEBHOOK_PATH_CONFLICT', f.rel, null, `啟用時 webhook 路徑與實例內既有的 workflow 衝突：${msgOf(act)}`);
    } else if (act.status === 400 && /no trigger node|at least one trigger|no node to start/i.test(act.text ?? '')) {
      entry.activate = 'no-trigger';
      advise('NO_TRIGGER', f.rel, null, '沒有可啟用的觸發節點（模式範本），無法啟用；需接上真實觸發器後才能使用');
    } else {
      const kind = classifyActivation(String(act.json?.message ?? act.text ?? ''), wf.nodes);
      if (kind === 'credential') {
        entry.activate = 'failed';
        block('CREDENTIAL_MISSING', f.rel, null, `啟用時回報憑證不存在或缺少（HTTP ${act.status}）：${msgOf(act)}`);
      } else if (kind === 'structural') {
        entry.activate = 'failed';
        block('ACTIVATE_FAILED', f.rel, null, `啟用失敗（HTTP ${act.status}）：${msgOf(act)}`);
      } else if (kind === 'external') {
        entry.activate = 'unverified';
        advise('activate:unverified-external', f.rel, null, `此 workflow 的觸發節點需要對外註冊，無法在無網路測試環境驗證啟用，建議在 staging 實測（HTTP ${act.status}：${msgOf(act)}）`);
      } else {
        entry.activate = 'unverified';
        advise('activate:unverified-unknown', f.rel, null, `啟用失敗但原因無法歸類，已列為建議而非阻擋，需人工複核（HTTP ${act.status}：${msgOf(act)}）`);
      }
    }

    if (activated) {
      const targets = webhookTargets(wf.nodes);
      if (targets.length > 0) await sleep(1000);
      const codes = [];
      for (const t of targets) {
        const hasBody = !['GET', 'HEAD'].includes(t.method);
        const r = await http(t.method, `/webhook/${encodeURI(t.path)}`, { auth: 'none', body: hasBody ? {} : undefined, timeout: 30000, headers: t.headers });
        codes.push(r.status || 'ERR');
      }
      if (codes.length > 0) entry.webhook = codes.join('、');
      if (codes.length > 0) await sleep(settleMs);
    }
    const ex = await http('GET', `/api/v1/executions?workflowId=${encodeURIComponent(id)}&limit=10`);
    if (ex.status === 200 && Array.isArray(ex.json?.data)) {
      entry.executions = ex.json.data.map(x => String(x.status));
      const bad = [...new Set(entry.executions.filter(s => s === 'error' || s === 'crashed'))];
      if (bad.length > 0) advise('execution-status', f.rel, null, `執行狀態：${bad.join('、')}（使用假憑證時外部呼叫失敗屬預期，只回報不影響結果）`);
    }
  } finally {
    const why = await cleanupWorkflow(id, activated, { defer: true });
    if (why && why !== 'deferred') {
      advise('cleanup-failed', f.rel, null, `無法刪除本次建立的 workflow：${why}`);
    }
  }
  return entry;
}

// ---- 全部清理（正常結束、例外與訊號都會走到） ---------------------------------------

let cleaned = false;
async function cleanupAll() {
  if (cleaned) return;
  cleaned = true;
  const until = Date.now() + 240000;
  for (const id of [...created.workflows.keys()]) {
    for (;;) {
      const why = await cleanupWorkflow(id, true);
      if (!why || Date.now() >= until || !/HTTP 409/.test(why)) break;
      await sleep(1500);
    }
  }
  for (const id of [...created.credentials.keys()]) {
    const r = await http('DELETE', `/api/v1/credentials/${id}`, { noDeadline: true });
    if (r.status === 200) { created.credentials.delete(id); stats.credentialsDeleted++; }
  }
  if (bootstrapKeyId && cookie) await http('DELETE', `/rest/api-keys/${bootstrapKeyId}`, { auth: 'cookie', noDeadline: true });
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await cleanupAll(); process.exit(130); });
}

// ---- 主流程 ----------------------------------------------------------------------

const files = listJsonFiles(opts.dir);
if (files.length === 0) die(`目錄內找不到任何 .json 檔：${opts.dir}`);

const dynamic = [];
let n8nVersion = null;
try {
  await waitHealthy();
  if (opts.bootstrap) await bootstrap();
  else {
    const pre = await http('GET', '/api/v1/workflows?limit=1');
    if (pre.status === 401 || pre.status === 403) die('N8N_API_KEY 無效或權限不足');
    if (pre.status !== 200) die(`n8n API 無法使用（HTTP ${pre.status}）`);
  }
  if (cookie) {
    const st = await http('GET', '/rest/settings', { auth: 'cookie' });
    n8nVersion = st.json?.data?.versionCli ?? null;
  }
  for (const f of files) dynamic.push(await runOneGuarded(f));
} finally {
  await cleanupAll();
}

if (stats.workflowsCreated !== stats.workflowsDeleted || stats.credentialsCreated !== stats.credentialsDeleted) {
  console.error('警告：有本次建立的 workflow 或憑證沒有清掉，請檢查實例');
  advise('cleanup-incomplete', null, null, `建立 ${stats.workflowsCreated} 個 workflow／${stats.credentialsCreated} 個憑證，刪除 ${stats.workflowsDeleted}／${stats.credentialsDeleted}`);
}

let report = {
  status: 'pass', target: opts['target-version'] ?? n8nVersion ?? 'unknown', n8nVersion,
  blocking, advisories, counts: { files: files.length }, dynamic, cleanup: stats,
};
if (opts['merge-into']) {
  let base;
  try { base = JSON.parse(readFileSync(opts['merge-into'], 'utf8')); } catch { die('--merge-into 指定的報告無法讀取'); }
  report = {
    ...base, ...(n8nVersion ? { n8nVersion } : {}),
    blocking: [...(base.blocking ?? []), ...blocking],
    advisories: [...(base.advisories ?? []), ...advisories],
    counts: { files: base.counts?.files ?? files.length },
    dynamic, cleanup: stats,
  };
}
report = finalizeReport(report);

for (const d of dynamic) {
  console.log(`${d.file}  匯入=${d.import}${d.importStatus ? `(${d.importStatus})` : ''}  啟用=${d.activate}${d.activateStatus ? `(${d.activateStatus})` : ''}  webhook=${d.webhook ?? '-'}  執行=${d.executions.join('、') || '-'}`);
}
for (const b of blocking) console.log(`BLOCK   ${b.file ?? '-'}  [${b.code}]  ${b.message}`);
console.log('---');
console.log(`Summary: ${dynamic.length} file(s) · n8n ${n8nVersion ?? '?'} · ${blocking.length} 阻擋 · ${advisories.length} 提示 · 清理 workflow ${stats.workflowsDeleted}/${stats.workflowsCreated}、憑證 ${stats.credentialsDeleted}/${stats.credentialsCreated} · ${report.status.toUpperCase()}`);

if (opts['merge-into']) writeJson(opts['merge-into'], report);
if (opts.out) writeJson(opts.out, opts['merge-into'] ? finalizeReport({ status: 'pass', target: report.target, n8nVersion, blocking, advisories, counts: { files: files.length }, dynamic, cleanup: stats }) : report);
if (opts.comment) writeFileSync(opts.comment, renderComment(report));
process.exit(report.status === 'fail' ? 1 : 0);

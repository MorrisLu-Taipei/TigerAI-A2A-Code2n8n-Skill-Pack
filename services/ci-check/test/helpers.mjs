// run-service-tests.mjs 用的小工具：判斷式與計數、HTTP 客戶端、夾具、假的 Pack、模擬執行器。只用內建模組。

import { randomBytes } from 'node:crypto';
import { closeSync, copyFileSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync, writeSync, existsSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './mini-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVICES = resolve(here, '..');
export const PACK = resolve(here, '..', '..', '..');
export const FIXTURE_DIR = join(PACK, 'scripts', '__test__', 'ci-fixtures');
export const EXPECTED = JSON.parse(readFileSync(join(PACK, 'scripts', '__test__', 'expected.json'), 'utf8'));
export const FAKE_SECRET = ['sk', 'FAKE'.repeat(6)].join('-');
export const fixture = name => readFileSync(join(FIXTURE_DIR, name), 'utf8').replaceAll('__FAKE_SECRET__', FAKE_SECRET);
export const randomToken = () => randomBytes(24).toString('hex');

// ---- 判斷式 ----------------------------------------------------------------------------

export const T = { total: 0, failures: [], section: '' };
export function check(cond, msg) { T.total += 1; if (!cond) T.failures.push(`[${T.section}] ${msg}`); return Boolean(cond); }
export const sameSet = (a, b) => [...new Set(a)].sort().join('|') === [...new Set(b)].sort().join('|');
export function checkSchema(name, data, pointer, label) {
  const errs = validate(name, data, pointer);
  return check(errs.length === 0, `${label}：不符合 ${name}${pointer === '#' ? '' : pointer}：${errs.slice(0, 4).join('；')}`);
}
export async function section(name, fn) {
  T.section = name;
  const before = T.total;
  try { await fn(); } catch (e) { T.total += 1; T.failures.push(`[${name}] 例外：${e?.stack ?? e}`); }
  console.log(`  ${name}：${T.total - before} 項`);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function waitFor(fn, timeoutMs = 8000, stepMs = 40) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(stepMs);
  }
}

// ---- HTTP 客戶端 --------------------------------------------------------------------------

// 回 { status, headers, text, json }；連線在拿到回應前就被關掉時回 { error }
export function request(port, { method = 'GET', path = '/', headers = {}, body, raw, chunks } = {}) {
  return new Promise(resolveReq => {
    const data = raw ?? (body !== undefined ? JSON.stringify(body) : undefined);
    const h = { ...headers };
    if (data !== undefined && !chunks && !('content-length' in h)) h['content-length'] = Buffer.byteLength(data);
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h, agent: false }, res => {
      const bufs = [];
      res.on('data', c => bufs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(bufs).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* 非 JSON */ }
        resolveReq({ status: res.statusCode, headers: res.headers, text, json });
      });
      res.on('error', e => resolveReq({ error: e.code }));
    });
    req.on('error', e => resolveReq({ error: e.code ?? e.message }));
    if (chunks) { for (const c of chunks) req.write(c); req.end(); } else req.end(data);
  });
}

export const auth = token => ({ authorization: `Bearer ${token}` });
export const jsonHeaders = token => ({ 'content-type': 'application/json', ...(token ? auth(token) : {}) });

// ---- 靜態服務用 -----------------------------------------------------------------------------

export function staticBody(files, extra = {}) {
  return {
    requestId: `t-${randomBytes(6).toString('hex')}`, targetVersion: EXPECTED.target,
    workflows: files.map(f => ({ path: `workflows/${f}`, content: fixture(f) })), ...extra,
  };
}

const made = [];
export function tmp(prefix = 'ci-svc-test-') { const d = mkdtempSync(join(tmpdir(), prefix)); made.push(d); return d; }
export const rm = p => rmSync(p, { recursive: true, force: true });
// 測試結束（含失敗）時刪除所有建立過的臨時目錄
export function cleanupTemps() { for (const d of made.splice(0)) rm(d); }

// 假的 Pack：只放服務會用到的路徑，check-workflows.mjs 換成測試腳本
export function makeFakePack(dir, checkScript) {
  mkdirSync(join(dir, 'scripts', 'ci'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'node-versions'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'node-versions', '2.44.6.json'), '{"nodes":[]}');
  writeFileSync(join(dir, 'VERSION'), '9.9.9-test\n');
  copyFileSync(join(PACK, 'scripts', 'ci', 'lib.mjs'), join(dir, 'scripts', 'ci', 'lib.mjs'));
  writeFileSync(join(dir, 'scripts', 'ci', 'check-workflows.mjs'), checkScript);
  return dir;
}

export const FAKE_PROLOGUE = `
import { writeFileSync } from 'node:fs';
const a = process.argv;
const arg = k => (a.indexOf(k) >= 0 ? a[a.indexOf(k) + 1] : null);
const out = arg('--out');
const cm = arg('--comment');
const report = (o = {}) => ({ status: 'pass', target: '2.44.6', blocking: [], advisories: [], incomplete: [], counts: { files: 1, filesWithBlocking: 0, blocking: 0, advisories: 0, incomplete: 0, blockingByCode: {} }, ...o });
`;

// ---- 動態前端用：模擬執行器 ---------------------------------------------------------------------

function writeAtomic(path, text) {
  const tmpPath = `${path}.tmp`;
  const fd = openSync(tmpPath, 'w', 0o664);
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmpPath, path);
}

export class Sim {
  constructor(dir, heartbeatMs = 80) {
    this.dir = dir;
    this.heartbeatMs = heartbeatMs;
    this.phase = 'idle';
    this.jobId = null;
    mkdirSync(dir, { recursive: true });
  }
  p(name) { return join(this.dir, name); }
  status() { writeAtomic(this.p('status.json'), JSON.stringify({ bootId: this.bootId, phase: this.phase, jobId: this.jobId, completed: 0, updatedAt: new Date().toISOString() })); }
  // 新的 boot：清掉殘留的輸入與旗標，宣告 idle，開始心跳
  start() {
    this.stop();
    this.bootId = randomBytes(8).toString('hex');
    this.phase = 'idle';
    this.jobId = null;
    for (const n of ['job.json', 'cancel']) { try { unlinkSync(this.p(n)); } catch { /* 沒有 */ } }
    this.status();
    this.timer = setInterval(() => { try { this.status(); } catch { /* 目錄被清掉 */ } }, this.heartbeatMs);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  async takeJob(timeoutMs = 6000) {
    const job = await waitFor(() => { try { return JSON.parse(readFileSync(this.p('job.json'), 'utf8')); } catch { return null; } }, timeoutMs, 30);
    if (job) { this.phase = 'running'; this.jobId = job.jobId; this.status(); }
    return job;
  }
  finish(envelopeOrRaw) {
    const text = typeof envelopeOrRaw === 'string' || Buffer.isBuffer(envelopeOrRaw) ? envelopeOrRaw : JSON.stringify(envelopeOrRaw);
    writeAtomic(this.p('result.json'), text);
    try { unlinkSync(this.p('job.json')); } catch { /* 已刪 */ }
    this.phase = 'done';
    this.status();
  }
}

export function honestEnvelope(job, mut = r => r) {
  const n = job.workflows.length;
  const result = {
    version: job.version, n8nVersion: job.version, boot: { status: 'ok', seconds: 5.5 },
    workflows: job.workflows.map(w => ({ file: w.path, import: 'ok', importStatus: 200, activate: 'ok', activateStatus: 200, webhook: [200], executions: ['success'] })),
    blocking: [], advisories: [{ source: 'n8n-run', rule: 'execution-status', file: job.workflows[0].path, node: null, message: '假的建議項' }],
    cleanup: { workflowsCreated: n, workflowsDeleted: n, credentialsCreated: 0, credentialsDeleted: 0 },
  };
  const env = { jobId: job.jobId, version: job.version, attempt: job.attempt, complete: true, result };
  return mut(env) ?? env;
}

export const listDir = d => (existsSync(d) ? readdirSync(d) : []);

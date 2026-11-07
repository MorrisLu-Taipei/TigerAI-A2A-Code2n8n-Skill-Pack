#!/usr/bin/env node
// 動態檢查 HTTP 前端：接件、檢核輸入、以共享目錄的檔案佇列把 job 交給無網路執行器、讀回並重算結果。
// 這個行程有網路，但沒有 n8n、沒有 docker 權限；slot 目錄內的一切都當作不可信輸入。
// 只用 Node 內建模組；不做任何對外網路呼叫。環境變數與目錄配置見 services/ci-check/README.md。

import { createHash, randomBytes } from 'node:crypto';
import {
  accessSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync,
  readSync, renameSync, rmSync, statSync, unlinkSync, writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ApiError, checkContentHeaders, checkInt, checkKeys, checkRequestId, checkVersion, checkWorkflowShapes, cleanText, createAuth,
  createJsonServer, createLogger, createRateLimiter, isObj, jobErrorBody, jsonDepthExceeds, listen, parseCidrs, parseJsonBody, readBody,
  REQUEST_ID_RE, routeOf, tokensFromEnv, validatePaths, VERSION_RE,
} from './shared.mjs';
import { assembleResult, DYNAMIC_BLOCKING_CODES, ResultInvalid, validateExecutorResult } from './dynamic-result.mjs';

export const SERVICE_VERSION = '1.0.0';
export const BLOCKING_CATALOG_VERSION = 1;
const here = dirname(fileURLToPath(import.meta.url));
const JOB_ID_RE = /^job_[a-z0-9]{26,40}$/;
const SLOT_NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
const BOOT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SLOT_FILES = new Set(['job.json', 'status.json', 'result.json', 'cancel']);
const TERMINAL = new Set(['done', 'failed', 'timeout', 'cancelled']);
const PHASES = new Set(['idle', 'booting', 'running', 'finishing', 'done', 'cancelled']);

export function configFromEnv(env = process.env) {
  const num = (k, d) => (env[k] === undefined ? d : Number(env[k]));
  if (!env.DYN_ROOT) throw new Error('缺少 DYN_ROOT（共享目錄）');
  return {
    host: env.HOST ?? '127.0.0.1',
    port: num('PORT', 8081),
    packRoot: resolve(env.PACK_ROOT ?? join(here, '..', '..')),
    root: resolve(env.DYN_ROOT),
    tokens: tokensFromEnv(env, 'DYNAMIC'),
    cidrs: env.ALLOWED_SOURCE_CIDRS ? parseCidrs(env.ALLOWED_SOURCE_CIDRS) : null,
    maxBytes: num('DYN_MAX_BYTES', 512 * 1024 * 1024),
    queueMax: num('QUEUE_MAX', 20),
    perCallerMax: num('CALLER_JOB_MAX', 5),
    ratePerMinute: num('RATE_PER_MINUTE', 60),
    rateBurst: num('RATE_BURST', 20),
  };
}

const DEFAULTS = {
  queueMax: 20, perCallerMax: 5, retentionMs: 3600000, queueTimeoutMs: 1800000, maxBytes: 512 * 1024 * 1024,
  diskRejectPct: 80, diskPurgePct: 90, tickMs: 1000, reaperMs: 15000, ratePerMinute: 60, rateBurst: 20,
  maxBodyBytes: 5 * 1024 * 1024, maxFiles: 20, maxFileBytes: 1024 * 1024, maxResultBytes: 1024 * 1024, maxStatusBytes: 4096,
  authFailLimit: 10, authBlockMs: 300000,
  timing: { assignFreshMs: 10000, staleMs: 20000, bootStaleMs: 30000, deadlineGraceMs: 15000, orphanJobMs: 120000, orphanDirMs: 600000, cancelMs: 30000 },
  defaults: { settleSeconds: 3, perWorkflowTimeoutSeconds: 60, jobTimeoutSeconds: 900 },
};

// ---- 檔案小工具 -------------------------------------------------------------------

class SlotFileError extends Error { constructor(kind) { super(kind); this.kind = kind; } }

function writeAtomic(path, data, mode = 0o664) {
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, 'w', mode);
  try { writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
}

// O_NOFOLLOW、一般檔案、大小上限；不存在回 null
function readSlotFile(path, maxBytes) {
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new SlotFileError(e.code === 'ELOOP' ? 'symlink' : 'open-failed'); }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new SlotFileError('not-regular');
    if (st.size > maxBytes) throw new SlotFileError('too-large');
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) { const n = readSync(fd, buf, off, st.size - off, off); if (n <= 0) break; off += n; }
    return { text: buf.toString('utf8', 0, off), mtimeMs: st.mtimeMs };
  } finally { closeSync(fd); }
}

const rmQuiet = p => { try { rmSync(p, { recursive: true, force: true }); } catch { /* 之後 reaper 再試 */ } };
const unlinkQuiet = p => { try { unlinkSync(p); } catch { /* 不存在 */ } };

function dirBytes(dir) {
  let total = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = join(dir, e.name);
    try {
      if (e.isDirectory()) total += dirBytes(p);
      else total += lstatSync(p).size;
    } catch { /* 競爭刪除 */ }
  }
  return total;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function newJobId() {
  let s = '';
  while (s.length < 30) for (const b of randomBytes(40)) { if (b < 252 && s.length < 30) s += ALPHABET[b % 36]; }
  return `job_${s}`;
}

const iso = ms => new Date(ms).toISOString();

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

// ---- 請求檢核 -----------------------------------------------------------------------

function validateRequest(body, cfg) {
  checkKeys(body, ['requestId', 'targetVersion', 'matrixVersions', 'workflows', 'credentialStubPolicy', 'options'], '');
  if (body.requestId === undefined || body.workflows === undefined) throw new ApiError('INVALID_REQUEST', { details: { path: body.requestId === undefined ? 'requestId' : 'workflows', why: 'required' } });
  checkRequestId(body.requestId);
  if (body.targetVersion === undefined && body.matrixVersions === undefined) throw new ApiError('INVALID_REQUEST', { details: { path: 'targetVersion', why: 'required' } });
  let target = null;
  let matrix = null;
  if (body.targetVersion !== undefined) target = checkVersion(body.targetVersion, 'targetVersion');
  if (body.matrixVersions !== undefined) {
    if (!Array.isArray(body.matrixVersions) || body.matrixVersions.length < 1 || body.matrixVersions.length > 3) throw new ApiError('INVALID_REQUEST', { details: { path: 'matrixVersions', why: 'array' } });
    matrix = body.matrixVersions.map((v, i) => checkVersion(v, `matrixVersions[${i}]`));
    if (new Set(matrix).size !== matrix.length) throw new ApiError('INVALID_REQUEST', { details: { path: 'matrixVersions', why: 'unique' } });
    if (target !== null && !matrix.includes(target)) throw new ApiError('INVALID_REQUEST', { details: { path: 'targetVersion', why: 'not-in-matrix' } });
  }
  let stubMode = 'stub-all';
  if (body.credentialStubPolicy !== undefined) {
    checkKeys(body.credentialStubPolicy, ['mode'], 'credentialStubPolicy');
    if (body.credentialStubPolicy.mode !== undefined) {
      if (!['stub-all', 'strip'].includes(body.credentialStubPolicy.mode)) throw new ApiError('INVALID_REQUEST', { details: { path: 'credentialStubPolicy.mode' } });
      if (body.credentialStubPolicy.mode === 'strip') throw new ApiError('INVALID_REQUEST', { message: 'credentialStubPolicy.mode=strip 尚未支援。', details: { path: 'credentialStubPolicy.mode', why: 'unsupported' } });
    }
  }
  const o = { ...cfg.defaults };
  let policy = null;
  if (body.options !== undefined) {
    checkKeys(body.options, ['matrixPolicy', 'settleSeconds', 'perWorkflowTimeoutSeconds', 'jobTimeoutSeconds'], 'options');
    if (body.options.matrixPolicy !== undefined) {
      if (!['target-only', 'all'].includes(body.options.matrixPolicy)) throw new ApiError('INVALID_REQUEST', { details: { path: 'options.matrixPolicy' } });
      policy = body.options.matrixPolicy;
    }
    if (body.options.settleSeconds !== undefined) o.settleSeconds = checkInt(body.options.settleSeconds, 'options.settleSeconds', 0, 10);
    if (body.options.perWorkflowTimeoutSeconds !== undefined) o.perWorkflowTimeoutSeconds = checkInt(body.options.perWorkflowTimeoutSeconds, 'options.perWorkflowTimeoutSeconds', 10, 120);
    if (body.options.jobTimeoutSeconds !== undefined) o.jobTimeoutSeconds = checkInt(body.options.jobTimeoutSeconds, 'options.jobTimeoutSeconds', cfg.jobTimeoutMin ?? 60, 1800);
  }
  const versions = matrix ?? [target];
  if (policy === 'target-only' && target === null) throw new ApiError('INVALID_REQUEST', { details: { path: 'options.matrixPolicy', why: 'needs-target' } });
  policy ??= target !== null ? 'target-only' : 'all';
  const blockingVersions = policy === 'all' ? [...versions] : [target];
  checkWorkflowShapes(body.workflows, cfg);
  const paths = validatePaths(body.workflows);
  const workflows = body.workflows.map((w, i) => ({ path: paths[i], content: w.content }));
  const normalized = { target, versions, policy, blockingVersions, stubMode, options: o, workflows };
  return { requestId: body.requestId, ...normalized, hash: createHash('sha256').update(stable(normalized)).digest('hex') };
}

// ---- 服務 -----------------------------------------------------------------------------

export async function createDynamicFront(userConfig) {
  const cfg = { ...DEFAULTS, ...userConfig, timing: { ...DEFAULTS.timing, ...userConfig.timing }, defaults: { ...DEFAULTS.defaults, ...userConfig.defaults } };
  cfg.root = resolve(cfg.root);
  cfg.packRoot = resolve(cfg.packRoot);
  const log = cfg.log ?? createLogger(undefined, { service: 'dynamic-check' });
  const lib = await import(pathToFileURL(join(cfg.packRoot, 'scripts', 'ci', 'lib.mjs')).href);
  const versionFile = join(cfg.packRoot, 'VERSION');
  const packVersion = existsSync(versionFile) ? cleanText(readFileSync(versionFile, 'utf8').trim(), 64) || null : null;
  const dirs = { jobs: join(cfg.root, 'jobs'), done: join(cfg.root, 'done'), slots: join(cfg.root, 'slots'), quarantine: join(cfg.root, 'quarantine') };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true, mode: 0o770 });

  const auth = createAuth({ tokens: cfg.tokens, cidrs: cfg.cidrs, failLimit: cfg.authFailLimit, blockMs: cfg.authBlockMs, log });
  const rate = createRateLimiter({ perMinute: cfg.ratePerMinute, burst: cfg.rateBurst });
  const T = cfg.timing;
  const now = () => (cfg.now ? cfg.now() : Date.now());

  const jobs = new Map();           // jobId -> { meta, result }
  const byRequest = new Map();      // `${callerId}|${requestId}` -> jobId
  const slotRt = new Map();         // `${version}/${slot}` -> { quarantine, cancelPending, orphanSince, unknownLogged }
  const occupied = new Map();       // slotKey -> jobId
  let usageCache = { at: 0, pct: 0 };

  // ---- 持久化與復原 ----
  const metaPath = id => join(dirs.jobs, id, 'meta.json');
  const persist = job => writeAtomic(metaPath(job.meta.jobId), JSON.stringify(job.meta));
  const event = (job, extra = {}) => log({ event: 'job-state', jobId: job.meta.jobId, requestId: job.meta.requestId, state: job.meta.state, ...extra });

  function recover() {
    for (const id of readdirSync(dirs.jobs)) {
      if (!JOB_ID_RE.test(id)) continue;
      let meta;
      try { meta = JSON.parse(readFileSync(metaPath(id), 'utf8')); } catch { continue; }
      if (!isObj(meta) || meta.jobId !== id || !Array.isArray(meta.versions)) continue;
      let result = null;
      try { result = JSON.parse(readFileSync(join(dirs.done, id, 'result.json'), 'utf8')); } catch { /* 沒有結果 */ }
      const job = { meta, result };
      jobs.set(id, job);
      byRequest.set(`${meta.callerId}|${meta.requestId}`, id);
      for (const s of meta.versions) if (s.state === 'running' && s.slot) occupied.set(s.slot, id);
    }
    for (const name of readdirSync(dirs.quarantine)) {
      const st = statSync(join(dirs.quarantine, name));
      slotRt.set(`flag:${name}`, { at: st.mtimeMs });
    }
  }

  // ---- slot 檢視 ----
  function discoverSlots() {
    const out = [];
    let versions = [];
    try { versions = readdirSync(dirs.slots); } catch { return out; }
    for (const v of versions.filter(x => VERSION_RE.test(x))) {
      let names = [];
      try { names = readdirSync(join(dirs.slots, v), { withFileTypes: true }); } catch { continue; }
      for (const e of names) if (e.isDirectory() && SLOT_NAME_RE.test(e.name)) out.push({ key: `${v}/${e.name}`, version: v, slot: e.name, dir: join(dirs.slots, v, e.name) });
    }
    return out;
  }

  const rtOf = key => {
    let rt = slotRt.get(key);
    if (!rt) {
      rt = { quarantine: null, cancelPending: null, orphanSince: null, unknownLogged: false };
      const flag = `flag:${key.replace('/', '-')}`;
      if (slotRt.has(flag)) { rt.quarantine = { at: slotRt.get(flag).at, bootId: null }; slotRt.delete(flag); }
      slotRt.set(key, rt);
    }
    return rt;
  };

  function readStatus(s) {
    try {
      const f = readSlotFile(join(s.dir, 'status.json'), cfg.maxStatusBytes);
      if (!f) return null;
      const j = JSON.parse(f.text);
      if (!isObj(j) || typeof j.bootId !== 'string' || !BOOT_ID_RE.test(j.bootId) || !PHASES.has(j.phase)) return null;
      return { bootId: j.bootId, phase: j.phase, ageMs: Math.max(0, now() - f.mtimeMs) };
    } catch { return null; }
  }

  function quarantine(s, reason) {
    const rt = rtOf(s.key);
    if (rt.quarantine) return;
    rt.quarantine = { at: now(), bootId: readStatus(s)?.bootId ?? null };
    try { writeAtomic(join(dirs.quarantine, `${s.version}-${s.slot}`), `${iso(now())}\n`); } catch { /* 旗標寫不出去也要在記憶體隔離 */ }
    log({ event: 'quarantine', slot: s.key, reason, bootId: rt.quarantine.bootId });
  }

  function release(s, rt) {
    rt.quarantine = null;
    unlinkQuiet(join(dirs.quarantine, `${s.version}-${s.slot}`));
    log({ event: 'quarantine-release', slot: s.key });
  }

  function slotFilesOk(s) {
    let entries;
    try { entries = readdirSync(s.dir, { withFileTypes: true }); } catch { return false; }
    for (const e of entries) {
      const known = SLOT_FILES.has(e.name) || (e.name.endsWith('.tmp') && SLOT_FILES.has(e.name.slice(0, -4)));
      if (!known || !e.isFile()) return false;
    }
    return true;
  }

  // 一次掃描所有 slot：隔離判定、解除、取消後的收尾；回傳每個 slot 的檢視
  function viewSlots() {
    const views = new Map();
    for (const s of discoverSlots()) {
      const rt = rtOf(s.key);
      const status = readStatus(s);
      if (!slotFilesOk(s)) {
        if (!rt.unknownLogged) { log({ event: 'slot-unknown-file', slot: s.key }); rt.unknownLogged = true; }
        quarantine(s, 'unknown-file');
      } else rt.unknownLogged = false;
      if (rt.quarantine && rt.quarantine.bootId === null && status) rt.quarantine.bootId = status.bootId;
      const fresh = status && status.ageMs <= (status.phase === 'booting' ? T.bootStaleMs : T.staleMs);
      if (rt.quarantine && status && fresh && status.phase === 'idle' && rt.quarantine.bootId && status.bootId !== rt.quarantine.bootId && slotFilesOk(s)) {
        unlinkQuiet(join(s.dir, 'job.json')); unlinkQuiet(join(s.dir, 'result.json')); unlinkQuiet(join(s.dir, 'cancel'));
        release(s, rt);
      }
      if (rt.cancelPending && status && status.bootId !== rt.cancelPending.bootId && status.phase === 'idle') {
        unlinkQuiet(join(s.dir, 'job.json')); unlinkQuiet(join(s.dir, 'cancel'));
        rt.cancelPending = null;
      }
      views.set(s.key, { ...s, rt, status, fresh: Boolean(fresh), healthy: Boolean(fresh) && !rt.quarantine });
    }
    return views;
  }

  function usedBoots() {
    const set = new Set();
    for (const { meta } of jobs.values()) for (const k of meta.usedBoots ?? []) set.add(k);
    return set;
  }

  function canAssign(v, used) {
    if (!v.healthy || v.rt.quarantine || occupied.has(v.key) || v.rt.cancelPending || !v.status || v.status.phase !== 'idle') return false;
    if (v.status.ageMs > T.assignFreshMs || used.has(`${v.key}:${v.status.bootId}`)) return false;
    return !['job.json', 'result.json', 'cancel'].some(n => existsSync(join(v.dir, n)));
  }

  // ---- job 狀態機 ----
  const subOf = (job, version) => job.meta.versions.find(s => s.version === version);

  function usagePct(force = false) {
    if (force || now() - usageCache.at > 2000) usageCache = { at: now(), pct: Math.min(100, Math.round((dirBytes(cfg.root) / cfg.maxBytes) * 100)) };
    return usageCache.pct;
  }

  function refreshState(job) {
    const m = job.meta;
    if (m.state === 'cancelled') return;
    const st = m.versions.map(s => s.state);
    if (st.every(x => TERMINAL.has(x))) { finalize(job); return; }
    const running = st.includes('running') || (st.some(x => TERMINAL.has(x)) && st.includes('queued'));
    m.state = running ? 'running' : 'queued';
  }

  function finalize(job) {
    const m = job.meta;
    const decide = m.blockingVersions.map(v => subOf(job, v));
    const failed = decide.find(s => s.state === 'failed');
    const timedOut = decide.find(s => s.state === 'timeout');
    m.finishedAt = now();
    m.expiresAt = m.finishedAt + cfg.retentionMs;
    const anyVr = m.versions.some(s => s.vr);
    if (failed) {
      m.state = 'failed';
      m.error = jobErrorBody(failed.errorCode ?? 'EXECUTOR_CRASHED');
    } else if (timedOut) {
      m.state = 'timeout';
      m.error = jobErrorBody('JOB_TIMEOUT', m.timeoutKind === 'queue'
        ? '在佇列中等待超過時限，已放棄；結果不完整，不得視為通過。'
        : `整個 job 超過 ${m.options.jobTimeoutSeconds} 秒，已中止；結果不完整，不得視為通過。`);
    } else m.state = 'done';
    if (m.state !== 'failed' && (m.state === 'done' || anyVr)) {
      job.result = assembleResult({
        target: m.targetVersion, files: m.files, blockingVersions: m.blockingVersions, matrixPolicy: m.matrixPolicy, lib,
        subs: m.versions.map(s => ({ version: s.version, state: s.state, attempt: s.attempt, errorCode: s.errorCode, vr: s.vr, complete: s.complete })),
      });
      mkdirSync(join(dirs.done, m.jobId), { recursive: true, mode: 0o770 });
      writeAtomic(join(dirs.done, m.jobId, 'result.json'), JSON.stringify(job.result));
    }
    for (const s of m.versions) { delete s.vr; if (s.slot && occupied.get(s.slot) === m.jobId) occupied.delete(s.slot); }
    unlinkQuiet(join(dirs.jobs, m.jobId, 'request.json'));   // 輸入在進入終態時立即刪除
    persist(job);
    event(job);
  }

  function infraFail(job, s, code, view) {
    log({ event: 'job-retry', jobId: job.meta.jobId, version: s.version, attempt: s.attempt, errorCode: code, slot: s.slot });
    if (occupied.get(s.slot) === job.meta.jobId) occupied.delete(s.slot);
    if (view) unlinkQuiet(join(view.dir, 'job.json'));
    s.errorCode = code;
    s.vr = null;
    s.complete = false;
    if (s.attempt < 2) { s.state = 'queued'; s.slot = null; s.bootId = null; }
    else { s.state = 'failed'; s.finishedAt = now(); }
  }

  // 回傳 true 表示子工作的狀態有變，呼叫端要重寫 meta.json
  function pollRunning(job, s, views) {
    const v = views.get(s.slot);
    const slotDir = v?.dir ?? join(dirs.slots, s.slot);
    const pseudo = { key: s.slot, version: s.version, slot: s.slot.split('/')[1], dir: slotDir };
    // 1. 結果
    let file = null;
    try { file = readSlotFile(join(slotDir, 'result.json'), cfg.maxResultBytes); }
    catch (e) {
      log({ event: 'result-invalid', jobId: job.meta.jobId, slot: s.slot, kind: e.kind });
      rmQuiet(join(slotDir, 'result.json'));   // 連結只刪連結本身，不跟隨
      quarantine(pseudo, 'result-invalid'); infraFail(job, s, 'RESULT_INVALID', v); return true;
    }
    if (file) {
      try {
        if (jsonDepthExceeds(file.text, 12)) throw new ResultInvalid('too-deep');
        let raw;
        try { raw = JSON.parse(file.text); } catch { throw new ResultInvalid('not-json'); }
        const out = validateExecutorResult(raw, { jobId: job.meta.jobId, version: s.version, attempt: s.attempt, paths: job.meta.files }, lib);
        unlinkQuiet(join(slotDir, 'result.json'));
        if (out.infraError) { quarantine(pseudo, out.infraError); infraFail(job, s, out.infraError, v); return true; }
        s.vr = out.vr; s.complete = out.complete; s.finishedAt = now();
        s.state = out.complete ? 'done' : 'timeout';
        if (occupied.get(s.slot) === job.meta.jobId) occupied.delete(s.slot);
        return true;
      } catch (e) {
        if (!(e instanceof ResultInvalid)) throw e;
        log({ event: 'result-invalid', jobId: job.meta.jobId, slot: s.slot, kind: e.kind });
        unlinkQuiet(join(slotDir, 'result.json'));
        quarantine(pseudo, 'result-invalid'); infraFail(job, s, 'RESULT_INVALID', v); return true;
      }
    }
    // 2. 總時限（兩層之一：前端 reaper）
    if (now() > s.deadline + T.deadlineGraceMs) {
      s.state = 'timeout'; s.finishedAt = now(); s.errorCode = 'JOB_TIMEOUT';
      occupied.delete(s.slot);
      try { writeAtomic(join(slotDir, 'cancel'), ''); } catch { /* slot 已不存在 */ }
      quarantine(pseudo, 'job-timeout');
      return true;
    }
    // 3. 心跳與開機編號
    const st = v?.status;
    if (st && st.bootId !== s.bootId) { infraFail(job, s, 'EXECUTOR_CRASHED', v); return true; }
    const limit = st?.phase === 'booting' ? T.bootStaleMs : T.staleMs;
    const age = st ? st.ageMs : now() - s.startedAt;
    // 心跳還在，但放進去的 job 一直沒被取走（phase 仍是 idle）
    const ignored = st?.phase === 'idle' && now() - s.startedAt > T.bootStaleMs;
    if (age > limit || ignored) { quarantine(pseudo, ignored ? 'job-ignored' : 'heartbeat-lost'); infraFail(job, s, 'EXECUTOR_CRASHED', v); return true; }
    return false;
  }

  function assignJob(job, s, v) {
    let req;
    try { req = JSON.parse(readFileSync(join(dirs.jobs, job.meta.jobId, 'request.json'), 'utf8')); } catch { return false; }
    const m = job.meta;
    const deadline = m.deadline ?? now() + m.options.jobTimeoutSeconds * 1000;
    const body = JSON.stringify({
      jobId: m.jobId, version: s.version, attempt: s.attempt + 1, workflows: req.workflows,
      policy: { credentialStubPolicy: { mode: m.stubMode } }, options: m.options, deadline,
    });
    try { writeAtomic(join(v.dir, 'job.json'), body); } catch { return false; }
    m.deadline = deadline;
    m.startedAt ??= now();
    (m.usedBoots ??= []).push(`${v.key}:${v.status.bootId}`);   // 同一個 boot 最多只處理一個 job
    s.attempt += 1; s.state = 'running'; s.slot = v.key; s.bootId = v.status.bootId; s.startedAt = now(); s.deadline = deadline;
    s.errorCode = null;
    occupied.set(v.key, m.jobId);
    log({ event: 'job-assign', jobId: m.jobId, version: s.version, attempt: s.attempt, slot: v.key, bootId: s.bootId });
    return true;
  }

  function tick() {
    const views = viewSlots();
    const t = now();
    for (const job of jobs.values()) {
      const m = job.meta;
      if (TERMINAL.has(m.state)) continue;
      let dirty = false;
      for (const s of m.versions) if (s.state === 'running' && pollRunning(job, s, views)) dirty = true;
      // 總時限已過：還在排隊（含重試等待）的子工作一併逾時
      const expire = () => { for (const s of m.versions) if (s.state === 'queued') { s.state = 'timeout'; s.finishedAt = t; s.errorCode = 'JOB_TIMEOUT'; dirty = true; } };
      if (m.deadline && t > m.deadline) expire();
      if (!m.startedAt && t - m.createdAt > cfg.queueTimeoutMs) { m.timeoutKind = 'queue'; expire(); }
      const before = m.state;
      refreshState(job);
      if (dirty && !TERMINAL.has(m.state)) persist(job);
      if (before !== m.state && !TERMINAL.has(m.state)) event(job);
    }
    // 排程：依建立時間，把排隊中的子工作放進可用 slot
    const used = usedBoots();
    const queued = [...jobs.values()].filter(j => !TERMINAL.has(j.meta.state)).sort((a, b) => a.meta.createdAt - b.meta.createdAt);
    for (const job of queued) {
      let changed = false;
      for (const s of job.meta.versions) {
        if (s.state !== 'queued') continue;
        const v = [...views.values()].find(x => x.version === s.version && canAssign(x, used));
        if (!v) continue;
        if (assignJob(job, s, v)) { used.add(`${v.key}:${v.status.bootId}`); changed = true; }
      }
      if (changed) { refreshState(job); persist(job); event(job); }
    }
    return views;
  }

  function reap() {
    const t = now();
    const views = viewSlots();
    // 孤兒 job.json／result.json：沒有任何執行中的子工作指向這個 slot
    for (const v of views.values()) {
      const idle = !occupied.has(v.key) && !v.rt.cancelPending;
      if (idle && existsSync(join(v.dir, 'result.json'))) { unlinkQuiet(join(v.dir, 'result.json')); log({ event: 'reaper', action: 'orphan-result', slot: v.key }); }
      if (idle && existsSync(join(v.dir, 'job.json'))) {
        v.rt.orphanSince ??= t;
        if (t - v.rt.orphanSince > T.orphanJobMs) {
          unlinkQuiet(join(v.dir, 'job.json'));
          quarantine(v, 'orphan-job');
          v.rt.orphanSince = null;
          log({ event: 'reaper', action: 'orphan-job', slot: v.key });
        }
      } else v.rt.orphanSince = null;
      // 取消旗標太久沒有回應：隔離
      if (v.rt.cancelPending && t - v.rt.cancelPending.at > T.cancelMs) {
        quarantine(v, 'cancel-ignored');
        v.rt.cancelPending = null;
        log({ event: 'reaper', action: 'cancel-timeout', slot: v.key });
      }
    }
    // 沒有 meta.json 的孤兒目錄
    for (const id of readdirSync(dirs.jobs)) {
      if (jobs.has(id)) continue;
      try {
        if (!existsSync(metaPath(id)) && t - statSync(join(dirs.jobs, id)).mtimeMs > T.orphanDirMs) { rmQuiet(join(dirs.jobs, id)); log({ event: 'reaper', action: 'orphan-dir' }); }
      } catch { /* 競爭 */ }
    }
    for (const id of readdirSync(dirs.done)) if (!jobs.has(id)) rmQuiet(join(dirs.done, id));
    // 過期
    for (const [id, job] of jobs) {
      if (TERMINAL.has(job.meta.state) && t > job.meta.expiresAt) {
        rmQuiet(join(dirs.jobs, id)); rmQuiet(join(dirs.done, id));
        jobs.delete(id); byRequest.delete(`${job.meta.callerId}|${job.meta.requestId}`);
        log({ event: 'reaper', action: 'expire', jobId: id });
      }
    }
    // 用量 >= 90%：由最舊的終態 job 開始清
    if (usagePct(true) >= cfg.diskPurgePct) {
      const old = [...jobs.values()].filter(j => TERMINAL.has(j.meta.state)).sort((a, b) => a.meta.finishedAt - b.meta.finishedAt);
      for (const job of old) {
        const id = job.meta.jobId;
        rmQuiet(join(dirs.jobs, id)); rmQuiet(join(dirs.done, id));
        jobs.delete(id); byRequest.delete(`${job.meta.callerId}|${job.meta.requestId}`);
        log({ event: 'reaper', action: 'disk-purge', jobId: id });
        if (usagePct(true) < cfg.diskPurgePct) break;
      }
    }
    return views;
  }

  // ---- 對外文件 ----
  function queuePosition(job) {
    if (job.meta.state !== 'queued') return null;
    const q = [...jobs.values()].filter(j => j.meta.state === 'queued').sort((a, b) => a.meta.createdAt - b.meta.createdAt);
    return q.indexOf(job) + 1;
  }

  function docOf(job) {
    const m = job.meta;
    return {
      jobId: m.jobId, requestId: m.requestId, state: m.state, queuePosition: queuePosition(job),
      createdAt: iso(m.createdAt), startedAt: m.startedAt ? iso(m.startedAt) : null, finishedAt: m.finishedAt ? iso(m.finishedAt) : null, expiresAt: iso(m.expiresAt),
      versions: m.versions.map(s => ({ version: s.version, state: s.state, attempt: s.attempt, startedAt: s.startedAt ? iso(s.startedAt) : null, finishedAt: s.finishedAt ? iso(s.finishedAt) : null })),
      result: m.state === 'done' || m.state === 'timeout' ? job.result ?? null : null,
      error: m.state === 'failed' || m.state === 'timeout' ? m.error : null,
    };
  }

  function poolsView(views) {
    const pools = new Map();
    for (const v of views.values()) {
      const p = pools.get(v.version) ?? { version: v.version, slotsTotal: 0, slotsBusy: 0, slotsFree: 0, slotsQuarantined: 0, heartbeatAgeSecondsMax: null };
      p.slotsTotal += 1;
      if (v.rt.quarantine) p.slotsQuarantined += 1;
      else if (v.healthy) {
        if (occupied.has(v.key) || v.rt.cancelPending || v.status.phase !== 'idle') p.slotsBusy += 1; else p.slotsFree += 1;
      }
      if (v.status) p.heartbeatAgeSecondsMax = Math.max(p.heartbeatAgeSecondsMax ?? 0, Math.floor(v.status.ageMs / 1000));
      pools.set(v.version, p);
    }
    return [...pools.values()].sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  }

  const queueLength = () => [...jobs.values()].filter(j => j.meta.state === 'queued').length;

  // ---- 建立與取消 ----
  function createJob(ctx, req) {
    const key = `${ctx.callerId}|${req.requestId}`;
    const existing = byRequest.get(key) && jobs.get(byRequest.get(key));
    if (existing) {
      if (existing.meta.bodyHash !== req.hash) throw new ApiError('REQUEST_ID_CONFLICT');
      return { status: 200, body: docOf(existing), headers: { 'Idempotent-Replay': 'true' } };
    }
    const views = viewSlots();
    const poolVersions = new Set([...views.values()].map(v => v.version));
    for (const v of req.versions) if (!poolVersions.has(v)) throw new ApiError('UNSUPPORTED_VERSION', { details: { version: v } });
    const mine = [...jobs.values()].filter(j => j.meta.callerId === ctx.callerId && !TERMINAL.has(j.meta.state)).length;
    if (mine >= cfg.perCallerMax) throw new ApiError('RATE_LIMITED', { message: '同一呼叫者的進行中 job 數已達上限。', retryAfterSeconds: 30, headers: { 'Retry-After': '30' } });
    if (queueLength() >= cfg.queueMax) throw new ApiError('QUEUE_FULL', { retryAfterSeconds: 60, headers: { 'Retry-After': '60' } });
    if (usagePct(true) >= cfg.diskRejectPct) throw new ApiError('DISK_FULL', { retryAfterSeconds: 60, headers: { 'Retry-After': '60' } });
    for (const v of req.versions) {
      if (![...views.values()].some(x => x.version === v && x.healthy)) throw new ApiError('EXECUTOR_UNAVAILABLE', { retryAfterSeconds: 60, headers: { 'Retry-After': '60' } });
    }
    const id = newJobId();
    const t = now();
    const dir = join(dirs.jobs, id);
    mkdirSync(dir, { mode: 0o770 });
    writeAtomic(join(dir, 'request.json'), JSON.stringify({ workflows: req.workflows }), 0o660);
    const meta = {
      jobId: id, requestId: req.requestId, callerId: ctx.callerId, bodyHash: req.hash, state: 'queued', createdAt: t, startedAt: null, finishedAt: null,
      expiresAt: t + cfg.retentionMs, targetVersion: req.target, blockingVersions: req.blockingVersions, matrixPolicy: req.policy, stubMode: req.stubMode,
      options: req.options, files: req.workflows.map(w => w.path), deadline: null, error: null,
      versions: req.versions.map(v => ({ version: v, state: 'queued', attempt: 0, startedAt: null, finishedAt: null, slot: null, bootId: null, deadline: null, errorCode: null })),
    };
    const job = { meta, result: null };
    jobs.set(id, job);
    byRequest.set(`${ctx.callerId}|${req.requestId}`, id);
    persist(job);
    event(job);
    const doc = docOf(job);
    setImmediate(() => { try { tick(); } catch { /* 下一輪再試 */ } });
    return { status: 202, body: doc, headers: { Location: `/v1/jobs/${id}`, 'Retry-After': '5' } };
  }

  function cancelJob(job) {
    const m = job.meta;
    if (m.state === 'cancelled') return docOf(job);
    if (TERMINAL.has(m.state)) throw new ApiError('JOB_CONFLICT');
    const views = viewSlots();
    for (const s of m.versions) {
      if (s.state === 'running') {
        const v = views.get(s.slot);
        if (v) {
          try { writeAtomic(join(v.dir, 'cancel'), ''); } catch { /* slot 消失 */ }
          v.rt.cancelPending = { at: now(), bootId: s.bootId };
        }
        occupied.delete(s.slot);
      }
      if (!TERMINAL.has(s.state)) { s.state = 'cancelled'; s.finishedAt = now(); }
      delete s.vr;
    }
    m.state = 'cancelled'; m.finishedAt = now(); m.expiresAt = m.finishedAt + cfg.retentionMs; m.error = null;
    unlinkQuiet(join(dirs.jobs, m.jobId, 'request.json'));
    persist(job);
    event(job);
    return docOf(job);
  }

  // ---- HTTP ----
  async function handle(ctx) {
    const { method, path } = routeOf(ctx.req);
    const authed = () => { ctx.callerId = auth.authenticate(ctx.ip, ctx.req.headers.authorization); };

    if (path === '/healthz' && method === 'GET') {
      const views = viewSlots();
      let writable = true;
      try { accessSync(cfg.root, constants.W_OK); } catch { writable = false; }
      const pct = usagePct();
      const vs = [...views.values()];
      const pools = new Set(vs.map(v => v.version));
      const anyHealthy = vs.some(v => v.healthy);
      const allPoolsHealthy = [...pools].every(p => vs.some(v => v.version === p && v.healthy));
      const noProblems = vs.every(v => v.healthy);
      let status = 'ok';
      if (!writable || !anyHealthy) status = 'down';
      else if (!allPoolsHealthy || !noProblems || pct >= cfg.diskRejectPct) status = 'degraded';
      if (pct >= cfg.diskPurgePct && status === 'ok') status = 'degraded';
      return { status: status === 'down' ? 503 : 200, body: { status } };
    }
    if (path === '/version' && method === 'GET') {
      authed();
      return {
        status: 200,
        body: {
          service: 'dynamic-check', serviceVersion: SERVICE_VERSION, apiVersion: 'v1', blockingCatalogVersion: BLOCKING_CATALOG_VERSION, packVersion,
          supportedVersions: poolsView(viewSlots()).map(p => p.version), blockingCodes: DYNAMIC_BLOCKING_CODES,
          limits: {
            maxBodyBytes: cfg.maxBodyBytes, maxFiles: cfg.maxFiles, maxFileBytes: cfg.maxFileBytes, jobTimeoutSecondsMax: 1800,
            perWorkflowTimeoutSecondsMax: 120, queueMax: cfg.queueMax, resultRetentionSeconds: Math.round(cfg.retentionMs / 1000),
          },
        },
      };
    }
    if (path === '/v1/capacity' && method === 'GET') {
      authed();
      const views = viewSlots();
      const pools = poolsView(views);
      const pct = usagePct();
      const ql = queueLength();
      const accepting = ql < cfg.queueMax && pct < cfg.diskRejectPct && [...views.values()].some(v => v.healthy);
      return { status: 200, body: { accepting, queue: { length: ql, max: cfg.queueMax }, pools, estimatedWaitSeconds: null, sharedDirUsagePercent: pct } };
    }
    if (path === '/v1/check/dynamic' && method === 'POST') {
      checkContentHeaders(ctx.req);
      authed();
      rate.take(ctx.callerId);
      const buf = await readBody(ctx.req, cfg.maxBodyBytes);
      const body = parseJsonBody(buf, 8);
      if (isObj(body) && typeof body.requestId === 'string' && REQUEST_ID_RE.test(body.requestId)) ctx.requestId = body.requestId;
      const req = validateRequest(body, cfg);
      ctx.extra.versions = req.versions;
      ctx.extra.files = req.workflows.map(w => w.path);
      return createJob(ctx, req);
    }
    const m = /^\/v1\/jobs\/([^/]+)$/.exec(path);
    if (m && (method === 'GET' || method === 'DELETE')) {
      authed();
      const job = JOB_ID_RE.test(m[1]) ? jobs.get(m[1]) : null;
      if (!job || (TERMINAL.has(job.meta.state) && now() > job.meta.expiresAt)) throw new ApiError('NOT_FOUND');
      ctx.requestId = job.meta.requestId;
      if (method === 'DELETE') return { status: 200, body: cancelJob(job) };
      return { status: 200, body: docOf(job), headers: job.meta.state === 'queued' || job.meta.state === 'running' ? { 'Retry-After': '5' } : {} };
    }
    throw new ApiError('NOT_FOUND');
  }

  recover();
  const server = createJsonServer({ handle, log, endpointOf: req => { const r = routeOf(req); return `${r.method} ${r.path.replace(/job_[a-z0-9]+/, 'job_*')}`.slice(0, 80); } });
  let timers = [];
  return {
    server, config: cfg, jobs, slotRt, occupied, tick, reap, usagePct,
    async start() {
      const port = await listen(server, cfg.port ?? 0, cfg.host ?? '127.0.0.1');
      timers = [setInterval(() => { try { tick(); } catch (e) { log({ event: 'internal-error', errorType: e?.name }); } }, cfg.tickMs), setInterval(() => { try { reap(); } catch (e) { log({ event: 'internal-error', errorType: e?.name }); } }, cfg.reaperMs)];
      for (const t of timers) t.unref();
      log({ event: 'startup', serviceVersion: SERVICE_VERSION, packVersion, port });
      return port;
    },
    close: () => new Promise(r => { for (const t of timers) clearInterval(t); server.close(() => r()); server.closeAllConnections?.(); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let svc;
  try {
    svc = await createDynamicFront(configFromEnv());
    await svc.start();
  } catch (e) {
    console.error(`啟動失敗：${e.message}`);
    process.exit(2);
  }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => svc.close().then(() => process.exit(0)));
}

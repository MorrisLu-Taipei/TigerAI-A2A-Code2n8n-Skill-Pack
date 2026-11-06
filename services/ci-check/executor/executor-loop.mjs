#!/usr/bin/env node
// 動態檢查執行器：在無網路容器內處理「一個」job 就結束（由容器的 restart policy 換一個全新的環境）。
// 流程：寫 status.json（idle）→ 輪詢 /slot/job.json → 在容器內啟動 n8n（只綁 loopback、隨機加密金鑰、空資料目錄）
//      → 等 /rest/settings 回 JSON → run-on-n8n.mjs --bootstrap --disposable → 寫 result.json → 刪 job.json → 結束。
// 只用 Node 內建模組；只連 127.0.0.1；輸出與狀態檔不含 workflow 內容、金鑰或 n8n 的標準輸出。

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const SLOT = process.env.EXECUTOR_SLOT_DIR ?? '/slot';
const CI_ROOT = process.env.EXECUTOR_CI_ROOT ?? '/opt/ci';
const WORK_BASE = process.env.EXECUTOR_WORK_BASE ?? '/tmp';
const PORT = Number(process.env.EXECUTOR_N8N_PORT ?? 5678);
const BOOT_TIMEOUT_MS = Number(process.env.EXECUTOR_BOOT_TIMEOUT_MS ?? 90000);
const HEARTBEAT_MS = Number(process.env.EXECUTOR_HEARTBEAT_MS ?? 2000);
const POLL_MS = Number(process.env.EXECUTOR_POLL_MS ?? 1000);
// 測試掛鉤：可用 JSON 陣列取代預設指令（正式映像不設定）
const cmdOf = (envName, dflt) => { try { const v = JSON.parse(process.env[envName] ?? 'null'); return Array.isArray(v) && v.every(x => typeof x === 'string') ? v : dflt; } catch { return dflt; } };
const N8N_CMD = cmdOf('EXECUTOR_N8N_CMD', ['n8n', 'start']);
const RUN_CMD = cmdOf('EXECUTOR_RUN_CMD', [process.execPath, join(CI_ROOT, 'scripts', 'ci', 'run-on-n8n.mjs')]);

const bootId = randomBytes(12).toString('hex');
const J = p => join(SLOT, p);
const status = { bootId, phase: 'idle', jobId: null, completed: 0 };
const log = msg => console.error(`[executor] ${msg}`);

function writeAtomic(path, text) {
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, 'w', 0o664);
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
}

function writeStatus() {
  try { writeAtomic(J('status.json'), JSON.stringify({ ...status, updatedAt: new Date().toISOString() })); } catch { /* slot 暫時不可寫，下一次心跳再試 */ }
}
function setPhase(phase, extra = {}) { Object.assign(status, { phase }, extra); writeStatus(); }

const killTree = child => { if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 已結束 */ } } };

// ---- 讀取 job ------------------------------------------------------------------

function readJob() {
  const p = J('job.json');
  if (!existsSync(p)) return null;
  const st = statSync(p);
  if (!st.isFile() || st.size > 6 * 1024 * 1024) return 'invalid';
  let j;
  try { j = JSON.parse(readFileSync(p, 'utf8')); } catch { return 'invalid'; }
  const ok = j && typeof j === 'object' && /^job_[a-z0-9]{26,40}$/.test(j.jobId) && /^\d+\.\d+\.\d+$/.test(j.version) && Number.isInteger(j.attempt)
    && Array.isArray(j.workflows) && j.workflows.length >= 1 && j.workflows.length <= 20 && Number.isFinite(j.deadline)
    && j.workflows.every(w => w && typeof w.path === 'string' && typeof w.content === 'string' && w.content.length <= 1048576);
  return ok ? j : 'invalid';
}

const clamp = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

// ---- 轉換 Pack 的 ci-report.json -> versionResult ------------------------------------

function toVersionResult(report, job, nameMap, bootSeconds) {
  const fileOf = f => (typeof f === 'string' && nameMap.has(f) ? nameMap.get(f) : null);
  const cap = list => (Array.isArray(list) ? list.slice(0, 2000) : []);
  const stats = report.cleanup ?? {};
  return {
    version: job.version,
    n8nVersion: typeof report.n8nVersion === 'string' ? report.n8nVersion : null,
    boot: { status: 'ok', seconds: Math.round(bootSeconds * 10) / 10 },
    workflows: cap(report.dynamic).map(d => ({
      file: fileOf(d.file), import: d.import, importStatus: d.importStatus ?? null, activate: d.activate, activateStatus: d.activateStatus ?? null,
      webhook: typeof d.webhook === 'string' && d.webhook !== '' ? d.webhook.split('、').map(x => (x === 'ERR' ? 'ERR' : Number(x))) : null,
      executions: Array.isArray(d.executions) ? d.executions.slice(0, 10) : [],
      ...(d.timeout === true ? { timeout: true } : {}),
    })),
    blocking: cap(report.blocking).map(b => ({ code: b.code, file: fileOf(b.file), node: b.node ?? null, message: b.message })),
    advisories: cap(report.advisories).map(a => ({ source: a.source, rule: a.rule, file: fileOf(a.file), node: a.node ?? null, message: a.message })),
    cleanup: {
      workflowsCreated: stats.workflowsCreated ?? 0, workflowsDeleted: stats.workflowsDeleted ?? 0,
      credentialsCreated: stats.credentialsCreated ?? 0, credentialsDeleted: stats.credentialsDeleted ?? 0,
    },
  };
}

// ---- 處理一個 job ------------------------------------------------------------------------

async function waitReady(n8n, deadlineMs) {
  const base = `http://127.0.0.1:${PORT}`;
  while (Date.now() < deadlineMs) {
    if (n8n.exited) return 'exited';
    try {
      const h = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3000) });
      if (h.status === 200) {
        const s = await fetch(`${base}/rest/settings`, { signal: AbortSignal.timeout(3000) });
        if (s.status === 200) { try { const j = await s.json(); if (j && typeof j === 'object') return 'ready'; } catch { /* 還不是 JSON */ } }
      }
    } catch { /* 尚未就緒 */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return 'timeout';
}

async function runJob(job) {
  const startedAt = Date.now();
  setPhase('booting', { jobId: job.jobId, completed: 0 });
  const opts = {
    settle: clamp(job.options?.settleSeconds, 0, 10, 3),
    perWf: clamp(job.options?.perWorkflowTimeoutSeconds, 10, 120, 60),
  };
  const work = mkdtempSync(join(WORK_BASE, 'ci-job-'));
  const home = join(work, 'home');
  const wfDir = join(work, 'wf');
  mkdirSync(home); mkdirSync(wfDir);
  const nameMap = new Map();   // 實際檔名 -> 原始路徑（僅在報告回傳時還原）
  job.workflows.forEach((w, i) => {
    const name = `w${String(i).padStart(3, '0')}.json`;
    const target = resolve(wfDir, name);
    if (!target.startsWith(`${wfDir}${sep}`)) throw new Error('path');
    writeFileSync(target, w.content, { flag: 'wx', mode: 0o600 });
    nameMap.set(name, w.path);
  });

  let abort = null;
  let abortResolve;
  const aborted = new Promise(r => { abortResolve = r; });
  const doAbort = kind => { if (!abort) { abort = kind; abortResolve(kind); } };
  const cancelTimer = setInterval(() => { if (existsSync(J('cancel'))) doAbort('cancel'); }, 400);
  const deadlineTimer = setTimeout(() => doAbort('deadline'), Math.max(0, job.deadline - Date.now()));

  // 加密金鑰只存在子行程的環境變數；環境變數用白名單，不繼承容器環境
  const n8nEnv = {
    PATH: process.env.PATH ?? '', HOME: home, N8N_USER_FOLDER: home, N8N_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false', N8N_TEMPLATES_ENABLED: 'false', N8N_SECURE_COOKIE: 'false',
    N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_PORT: String(PORT), GENERIC_TIMEZONE: 'UTC', N8N_LOG_LEVEL: 'warn', N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true',
    EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'all', EXECUTIONS_DATA_SAVE_ON_ERROR: 'all', N8N_HIRING_BANNER_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false',
  };
  const n8n = spawn(N8N_CMD[0], N8N_CMD.slice(1), { env: n8nEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  n8n.exited = false;
  let outLines = 0;
  for (const s of [n8n.stdout, n8n.stderr]) s.on('data', d => { outLines += String(d).split('\n').length - 1; });   // 只計行數，不保存
  n8n.on('exit', () => { n8n.exited = true; });
  n8n.on('error', () => { n8n.exited = true; });

  let envelope = null;
  let pack = null;
  try {
    const ready = await Promise.race([waitReady(n8n, startedAt + BOOT_TIMEOUT_MS), aborted]);
    if (ready === 'cancel' || ready === 'deadline') { /* 由下方處理 */ }
    else if (ready !== 'ready') {
      log(`n8n 未就緒（${ready}，輸出 ${outLines} 行）`);
      envelope = { jobId: job.jobId, version: job.version, attempt: job.attempt, complete: false, infraError: 'N8N_BOOT_FAILED' };
    } else {
      const bootSeconds = (Date.now() - startedAt) / 1000;
      setPhase('running');
      const report = join(work, 'ci-report.json');
      const args = [...RUN_CMD.slice(1), '--bootstrap', '--disposable', '--dir', wfDir, '--target-version', job.version, '--out', report,
        '--workflow-timeout', String(opts.perWf), '--settle-seconds', String(opts.settle), '--wait-seconds', '30'];
      pack = spawn(RUN_CMD[0], args, { env: { PATH: process.env.PATH ?? '', HOME: home, N8N_URL: `http://127.0.0.1:${PORT}` }, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
      const exit = new Promise(r => { pack.on('exit', code => r({ code })); pack.on('error', () => r({ code: 2 })); });
      const out = await Promise.race([exit, aborted]);
      if (out !== 'cancel' && out !== 'deadline') {
        let parsed = null;
        try { parsed = JSON.parse(readFileSync(report, 'utf8')); } catch { /* 沒有報告 */ }
        if ((out.code === 0 || out.code === 1) && parsed && typeof parsed === 'object') {
          envelope = { jobId: job.jobId, version: job.version, attempt: job.attempt, complete: true, result: toVersionResult(parsed, job, nameMap, bootSeconds) };
        } else {
          log(`run-on-n8n 結束但沒有可用的報告（退出碼 ${out.code}）`);
          envelope = { jobId: job.jobId, version: job.version, attempt: job.attempt, complete: false, infraError: 'N8N_BOOT_FAILED' };
        }
      }
    }
    if (abort === 'deadline' && !envelope) {
      // Pack 沒有逐檔的中途輸出，所以逾時的部分結果沒有任何 workflow；前端會標為 timeout / incomplete
      const bootOk = status.phase === 'running';
      envelope = bootOk
        ? { jobId: job.jobId, version: job.version, attempt: job.attempt, complete: false, result: { version: job.version, n8nVersion: null, boot: { status: 'ok', seconds: Math.round((Date.now() - startedAt) / 100) / 10 }, workflows: [], blocking: [], advisories: [], cleanup: { workflowsCreated: 0, workflowsDeleted: 0, credentialsCreated: 0, credentialsDeleted: 0 } } }
        : { jobId: job.jobId, version: job.version, attempt: job.attempt, complete: false, infraError: 'N8N_BOOT_FAILED' };
    }
  } finally {
    clearInterval(cancelTimer);
    clearTimeout(deadlineTimer);
    killTree(pack);
    killTree(n8n);
  }

  if (abort === 'cancel') {
    unlinkQuiet(J('job.json'));
    setPhase('cancelled');
  } else {
    if (envelope) writeAtomic(J('result.json'), JSON.stringify(envelope));
    unlinkQuiet(J('job.json'));   // 立即清掉 workflow 原文
    setPhase('done', { completed: envelope?.result?.workflows?.length ?? 0 });
  }
  try { rmSync(work, { recursive: true, force: true }); } catch { /* tmpfs 隨容器結束清空 */ }
}

function unlinkQuiet(p) { try { unlinkSync(p); } catch { /* 不存在 */ } }

// ---- 主迴圈 ----------------------------------------------------------------------------

// 前一個 boot 殘留的輸入與取消旗標一律清掉；result.json 留給前端讀取後自行刪除
for (const name of existsSync(SLOT) ? readdirSync(SLOT) : []) {
  if (name === 'job.json' || name === 'cancel' || name.endsWith('.tmp')) unlinkQuiet(join(SLOT, name));
}
mkdirSync(dirname(J('status.json')), { recursive: true });
setPhase('idle');
const heartbeat = setInterval(writeStatus, HEARTBEAT_MS);

for (;;) {
  const job = readJob();
  if (job === 'invalid') {
    log('job.json 格式不對，結束');
    unlinkQuiet(J('job.json'));
    break;
  }
  if (job) {
    try { await runJob(job); } catch (e) { log(`處理 job 時發生錯誤（${e?.name ?? 'Error'}）`); }
    break;
  }
  await new Promise(r => setTimeout(r, POLL_MS));
}
clearInterval(heartbeat);
process.exit(0);

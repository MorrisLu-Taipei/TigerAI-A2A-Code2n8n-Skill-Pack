// 執行器驅動程式（executor-loop.mjs）的測試：用假的 n8n 與假的 run-on-n8n 在一般行程裡跑，不需要 docker。
// 容器旗標與真正的 n8n 由 run-executor-smoke.sh 負責。

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { check, checkSchema, fixture, PACK, randomToken, rm, section, SERVICES, sleep, tmp, waitFor } from './helpers.mjs';
import { pathToFileURL } from 'node:url';

const LOOP = join(SERVICES, 'executor', 'executor-loop.mjs');
const FAKE_N8N = join(SERVICES, 'test', 'fake-n8n.mjs');
const FAKE_RUN = join(SERVICES, 'test', 'fake-run.mjs');
const JOB_ID = `job_${'e'.repeat(30)}`;
const CANARY = randomToken();   // 放進執行器環境的假機密，輸出裡不得出現

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const portOpen = port => new Promise(r => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });

async function startExecutor({ mode = 'ok', n8nArg, slotSetup, env = {}, bootTimeoutMs = 4000 } = {}) {
  const base = tmp('ci-exec-test-');
  const slot = join(base, 'slot');
  const work = join(base, 'work');
  mkdirSync(slot); mkdirSync(work);
  slotSetup?.(slot);
  const port = await freePort();
  const n8nEnvFile = join(base, 'n8n-env.txt');
  const runEnvFile = join(base, 'run-env.txt');
  const child = spawn(process.execPath, [LOOP], {
    env: {
      PATH: process.env.PATH, DYNAMIC_API_TOKEN_CURRENT: CANARY, STATIC_API_TOKEN_CURRENT: CANARY, SOME_SECRET: CANARY,
      EXECUTOR_SLOT_DIR: slot, EXECUTOR_WORK_BASE: work, EXECUTOR_N8N_PORT: String(port), EXECUTOR_POLL_MS: '60', EXECUTOR_HEARTBEAT_MS: '80', EXECUTOR_BOOT_TIMEOUT_MS: String(bootTimeoutMs),
      EXECUTOR_N8N_CMD: JSON.stringify([process.execPath, FAKE_N8N, n8nEnvFile, ...(n8nArg ? [n8nArg] : [])]),
      EXECUTOR_RUN_CMD: JSON.stringify([process.execPath, FAKE_RUN, mode, runEnvFile]),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const o = { out: '', err: '' };
  child.stdout.on('data', d => { o.out += d; });
  child.stderr.on('data', d => { o.err += d; });
  const exited = new Promise(r => child.on('exit', (code, signal) => r({ code, signal })));
  const readJson = name => { try { return JSON.parse(readFileSync(join(slot, name), 'utf8')); } catch { return null; } };
  return { base, slot, work, port, child, o, exited, n8nEnvFile, runEnvFile, status: () => readJson('status.json'), result: () => readJson('result.json'), stop() { child.kill('SIGKILL'); rm(base); } };
}

function putJob(ex, { workflows, deadlineMs = 30000, version = '2.44.6', attempt = 1 } = {}) {
  const wf = workflows ?? [
    { path: 'workflows/x/one.json', content: fixture('pass-manual-set.workflow.json') },
    { path: 'workflows/x/two.json', content: `${fixture('pass-manual-set.workflow.json')}\n/* BLOCK_IMPORT */` },
  ];
  const tmpPath = join(ex.slot, 'job.json.tmp');
  writeFileSync(tmpPath, JSON.stringify({ jobId: JOB_ID, version, attempt, workflows: wf, policy: { credentialStubPolicy: { mode: 'stub-all' } }, options: { settleSeconds: 0, perWorkflowTimeoutSeconds: 30, jobTimeoutSeconds: 60 }, deadline: Date.now() + deadlineMs }));
  renameSync(tmpPath, join(ex.slot, 'job.json'));
  return wf;
}

export async function runExecutor() {
  const { validateExecutorResult } = await import(pathToFileURL(join(SERVICES, 'dynamic-result.mjs')).href);
  const lib = await import(pathToFileURL(join(PACK, 'scripts', 'ci', 'lib.mjs')).href);

  await section('執行器：正常處理一個 job', async () => {
    const ex = await startExecutor();
    const idle = await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    check(idle, '啟動後應寫出 phase=idle 的 status.json');
    const st0 = ex.status();
    check(/^[A-Za-z0-9_-]{8,64}$/.test(st0.bootId) && st0.jobId === null && typeof st0.updatedAt === 'string', 'status.json 欄位：bootId、phase、jobId、updatedAt');
    await sleep(300);
    check(ex.status().updatedAt !== st0.updatedAt, '心跳應持續更新 updatedAt');
    const wf = putJob(ex);
    const { code } = await ex.exited;
    check(code === 0, `處理完一個 job 後應以 0 結束，實際 ${code}`);
    const res = ex.result();
    check(res && res.jobId === JOB_ID && res.version === '2.44.6' && res.attempt === 1 && res.complete === true && !res.infraError, 'result.json 的外層欄位');
    let out = null;
    try { out = validateExecutorResult(res, { jobId: JOB_ID, version: '2.44.6', attempt: 1, paths: wf.map(w => w.path) }, lib); } catch (e) { check(false, `前端檢核不接受執行器的結果：${e.kind ?? e.message}`); }
    check(out?.vr?.workflows.map(w => w.file).join() === 'workflows/x/one.json,workflows/x/two.json', '檔名應還原成原始路徑');
    check(out?.vr?.blocking.length === 1 && out.vr.blocking[0].code === 'IMPORT_FAILED' && out.vr.blocking[0].file === 'workflows/x/two.json', '阻擋項的檔名應還原成原始路徑');
    check(JSON.stringify(out?.vr?.workflows[0].webhook) === '[200,"ERR"]', 'webhook 字串應拆成陣列');
    check(out?.vr?.n8nVersion === '0.0.0-fake' && out.vr.boot.status === 'ok' && out.vr.cleanup.workflowsCreated === 2 && !('workflowsAbandoned' in out.vr.cleanup), 'n8nVersion、boot、cleanup');
    check(!existsSync(join(ex.slot, 'job.json')), '結束時 job.json 應已刪除');
    const st = ex.status();
    check(st.phase === 'done' && st.jobId === JOB_ID && st.completed === 2 && st.bootId === st0.bootId, '最後的 status.json：phase=done');
    check(!(await portOpen(ex.port)), '結束時假 n8n 行程應已被殺掉');
    check(readdirSync(ex.work).length === 0, '工作目錄（資料目錄與 workflow 檔）應已刪除');
    const n8nEnv = readFileSync(ex.n8nEnvFile, 'utf8');
    check(/N8N_ENCRYPTION_KEY/.test(n8nEnv) && /KEYLEN=64/.test(n8nEnv) && /N8N_LISTEN_ADDRESS/.test(n8nEnv), 'n8n 行程應拿到隨機加密金鑰（64 個十六進位字元）與 loopback 設定');
    check(!/DYNAMIC_API_TOKEN|STATIC_API_TOKEN|SOME_SECRET/.test(n8nEnv), 'n8n 行程的環境變數只能是白名單（不得繼承 token 等容器環境）');
    const runEnv = readFileSync(ex.runEnvFile, 'utf8');
    check(/N8N_URL/.test(runEnv) && !/DYNAMIC_API_TOKEN|STATIC_API_TOKEN|SOME_SECRET|N8N_ENCRYPTION_KEY/.test(runEnv), 'run-on-n8n 行程只拿到 N8N_URL 與必要變數');
    check(/--bootstrap/.test(runEnv) && /--disposable/.test(runEnv) && /--workflow-timeout 30/.test(runEnv) && /--target-version 2\.44\.6/.test(runEnv) && /--wait-seconds 30/.test(runEnv), 'run-on-n8n 的參數：--bootstrap --disposable --workflow-timeout --target-version');
    const all = `${ex.o.out}${ex.o.err}${JSON.stringify(res)}${JSON.stringify(st)}`;
    check(!all.includes(CANARY) && !/ENCRYPTION/.test(JSON.stringify(res) + JSON.stringify(st)), '輸出、結果與狀態檔不得含金鑰或 token');
    check(!all.includes('sk-') && !ex.o.err.includes('manualTrigger'), '輸出不得含 workflow 內容');
    // 前一個 boot 的 bootId 在下一次啟動時一定不同
    rm(ex.base);
    const ex2 = await startExecutor();
    await waitFor(() => ex2.status()?.phase === 'idle', 4000, 40);
    check(ex2.status().bootId !== st0.bootId, '每次啟動的 bootId 都不同');
    ex2.stop();
  });

  await section('執行器：啟動清理、取消、時限、失敗', async () => {
    // 啟動時清掉前一個 boot 殘留的輸入與旗標，但保留 result.json
    let ex = await startExecutor({ slotSetup: slot => { writeFileSync(join(slot, 'job.json'), '{"stale":1}'); writeFileSync(join(slot, 'cancel'), ''); writeFileSync(join(slot, 'job.json.tmp'), 'x'); writeFileSync(join(slot, 'result.json'), '{"keep":1}'); } });
    await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    await sleep(300);
    check(!existsSync(join(ex.slot, 'job.json')) && !existsSync(join(ex.slot, 'cancel')) && !existsSync(join(ex.slot, 'job.json.tmp')), '啟動時應清掉殘留的 job.json／cancel／*.tmp');
    check(existsSync(join(ex.slot, 'result.json')) && ex.child.exitCode === null, '啟動時不刪 result.json（留給前端讀取），且仍在等待 job');
    ex.stop();

    // 取消：殺 n8n 與 Pack、刪 job.json、不寫結果、以 0 結束
    ex = await startExecutor({ mode: 'sleep' });
    await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    putJob(ex);
    check(await waitFor(() => ex.status()?.phase === 'running', 5000, 40), '取消測試：應進入 running');
    writeFileSync(join(ex.slot, 'cancel'), '');
    let r = await Promise.race([ex.exited, sleep(4000).then(() => null)]);
    check(r && r.code === 0, `收到 cancel 旗標：應在數秒內以 0 結束，實際 ${JSON.stringify(r)}`);
    check(!existsSync(join(ex.slot, 'result.json')) && !existsSync(join(ex.slot, 'job.json')) && ex.status().phase === 'cancelled', '取消：不寫結果、刪除 job.json、phase=cancelled');
    check(!(await portOpen(ex.port)), '取消：n8n 應被殺掉');
    ex.stop();

    // 總時限：supervisor 自己終止並寫 complete=false 的部分結果
    ex = await startExecutor({ mode: 'sleep' });
    await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    const wf = putJob(ex, { deadlineMs: 2500 });
    r = await Promise.race([ex.exited, sleep(8000).then(() => null)]);
    check(r && r.code === 0, `超過 deadline：supervisor 應自行結束，實際 ${JSON.stringify(r)}`);
    const part = ex.result();
    check(part && part.complete === false && part.result?.workflows.length === 0 && part.result.boot.status === 'ok', 'deadline：result.json 應為 complete=false 的部分結果');
    try {
      const v = validateExecutorResult(part, { jobId: JOB_ID, version: '2.44.6', attempt: 1, paths: wf.map(w => w.path) }, lib);
      check(v.complete === false && v.vr.workflows.length === 0, 'deadline：前端檢核應接受部分結果');
    } catch (e) { check(false, `deadline：前端檢核不接受部分結果 ${e.kind}`); }
    check(!existsSync(join(ex.slot, 'job.json')) && !(await portOpen(ex.port)), 'deadline：job.json 刪除、n8n 被殺掉');
    ex.stop();

    // n8n 起不來
    ex = await startExecutor({ n8nArg: 'boot-fail' });
    await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    putJob(ex);
    r = await Promise.race([ex.exited, sleep(8000).then(() => null)]);
    const bf = ex.result();
    check(r?.code === 0 && bf?.infraError === 'N8N_BOOT_FAILED' && bf.complete === false && !('result' in bf), 'n8n 起不來：應回報 infraError=N8N_BOOT_FAILED');
    try { check(validateExecutorResult(bf, { jobId: JOB_ID, version: '2.44.6', attempt: 1, paths: ['workflows/x/one.json', 'workflows/x/two.json'] }, lib).infraError === 'N8N_BOOT_FAILED', '前端檢核可讀懂 infraError'); } catch (e) { check(false, `infraError：${e.kind}`); }
    ex.stop();

    // n8n 開機逾時（假 n8n 很慢）：用很短的開機時限
    ex = await startExecutor({ env: { EXECUTOR_N8N_CMD: JSON.stringify([process.execPath, '-e', 'setTimeout(()=>{}, 60000)']) }, bootTimeoutMs: 800 });
    await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    putJob(ex);
    r = await Promise.race([ex.exited, sleep(8000).then(() => null)]);
    check(r?.code === 0 && ex.result()?.infraError === 'N8N_BOOT_FAILED', 'n8n 開機逾時：應回報 infraError=N8N_BOOT_FAILED');
    ex.stop();

    // Pack 沒有產生報告
    ex = await startExecutor({ mode: 'noreport' });
    await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    putJob(ex);
    r = await Promise.race([ex.exited, sleep(8000).then(() => null)]);
    check(r?.code === 0 && ex.result()?.infraError === 'N8N_BOOT_FAILED', 'run-on-n8n 沒有報告：應回報 infraError');
    ex.stop();

    // 壞掉的 job.json：不處理、不寫結果、結束
    ex = await startExecutor();
    await waitFor(() => ex.status()?.phase === 'idle', 4000, 40);
    writeFileSync(join(ex.slot, 'job.json'), '{"jobId":"nope"}');
    r = await Promise.race([ex.exited, sleep(4000).then(() => null)]);
    check(r?.code === 0 && !existsSync(join(ex.slot, 'result.json')) && !existsSync(join(ex.slot, 'job.json')), '格式不對的 job.json：刪除並結束，不寫結果');
    ex.stop();
  });

  await section('執行器：映像檔與容器設定檔案', async () => {
    const df = readFileSync(join(SERVICES, 'executor', 'Dockerfile.executor'), 'utf8');
    check(/^ARG N8N_VERSION/m.test(df) && /FROM docker\.n8n\.io\/n8nio\/n8n:\$\{N8N_VERSION\}/.test(df), 'Dockerfile：以 ARG N8N_VERSION 基於官方 n8n 映像');
    check(/^USER node/m.test(df) && !/^USER root\s*$/m.test(df.split('USER node')[1] ?? ''), 'Dockerfile：最後以非 root（node）執行');
    check(!/\b(apk|apt-get|apt|npm|pnpm|yarn|pip|curl|wget)\b\s+(add|install|i|update|get)/.test(df) && !/ADD\s+https?:/.test(df), 'Dockerfile：不安裝任何額外套件、不下載');
    check(/ENTRYPOINT/.test(df) && /executor-loop\.mjs/.test(df) && /scripts\/ci/.test(df) && /docs\/node-versions/.test(df), 'Dockerfile：複製 scripts/ci 與 docs/node-versions，入口為 executor-loop.mjs');
    const di = readFileSync(join(SERVICES, 'executor', 'Dockerfile.executor.dockerignore'), 'utf8');
    check(/^\*$/m.test(di) && /!scripts\/ci/.test(di), 'dockerignore：預設全排除，只放行需要的路徑');
  });
  void checkSchema;
}

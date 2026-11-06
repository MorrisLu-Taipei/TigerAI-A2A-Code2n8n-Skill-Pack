// 其他測試：前端與真實執行器驅動程式串接（假 n8n）、動態前端真實行程、原始碼的靜態檢查（沒有對外連線）。

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import {
  auth, check, checkSchema, fixture, jsonHeaders, PACK, randomToken, request, rm, section, SERVICES, sleep, tmp, waitFor,
} from './helpers.mjs';
import { createDynamicFront } from '../dynamic-front.mjs';
import { createLogger } from '../shared.mjs';

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

export async function runMisc() {
  await section('串接：動態前端 + 真實的 executor-loop（假 n8n）', async () => {
    const root = tmp('ci-e2e-');
    const slotDir = join(root, 'slots', '2.44.6', '1');
    mkdirSync(slotDir, { recursive: true });
    const token = randomToken();
    const logs = [];
    const front = await createDynamicFront({
      packRoot: PACK, root, tokens: [{ value: token, callerId: 'e2e' }], port: 0, tickMs: 60, reaperMs: 200, rateBurst: 100000, jobTimeoutMin: 1,
      log: createLogger(l => logs.push(l), { service: 'dynamic-check' }),
      timing: { assignFreshMs: 3000, staleMs: 3000, bootStaleMs: 5000, deadlineGraceMs: 1000 },
    });
    const port = await front.start();
    const n8nPort = await freePort();
    const spawnExec = () => {
      const p = spawn(process.execPath, [join(SERVICES, 'executor', 'executor-loop.mjs')], {
      env: {
        PATH: process.env.PATH, EXECUTOR_SLOT_DIR: slotDir, EXECUTOR_WORK_BASE: tmp('ci-e2e-work-'), EXECUTOR_N8N_PORT: String(n8nPort), EXECUTOR_POLL_MS: '60', EXECUTOR_HEARTBEAT_MS: '100', EXECUTOR_BOOT_TIMEOUT_MS: '4000',
        EXECUTOR_N8N_CMD: JSON.stringify([process.execPath, join(SERVICES, 'test', 'fake-n8n.mjs')]),
        EXECUTOR_RUN_CMD: JSON.stringify([process.execPath, join(SERVICES, 'test', 'fake-run.mjs'), 'ok', '-']),
      },
      stdio: 'ignore',
      });
      p.exitedP = new Promise(r => p.on('exit', code => r(code)));
      return p;
    };
    let exec = spawnExec();
    const exited = p => p.exitedP;
    const body = n => ({
      requestId: `e2e-${n}-${randomToken().slice(0, 6)}`, targetVersion: '2.44.6', options: { jobTimeoutSeconds: 30, settleSeconds: 0 },
      workflows: [{ path: 'workflows/a/one.json', content: fixture('pass-manual-set.workflow.json') }, { path: 'workflows/a/two.json', content: `${fixture('pass-manual-set.workflow.json')}\n/* BLOCK_IMPORT */` }],
    });
    const get = id => request(port, { path: `/v1/jobs/${id}`, headers: auth(token) });
    // 執行器開機後才有 idle slot
    await waitFor(async () => (await request(port, { path: '/healthz' })).json.status === 'ok', 5000, 60);

    const first = await request(port, { method: 'POST', path: '/v1/check/dynamic', headers: jsonHeaders(token), body: body(1) });
    check(first.status === 202, `串接：POST 應回 202，實際 ${first.status}`);
    const doc = await waitFor(async () => { const d = (await get(first.json.jobId)).json; return d.state === 'done' || d.state === 'failed' ? d : null; }, 15000, 80);
    check(doc?.state === 'done', `串接：job 應為 done，實際 ${doc?.state} ${JSON.stringify(doc?.error)}`);
    checkSchema('dynamic-job', doc, '#', '串接');
    check(doc?.result.status === 'fail' && doc.result.blocking.length === 1 && doc.result.blocking[0].code === 'IMPORT_FAILED' && doc.result.blocking[0].file === 'workflows/a/two.json' && doc.result.blocking[0].version === '2.44.6', '串接：阻擋項經執行器轉換、前端重算後仍正確');
    check(doc?.result.versions[0].n8nVersion === '0.0.0-fake' && doc.result.versions[0].workflows.length === 2 && doc.result.versions[0].workflows[0].webhook.join() === '200,ERR', '串接：版本結果內容');
    check(await exited(exec) === 0, '串接：執行器處理完一個 job 後以 0 結束');

    // 同一個 slot 的下一個 job：執行器未重啟前不派件（slot 一個 boot 只做一個 job）
    const second = await request(port, { method: 'POST', path: '/v1/check/dynamic', headers: jsonHeaders(token), body: body(2) });
    const st = await waitFor(async () => (await get(second.json.jobId)).json.state === 'queued', 1000, 50);
    await sleep(500);
    check(st && (await get(second.json.jobId)).json.state === 'queued', '串接：執行器結束後、新 boot 之前，第二個 job 應維持 queued');
    exec = spawnExec();
    const doc2 = await waitFor(async () => { const d = (await get(second.json.jobId)).json; return d.state === 'done' ? d : null; }, 15000, 80);
    check(doc2?.state === 'done' && doc2.versions[0].attempt === 1, '串接：新 boot 的執行器接手第二個 job（attempt=1）');
    await exited(exec);
    check(readdirSync(slotDir).sort().join() === 'status.json', `串接：結束後 slot 內只剩 status.json，實際 ${readdirSync(slotDir)}`);
    check(!logs.join('\n').includes(token) && !logs.join('\n').includes('BLOCK_IMPORT'), '串接：前端日誌不含 token 或 workflow 內容');
    await front.close();
    rm(root);
  });

  await section('動態前端：真實行程與啟動檢查', async () => {
    const token = randomToken();
    const root = tmp('ci-dynproc-');
    const run = env => spawn(process.execPath, [join(SERVICES, 'dynamic-front.mjs')], { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = c => { const o = { out: '', err: '' }; c.stdout.on('data', d => { o.out += d; }); c.stderr.on('data', d => { o.err += d; }); return o; };
    const exited = c => new Promise(r => c.on('exit', code => r(code)));

    let c = run({ DYNAMIC_API_TOKEN_CURRENT: token });
    let o = collect(c);
    check(await exited(c) === 2 && o.err.includes('DYN_ROOT') && !o.err.includes(token), '沒有 DYN_ROOT：應拒絕啟動，且不回顯 token');
    c = run({ DYN_ROOT: root });
    o = collect(c);
    check(await exited(c) === 2 && o.err.includes('DYNAMIC_API_TOKEN_CURRENT'), '沒有 token：應拒絕啟動');

    c = run({ DYN_ROOT: root, PORT: '0', HOST: '127.0.0.1', DYNAMIC_API_TOKEN_CURRENT: token });
    o = collect(c);
    const port = await waitFor(() => { const m = /"event":"startup".*"port":(\d+)/.exec(o.out); return m ? Number(m[1]) : null; }, 8000);
    check(Boolean(port), '真實行程：應輸出 startup 記錄');
    if (port) {
      const h = await request(port, { path: '/healthz' });
      check(h.status === 503 && h.json.status === 'down', '沒有任何 slot：healthz 應為 down（503）');
      const body = JSON.parse(readFileSync(join(SERVICES, 'test', 'spec-examples', 'dynamic-create.request.json'), 'utf8'));
      const r = await request(port, { method: 'POST', path: '/v1/check/dynamic', headers: jsonHeaders(token), body });
      check(r.status === 422 && r.json.error.code === 'UNSUPPORTED_VERSION', '沒有任何池：POST 應回 422 UNSUPPORTED_VERSION');
      await request(port, { method: 'POST', path: '/v1/check/dynamic', headers: jsonHeaders('q'.repeat(40)), body });
      const cap = await request(port, { path: '/v1/capacity', headers: auth(token) });
      check(cap.status === 200 && cap.json.accepting === false, 'capacity：沒有池時 accepting=false');
    }
    c.kill('SIGTERM');
    check(await exited(c) === 0, 'SIGTERM 後應正常結束');
    const all = `${o.out}\n${o.err}`;
    check(!all.includes(token) && !all.toLowerCase().includes('bearer'), '真實行程：記錄不得含 token');
    rm(root);
  });

  await section('原始碼：沒有對外網路呼叫、沒有機密或私人路徑', async () => {
    const files = [];
    const walk = d => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
    walk(SERVICES);
    const srcs = files.filter(f => /\.(mjs|sh)$/.test(f)).map(f => [f, readFileSync(f, 'utf8')]);
    const servers = ['shared.mjs', 'static-service.mjs', 'dynamic-front.mjs', 'dynamic-result.mjs', 'review-api.mjs'].map(n => [n, readFileSync(join(SERVICES, n), 'utf8')]);
    for (const [name, text] of servers) {
      check(!/\bfetch\s*\(/.test(text) && !/http\.(request|get)\b/.test(text) && !/node:https|node:tls|node:dns|node:dgram|WebSocket|XMLHttpRequest/.test(text) && !/\bnet\.(connect|createConnection)\b/.test(text), `${name}：不得有對外網路呼叫`);
      check(!/docker\.sock|\/var\/run\/docker/.test(text), `${name}：不得碰 docker.sock`);
    }
    check(!/child_process/.test(servers.find(([n]) => n === 'dynamic-front.mjs')[1]), 'dynamic-front.mjs：前端不得啟動任何子行程（沒有 n8n、沒有 docker）');
    const exec = readFileSync(join(SERVICES, 'executor', 'executor-loop.mjs'), 'utf8');
    const urls = exec.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
    check(urls.length > 0 && urls.every(u => u.startsWith('http://127.0.0.1')), '執行器：所有 URL 都只能是 127.0.0.1');
    check(!/node:https|node:dns|WebSocket/.test(exec), '執行器：不得載入對外網路模組');
    for (const [f, text] of srcs) {
      const rel = f.slice(SERVICES.length + 1);
      check(!/\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/.test(text), `${rel}：不得含內網位址`);
      check(!/\/home\/[a-z]|\/Users\/[A-Za-z]|C:\\Users/.test(text), `${rel}：不得含私人路徑`);
      check(!/sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), `${rel}：不得含金鑰樣式`);
    }
  });
}

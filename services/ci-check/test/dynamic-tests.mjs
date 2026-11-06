// 動態檢查前端的測試：以「模擬執行器」寫 status.json／result.json，不需要 docker 或 n8n。
// 時間相關的門檻（心跳逾時、孤兒回收等）在測試中縮短為數百毫秒。

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  auth, check, checkSchema, fixture, honestEnvelope, jsonHeaders, listDir, randomToken, request, rm, section, Sim, sleep, tmp, waitFor,
} from './helpers.mjs';
import { createDynamicFront } from '../dynamic-front.mjs';
import { createLogger, parseCidrs } from '../shared.mjs';
import { PACK } from './helpers.mjs';

const WF = [
  { path: 'workflows/a/echo.json', content: fixture('pass-webhook-echo.workflow.json') },
  { path: 'workflows/a/manual.json', content: fixture('pass-manual-set.workflow.json') },
];
const dreq = (o = {}) => ({ requestId: `dyn-${randomBytes(5).toString('hex')}`, targetVersion: '2.44.6', workflows: WF, options: { jobTimeoutSeconds: 20, settleSeconds: 0 }, ...o });
const errCode = r => r.json?.error?.code;

const BASE = {
  tickMs: 50, reaperMs: 120, rateBurst: 100000, jobTimeoutMin: 1,
  timing: { assignFreshMs: 2000, staleMs: 1200, bootStaleMs: 1800, deadlineGraceMs: 250, orphanJobMs: 600, orphanDirMs: 300, cancelMs: 600 },
};

async function withFront({ pools = { '2.44.6': ['1'] }, cfg = {}, startSims = true, root: givenRoot } = {}, fn) {
  const root = givenRoot ?? tmp('ci-dyn-root-');
  const logs = [];
  const sims = {};
  for (const [v, slots] of Object.entries(pools)) {
    for (const s of slots) {
      const sim = new Sim(join(root, 'slots', v, s));
      sims[`${v}/${s}`] = sim;
      if (startSims) sim.start();
    }
  }
  const token = randomToken();
  const mkFront = async () => createDynamicFront({
    ...BASE, packRoot: PACK, root, tokens: [{ value: token, callerId: 'tester' }], port: 0, log: createLogger(l => logs.push(l), { service: 'dynamic-check' }),
    ...cfg, timing: { ...BASE.timing, ...cfg.timing },
  });
  const front = await mkFront();
  const port = await front.start();
  const ctx = {
    front, port, token, root, sims, logs, mkFront, sim: Object.values(sims)[0],
    post: (body, o = {}) => request(port, { method: 'POST', path: '/v1/check/dynamic', headers: o.headers ?? jsonHeaders(o.token ?? token), body, raw: o.raw }),
    get: (id, p = '/v1/jobs/') => request(port, { path: `${p}${id}`, headers: auth(token) }),
    del: id => request(port, { method: 'DELETE', path: `/v1/jobs/${id}`, headers: auth(token) }),
    api: path => request(port, { path, headers: auth(token) }),
    async state(id, want, timeoutMs = 8000) {
      let last = null;
      await waitFor(async () => { last = (await ctx.get(id)).json; return Array.isArray(want) ? want.includes(last?.state) : last?.state === want; }, timeoutMs, 40);
      return last;
    },
    async create(body = dreq()) { const r = await ctx.post(body); return { r, id: r.json?.jobId }; },
    async capacity() { return (await ctx.api('/v1/capacity')).json; },
  };
  try { await fn(ctx); } finally {
    for (const sim of Object.values(sims)) sim.stop();
    await ctx.front.close();
    rm(root);
  }
}

async function honestRound(ctx, sim = ctx.sim) {
  const job = await sim.takeJob();
  if (job) sim.finish(honestEnvelope(job));
  return job;
}

export async function runDynamic() {
  await section('動態：建立、執行、讀回', async () => {
    await withFront({}, async ctx => {
      const body = dreq();
      const { r, id } = await ctx.create(body);
      check(r.status === 202 && r.headers.location === `/v1/jobs/${id}` && r.headers['retry-after'] === '5', `POST 應回 202＋Location＋Retry-After，實際 ${r.status}`);
      check(r.json?.state === 'queued' && /^job_[a-z0-9]{26,40}$/.test(id), '新 job 應為 queued 且 jobId 不可猜測');
      checkSchema('dynamic-job', r.json, '#', 'POST 202');
      check(r.headers['x-request-id'] === body.requestId, 'POST 應帶 X-Request-Id');

      const job = await ctx.sim.takeJob();
      check(Boolean(job) && job.jobId === id && job.version === '2.44.6' && job.attempt === 1 && job.deadline > Date.now(), 'job.json 應含 jobId、version、attempt=1 與未來的 deadline');
      check(JSON.stringify(Object.keys(job).sort()) === JSON.stringify(['attempt', 'deadline', 'jobId', 'options', 'policy', 'version', 'workflows']), `job.json 只應有約定的欄位，實際 ${Object.keys(job)}`);
      check(JSON.stringify(job.workflows.map(w => w.path)) === JSON.stringify(WF.map(w => w.path)) && !JSON.stringify(job).includes('tester') && !JSON.stringify(job).includes(ctx.token), 'job.json 的 workflows 路徑要一致，且不含 callerId 與 token');
      const running = (await ctx.get(id)).json;
      check(running.state === 'running' && running.startedAt !== null && running.versions[0].state === 'running' && running.versions[0].attempt === 1, '被取走後應為 running');
      checkSchema('dynamic-job', running, '#', 'running');
      check((await ctx.get(id)).headers['retry-after'] === '5', 'running 應帶 Retry-After');

      ctx.sim.finish(honestEnvelope(job));
      const done = await ctx.state(id, 'done');
      check(done?.state === 'done', '執行器寫完結果後應變 done');
      checkSchema('dynamic-job', done, '#', 'done');
      const res = done?.result;
      check(res?.status === 'pass' && res.complete === true && res.blockingVersions.join() === '2.44.6' && res.target === '2.44.6', 'result 應為 pass／complete／目標 2.44.6');
      check(res?.limitations.length === 11 && res.counts.files === 2 && res.counts.blocking === 0, 'limitations 固定 11 項、counts 由前端重算');
      check(res?.versions[0].workflows.every(w => w.executionSummary.total === 1 && w.executionSummary.success === 1), 'executionSummary 應由前端重算');
      check(res?.advisories.length === 1 && res.advisories[0].version === '2.44.6', '建議項應帶 version');
      check(res?.comment.split('\n')[0].includes('建議項不會讓 CI 失敗') && res.comment.includes('### 動態檢查結果') && res.comment.includes('動態檢查測不到的事（11 項）'), '註解由前端渲染並附上測不到的事');
      check(done.expiresAt > done.finishedAt, 'expiresAt 應晚於 finishedAt');
      check((await ctx.get(id)).headers['retry-after'] === undefined, '終態不帶 Retry-After');

      // 清理：輸入不留
      await sleep(150);
      check(!existsSync(join(ctx.root, 'jobs', id, 'request.json')) && existsSync(join(ctx.root, 'jobs', id, 'meta.json')), 'job 結束後 request.json 應已刪除');
      check(!existsSync(join(ctx.sim.dir, 'job.json')) && !existsSync(join(ctx.sim.dir, 'result.json')), 'slot 內不應殘留 job.json 與 result.json');
      check(existsSync(join(ctx.root, 'done', id, 'result.json')), 'done/ 應保存淨化後的結果');

      // 冪等
      const again = await ctx.post(body);
      check(again.status === 200 && again.headers['idempotent-replay'] === 'true' && again.json.jobId === id, '同 requestId 同本文：應回 200＋Idempotent-Replay 與既有 job');
      const conflict = await ctx.post({ ...body, workflows: [WF[0]] });
      check(conflict.status === 409 && errCode(conflict) === 'REQUEST_ID_CONFLICT', '同 requestId 不同本文：應回 409 REQUEST_ID_CONFLICT');
      checkSchema('error', conflict.json, '#', '409');

      // /version、/healthz、/v1/capacity
      const v = await ctx.api('/version');
      checkSchema('misc-responses', v.json, '#/$defs/dynamicVersion', '/version');
      check(v.json.blockingCodes.length === 4 && v.json.supportedVersions.join() === '2.44.6', '/version：動態 4 碼與已設定的池');
      const h = await request(ctx.port, { path: '/healthz' });
      check(h.status === 200 && h.json.status === 'ok', 'healthz 應為 ok');
      checkSchema('misc-responses', h.json, '#/$defs/healthz', 'healthz');
      const cap = await ctx.capacity();
      checkSchema('misc-responses', cap, '#/$defs/capacity', 'capacity');
      check(cap.accepting === true && cap.pools[0].slotsTotal === 1 && cap.queue.max === 20, 'capacity：接件中、1 個 slot');
      check((await request(ctx.port, { path: '/v1/capacity' })).status === 401, 'capacity 需要認證');
      const nf = await ctx.get(`job_${'q'.repeat(30)}`);
      check(nf.status === 404 && errCode(nf) === 'NOT_FOUND', '不存在的 job：404');
      check((await ctx.get('not-a-job-id')).status === 404 && (await ctx.get('../../etc/passwd')).status === 404, 'jobId 格式不對：一律 404（不區分）');
      // 日誌不含 token 與 workflow 內容
      const log = ctx.logs.join('\n');
      check(!log.includes(ctx.token) && !log.includes('ci-fixture-echo') && !log.includes('"content"'), '日誌不得含 token 或 workflow 內容');
    });
  });

  await section('動態：輸入檢核與認證', async () => {
    await withFront({ pools: { '2.44.6': ['1'], '2.37.3': ['1'] } }, async ctx => {
      const ok = dreq();
      let r = await ctx.post(ok, { headers: { 'content-type': 'application/json' } });
      check(r.status === 401 && errCode(r) === 'UNAUTHORIZED', '沒有 token：401');
      r = await ctx.post(ok, { token: 'w'.repeat(40) });
      check(r.status === 401 && !r.text.includes('w'.repeat(40)), '錯的 token：401 且不回顯');
      r = await ctx.post(ok, { headers: { 'content-type': 'text/plain', ...auth(ctx.token) } });
      check(r.status === 415, '非 JSON 的 Content-Type：415');
      r = await ctx.post(null, { raw: '{oops' });
      check(r.status === 400 && errCode(r) === 'INVALID_JSON_BODY', '壞 JSON：400 INVALID_JSON_BODY');
      const bad = [
        ['未定義欄位', { ...ok, extra: 1 }], ['缺 requestId', { ...ok, requestId: undefined }], ['沒有任何版本', { requestId: ok.requestId, workflows: ok.workflows }],
        ['matrix 超過 3 個', { ...ok, matrixVersions: ['1.0.0', '1.0.1', '1.0.2', '1.0.3'] }], ['matrix 重複', { ...ok, matrixVersions: ['2.44.6', '2.44.6'] }],
        ['target 不在 matrix', { ...ok, targetVersion: '2.44.6', matrixVersions: ['2.37.3'] }], ['strip 尚未支援', { ...ok, credentialStubPolicy: { mode: 'strip' } }],
        ['未知的 stub mode', { ...ok, credentialStubPolicy: { mode: 'x' } }], ['settleSeconds 超出', { ...ok, options: { settleSeconds: 11 } }],
        ['perWorkflowTimeoutSeconds 太小', { ...ok, options: { perWorkflowTimeoutSeconds: 5 } }], ['jobTimeoutSeconds 為 0', { ...ok, options: { jobTimeoutSeconds: 0 } }],
        ['options 未定義欄位', { ...ok, options: { x: 1 } }], ['target-only 但沒有 target', { requestId: ok.requestId, matrixVersions: ['2.44.6'], workflows: ok.workflows, options: { matrixPolicy: 'target-only' } }],
        ['version 格式', { ...ok, targetVersion: 'latest' }],
      ];
      for (const [name, body] of bad) {
        r = await ctx.post(body);
        check(r.status === 400 && errCode(r) === 'INVALID_REQUEST', `${name}：應回 400 INVALID_REQUEST，實際 ${r.status} ${errCode(r)}`);
      }
      for (const p of ['/abs.json', '../x.json', '.git/x.json', 'a//b.json', 'a/b.txt', 'a/node_modules/x.json']) {
        r = await ctx.post({ ...ok, workflows: [{ path: p, content: '{"a":1}' }] });
        check(r.status === 400 && errCode(r) === 'INVALID_PATH', `路徑 ${p}：應回 400 INVALID_PATH，實際 ${r.status}`);
      }
      r = await ctx.post({ ...ok, workflows: [{ path: 'a.json', content: '{"a":1}' }, { path: 'A.json', content: '{"a":1}' }] });
      check(r.status === 400 && errCode(r) === 'DUPLICATE_PATH', '路徑重複：400 DUPLICATE_PATH');
      r = await ctx.post({ ...ok, workflows: Array.from({ length: 21 }, (_, i) => ({ path: `f${i}.json`, content: '{"a":1}' })) });
      check(r.status === 413 && errCode(r) === 'TOO_MANY_FILES', '21 個檔案：413 TOO_MANY_FILES');
      r = await ctx.post({ ...ok, workflows: [{ path: 'big.json', content: `{"a":"${'x'.repeat(1048576)}"}` }] });
      check(r.status === 413 && errCode(r) === 'FILE_TOO_LARGE', '單檔超過 1 MB：413');
      r = await ctx.post(null, { raw: 'x'.repeat(6 * 1024 * 1024) });
      check(r.status === 413 && errCode(r) === 'PAYLOAD_TOO_LARGE', '本文超過 5 MB：413');
      r = await ctx.post({ ...ok, targetVersion: '9.9.9' });
      check(r.status === 422 && errCode(r) === 'UNSUPPORTED_VERSION', '沒有執行器池的版本：422 UNSUPPORTED_VERSION');
      r = await ctx.post({ ...ok, targetVersion: '2.44.6', matrixVersions: ['2.44.6', '2.99.0'] });
      check(r.status === 422 && errCode(r) === 'UNSUPPORTED_VERSION', 'matrix 內有沒有池的版本：422');
      r = await request(ctx.port, { method: 'DELETE', path: '/v1/check/dynamic', headers: auth(ctx.token) });
      check(r.status === 404, '錯的方法：404');
      check(readdirSync(join(ctx.root, 'jobs')).length === 0, '被拒的請求不應建立 job 目錄');
      // 規格範例
      for (const f of ['dynamic-create.request.json', 'dynamic-create.request.external-trigger.json']) {
        const body = JSON.parse(readFileSync(join(PACK, 'services', 'ci-check', 'test', 'spec-examples', f), 'utf8'));
        checkSchema('dynamic-request', body, '#', `${f}（請求範例本身）`);
        const versions = [...new Set([body.targetVersion, ...(body.matrixVersions ?? [])].filter(Boolean))];
        const rr = await ctx.post({ ...body, requestId: `dyn-${randomBytes(5).toString('hex')}` });
        const want = versions.every(v => ['2.44.6', '2.37.3'].includes(v)) ? 202 : 422;
        check(rr.status === want, `${f}：應回 ${want}（池只有 2.44.6 與 2.37.3），實際 ${rr.status}`);
        if (rr.status === 202) checkSchema('dynamic-job', rr.json, '#', f);
      }
    });
    // 來源白名單
    await withFront({ cfg: { cidrs: parseCidrs('203.0.113.0/24') } }, async ctx => {
      const r = await ctx.post(dreq());
      check(r.status === 403 && errCode(r) === 'FORBIDDEN', '來源不在白名單：403');
    });
  });

  await section('動態：惡意或錯誤的 result.json', async () => {
    const hostile = (job, fn) => honestEnvelope(job, fn);
    const cases = [
      ['超大（>1 MB）', () => JSON.stringify({ pad: 'A'.repeat(1300000) })],
      ['不是 JSON', () => '{not json'],
      ['巢狀過深', () => '['.repeat(40) + ']'.repeat(40)],
      ['jobId 不符', job => hostile(job, e => { e.jobId = `job_${'z'.repeat(30)}`; })],
      ['version 不符', job => hostile(job, e => { e.version = '9.9.9'; })],
      ['attempt 不符', job => hostile(job, e => { e.attempt = 7; })],
      ['外層多出欄位', job => hostile(job, e => { e.extra = 1; })],
      ['result 多出欄位', job => hostile(job, e => { e.result.verdict = 'pass'; })],
      ['阻擋碼不在動態 4 碼內', job => hostile(job, e => { e.result.blocking.push({ code: 'SECRET_DETECTED', file: job.workflows[0].path, node: null, message: 'x' }); })],
      ['file 不在請求內', job => hostile(job, e => { e.result.workflows[0].file = 'workflows/evil.json'; })],
      ['workflow 重複', job => hostile(job, e => { e.result.workflows[1].file = e.result.workflows[0].file; })],
      ['workflow 數量不足卻宣稱完成', job => hostile(job, e => { e.result.workflows.pop(); })],
      ['activate=failed 卻沒有阻擋項', job => hostile(job, e => { e.result.workflows[0].activate = 'failed'; })],
      ['import=failed 卻沒有 IMPORT_FAILED', job => hostile(job, e => { e.result.workflows[0].import = 'failed'; })],
      ['有 ACTIVATE_FAILED 但 activate=ok', job => hostile(job, e => { e.result.blocking.push({ code: 'ACTIVATE_FAILED', file: job.workflows[0].path, node: null, message: 'x' }); })],
      ['同一個啟用失敗兩種歸類', job => hostile(job, e => {
        e.result.workflows[0].activate = 'failed';
        e.result.blocking.push({ code: 'ACTIVATE_FAILED', file: job.workflows[0].path, node: null, message: 'x' }, { code: 'CREDENTIAL_MISSING', file: job.workflows[0].path, node: null, message: 'y' });
      })],
      ['activate=unverified 卻有 ACTIVATE_FAILED', job => hostile(job, e => {
        e.result.workflows[0].activate = 'unverified';
        e.result.blocking.push({ code: 'ACTIVATE_FAILED', file: job.workflows[0].path, node: null, message: 'x' });
      })],
      ['webhook 狀態碼不合理', job => hostile(job, e => { e.result.workflows[0].webhook = [99999]; })],
      ['executions 含非狀態字串', job => hostile(job, e => { e.result.workflows[0].executions = ['<script>']; })],
      ['advisories 超過 2000 筆', job => hostile(job, e => { e.result.advisories = Array.from({ length: 2001 }, () => e.result.advisories[0]); })],
      ['advisory 規則 ID 含空白與標記', job => hostile(job, e => { e.result.advisories[0].rule = '![x](http://e.invalid)'; })],
      ['boot 欄位不合法', job => hostile(job, e => { e.result.boot.status = 'weird'; })],
      ['cleanup 數字不合法', job => hostile(job, e => { e.result.cleanup.workflowsCreated = -5; })],
      ['complete 不是布林', job => hostile(job, e => { e.complete = 'yes'; })],
      ['workflows 項目多出欄位', job => hostile(job, e => { e.result.workflows[0].injected = true; })],
    ];
    await withFront({}, async ctx => {
      for (const [name, make] of cases) {
        const { r, id } = await ctx.create(dreq());
        if (r.status !== 202) { check(false, `${name}：建立 job 失敗 ${r.status}`); continue; }
        const job = await ctx.sim.takeJob();
        const raw = make(job);
        ctx.sim.finish(typeof raw === 'string' ? raw : JSON.stringify(raw));
        const quarantined = await waitFor(async () => (await ctx.capacity()).pools[0].slotsQuarantined === 1, 4000, 40);
        check(quarantined, `${name}：無效的結果應使該 slot 被隔離`);
        const mid = (await ctx.get(id)).json;
        check(mid.state === 'queued' && mid.versions[0].attempt === 1 && mid.result === null, `${name}：應丟棄結果並重新排隊（attempt 仍為 1），實際 ${mid.state}`);
        check(ctx.logs.some(l => l.includes('"event":"result-invalid"') && l.includes(id)), `${name}：應記錄 result-invalid 事件`);
        check(!existsSync(join(ctx.sim.dir, 'result.json')), `${name}：無效的 result.json 應被刪除`);
        // 隔離期間不會有新的 job 被放進同一個 slot；容器重啟（新 bootId）後才解除
        await sleep(250);
        check(!existsSync(join(ctx.sim.dir, 'job.json')), `${name}：隔離中的 slot 不應收到新 job`);
        ctx.sim.start();
        const job2 = await ctx.sim.takeJob();
        check(Boolean(job2) && job2.jobId === id && job2.attempt === 2, `${name}：重啟後應以 attempt=2 重新交付`);
        if (job2) ctx.sim.finish(honestEnvelope(job2));
        const fin = await ctx.state(id, 'done');
        check(fin?.state === 'done' && fin.result.status === 'pass', `${name}：第二次嘗試的正常結果應被接受`);
        ctx.sim.start();
        await waitFor(async () => (await ctx.capacity()).pools[0].slotsFree === 1, 3000, 40);
      }

      // 兩次都無效：job failed，不給結果
      const { id } = await ctx.create(dreq());
      for (let i = 0; i < 2; i++) {
        const job = await ctx.sim.takeJob();
        ctx.sim.finish('{not json');
        if (i === 0) { await waitFor(async () => (await ctx.get(id)).json.state === 'queued' && (await ctx.capacity()).pools[0].slotsQuarantined === 1, 4000); ctx.sim.start(); }
        check(Boolean(job), '兩次無效：第 ' + (i + 1) + ' 次應有 job');
      }
      const failed = await ctx.state(id, 'failed');
      check(failed?.state === 'failed' && failed.error.code === 'RESULT_INVALID' && failed.error.retryable === true && failed.result === null && failed.versions[0].attempt === 2, '兩次都無效：job 應為 failed／RESULT_INVALID／retryable，且不給結果');
      checkSchema('dynamic-job', failed, '#', '兩次無效');

      // result.json 是符號連結：不跟隨、視為無效
      ctx.sim.start();
      await waitFor(async () => (await ctx.capacity()).pools[0].slotsFree === 1, 3000, 40);
      const s2 = await ctx.create(dreq());
      const job = await ctx.sim.takeJob();
      const target = join(ctx.root, 'outside.json');
      writeFileSync(target, JSON.stringify(honestEnvelope(job)));
      symlinkSync(target, join(ctx.sim.dir, 'result.json'));
      const q = await waitFor(async () => (await ctx.capacity()).pools[0].slotsQuarantined === 1, 4000, 40);
      const rq = await waitFor(async () => (await ctx.get(s2.id)).json.state === 'queued', 3000, 40);
      check(q && rq, 'result.json 為符號連結：不得被讀取，slot 應被隔離');
      check(existsSync(target), '符號連結的目標檔不得被刪除（只刪連結）');
      ctx.sim.start();
      await ctx.del(s2.id);
    });
  });

  await section('動態：結果重算與淨化', async () => {
    await withFront({}, async ctx => {
      // 執行器宣稱 status=pass、executionSummary 與計數造假，但實際有阻擋項
      let { id } = await ctx.create(dreq());
      let job = await ctx.sim.takeJob();
      let env = honestEnvelope(job, e => {
        e.result.status = 'pass';
        e.result.workflows[0].import = 'failed';
        e.result.workflows[0].executionSummary = { total: 99, success: 99, error: 0, crashed: 0, other: 0 };
        e.result.blocking.push({ code: 'IMPORT_FAILED', file: job.workflows[0].path, node: null, message: '匯入失敗' });
        e.result.counts = { blocking: 0 };
      });
      delete env.result.counts;
      ctx.sim.finish(env);
      let doc = await ctx.state(id, 'done');
      check(doc?.result.status === 'fail' && doc.result.counts.blocking === 1 && doc.result.counts.blockingByCode.IMPORT_FAILED === 1, '宣稱通過但有阻擋項：前端重算後應為 fail');
      check(doc?.result.versions[0].workflows[0].executionSummary.total === 1 && doc.result.versions[0].status === 'fail', 'executionSummary 與版本狀態應由前端重算');
      check(doc?.result.comment.includes('結果：失敗') && doc.result.comment.includes('### 阻擋項（1）'), '註解應反映重算後的 fail');
      checkSchema('dynamic-job', doc, '#', '重算 fail');

      // 淨化：控制字元、超長、連結與提及、疑似金鑰
      ctx.sim.start();
      ({ id } = await ctx.create(dreq()));
      job = await ctx.sim.takeJob();
      const secretLike = ['sk', 'ZZZZ'.repeat(7)].join('-');
      env = honestEnvelope(job, e => {
        e.result.workflows[0].import = 'failed';
        e.result.blocking.push({ code: 'IMPORT_FAILED', file: job.workflows[0].path, node: `[x](http://evil.invalid/p)@admin${'N'.repeat(300)}`, message: `第一行\n## 假標題\r\n\u0007${secretLike} ${'M'.repeat(400)}` });
        e.result.advisories.push({ source: 'n8n-run', rule: 'execution-status', file: null, node: '![img](http://evil.invalid/x.png)', message: '<b>@all</b> www.evil.invalid' });
      });
      ctx.sim.finish(env);
      doc = await ctx.state(id, 'done');
      const b = doc?.result.blocking[0];
      check(b && b.node.length <= 201 && b.message.length <= 201 && !/[\u0000-\u001f\u007f]/.test(b.message), '淨化：長度 ≤ 201 且無控制字元');
      check(b && !b.message.includes(secretLike) && b.message.includes('***'), '淨化：疑似金鑰樣式應被遮罩');
      const cm = doc?.result.comment ?? '';
      for (const bad of ['](http', '![img]', '@admin', '@all', '<b>', 'www.evil']) check(!cm.includes(bad), `淨化：註解不得含未跳脫的「${bad}」`);
      check(!cm.split('\n').some(l => /^\s*#+ 假標題/.test(l)), '淨化：換行不得讓內容變成標題');
      checkSchema('dynamic-job', doc, '#', '淨化');
    });
  });

  await section('動態：reaper（心跳、逾時、孤兒、過期、磁碟）', async () => {
    // 心跳中斷：重試一次，仍失敗則 failed
    await withFront({}, async ctx => {
      let { id } = await ctx.create(dreq());
      let job = await ctx.sim.takeJob();
      ctx.sim.stop();
      const requeued = await waitFor(async () => { const d = (await ctx.get(id)).json; return d.state === 'queued' && d.versions[0].attempt === 1; }, 5000, 50);
      check(requeued, '心跳中斷：應判定失聯並重新排隊');
      check((await ctx.capacity()).pools[0].slotsQuarantined === 1, '心跳中斷：slot 應被隔離');
      ctx.sim.start();
      job = await ctx.sim.takeJob();
      check(job?.attempt === 2, '重啟後應以 attempt=2 重新交付');
      ctx.sim.stop();
      const failed = await ctx.state(id, 'failed', 6000);
      check(failed?.state === 'failed' && failed.error.code === 'EXECUTOR_CRASHED' && failed.error.retryable === true && failed.versions[0].attempt === 2, '兩次失聯：job failed／EXECUTOR_CRASHED');
      checkSchema('dynamic-job', failed, '#', 'EXECUTOR_CRASHED');
      ctx.sim.start();
      // 執行器的 n8n 開機失敗（回報 infraError）：同樣重試
      ({ id } = await ctx.create(dreq()));
      job = await ctx.sim.takeJob();
      ctx.sim.finish({ jobId: job.jobId, version: job.version, attempt: job.attempt, complete: false, infraError: 'N8N_BOOT_FAILED' });
      await waitFor(async () => (await ctx.capacity()).pools[0].slotsQuarantined === 1, 4000);
      ctx.sim.start();
      job = await ctx.sim.takeJob();
      ctx.sim.finish({ jobId: job.jobId, version: job.version, attempt: job.attempt, complete: false, infraError: 'N8N_BOOT_FAILED' });
      const boot = await ctx.state(id, 'failed');
      check(boot?.error.code === 'N8N_BOOT_FAILED' && boot.result === null, 'n8n 開機失敗兩次：job failed／N8N_BOOT_FAILED');
      ctx.sim.start();
      // 執行器心跳正常，卻一直不取走 job
      ({ id } = await ctx.create(dreq()));
      const ig = await waitFor(async () => { const d = (await ctx.get(id)).json; return d.versions[0].attempt === 1 && d.state === 'queued' && existsSync(join(ctx.sim.dir, 'job.json')) === false; }, 6000, 80);
      check(ig, '執行器不取走 job：應判定失聯並重新排隊');
    });

    // 總時限
    await withFront({}, async ctx => {
      const { id } = await ctx.create(dreq({ options: { jobTimeoutSeconds: 1, settleSeconds: 0 } }));
      await ctx.sim.takeJob();
      const t = await ctx.state(id, 'timeout', 6000);
      check(t?.state === 'timeout' && t.error.code === 'JOB_TIMEOUT' && t.error.retryable === false && t.result === null, '超過總時限：timeout／JOB_TIMEOUT／不可重試');
      checkSchema('dynamic-job', t, '#', 'timeout');
      check(existsSync(join(ctx.sim.dir, 'cancel')) && (await ctx.capacity()).pools[0].slotsQuarantined === 1, '總時限：應放取消旗標並隔離 slot');
      ctx.sim.start();
      // 執行器自己在時限內回報的部分結果
      const s2 = await ctx.create(dreq({ options: { jobTimeoutSeconds: 1, settleSeconds: 0 } }));
      const job = await ctx.sim.takeJob();
      ctx.sim.finish({ jobId: job.jobId, version: job.version, attempt: 1, complete: false, result: { version: '2.44.6', n8nVersion: '2.44.6', boot: { status: 'ok', seconds: 3 }, workflows: [], blocking: [], advisories: [], cleanup: { workflowsCreated: 0, workflowsDeleted: 0, credentialsCreated: 0, credentialsDeleted: 0 } } });
      const part = await ctx.state(s2.id, 'timeout');
      check(part?.result?.status === 'incomplete' && part.result.complete === false && part.error.code === 'JOB_TIMEOUT', '部分結果：job timeout，result 為 incomplete／complete=false');
      check(part?.result?.comment.includes('未完成'), '部分結果：註解應標示未完成');
      checkSchema('dynamic-job', part, '#', '部分結果');
    });

    // 排隊逾時
    await withFront({ cfg: { queueTimeoutMs: 600 } }, async ctx => {
      const j1 = await ctx.create(dreq());
      await ctx.sim.takeJob();
      const j2 = await ctx.create(dreq());
      const q = (await ctx.get(j2.id)).json;
      check(q.state === 'queued' && q.queuePosition === 1, '排隊中：queuePosition 應為 1');
      const t = await ctx.state(j2.id, 'timeout', 4000);
      check(t?.state === 'timeout' && t.error.code === 'JOB_TIMEOUT' && t.error.message.includes('佇列') && t.result === null, '排隊逾時：timeout／JOB_TIMEOUT');
      await ctx.del(j1.id);
    });

    // 孤兒 job.json、孤兒目錄、過期
    await withFront({ cfg: { retentionMs: 900 } }, async ctx => {
      writeFileSync(join(ctx.sim.dir, 'job.json'), '{"orphan":true}');
      const gone = await waitFor(() => !existsSync(join(ctx.sim.dir, 'job.json')), 4000, 50);
      check(gone, '孤兒 job.json：超過門檻應刪除');
      check((await ctx.capacity()).pools[0].slotsQuarantined === 1, '孤兒 job.json：slot 應被隔離');
      ctx.sim.start();
      const orphan = join(ctx.root, 'jobs', `job_${'o'.repeat(30)}`);
      mkdirSync(orphan);
      writeFileSync(join(orphan, 'request.json'), '{}');
      const old = new Date(Date.now() - 60000);
      utimesSync(orphan, old, old);
      check(await waitFor(() => !existsSync(orphan), 3000, 50), '沒有 meta.json 的孤兒目錄：超過門檻應刪除');
      // 過期
      const { id } = await ctx.create(dreq());
      await honestRound(ctx);
      await ctx.state(id, 'done');
      const exp = await waitFor(async () => (await ctx.get(id)).status === 404, 4000, 50);
      check(exp, '結果保留期過後應回 404');
      check(await waitFor(() => !existsSync(join(ctx.root, 'jobs', id)) && !existsSync(join(ctx.root, 'done', id)), 3000, 50), '過期後 jobs/ 與 done/ 的目錄都應刪除');
      const replay = await ctx.post(dreq({ requestId: 'dyn-reuse-after-expiry' }));
      check(replay.status === 202, '過期後仍可建立新 job');
      await ctx.del(replay.json.jobId);
    });

    // 磁碟：>= 80% 拒收；>= 90% 清最舊的終態 job
    await withFront({ cfg: { maxBytes: 200000, retentionMs: 600000 } }, async ctx => {
      const first = await ctx.create(dreq());
      await honestRound(ctx);
      await ctx.state(first.id, 'done');
      writeFileSync(join(ctx.root, 'done', first.id, 'junk.bin'), Buffer.alloc(165000, 1));
      const full = await ctx.post(dreq());
      check(full.status === 503 && errCode(full) === 'DISK_FULL' && full.headers['retry-after'], '用量 >= 80%：503 DISK_FULL＋Retry-After');
      checkSchema('error', full.json, '#', 'DISK_FULL');
      check((await ctx.capacity()).accepting === false, '用量 >= 80%：capacity.accepting 應為 false');
      const h = await request(ctx.port, { path: '/healthz' });
      check(h.status === 200 && h.json.status === 'degraded', '用量 >= 80%：healthz 應為 degraded');
      writeFileSync(join(ctx.root, 'done', first.id, 'junk2.bin'), Buffer.alloc(30000, 1));
      const purged = await waitFor(async () => (await ctx.get(first.id)).status === 404, 4000, 60);
      check(purged, '用量 >= 90%：應緊急清掉最舊的終態 job');
    });
  });

  await section('動態：取消、佇列、容量、健康', async () => {
    await withFront({ cfg: { queueMax: 2 } }, async ctx => {
      const j1 = await ctx.create(dreq());
      const job1 = await ctx.sim.takeJob();
      const j2 = await ctx.create(dreq());
      const j3 = await ctx.create(dreq());
      const full = await ctx.post(dreq());
      check(full.status === 429 && errCode(full) === 'QUEUE_FULL' && full.headers['retry-after'] === '60' && full.json.error.retryAfterSeconds === 60, '佇列滿：429 QUEUE_FULL＋Retry-After');
      checkSchema('error', full.json, '#', 'QUEUE_FULL');
      const cap = await ctx.capacity();
      check(cap.accepting === false && cap.queue.length === 2 && cap.pools[0].slotsBusy === 1, 'capacity：佇列滿時 accepting=false、queue.length=2、1 個忙碌');
      checkSchema('misc-responses', cap, '#/$defs/capacity', 'capacity 佇列滿');
      check((await ctx.get(j3.id)).json.queuePosition === 2, '第二個排隊者 queuePosition=2');

      // 取消排隊中的 job
      const c2 = await ctx.del(j2.id);
      check(c2.status === 200 && c2.json.state === 'cancelled' && c2.json.versions[0].state === 'cancelled' && c2.json.result === null, 'DELETE 排隊中：200 cancelled');
      checkSchema('dynamic-job', c2.json, '#', 'cancel');
      check((await ctx.del(j2.id)).status === 200, '重複取消：200（冪等）');
      check((await ctx.get(j3.id)).json.queuePosition === 1, '取消後 queuePosition 遞補');

      // 取消執行中的 job：放取消旗標；slot 在新 boot 前不會被重用
      const c1 = await ctx.del(j1.id);
      check(c1.json.state === 'cancelled' && existsSync(join(ctx.sim.dir, 'cancel')), 'DELETE 執行中：cancelled 並在 slot 放 cancel 旗標');
      ctx.ago = Date.now();
      await sleep(300);
      check((await ctx.get(j3.id)).json.state === 'queued', '取消後 slot 在重啟前不應收新 job');
      ctx.sim.finish(honestEnvelope(job1));   // 被取消的執行器若仍寫出結果，前端不應採用
      await sleep(150);
      check((await ctx.get(j1.id)).json.state === 'cancelled' && (await ctx.get(j1.id)).json.result === null, '已取消的 job 不應因遲到的結果而復活');
      ctx.sim.start();
      const job3 = await ctx.sim.takeJob();
      check(job3?.jobId === j3.id, '新 boot 之後排隊中的 job 才被交付');
      ctx.sim.finish(honestEnvelope(job3));
      await ctx.state(j3.id, 'done');
      const conflict = await ctx.del(j3.id);
      check(conflict.status === 409 && errCode(conflict) === 'JOB_CONFLICT', '已完成的 job 取消：409 JOB_CONFLICT');
      check((await ctx.del(`job_${'k'.repeat(30)}`)).status === 404, '取消不存在的 job：404');
    });

    await withFront({ cfg: { perCallerMax: 2 } }, async ctx => {
      const a = await ctx.create(dreq());
      await ctx.create(dreq());
      const r = await ctx.post(dreq());
      check(r.status === 429 && errCode(r) === 'RATE_LIMITED', '同一呼叫者進行中 job 達上限：429 RATE_LIMITED');
      await ctx.del(a.id);
      check((await ctx.post(dreq())).status === 202, '取消一個後應可再建立');
    });

    // 健康：ok／degraded／down 與無執行器時的 503
    await withFront({ pools: { '2.44.6': ['1', '2'] } }, async ctx => {
      const hz = async () => request(ctx.port, { path: '/healthz' });
      check((await hz()).json.status === 'ok', '兩個 slot 都正常：ok');
      ctx.sims['2.44.6/2'].stop();
      const deg = await waitFor(async () => (await hz()).json.status === 'degraded', 4000, 80);
      check(deg && (await hz()).status === 200, '一個 slot 失聯：degraded（HTTP 200）');
      const cap = await ctx.capacity();
      check(cap.pools[0].slotsTotal === 2 && cap.pools[0].slotsFree === 1, 'capacity：失聯的 slot 不算可用');
      ctx.sim.stop();
      const down = await waitFor(async () => (await hz()).status === 503, 4000, 80);
      check(down && (await hz()).json.status === 'down', '全部失聯：down（HTTP 503）');
      const r = await ctx.post(dreq());
      check(r.status === 503 && errCode(r) === 'EXECUTOR_UNAVAILABLE' && r.headers['retry-after'] === '60', '沒有健康執行器：503 EXECUTOR_UNAVAILABLE＋Retry-After');
      checkSchema('error', r.json, '#', 'EXECUTOR_UNAVAILABLE');
      check((await ctx.capacity()).accepting === false, '沒有健康執行器：accepting=false');
      ctx.sim.start(); ctx.sims['2.44.6/2'].start();
      check(await waitFor(async () => (await hz()).json.status === 'ok', 3000, 80), '恢復後：ok');
    });

    // slot 內出現不認得的檔案：隔離；清掉並換 boot 後解除
    await withFront({}, async ctx => {
      mkdirSync(join(ctx.sim.dir, 'evil'));
      const q = await waitFor(async () => (await ctx.capacity()).pools[0].slotsQuarantined === 1, 3000, 50);
      check(q && ctx.logs.some(l => l.includes('slot-unknown-file')), '不認得的子目錄：slot 應被隔離並記錄');
      check((await ctx.post(dreq())).status === 503, '隔離中沒有健康 slot：503');
      ctx.sim.start();
      await sleep(300);
      check((await ctx.capacity()).pools[0].slotsQuarantined === 1, '檔案還在時，新 boot 也不解除隔離');
      rm(join(ctx.sim.dir, 'evil'));
      ctx.sim.start();
      check(await waitFor(async () => (await ctx.capacity()).pools[0].slotsQuarantined === 0, 3000, 50), '清掉不認得的檔案並換 boot 後應解除隔離');
      check(!existsSync(join(ctx.root, 'quarantine', '2.44.6-1')), '解除隔離後旗標檔應刪除');
    });
  });

  await section('動態：多版本矩陣', async () => {
    const pools = { '2.37.3': ['1'], '2.44.6': ['1'], '2.46.6': ['1'] };
    const importFail = (job, version) => honestEnvelope(job, e => {
      e.result.workflows[0].import = 'failed'; e.result.workflows[0].importStatus = 400;
      e.result.blocking.push({ code: 'IMPORT_FAILED', file: job.workflows[0].path, node: null, message: `匯入失敗（${version}）` });
    });
    await withFront({ pools }, async ctx => {
      // target-only：非目標版本的阻擋碼降為建議項
      let { r, id } = await ctx.create(dreq({ matrixVersions: ['2.37.3', '2.44.6', '2.46.6'] }));
      check(r.status === 202 && r.json.versions.length === 3, '矩陣：POST 回 3 個版本的子工作');
      const jobs = await Promise.all(['2.37.3', '2.44.6', '2.46.6'].map(v => ctx.sims[`${v}/1`].takeJob()));
      check(jobs.every(Boolean) && jobs.map(j => j.version).join() === '2.37.3,2.44.6,2.46.6', '矩陣：三個池各收到自己版本的 job');
      jobs.forEach((j, i) => ctx.sims[`${j.version}/1`].finish(i === 0 ? importFail(j, j.version) : honestEnvelope(j)));
      let doc = await ctx.state(id, 'done');
      check(doc?.result.status === 'pass' && doc.result.complete && doc.result.blocking.length === 0 && doc.result.blockingVersions.join() === '2.44.6', 'target-only：非目標版本的阻擋項不使結果失敗');
      const m = doc?.result.advisories.find(a => a.source === 'matrix');
      check(m && m.rule === 'IMPORT_FAILED' && m.version === '2.37.3', 'target-only：降級的阻擋項應成為 source=matrix 的建議項');
      check(doc?.result.versions.find(v => v.version === '2.37.3').status === 'fail' && doc.result.versions.find(v => v.version === '2.37.3').blocking.length === 1, '該版本自己的結果仍記為 fail');
      check(doc?.result.comment.includes('### 多版本對照') && doc.result.comment.includes('2.44.6（目標）') && doc.result.comment.includes('多版本對照（建議）'), '矩陣：註解有多版本對照表與 matrix 建議項分組');
      checkSchema('dynamic-job', doc, '#', 'target-only');
      for (const s of Object.values(ctx.sims)) s.start();

      // 只給 matrixVersions：每個版本都決定結果
      ({ id } = await ctx.create(dreq({ targetVersion: undefined, matrixVersions: ['2.37.3', '2.44.6'] })));
      const j2 = await Promise.all(['2.37.3', '2.44.6'].map(v => ctx.sims[`${v}/1`].takeJob()));
      j2.forEach((j, i) => ctx.sims[`${j.version}/1`].finish(i === 0 ? importFail(j, j.version) : honestEnvelope(j)));
      doc = await ctx.state(id, 'done');
      check(doc?.result.status === 'fail' && doc.result.blocking.length === 1 && doc.result.blocking[0].version === '2.37.3' && doc.result.blockingVersions.join() === '2.37.3,2.44.6', 'matrixPolicy=all：任何版本的阻擋項都使結果失敗');
      check(doc?.result.target === null, '只給 matrixVersions：target 為 null');
      for (const s of Object.values(ctx.sims)) s.start();

      // 明確指定 policy=all
      ({ id } = await ctx.create(dreq({ matrixVersions: ['2.37.3', '2.44.6'], options: { matrixPolicy: 'all', jobTimeoutSeconds: 20, settleSeconds: 0 } })));
      const j3 = await Promise.all(['2.37.3', '2.44.6'].map(v => ctx.sims[`${v}/1`].takeJob()));
      j3.forEach((j, i) => ctx.sims[`${j.version}/1`].finish(i === 0 ? importFail(j, j.version) : honestEnvelope(j)));
      doc = await ctx.state(id, 'done');
      check(doc?.result.status === 'fail', '明確指定 matrixPolicy=all：非目標版本的阻擋項也使結果失敗');
      for (const s of Object.values(ctx.sims)) s.start();

      // 非目標版本的基礎設施失敗：不影響 job 狀態
      ({ id } = await ctx.create(dreq({ matrixVersions: ['2.44.6', '2.46.6'], targetVersion: '2.44.6' })));
      const sim46 = ctx.sims['2.46.6/1'];
      const [a, b] = await Promise.all([ctx.sims['2.44.6/1'].takeJob(), sim46.takeJob()]);
      ctx.sims['2.44.6/1'].finish(honestEnvelope(a));
      sim46.finish({ jobId: b.jobId, version: b.version, attempt: 1, complete: false, infraError: 'N8N_BOOT_FAILED' });
      await waitFor(async () => (await ctx.capacity()).pools.find(p => p.version === '2.46.6').slotsQuarantined === 1, 4000);
      sim46.start();
      const b2 = await sim46.takeJob();
      sim46.finish({ jobId: b2.jobId, version: b2.version, attempt: 2, complete: false, infraError: 'N8N_BOOT_FAILED' });
      doc = await ctx.state(id, 'done');
      const v46 = doc?.result.versions.find(v => v.version === '2.46.6');
      check(doc?.state === 'done' && doc.result.status === 'pass' && v46?.status === 'error' && v46.boot.status === 'failed', '非目標版本失敗：job 仍為 done，該版本記為 error');
      check(doc?.result.advisories.some(a => a.source === 'matrix' && a.rule === 'N8N_BOOT_FAILED' && a.version === '2.46.6'), '非目標版本失敗：應有 matrix 建議項');
      check(doc?.versions.find(v => v.version === '2.46.6').state === 'failed', 'versions[] 內該版本為 failed');
      checkSchema('dynamic-job', doc, '#', '非目標版本失敗');
      for (const s of Object.values(ctx.sims)) s.start();

      // 目標版本失敗：job failed
      ({ id } = await ctx.create(dreq({ matrixVersions: ['2.44.6', '2.46.6'], targetVersion: '2.44.6' })));
      const sim44 = ctx.sims['2.44.6/1'];
      const [c, d] = await Promise.all([sim44.takeJob(), sim46.takeJob()]);
      sim46.finish(honestEnvelope(d));
      sim44.finish('壞掉');
      await waitFor(async () => (await ctx.capacity()).pools.find(p => p.version === '2.44.6').slotsQuarantined === 1, 4000);
      sim44.start();
      const c2 = await sim44.takeJob();
      sim44.finish('又壞掉');
      doc = await ctx.state(id, 'failed');
      check(doc?.state === 'failed' && doc.error.code === 'RESULT_INVALID' && doc.result === null && c2.attempt === 2, '目標版本失敗：job failed，不給結果');
      void c;
    });

    // 工作流程旗標：workflow 逾時與無法歸類的啟用失敗 -> incomplete；NO_TRIGGER 與外部註冊只是建議
    await withFront({}, async ctx => {
      const run = async mut => {
        const { id } = await ctx.create(dreq());
        const job = await ctx.sim.takeJob();
        ctx.sim.finish(honestEnvelope(job, mut));
        const doc = await ctx.state(id, 'done');
        ctx.sim.start();
        return doc;
      };
      let doc = await run(e => { e.result.workflows[1].timeout = true; e.result.workflows[1].activate = 'skipped'; e.result.advisories.push({ source: 'n8n-run', rule: 'workflow:timeout', file: e.result.workflows[1].file, node: null, message: '逾時' }); });
      check(doc.state === 'done' && doc.result.status === 'incomplete' && doc.result.complete === false && doc.result.blocking.length === 0, 'workflow 逾時：job done，但結果 incomplete／complete=false');
      check(doc.result.comment.includes('未完成') && doc.result.comment.includes('workflow-timeout'), 'workflow 逾時：註解標示未完成');
      checkSchema('dynamic-job', doc, '#', 'workflow 逾時');
      doc = await run(e => { e.result.workflows[0].activate = 'unverified'; e.result.advisories.push({ source: 'n8n-run', rule: 'activate:unverified-unknown', file: e.result.workflows[0].file, node: null, message: '需人工複核' }); });
      check(doc.result.status === 'incomplete' && doc.result.complete === false, 'activate:unverified-unknown：依 Pack 的行為視為 incomplete');
      doc = await run(e => { e.result.workflows[0].activate = 'unverified'; e.result.advisories.push({ source: 'n8n-run', rule: 'activate:unverified-external', file: e.result.workflows[0].file, node: null, message: '需對外註冊' }); e.result.workflows[1].activate = 'no-trigger'; });
      check(doc.result.status === 'pass' && doc.result.complete === true, 'activate:unverified-external 與 NO_TRIGGER 只是建議：pass');
    });
  });

  await section('動態：前端重啟後復原', async () => {
    const root = tmp('ci-dyn-recover-');
    await withFront({ root }, async ctx => {
      const body = dreq();
      const { id } = await ctx.create(body);
      const job = await ctx.sim.takeJob();
      const other = await ctx.create(dreq());
      await ctx.front.close();
      const front2 = await ctx.mkFront();
      const port2 = await front2.start();
      const g = await request(port2, { path: `/v1/jobs/${id}`, headers: auth(ctx.token) });
      check(g.status === 200 && g.json.state === 'running' && g.json.versions[0].attempt === 1, '重啟後：running 的 job 應從 meta.json 復原');
      const rp = await request(port2, { method: 'POST', path: '/v1/check/dynamic', headers: jsonHeaders(ctx.token), body });
      check(rp.status === 200 && rp.headers['idempotent-replay'] === 'true', '重啟後：冪等鍵應復原');
      ctx.sim.finish(honestEnvelope(job));
      const done = await waitFor(async () => { const d = (await request(port2, { path: `/v1/jobs/${id}`, headers: auth(ctx.token) })).json; return d.state === 'done' ? d : null; }, 6000, 50);
      check(done?.result?.status === 'pass', '重啟後：新的前端應接手讀回結果');
      const second = await waitFor(async () => (await request(port2, { path: `/v1/jobs/${other.id}`, headers: auth(ctx.token) })).json.state === 'queued', 2000, 50);
      check(second, '重啟後：排隊中的 job 仍在佇列');
      await front2.close();
    });
  });
}

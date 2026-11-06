#!/usr/bin/env node
// 靜態檢查 HTTP 服務：把 scripts/ci/check-workflows.mjs 包成 POST /v1/check/static。
// 只用 Node 內建模組；不做任何對外網路呼叫；不落地儲存（臨時目錄用完即刪）。
// 環境變數與部署方式見 services/ci-check/README.md。

import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ApiError, checkContentHeaders, checkCredentialMap, checkInt, checkKeys, checkRequestId, checkStringList, checkVersion,
  checkWorkflowShapes, cleanText, createAuth, createGate, createJsonServer, createLogger, createRateLimiter, guardComment,
  isObj, jsonDepthExceeds, listen, parseCidrs, parseJsonBody, readBody, REQUEST_ID_RE, routeOf, tokensFromEnv, validatePaths,
} from './shared.mjs';

export const SERVICE_VERSION = '1.0.0';
export const BLOCKING_CATALOG_VERSION = 1;
export const STATIC_BLOCKING_CODES = [
  'JSON_INVALID', 'STRUCTURE_INVALID', 'SECRET_DETECTED', 'MALICIOUS_CODE', 'CREDENTIAL_PLAINTEXT',
  'NODE_NOT_FOUND', 'NODE_DEPRECATED', 'TYPEVERSION_INVALID', 'CREDENTIAL_MISSING', 'WEBHOOK_PATH_CONFLICT',
];
const ADVISORY_CAP = 2000;
const MAX_JSON_DEPTH = 100;
const MAX_NODES = 2000;
const here = dirname(fileURLToPath(import.meta.url));

export function configFromEnv(env = process.env) {
  const num = (k, d) => (env[k] === undefined ? d : Number(env[k]));
  return {
    host: env.HOST ?? '127.0.0.1',
    port: num('PORT', 8080),
    packRoot: resolve(env.PACK_ROOT ?? join(here, '..', '..')),
    workRoot: env.WORK_ROOT ? resolve(env.WORK_ROOT) : join(tmpdir(), 'ci-check-static'),
    tokens: tokensFromEnv(env, 'STATIC'),
    cidrs: env.ALLOWED_SOURCE_CIDRS ? parseCidrs(env.ALLOWED_SOURCE_CIDRS) : null,
    timeoutMs: num('CHECK_TIMEOUT_MS', 30000),
    maxConcurrent: num('MAX_CONCURRENT', 4),
    ratePerMinute: num('RATE_PER_MINUTE', 60),
    rateBurst: num('RATE_BURST', 20),
  };
}

const DEFAULTS = {
  timeoutMs: 30000, maxConcurrent: 4, queueMax: 8, queueWaitMs: 5000, ratePerMinute: 60, rateBurst: 20,
  maxBodyBytes: 5 * 1024 * 1024, maxFiles: 50, maxFileBytes: 1024 * 1024, maxOldSpaceMb: 512,
  authFailLimit: 10, authBlockMs: 300000, nodeBinary: process.execPath, checkScript: join('scripts', 'ci', 'check-workflows.mjs'),
};

// ---- 請求檢核 -------------------------------------------------------------------

function validateRequest(body, cfg) {
  checkKeys(body, ['requestId', 'targetVersion', 'workflows', 'credentialMap', 'existingWebhookPaths', 'existingWorkflowIds', 'options'], '');
  for (const k of ['requestId', 'targetVersion', 'workflows']) if (body[k] === undefined) throw new ApiError('INVALID_REQUEST', { details: { path: k, why: 'required' } });
  checkRequestId(body.requestId);
  checkVersion(body.targetVersion, 'targetVersion');
  const req = { requestId: body.requestId, targetVersion: body.targetVersion, includeComment: true, maxCommentChars: 60000 };
  if (body.credentialMap !== undefined) req.credentialMap = checkCredentialMap(body.credentialMap);
  if (body.existingWebhookPaths !== undefined) req.existingWebhookPaths = checkStringList(body.existingWebhookPaths, 'existingWebhookPaths', 5000, 300);
  if (body.existingWorkflowIds !== undefined) req.existingWorkflowIds = checkStringList(body.existingWorkflowIds, 'existingWorkflowIds', 5000, 100);
  if (body.options !== undefined) {
    checkKeys(body.options, ['includeComment', 'maxCommentChars'], 'options');
    if (body.options.includeComment !== undefined) {
      if (typeof body.options.includeComment !== 'boolean') throw new ApiError('INVALID_REQUEST', { details: { path: 'options.includeComment' } });
      req.includeComment = body.options.includeComment;
    }
    if (body.options.maxCommentChars !== undefined) req.maxCommentChars = checkInt(body.options.maxCommentChars, 'options.maxCommentChars', 2000, 60000);
  }
  checkWorkflowShapes(body.workflows, cfg);
  const paths = validatePaths(body.workflows);
  req.workflows = body.workflows.map((w, i) => ({ path: paths[i], content: w.content }));
  return req;
}

// ---- 子行程 -----------------------------------------------------------------------

// 獨立行程群組、牆鐘逾時、逾時殺整個群組；stdout 丟掉，stderr 只留一小段用來判斷是哪個子工具失敗（不記錄、不回傳）
function runPack({ node, args, cwd, env, timeoutMs, oldSpaceMb }) {
  return new Promise((resolveRun, rejectRun) => {
    let child;
    try {
      child = spawn(node, [...args], { cwd, env: { ...env, NODE_OPTIONS: `--max-old-space-size=${oldSpaceMb}` }, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) { rejectRun(e); return; }
    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', d => { if (stderr.length < 4096) stderr += d; });
    const killGroup = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 已結束 */ } };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); rejectRun(e); });
    child.on('close', code => {
      clearTimeout(timer);
      killGroup();
      resolveRun({ code, timedOut, tool: /(security-scan|native-first-check)\.mjs/.exec(stderr)?.[1] ?? 'check-workflows' });
    });
  });
}

// ---- 報告整理 -----------------------------------------------------------------------

const str = (v, max = 201) => typeof v === 'string' && v.length <= max;
const strOrNull = v => v === null || str(v);

function toolFailed(tool) { return new ApiError('CHECK_TOOL_FAILED', { details: { tool } }); }

function countsOf(blocking, advisories, files) {
  const byCode = {};
  for (const b of blocking) byCode[b.code] = (byCode[b.code] ?? 0) + 1;
  return { files, filesWithBlocking: new Set(blocking.map(b => b.file).filter(Boolean)).size, blocking: blocking.length, advisories: advisories.length, blockingByCode: byCode };
}

// raw 是 Pack 的 ci-report.json；只留 schema 內的欄位，未知的阻擋碼或不一致的狀態一律視為工具失敗（不放行）
function normalizeReport(raw, preempted, fileCount) {
  if (!isObj(raw) || !Array.isArray(raw.blocking) || !Array.isArray(raw.advisories) || typeof raw.target !== 'string') throw toolFailed('check-workflows');
  if (Array.isArray(raw.incomplete) && raw.incomplete.length > 0) throw toolFailed('check-workflows');
  const gone = new Set(preempted.map(p => p.path));
  let blocking = raw.blocking.filter(b => !gone.has(b?.file)).map(b => {
    if (!isObj(b) || !STATIC_BLOCKING_CODES.includes(b.code) || !strOrNull(b.file) || !strOrNull(b.node) || !str(b.message)) throw toolFailed('check-workflows');
    return { code: b.code, file: b.file, node: b.node ?? null, message: b.message };
  });
  const advisories = raw.advisories.filter(a => !gone.has(a?.file)).map(a => {
    if (!isObj(a) || !str(a.source, 64) || !str(a.rule, 128) || !strOrNull(a.file) || !strOrNull(a.node) || !str(a.message)) throw toolFailed('check-workflows');
    return { source: a.source, rule: a.rule, file: a.file, node: a.node ?? null, message: a.message };
  });
  for (const p of preempted) blocking.push({ code: p.code, file: cleanText(p.path), node: null, message: p.message });
  if (preempted.length === 0 && !(raw.status === 'pass' || raw.status === 'fail')) throw toolFailed('check-workflows');
  if (preempted.length === 0 && (raw.status === 'pass') !== (blocking.length === 0)) throw toolFailed('check-workflows');
  const total = advisories.length;
  let shown = advisories;
  if (total > ADVISORY_CAP) {
    shown = [...advisories.slice(0, ADVISORY_CAP - 1), { source: 'ci', rule: 'advisories-truncated', file: null, node: null, message: `建議項超過 ${ADVISORY_CAP} 筆，其餘已省略；完整數量見 counts.advisories` }];
  }
  const counts = countsOf(blocking, advisories, fileCount);
  return { status: blocking.length === 0 ? 'pass' : 'fail', target: raw.target, blocking, advisories: shown, counts };
}

const TRUNC_NOTE = '建議項過多已截斷，完整清單見回應的 `report.advisories`';

// 阻擋項區塊永遠完整保留；建議項依來源由後往前截斷
export function truncateComment(comment, max) {
  if (comment.length <= max) return { comment, truncated: false };
  const at = comment.indexOf('\n### 建議項');
  if (at < 0) return { comment, truncated: false };
  const head = comment.slice(0, at + 1);
  const parts = comment.slice(at + 1).replace(/\n+$/, '').split(/\n(?=#### )/);
  const build = () => `${head}${parts.join('\n')}\n\n${TRUNC_NOTE}\n`;
  while (parts.length > 1 && build().length > max) parts.pop();
  return { comment: build(), truncated: true };
}

// ---- 服務 ------------------------------------------------------------------------------

export async function createStaticService(userConfig) {
  const cfg = { ...DEFAULTS, ...userConfig };
  cfg.packRoot = resolve(cfg.packRoot);
  cfg.workRoot = resolve(cfg.workRoot);
  const catalogDir = join(cfg.packRoot, 'docs', 'node-versions');
  const log = cfg.log ?? createLogger(undefined, { service: 'static-check' });
  const versionFile = join(cfg.packRoot, 'VERSION');
  const packVersion = existsSync(versionFile) ? cleanText(readFileSync(versionFile, 'utf8').trim(), 64) || null : null;
  const supported = () => (existsSync(catalogDir) ? readdirSync(catalogDir) : [])
    .map(f => /^(\d+\.\d+\.\d+)\.json$/.exec(f)?.[1]).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  await mkdir(cfg.workRoot, { recursive: true, mode: 0o700 });
  // 這個資料夾只給本服務用：啟動時清掉上次異常結束留下的殘渣
  for (const name of readdirSync(cfg.workRoot)) await rm(join(cfg.workRoot, name), { recursive: true, force: true });

  const auth = createAuth({ tokens: cfg.tokens, cidrs: cfg.cidrs, failLimit: cfg.authFailLimit, blockMs: cfg.authBlockMs, log });
  const rate = createRateLimiter({ perMinute: cfg.ratePerMinute, burst: cfg.rateBurst });
  const gate = createGate({ max: cfg.maxConcurrent, queueMax: cfg.queueMax, waitMs: cfg.queueWaitMs });
  let libPromise;
  const packLib = () => (libPromise ??= import(pathToFileURL(join(cfg.packRoot, 'scripts', 'ci', 'lib.mjs')).href));

  async function runCheck(ctx, req) {
    const catalog = join(catalogDir, `${req.targetVersion}.json`);
    if (!existsSync(catalog)) throw new ApiError('NODE_CATALOG_MISSING', { details: { targetVersion: req.targetVersion } });

    const release = await gate.acquire();
    let dir;
    try {
      dir = await mkdtemp(join(cfg.workRoot, 'job-'));
      const inDir = join(dir, 'in');
      await mkdir(inDir);
      const preempted = [];
      for (const w of req.workflows) {
        let content = w.content;
        if (jsonDepthExceeds(content, MAX_JSON_DEPTH)) {
          preempted.push({ path: w.path, code: 'JSON_INVALID', message: `JSON 巢狀過深（超過 ${MAX_JSON_DEPTH} 層）` });
          content = '{}';
        } else {
          let wf = null;
          try { wf = JSON.parse(content); } catch { /* 由 Pack 回報 JSON_INVALID */ }
          if (isObj(wf) && Array.isArray(wf.nodes) && wf.nodes.length > MAX_NODES) {
            preempted.push({ path: w.path, code: 'STRUCTURE_INVALID', message: `節點數過多（超過 ${MAX_NODES} 個）` });
            content = '{}';
          }
        }
        const target = resolve(inDir, w.path);
        if (!target.startsWith(`${inDir}${sep}`)) throw new ApiError('INVALID_PATH');
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, { flag: 'wx', mode: 0o600 });
      }

      const args = [join(cfg.packRoot, cfg.checkScript), '--dir', inDir, '--target-version', req.targetVersion];
      const aux = async (name, flag, value) => {
        if (value === undefined) return;
        const f = join(dir, name);
        await writeFile(f, JSON.stringify(value), { mode: 0o600 });
        args.push(flag, f);
      };
      await aux('credential-map.json', '--credential-map', req.credentialMap);
      await aux('existing-paths.json', '--existing-webhook-paths', req.existingWebhookPaths);
      await aux('existing-ids.json', '--existing-workflow-ids', req.existingWorkflowIds);
      const reportFile = join(dir, 'ci-report.json');
      const commentFile = join(dir, 'ci-comment.md');
      args.push('--out', reportFile);
      if (req.includeComment) args.push('--comment', commentFile);

      // 子行程只拿得到 PATH 與臨時目錄；不繼承 token 等環境變數
      const env = { PATH: process.env.PATH ?? '', TMPDIR: dir, HOME: dir, LANG: 'C.UTF-8' };
      let run;
      try {
        run = await runPack({ node: cfg.nodeBinary, args, cwd: cfg.packRoot, env, timeoutMs: cfg.timeoutMs, oldSpaceMb: cfg.maxOldSpaceMb });
      } catch { throw new ApiError('INTERNAL_ERROR'); }
      if (run.timedOut) throw new ApiError('CHECK_TIMEOUT');
      if (run.code !== 0 && run.code !== 1) throw toolFailed(run.tool);

      let raw;
      try { raw = JSON.parse(await readFile(reportFile, 'utf8')); } catch { throw toolFailed('check-workflows'); }
      const report = normalizeReport(raw, preempted, req.workflows.length);
      if ((run.code === 1) !== (report.status === 'fail') && preempted.length === 0) throw toolFailed('check-workflows');

      let comment = null;
      let truncated = false;
      if (req.includeComment) {
        try {
          if (preempted.length > 0) {
            const lib = await packLib();
            comment = lib.renderComment({ ...report, incomplete: [], advisories: report.advisories });
          } else {
            comment = await readFile(commentFile, 'utf8');
          }
        } catch { throw toolFailed('check-workflows'); }
        const g = guardComment(comment);
        if (g.hits > 0) log({ event: 'comment-guard', requestId: req.requestId, rule: 'unescaped-markdown', count: g.hits });
        ({ comment, truncated } = truncateComment(g.comment, req.maxCommentChars));
      }

      const advisoryRules = {};
      for (const a of report.advisories) {
        const rule = /^[A-Za-z0-9:_.-]{1,80}$/.test(a.rule) ? a.rule : 'other';
        const k = `${a.source.replace(/[^A-Za-z0-9:_.-]/g, '_').slice(0, 40)}:${rule}`;
        advisoryRules[k] = (advisoryRules[k] ?? 0) + 1;
      }
      ctx.extra.blocking = report.counts.blockingByCode;
      ctx.extra.advisories = advisoryRules;
      return {
        requestId: req.requestId,
        service: 'static-check',
        serviceVersion: SERVICE_VERSION,
        apiVersion: 'v1',
        blockingCatalogVersion: BLOCKING_CATALOG_VERSION,
        packVersion,
        report,
        comment,
        commentTruncated: truncated,
        durationMs: Date.now() - ctx.started,
      };
    } finally {
      release();
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function handle(ctx) {
    const { method, path } = routeOf(ctx.req);
    if (path === '/healthz' && method === 'GET') {
      let ok = existsSync(join(catalogDir)) && supported().length > 0;
      try { accessSync(cfg.workRoot, constants.W_OK); } catch { ok = false; }
      return { status: ok ? 200 : 503, body: { status: ok ? 'ok' : 'down' } };
    }
    if (path === '/version' && method === 'GET') {
      ctx.callerId = auth.authenticate(ctx.ip, ctx.req.headers.authorization);
      return {
        status: 200,
        body: {
          service: 'static-check', serviceVersion: SERVICE_VERSION, apiVersion: 'v1', blockingCatalogVersion: BLOCKING_CATALOG_VERSION,
          packVersion, supportedTargetVersions: supported(), blockingCodes: STATIC_BLOCKING_CODES,
          limits: { maxBodyBytes: cfg.maxBodyBytes, maxFiles: cfg.maxFiles, maxFileBytes: cfg.maxFileBytes, timeoutSeconds: Math.round(cfg.timeoutMs / 1000), maxConcurrent: cfg.maxConcurrent },
        },
      };
    }
    if (path === '/v1/check/static' && method === 'POST') {
      checkContentHeaders(ctx.req);
      ctx.callerId = auth.authenticate(ctx.ip, ctx.req.headers.authorization);
      rate.take(ctx.callerId);
      const buf = await readBody(ctx.req, cfg.maxBodyBytes);
      const body = parseJsonBody(buf, 8);
      if (isObj(body) && typeof body.requestId === 'string' && REQUEST_ID_RE.test(body.requestId)) ctx.requestId = body.requestId;
      const req = validateRequest(body, cfg);
      ctx.extra.targetVersion = req.targetVersion;
      ctx.extra.files = req.workflows.map(w => w.path);
      return { status: 200, body: await runCheck(ctx, req) };
    }
    throw new ApiError('NOT_FOUND');
  }

  const server = createJsonServer({ handle, log, endpointOf: req => `${req.method} ${routeOf(req).path}`.slice(0, 80) });
  return {
    server,
    config: cfg,
    gate,
    async start() {
      const port = await listen(server, cfg.port ?? 0, cfg.host ?? '127.0.0.1');
      log({ event: 'startup', serviceVersion: SERVICE_VERSION, packVersion, port });
      return port;
    },
    close: () => new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let svc;
  try {
    svc = await createStaticService(configFromEnv());
    await svc.start();
  } catch (e) {
    console.error(`啟動失敗：${e.message}`);
    process.exit(2);
  }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => svc.close().then(() => process.exit(0)));
}

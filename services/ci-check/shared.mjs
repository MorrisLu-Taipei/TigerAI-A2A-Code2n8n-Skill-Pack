// 靜態檢查服務與動態檢查前端共用的小零件：錯誤格式、認證、限流、輸入檢核、記錄。
// 只用 Node 內建模組；不做任何對外網路呼叫。

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

// ---- 錯誤 -----------------------------------------------------------------

const ERRORS = {
  INVALID_JSON_BODY: [400, false, '請求本文不是合法的 JSON 或不是 UTF-8。'],
  INVALID_REQUEST: [400, false, '請求欄位缺漏、型別不對或有未定義的欄位。'],
  INVALID_PATH: [400, false, 'workflows[].path 不符合規則。'],
  DUPLICATE_PATH: [400, false, '同一請求內的 workflows[].path 重複。'],
  UNAUTHORIZED: [401, false, '缺少或無效的 Bearer token。'],
  FORBIDDEN: [403, false, '來源位址不在允許範圍。'],
  NOT_FOUND: [404, false, '找不到指定的資源。'],
  REQUEST_ID_CONFLICT: [409, false, '相同的 requestId 已用於內容不同的請求，請換新的 requestId。'],
  JOB_CONFLICT: [409, false, '該 job 已結束，無法取消。'],
  PAYLOAD_TOO_LARGE: [413, false, '請求本文超過上限。'],
  TOO_MANY_FILES: [413, false, 'workflow 檔案數超過上限。'],
  FILE_TOO_LARGE: [413, false, '單一 workflow 檔超過大小上限。'],
  UNSUPPORTED_MEDIA_TYPE: [415, false, 'Content-Type 必須是 application/json，且不接受 Content-Encoding。'],
  NODE_CATALOG_MISSING: [422, false, '目標版本沒有節點版本目錄，檢查無法執行。'],
  UNSUPPORTED_VERSION: [422, false, '請求的版本沒有設定執行器池。'],
  RATE_LIMITED: [429, true, '超過並行或速率上限，請稍後重試。'],
  QUEUE_FULL: [429, true, '動態檢查佇列已滿，請稍後重試。'],
  CHECK_TOOL_FAILED: [500, true, '檢查工具執行失敗。'],
  INTERNAL_ERROR: [500, true, '服務發生未預期的錯誤。'],
  EXECUTOR_UNAVAILABLE: [503, true, '目前沒有可用的執行器。'],
  DISK_FULL: [503, true, '共享目錄用量過高，暫停接件。'],
  CHECK_TIMEOUT: [504, true, '檢查超過時限。'],
  EXECUTOR_CRASHED: [null, true, '執行器失聯或異常結束，重試後仍失敗。這是基礎設施失敗，不代表 workflow 有問題。'],
  N8N_BOOT_FAILED: [null, true, '執行器內的 n8n 在時限內未就緒，重試後仍失敗。這是基礎設施失敗，不代表 workflow 有問題。'],
  RESULT_INVALID: [null, true, '執行器的結果沒有通過前端的檢核，重試後仍失敗。'],
  JOB_TIMEOUT: [null, false, 'job 超過時限，已中止；結果不完整，不得視為通過。'],
};

export class ApiError extends Error {
  constructor(code, { message, retryable, retryAfterSeconds, details, headers } = {}) {
    super(code);
    const spec = ERRORS[code];
    if (!spec) throw new Error(`未知的錯誤碼：${code}`);
    this.code = code;
    this.status = spec[0] ?? 500;
    this.text = message ?? spec[2];
    this.retryable = retryable ?? spec[1];
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
    this.headers = headers ?? {};
  }
}

export const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;
export const VERSION_RE = /^\d+\.\d+\.\d+$/;

// error 物件（schemas/error.schema.json 的 errorBody）；requestId 只在格式合法時回填
export function errorBodyOf(err, requestId) {
  const e = { code: err.code, message: err.text.slice(0, 500), requestId: typeof requestId === 'string' && REQUEST_ID_RE.test(requestId) ? requestId : null, retryable: err.retryable };
  if (err.retryAfterSeconds) e.retryAfterSeconds = err.retryAfterSeconds;
  if (err.details) e.details = err.details;
  return e;
}

export function jobErrorBody(code, message) {
  return errorBodyOf(new ApiError(code, message ? { message } : {}), null);
}

// ---- 字串淨化 -----------------------------------------------------------------

const CTRL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g;
export function cleanText(v, max = 200) {
  const s = String(v ?? '').replace(CTRL_RE, ' ');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ---- 記錄 -----------------------------------------------------------------------
// 只允許下列欄位；其他欄位一律丟棄，避免有人不小心把 workflow 內容或標頭寫進記錄。

const LOG_KEYS = new Set([
  'ts', 'event', 'service', 'serviceVersion', 'packVersion', 'requestId', 'callerId', 'ip', 'endpoint', 'status', 'durationMs',
  'targetVersion', 'versions', 'files', 'blocking', 'advisories', 'errorCode', 'reason', 'jobId', 'state', 'attempt', 'version',
  'slot', 'bootId', 'action', 'kind', 'count', 'rule', 'port', 'errorType', 'usagePercent', 'queueLength',
]);

function logValue(v, depth = 0) {
  if (typeof v === 'string') return cleanText(v, 200);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  if (Array.isArray(v)) return depth > 1 ? undefined : v.slice(0, 100).map(x => logValue(x, depth + 1));
  if (v && typeof v === 'object') {
    if (depth > 1) return undefined;
    return Object.fromEntries(Object.entries(v).slice(0, 100).map(([k, x]) => [cleanText(k, 80), logValue(x, depth + 1)]));
  }
  return undefined;
}

export function createLogger(sink = line => process.stdout.write(`${line}\n`), base = {}) {
  return obj => {
    const out = { ts: new Date().toISOString(), ...base };
    for (const [k, v] of Object.entries(obj)) {
      if (!LOG_KEYS.has(k)) continue;
      const x = logValue(v);
      if (x !== undefined) out[k] = x;
    }
    try { sink(JSON.stringify(out)); } catch { /* 記錄失敗不影響服務 */ }
  };
}

// ---- 網路位址與 CIDR -------------------------------------------------------------

export function normalizeIp(addr) {
  const a = String(addr ?? '');
  return a.startsWith('::ffff:') ? a.slice(7) : a;
}

function ipv4ToInt(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.some(x => x > 255) ? null : (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]);
}

// 只支援 IPv4 與單一的 ::1；其他 IPv6 位址視為不在名單內（失敗關閉）
export function parseCidrs(text) {
  const list = [];
  for (const raw of String(text ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    if (raw === '::1') { list.push({ v6: '::1' }); continue; }
    const [ip, bitsText] = raw.split('/');
    const base = ipv4ToInt(ip);
    const bits = bitsText === undefined ? 32 : Number(bitsText);
    if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error('ALLOWED_SOURCE_CIDRS 格式不對（只支援 IPv4 CIDR）');
    const size = 2 ** (32 - bits);
    list.push({ start: Math.floor(base / size) * size, size });
  }
  return list;
}

export function ipAllowed(cidrs, ip) {
  if (!cidrs) return true;
  const n = ipv4ToInt(ip);
  return cidrs.some(c => (c.v6 ? ip === c.v6 : n !== null && n >= c.start && n < c.start + c.size));
}

// ---- 認證 -----------------------------------------------------------------------------

const sha = s => createHash('sha256').update(s).digest();

export function tokensFromEnv(env, prefix) {
  const out = [];
  for (const slot of ['CURRENT', 'NEXT']) {
    const value = env[`${prefix}_API_TOKEN_${slot}`];
    if (!value) continue;
    if (value.length < 32) throw new Error(`${prefix}_API_TOKEN_${slot} 太短（至少 32 個字元的亂數）`);
    out.push({ value, callerId: cleanText(env[`${prefix}_CALLER_ID_${slot}`] ?? (slot === 'CURRENT' ? 'pipeline-n8n' : 'pipeline-n8n-next'), 64) });
  }
  if (out.length === 0) throw new Error(`沒有設定 ${prefix}_API_TOKEN_CURRENT（服務不接受沒有認證的啟動）`);
  return out;
}

export function createAuth({ tokens, cidrs = null, failLimit = 10, blockMs = 300000, log = () => {}, now = Date.now }) {
  const digests = tokens.map(t => ({ d: sha(t.value), callerId: t.callerId }));
  const fails = new Map();   // ip -> { n, blockedUntil }

  function prune() {
    if (fails.size < 5000) return;
    for (const [ip, f] of fails) if (f.blockedUntil < now() && f.n === 0) fails.delete(ip);
    if (fails.size >= 5000) fails.clear();
  }

  return {
    // 先擋來源，再擋封鎖中的來源，最後比對 token；比對一律跑完全部 token（常數時間）
    authenticate(ip, header) {
      if (!ipAllowed(cidrs, ip)) {
        log({ event: 'auth-failure', ip, reason: 'source-not-allowed' });
        throw new ApiError('FORBIDDEN');
      }
      const f = fails.get(ip);
      if (f && f.blockedUntil > now()) {
        const wait = Math.ceil((f.blockedUntil - now()) / 1000);
        log({ event: 'auth-failure', ip, reason: 'blocked' });
        throw new ApiError('RATE_LIMITED', { message: '連續認證失敗，來源已暫時封鎖。', retryAfterSeconds: wait, headers: { 'Retry-After': String(wait) } });
      }
      const m = typeof header === 'string' ? /^Bearer ([!-~]{1,512})$/.exec(header) : null;
      const presented = sha(m ? m[1] : '');
      let hit = null;
      for (const t of digests) if (timingSafeEqual(presented, t.d) && m) hit = t.callerId;
      if (hit) {
        if (f) fails.delete(ip);
        return hit;
      }
      prune();
      const cur = fails.get(ip) ?? { n: 0, blockedUntil: 0 };
      cur.n += 1;
      if (cur.n >= failLimit) { cur.blockedUntil = now() + blockMs; cur.n = 0; log({ event: 'auth-failure', ip, reason: 'blocked-start' }); }
      else log({ event: 'auth-failure', ip, reason: m ? 'bad-token' : 'missing-token' });
      fails.set(ip, cur);
      throw new ApiError('UNAUTHORIZED', { headers: { 'WWW-Authenticate': 'Bearer' } });
    },
  };
}

// ---- 速率與並行 -----------------------------------------------------------------------

export function createRateLimiter({ perMinute = 60, burst = 20, now = Date.now }) {
  const buckets = new Map();
  return {
    take(key) {
      const t = now();
      const b = buckets.get(key) ?? { tokens: burst, last: t };
      b.tokens = Math.min(burst, b.tokens + ((t - b.last) / 1000) * (perMinute / 60));
      b.last = t;
      buckets.set(key, b);
      if (b.tokens >= 1) { b.tokens -= 1; return; }
      const wait = Math.max(1, Math.ceil((1 - b.tokens) * 60 / perMinute));
      throw new ApiError('RATE_LIMITED', { retryAfterSeconds: wait, headers: { 'Retry-After': String(wait) } });
    },
  };
}

export function createGate({ max, queueMax, waitMs }) {
  let active = 0;
  const waiters = [];
  const release = () => {
    active -= 1;
    const w = waiters.shift();
    if (w) { clearTimeout(w.timer); active += 1; w.resolve(release); }
  };
  const tooBusy = () => new ApiError('RATE_LIMITED', { retryAfterSeconds: 5, headers: { 'Retry-After': '5' } });
  return {
    get active() { return active; },
    get waiting() { return waiters.length; },
    acquire() {
      if (active < max) { active += 1; return Promise.resolve(release); }
      if (waiters.length >= queueMax) return Promise.reject(tooBusy());
      return new Promise((resolve, reject) => {
        const w = { resolve, timer: setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(tooBusy());
        }, waitMs) };
        waiters.push(w);
      });
    },
  };
}

// ---- 本文讀取與 JSON ------------------------------------------------------------------

// 超過上限就丟掉剩下的資料（再多也只收到 4 倍上限，之後直接斷線）
function discardRest(req, cap) {
  let n = 0;
  req.removeAllListeners('data');
  req.on('data', c => { n += c.length; if (n > cap) req.destroy(); });
  req.on('error', () => {});
  req.resume();
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const cl = req.headers['content-length'];
    if (cl !== undefined) {
      if (!/^\d+$/.test(cl)) { reject(new ApiError('INVALID_REQUEST', { message: 'Content-Length 格式不對。' })); return; }
      if (Number(cl) > limit) { discardRest(req, limit * 4); reject(new ApiError('PAYLOAD_TOO_LARGE', { details: { limit } })); return; }
    }
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = e => { if (!done) { done = true; reject(e); } };
    req.on('data', c => {
      if (done) return;
      size += c.length;
      if (size > limit) { discardRest(req, limit * 4); fail(new ApiError('PAYLOAD_TOO_LARGE', { details: { limit } })); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', () => fail(new ApiError('INVALID_REQUEST', { message: '讀取請求本文時連線中斷。' })));
    req.on('aborted', () => fail(new ApiError('INVALID_REQUEST', { message: '讀取請求本文時連線中斷。' })));
  });
}

// 括號巢狀深度（字串內不計）超過 limit 就回 true；不解析、不遞迴
export function jsonDepthExceeds(text, limit) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === 92) esc = true;
      else if (c === 34) inStr = false;
      continue;
    }
    if (c === 34) inStr = true;
    else if (c === 123 || c === 91) { if (++depth > limit) return true; }
    else if (c === 125 || c === 93) depth -= 1;
  }
  return false;
}

export function parseJsonBody(buf, maxDepth = 8) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { throw new ApiError('INVALID_JSON_BODY'); }
  if (jsonDepthExceeds(text, maxDepth)) throw new ApiError('INVALID_JSON_BODY', { message: '請求本文的 JSON 巢狀過深。' });
  try { return JSON.parse(text); }
  catch { throw new ApiError('INVALID_JSON_BODY'); }
}

export function checkContentHeaders(req) {
  const ct = String(req.headers['content-type'] ?? '');
  if (!/^application\/json\s*(;\s*charset\s*=\s*"?utf-8"?\s*)?$/i.test(ct)) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  const ce = req.headers['content-encoding'];
  if (ce !== undefined && String(ce).trim().toLowerCase() !== 'identity') throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
}

// ---- 請求欄位檢核（靜態與動態共用） ------------------------------------------------------

const bad = (path, why) => new ApiError('INVALID_REQUEST', { details: { path, ...(why ? { why } : {}) } });
export const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function checkKeys(obj, allowed, path) {
  if (!isObj(obj)) throw bad(path, 'type');
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw bad(path ? `${path}.${cleanText(k, 40)}` : cleanText(k, 40), 'unknown-field');
}

export function checkRequestId(v) {
  if (typeof v !== 'string' || !REQUEST_ID_RE.test(v)) throw bad('requestId', 'pattern');
  return v;
}

export function checkVersion(v, path) {
  if (typeof v !== 'string' || !VERSION_RE.test(v)) throw bad(path, 'pattern');
  return v;
}

export function checkStringList(v, path, maxItems, maxLen) {
  if (!Array.isArray(v) || v.length > maxItems) throw bad(path, 'array');
  v.forEach((s, i) => { if (typeof s !== 'string' || s.length < 1 || s.length > maxLen) throw bad(`${path}[${i}]`, 'string'); });
  return v;
}

export function checkCredentialMap(v) {
  if (!isObj(v) || Object.keys(v).length > 200) throw bad('credentialMap', 'object');
  for (const [k, list] of Object.entries(v)) {
    if (k.length > 200 || k === '') throw bad('credentialMap', 'key');
    checkStringList(list, `credentialMap.${cleanText(k, 40)}`, 200, 200);
  }
  return v;
}

export function checkInt(v, path, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) throw bad(path, 'range');
  return v;
}

// workflows[] 的第一階段：形狀、檔數與大小（回 413 的條件）
export function checkWorkflowShapes(workflows, { maxFiles, maxFileBytes }) {
  if (!Array.isArray(workflows) || workflows.length < 1) throw bad('workflows', 'array');
  if (workflows.length > maxFiles) throw new ApiError('TOO_MANY_FILES', { details: { limit: maxFiles } });
  workflows.forEach((w, i) => {
    checkKeys(w, ['path', 'content'], `workflows[${i}]`);
    if (typeof w.path !== 'string') throw bad(`workflows[${i}].path`, 'type');
    if (typeof w.content !== 'string' || w.content.length < 2) throw bad(`workflows[${i}].content`, 'type');
  });
  workflows.forEach((w, i) => {
    if (Buffer.byteLength(w.content, 'utf8') > maxFileBytes) throw new ApiError('FILE_TOO_LARGE', { details: { limit: maxFileBytes, file: i } });
  });
}

// 路徑規則（第二階段）。回傳 NFC 正規化後的路徑陣列；失敗時 details 只含索引
const PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.)(?!.*(?:^|\/)node_modules(?:\/|$))(?!.*\/\/)[^\\\u0000-\u001f\u007f]{1,200}\.json$/;
const PATH_BAD_CHARS = /[\p{Cc}\p{Zl}\p{Zp}\u202a-\u202e\u2066-\u2069]/u;

export function validatePaths(workflows) {
  const seen = new Set();
  const dirs = new Set();
  const out = workflows.map((w, i) => {
    const p = w.path.normalize('NFC');
    const fail = () => new ApiError('INVALID_PATH', { details: { file: i } });
    if (p.length > 200 || !PATH_RE.test(p) || PATH_BAD_CHARS.test(p)) throw fail();
    const segs = p.split('/');
    if (segs.some(s => Buffer.byteLength(s, 'utf8') > 255)) throw fail();
    const key = p.toLowerCase();
    if (seen.has(key)) throw new ApiError('DUPLICATE_PATH', { details: { file: i } });
    seen.add(key);
    for (let d = 1; d < segs.length; d++) dirs.add(segs.slice(0, d).join('/').toLowerCase());
    return p;
  });
  // 一個檔案的名稱不能同時是另一個檔案的目錄（a.json 與 a.json/b.json）
  out.forEach((p, i) => { if (dirs.has(p.toLowerCase())) throw new ApiError('INVALID_PATH', { details: { file: i } }); });
  return out;
}

// ---- PR 註解的縱深防禦 -----------------------------------------------------------------------
// Pack 已跳脫；這裡只在表格列裡找「沒被跳脫的」危險字元，找到就把該列的儲存格改成程式碼區塊。

function riskyRow(line) {
  let inCode = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') { i += 1; continue; }
    if (c === '`') { inCode = !inCode; continue; }
    if (inCode) continue;
    if (c === '<' || c === '>') return true;
    if (c === '!' && line[i + 1] === '[') return true;
    if (c === ']' && line[i + 1] === '(') return true;
    if (c === '@' && line[i + 1] !== '\u200b') return true;
    if (c === '#' && /\d/.test(line[i + 1] ?? '')) return true;
    if (c === ':' && line.startsWith('://', i)) return true;
  }
  return false;
}

function splitCells(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') { cur += line.slice(i, i + 2); i += 1; continue; }
    if (line[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += line[i];
  }
  cells.push(cur);
  return cells.slice(1, -1).map(s => s.trim());
}

export function guardComment(comment) {
  if (typeof comment !== 'string') return { comment, hits: 0 };
  let hits = 0;
  const lines = comment.split('\n').map(line => {
    if (!line.startsWith('|') || /^\|[-| ]+\|$/.test(line) || !riskyRow(line)) return line;
    hits += 1;
    return `| ${splitCells(line).map(c => `\`${c.replace(/[`\\]/g, '').replace(/\|/g, '/')}\``).join(' | ')} |`;
  });
  return { comment: lines.join('\n'), hits };
}

// ---- HTTP 伺服器骨架 ---------------------------------------------------------------------------

export function newId(prefix, bytes = 8) { return `${prefix}${randomBytes(bytes).toString('hex')}`; }

export function createJsonServer({ handle, log, endpointOf }) {
  const server = http.createServer(async (req, res) => {
    const ctx = { req, res, started: Date.now(), ip: normalizeIp(req.socket.remoteAddress), requestId: null, callerId: null, extra: {}, fallbackId: newId('req-') };
    let status;
    let body;
    let headers = {};
    let errorCode;
    try {
      ({ status, body, headers = {} } = await handle(ctx));
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('INTERNAL_ERROR');
      if (!(e instanceof ApiError)) log({ event: 'internal-error', requestId: ctx.requestId, errorType: e?.name ?? 'Error' });
      status = err.status;
      body = { error: errorBodyOf(err, ctx.requestId) };
      headers = err.headers;
      errorCode = err.code;
    }
    const text = JSON.stringify(body);
    try {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(text),
        'X-Request-Id': ctx.requestId ?? ctx.fallbackId,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers,
      });
      res.end(text);
    } catch { /* 連線已斷 */ }
    log({
      event: 'request', requestId: ctx.requestId, callerId: ctx.callerId, ip: ctx.ip, endpoint: endpointOf(req), status,
      durationMs: Date.now() - ctx.started, errorCode, ...ctx.extra,
    });
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 60000;
  server.keepAliveTimeout = 5000;
  return server;
}

export function routeOf(req) {
  const u = new URL(req.url ?? '/', 'http://localhost');
  return { method: req.method ?? 'GET', path: u.pathname };
}

export const listen = (server, port, host) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => { server.off('error', reject); resolve(server.address().port); });
});

export const sleep = ms => new Promise(r => setTimeout(r, ms));

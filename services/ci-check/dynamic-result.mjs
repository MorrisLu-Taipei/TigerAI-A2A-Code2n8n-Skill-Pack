// 動態檢查：執行器 result.json 的檢核（一律當不可信輸入）、結果重算與 PR 註解渲染。
// 不信任執行器宣稱的 status／counts／executionSummary；全部由這裡依淨化後的欄位重新計算。

import { cleanText, guardComment, isObj } from './shared.mjs';

export const DYNAMIC_BLOCKING_CODES = ['IMPORT_FAILED', 'ACTIVATE_FAILED', 'WEBHOOK_PATH_CONFLICT', 'CREDENTIAL_MISSING'];
export const LIMITATION_TEXT = {
  'licensed-features': '授權功能（Source Control、環境、變數、外部密碼庫、角色權限等）未測',
  'real-external-services': '沒有連到任何真實外部服務，使用假憑證',
  'credential-validity': '憑證是否有效、權限是否足夠未測',
  'source-control': 'Source Control 的推送與拉取未測',
  'non-webhook-triggers': '排程、輪詢、表單等非 webhook 觸發器未被實際觸發',
  'production-webhook-conflicts': '與 production 既有 workflow 的 webhook 路徑衝突未測（由靜態檢查與部署前比對負責）',
  'queue-mode-behaviour': 'production 是 queue mode，這裡是單行程模式，行為可能不同',
  'performance-and-load': '效能與負載未測',
  'python-code-not-scanned': 'Python Code 節點未經程式碼掃描',
  'external-trigger-registration': '需向外部服務註冊的觸發節點在無網路環境下無法確認啟用，且 2.44.6／2.46.6 的啟用 API 看不到這類失敗；請以靜態建議 `trigger:external-registration` 為準並在 staging 實測',
  'webhook-conflict-best-effort': '同批 workflow 之間的 webhook 路徑衝突在動態只是盡力而為，請以靜態檢查與部署前比對為準',
};
export const LIMITATIONS = Object.keys(LIMITATION_TEXT);

export class ResultInvalid extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}

const bad = kind => { throw new ResultInvalid(kind); };
const ID_RE = /^[A-Za-z0-9:_.-]+$/;
const IMPORT_VALUES = ['ok', 'failed', 'skipped'];
const ACTIVATE_VALUES = ['ok', 'conflict', 'no-trigger', 'unverified', 'failed', 'skipped'];
const MAX_ITEMS = 2000;

function onlyKeys(o, allowed, kind) {
  if (!isObj(o)) bad(kind);
  for (const k of Object.keys(o)) if (!allowed.includes(k)) bad(`${kind}-unknown-key`);
}
const intIn = (v, min, max, kind) => { if (!Number.isInteger(v) || v < min || v > max) bad(kind); return v; };
const intOrNull = (v, kind) => (v === null ? null : intIn(v, 0, 999, kind));

export function validateExecutorResult(raw, expect, lib) {
  const san = (v, kind, max = 200) => { if (typeof v !== 'string') bad(kind); return lib.scrub(cleanText(v, max)); };
  const pathSet = new Set(expect.paths);
  const fileOf = (v, kind, nullable) => {
    if (v === null && nullable) return null;
    if (typeof v !== 'string' || !pathSet.has(v)) bad(kind);
    return v;
  };

  onlyKeys(raw, ['jobId', 'version', 'attempt', 'complete', 'infraError', 'result'], 'envelope');
  if (raw.jobId !== expect.jobId || raw.version !== expect.version || raw.attempt !== expect.attempt) bad('identity-mismatch');
  if (typeof raw.complete !== 'boolean') bad('complete-type');
  if (raw.infraError !== undefined && raw.infraError !== null) {
    if (raw.infraError !== 'N8N_BOOT_FAILED' && raw.infraError !== 'EXECUTOR_CRASHED') bad('infra-error-value');
    return { infraError: raw.infraError, complete: false, vr: null };
  }

  const r = raw.result;
  onlyKeys(r, ['version', 'n8nVersion', 'status', 'boot', 'workflows', 'blocking', 'advisories', 'cleanup'], 'result');
  if (r.version !== expect.version) bad('identity-mismatch');
  const n8nVersion = r.n8nVersion === null || r.n8nVersion === undefined ? null
    : (typeof r.n8nVersion === 'string' && /^[0-9A-Za-z.+_-]{1,40}$/.test(r.n8nVersion) ? r.n8nVersion : bad('n8n-version'));

  onlyKeys(r.boot, ['status', 'seconds'], 'boot');
  if (!['ok', 'failed', 'timeout'].includes(r.boot.status)) bad('boot-status');
  if (!(r.boot.seconds === null || (typeof r.boot.seconds === 'number' && r.boot.seconds >= 0 && r.boot.seconds <= 3600))) bad('boot-seconds');
  if (r.boot.status !== 'ok') return { infraError: 'N8N_BOOT_FAILED', complete: false, vr: null };
  const boot = { status: 'ok', seconds: r.boot.seconds === null ? null : Math.round(r.boot.seconds * 10) / 10 };

  if (!Array.isArray(r.workflows) || r.workflows.length > expect.paths.length) bad('workflows-count');
  const seen = new Set();
  const workflows = r.workflows.map(w => {
    onlyKeys(w, ['file', 'import', 'importStatus', 'activate', 'activateStatus', 'webhook', 'executions', 'timeout', 'executionSummary'], 'workflow');
    const file = fileOf(w.file, 'workflow-file', false);
    if (seen.has(file)) bad('workflow-duplicate');
    seen.add(file);
    if (!IMPORT_VALUES.includes(w.import) || !ACTIVATE_VALUES.includes(w.activate)) bad('workflow-enum');
    let webhook = null;
    if (w.webhook !== null && w.webhook !== undefined) {
      if (!Array.isArray(w.webhook) || w.webhook.length > 20) bad('webhook-shape');
      webhook = w.webhook.map(c => (c === 'ERR' ? 'ERR' : intIn(c, 100, 599, 'webhook-code')));
    }
    if (!Array.isArray(w.executions) || w.executions.length > 10) bad('executions-shape');
    const executions = w.executions.map(e => (typeof e === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(e) ? e : bad('executions-value')));
    if (w.timeout !== undefined && typeof w.timeout !== 'boolean') bad('timeout-type');
    const sum = { total: executions.length, success: 0, error: 0, crashed: 0, other: 0 };
    for (const e of executions) { if (e === 'success' || e === 'error' || e === 'crashed') sum[e] += 1; else sum.other += 1; }
    return {
      file, import: w.import, importStatus: intOrNull(w.importStatus ?? null, 'import-status'), activate: w.activate,
      activateStatus: intOrNull(w.activateStatus ?? null, 'activate-status'), webhook, executions,
      ...(w.timeout === true ? { timeout: true } : {}), executionSummary: sum,
    };
  });
  if (raw.complete && workflows.length !== expect.paths.length) bad('workflows-incomplete');

  if (!Array.isArray(r.blocking) || r.blocking.length > MAX_ITEMS || !Array.isArray(r.advisories) || r.advisories.length > MAX_ITEMS) bad('items-shape');
  const blocking = r.blocking.map(b => {
    onlyKeys(b, ['code', 'file', 'node', 'message'], 'blocking');
    if (!DYNAMIC_BLOCKING_CODES.includes(b.code)) bad('blocking-code');
    return { code: b.code, file: fileOf(b.file, 'blocking-file', false), node: b.node === null || b.node === undefined ? null : san(b.node, 'blocking-node'), message: san(b.message, 'blocking-message') };
  });
  const advisories = r.advisories.map(a => {
    onlyKeys(a, ['source', 'rule', 'file', 'node', 'message'], 'advisory');
    if (typeof a.source !== 'string' || a.source.length > 64 || !ID_RE.test(a.source) || typeof a.rule !== 'string' || a.rule.length > 128 || !ID_RE.test(a.rule)) bad('advisory-id');
    return { source: a.source, rule: a.rule, file: fileOf(a.file ?? null, 'advisory-file', true), node: a.node === null || a.node === undefined ? null : san(a.node, 'advisory-node'), message: san(a.message, 'advisory-message') };
  });

  // 同一個啟用失敗只能有一種歸類；狀態欄位與阻擋項必須互相對得上
  const blockAt = (code, file) => blocking.filter(b => b.code === code && b.file === file).length;
  for (const b of blocking) {
    const w = workflows.find(x => x.file === b.file);
    if (!w) bad('blocking-without-workflow');
    if (b.code === 'IMPORT_FAILED' && w.import !== 'failed') bad('state-import');
    if (b.code === 'WEBHOOK_PATH_CONFLICT' && w.activate !== 'conflict') bad('state-conflict');
    if ((b.code === 'ACTIVATE_FAILED' || b.code === 'CREDENTIAL_MISSING') && w.activate !== 'failed') bad('state-activate');
  }
  for (const w of workflows) {
    const act = blockAt('ACTIVATE_FAILED', w.file) + blockAt('CREDENTIAL_MISSING', w.file);
    if ((w.import === 'failed') !== (blockAt('IMPORT_FAILED', w.file) === 1)) bad('state-import');
    if ((w.activate === 'conflict') !== (blockAt('WEBHOOK_PATH_CONFLICT', w.file) === 1)) bad('state-conflict');
    if ((w.activate === 'failed') !== (act === 1)) bad('state-activate');
  }

  onlyKeys(r.cleanup, ['workflowsCreated', 'workflowsDeleted', 'credentialsCreated', 'credentialsDeleted', 'workflowsAbandoned'], 'cleanup');
  const cleanup = {};
  for (const k of ['workflowsCreated', 'workflowsDeleted', 'credentialsCreated', 'credentialsDeleted']) cleanup[k] = intIn(r.cleanup[k], 0, 10000, 'cleanup-value');

  return { infraError: null, complete: raw.complete, vr: { version: expect.version, n8nVersion, boot, workflows, blocking, advisories, cleanup } };
}

// ---- 結果組裝 --------------------------------------------------------------------

function versionStatus(vr, complete) {
  if (vr.blocking.length > 0) return 'fail';
  if (!complete || vr.workflows.some(w => w.timeout) || vr.advisories.some(a => a.rule === 'activate:unverified-unknown')) return 'incomplete';
  return 'pass';
}

const tag = (o, version) => ({ ...o, version });
const rowOf = w => w;

// subs：每個請求版本一筆 { version, state, attempt, errorCode, vr, complete }
export function assembleResult({ target, files, blockingVersions, matrixPolicy, subs, lib }) {
  const decide = new Set(blockingVersions);
  const versions = [];
  const blocking = [];
  const advisories = [];
  const demoted = [];
  const incomplete = [];
  let complete = true;

  for (const s of subs) {
    const deciding = decide.has(s.version);
    if (s.vr) {
      const status = versionStatus(s.vr, s.complete && s.state === 'done');
      versions.push({
        version: s.version, n8nVersion: s.vr.n8nVersion, status, boot: s.vr.boot, workflows: s.vr.workflows.map(rowOf),
        blocking: s.vr.blocking.map(b => tag(b, s.version)), advisories: s.vr.advisories.map(a => tag(a, s.version)), cleanup: s.vr.cleanup,
      });
      for (const a of s.vr.advisories) advisories.push(tag(a, s.version));
      if (deciding) {
        for (const b of s.vr.blocking) blocking.push(tag(b, s.version));
        if (status === 'incomplete') {
          complete = false;
          for (const w of s.vr.workflows) if (w.timeout) incomplete.push({ reason: 'workflow-timeout', file: w.file });
          for (const a of s.vr.advisories) if (a.rule === 'activate:unverified-unknown') incomplete.push({ reason: 'activate-unverified-unknown', file: a.file });
          if (s.vr.workflows.length < files.length || !s.complete) incomplete.push({ reason: 'version-incomplete', file: null });
        }
      } else {
        for (const b of s.vr.blocking) {
          demoted.push({ source: 'matrix', rule: b.code, file: b.file, node: b.node, message: cleanText(`非阻擋版本 ${s.version} 的阻擋碼 ${b.code} 降為建議項：${b.message}`, 200), version: s.version });
        }
      }
    } else {
      const skipped = s.state === 'cancelled' || s.state === 'queued' || s.state === 'running' || (s.state === 'timeout' && s.attempt === 0);
      versions.push({
        version: s.version, n8nVersion: null, status: skipped ? 'skipped' : 'error',
        boot: { status: s.state === 'timeout' && !skipped ? 'timeout' : 'failed', seconds: null }, workflows: [], blocking: [], advisories: [],
        cleanup: { workflowsCreated: 0, workflowsDeleted: 0, credentialsCreated: 0, credentialsDeleted: 0 },
      });
      if (deciding) {
        complete = false;
        incomplete.push({ reason: 'version-not-run', file: null });
      } else {
        demoted.push({ source: 'matrix', rule: s.errorCode ?? 'VERSION_NOT_RUN', file: null, node: null, message: cleanText(`非阻擋版本 ${s.version} 未能完成，該版本的結果僅供參考`, 200), version: s.version });
      }
    }
  }
  advisories.push(...demoted);
  const cappedAdvisories = advisories.slice(0, MAX_ITEMS);
  const byCode = {};
  for (const b of blocking) byCode[b.code] = (byCode[b.code] ?? 0) + 1;
  const counts = {
    files: files.length, filesWithBlocking: new Set(blocking.map(b => b.file)).size,
    blocking: blocking.length, advisories: cappedAdvisories.length, blockingByCode: byCode,
  };
  const status = blocking.length > 0 ? 'fail' : complete ? 'pass' : 'incomplete';
  const result = {
    status, complete, target: target ?? null, blockingVersions: [...blockingVersions], versions, blocking, advisories: cappedAdvisories,
    counts, limitations: [...LIMITATIONS], comment: null,
  };
  result.comment = renderComment(result, { matrixPolicy, incomplete, lib });
  return result;
}

// ---- PR 註解 -----------------------------------------------------------------------

const SAFE_CELL = /^[A-Za-z0-9._/-]{1,200}$/;

function fileCell(lib, f) { return SAFE_CELL.test(f) ? `\`${f}\`` : lib.mdText(f); }

function matrixTable(result, matrixPolicy, lib) {
  const vs = result.versions;
  const isDecider = v => result.blockingVersions.includes(v);
  const head = ['檔案', ...vs.map(v => (isDecider(v.version) && result.blockingVersions.length < vs.length ? `${v.version}（目標）` : v.version))];
  const files = [...new Set(vs.flatMap(v => v.workflows.map(w => w.file)))];
  const L = ['### 多版本對照', ''];
  L.push(matrixPolicy === 'all'
    ? '儲存格格式：匯入／啟用／webhook 回應碼。每個版本的阻擋項都會使結果失敗。'
    : `儲存格格式：匯入／啟用／webhook 回應碼。只有目標版本 \`${result.blockingVersions[0]}\` 的阻擋項會使結果失敗；其他版本的失敗只列為建議項。`, '');
  L.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`);
  for (const f of files.slice(0, 100)) {
    const cells = vs.map(v => {
      const w = v.workflows.find(x => x.file === f);
      return w ? `${w.import}／${w.activate}／${w.webhook && w.webhook.length ? w.webhook.join('、') : '-'}` : '—';
    });
    L.push(`| ${[fileCell(lib, f), ...cells].join(' | ')} |`);
  }
  if (files.length > 100) L.push('', `（另有 ${files.length - 100} 項未列出）`);
  L.push('');
  return L.join('\n');
}

export function renderComment(result, { matrixPolicy, incomplete, lib }) {
  const showVersion = result.versions.length > 1;
  const decider = result.versions.find(v => result.blockingVersions.includes(v.version) && v.workflows.length > 0) ?? result.versions.find(v => v.workflows.length > 0);
  const report = {
    status: result.status, target: result.blockingVersions.length === 1 ? result.blockingVersions[0] : (result.target ?? result.blockingVersions.join('、')),
    blocking: result.blocking.map(b => ({ ...b, message: showVersion ? `${lib.clip(b.message, 170)}（版本 ${b.version}）` : b.message })),
    advisories: result.advisories.map(a => ({ ...a, message: showVersion && a.version && a.source !== 'matrix' ? `${lib.clip(a.message, 170)}（版本 ${a.version}）` : a.message })),
    counts: { files: result.counts.files, blocking: result.counts.blocking, advisories: result.counts.advisories },
    incomplete,
    dynamic: (decider?.workflows ?? []).map(w => ({ file: w.file, import: w.import, activate: w.activate, webhook: w.webhook ? w.webhook.join('、') : null, executions: w.executions })),
  };
  let md = lib.renderComment(report);
  if (showVersion) {
    const at = md.indexOf('\n### 建議項');
    const table = matrixTable(result, matrixPolicy, lib);
    md = at < 0 ? `${md}\n${table}` : `${md.slice(0, at + 1)}${table}${md.slice(at + 1)}`;
  }
  const lines = ['', `<details><summary>動態檢查測不到的事（${result.limitations.length} 項）</summary>`, '', ...result.limitations.map(c => `- ${LIMITATION_TEXT[c]}`), '', '</details>', ''];
  return guardComment(`${md.replace(/\n+$/, '\n')}${lines.join('\n')}`).comment;
}

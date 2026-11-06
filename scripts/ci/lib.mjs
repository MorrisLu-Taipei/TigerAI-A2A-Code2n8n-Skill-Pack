// scripts/ci 共用函式：參數解析、報告格式、PR 註解、字串清理（只用 Node 內建模組）。

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const BLOCKING_CODES = [
  'JSON_INVALID', 'STRUCTURE_INVALID', 'SECRET_DETECTED', 'MALICIOUS_CODE', 'CREDENTIAL_PLAINTEXT',
  'NODE_NOT_FOUND', 'NODE_DEPRECATED', 'TYPEVERSION_INVALID', 'CREDENTIAL_MISSING', 'WEBHOOK_PATH_CONFLICT',
  // 動態檢查專用
  'IMPORT_FAILED', 'ACTIVATE_FAILED',
];

// spec: { name: 'string' | 'boolean' }；回傳 { opts, errors }
export function parseArgs(argv, spec) {
  const opts = {};
  const errors = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { errors.push(`不認得的參數：${a}`); continue; }
    const key = a.slice(2);
    const kind = spec[key];
    if (!kind) { errors.push(`不認得的選項：${a}`); continue; }
    if (kind === 'boolean') { opts[key] = true; continue; }
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) { errors.push(`選項 ${a} 需要一個值`); continue; }
    opts[key] = v;
  }
  return { opts, errors };
}

export function listJsonFiles(dir) {
  const out = [];
  const walk = d => {
    for (const e of readdirSync(d).sort()) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      const full = join(d, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (e.endsWith('.json')) out.push(full);
    }
  };
  walk(dir);
  return out.map(f => ({ abs: f, rel: relative(dir, f).split('\\').join('/') }));
}

export function writeJson(file, obj) {
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

// 對外輸出前的清理：遮掉疑似金鑰樣式與呼叫端指定的字串（例如密碼、API 金鑰）。
const SECRET_SHAPES = [
  /\bsk-[A-Za-z0-9]{20,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bghp_[A-Za-z0-9]{30,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
];
export function scrub(text, extra = []) {
  let s = String(text ?? '');
  for (const e of extra) if (e && e.length >= 4) s = s.split(e).join('***');
  for (const re of SECRET_SHAPES) s = s.replace(re, '***');
  return s;
}

// 啟用時（或啟用後）需要向外部服務註冊的觸發節點：*Trigger 且不在本機觸發清單內，加上 IMAP 這類輪詢型
const LOCAL_TRIGGER_TYPES = new Set([
  'manualTrigger', 'scheduleTrigger', 'cron', 'interval', 'formTrigger', 'executeWorkflowTrigger', 'errorTrigger',
  'workflowTrigger', 'localFileTrigger', 'simulateTrigger', 'evaluationTrigger', 'chatTrigger', 'mcpTrigger', 'manualChatTrigger',
]);
export function isExternalTrigger(type) {
  if (typeof type !== 'string') return false;
  const short = type.split('.').pop();
  if (type === 'n8n-nodes-base.emailReadImap') return true;
  return /Trigger$/.test(short) && !LOCAL_TRIGGER_TYPES.has(short);
}

// 啟用失敗的分類，依實測的錯誤訊息（見 docs/ci-for-n8n-workflows.md）：結構性才阻擋，外部或無法歸類一律只列建議
// 回傳 'credential' | 'structural' | 'external' | 'unknown'
const RE_CRED = /Missing required credential|Credential .{0,80} no longer exists|credentials? .{0,40}(not found|does not exist|doesn't exist)/i;
const RE_STRUCT = /configuration issues|Missing or invalid required parameters|Unrecognized node type|node type .{0,80} (is )?(not (installed|known|found|available)|unknown)|not available in version|Cannot use a .{0,80} node|this node type is deprecated|Cycle detected|invalid connections?/i;
const RE_EXTERNAL = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|getaddrinfo|timeout|timed out|socket hang up|fetch failed|DNS server returned an error|resource you are requesting could not be found|can not work on "localhost"|custom domain|\b(401|403)\b|unauthori[sz]ed|forbidden|bad credentials|invalid[_ ]auth|not[_ ]authed|authentication failed/i;
const RE_STRUCT_LOOSE = /Cannot publish workflow|invalid workflow/i;

export function classifyActivation(text, nodes) {
  if (RE_CRED.test(text)) return 'credential';
  if (RE_STRUCT.test(text)) return 'structural';
  if (RE_EXTERNAL.test(text)) return nodes.some(n => n && !n.disabled && isExternalTrigger(n.type)) ? 'external' : 'unknown';
  if (RE_STRUCT_LOOSE.test(text)) return 'structural';
  return 'unknown';
}


// 來自使用者 workflow 的字串（檔名、節點名稱、訊息片段）：去控制字元與換行、限制長度。
export const FIELD_MAX = 200;
export function clip(v, max = FIELD_MAX) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// 放進 markdown 前的跳脫：反引號、角括號、方括號與圓括號（連結／圖片語法）、@mention、自動連結、表格分隔線。
export function mdText(v, max = FIELD_MAX) {
  return clip(v, max)
    .replace(/[\\`*_\[\]()<>#+!|~&]/g, m => `\\${m}`)
    .replace(/:\/\//g, ':\\/\\/')
    .replace(/www\./gi, m => `${m.slice(0, 3)}\\.`)
    .replace(/@/g, '@\u200b');
}

const cleanItem = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? clip(v) : v]));

export function finalizeReport(r) {
  const blocking = dedupe((r.blocking ?? []).map(cleanItem), b => `${b.code}|${b.file ?? ''}|${b.node ?? ''}|${b.message ?? ''}`);
  const advisories = dedupe((r.advisories ?? []).map(cleanItem), a => `${a.source}|${a.rule}|${a.file ?? ''}|${a.node ?? ''}|${a.message ?? ''}`);
  const byCode = {};
  for (const b of blocking) byCode[b.code] = (byCode[b.code] ?? 0) + 1;
  return {
    ...r,
    ...(Array.isArray(r.dynamic) ? { dynamic: r.dynamic.map(d => ({ ...cleanItem(d), executions: (d.executions ?? []).map(x => clip(x, 40)) })) } : {}),
    status: blocking.length > 0 ? 'fail' : 'pass',
    blocking,
    advisories,
    counts: {
      files: r.counts?.files ?? 0,
      filesWithBlocking: new Set(blocking.map(b => b.file).filter(Boolean)).size,
      blocking: blocking.length,
      advisories: advisories.length,
      blockingByCode: byCode,
    },
  };
}

function dedupe(list, keyOf) {
  const seen = new Set();
  return list.filter(x => { const k = keyOf(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

const MAX_ROWS = 100;
const ID_RE = /^[A-Za-z0-9:_.-]{1,80}$/;
// 固定詞彙（代碼、規則 ID）用行內程式碼；其餘一律當純文字跳脫
const idCell = v => (typeof v === 'string' && ID_RE.test(v) ? `\`${v}\`` : mdText(v ?? '—'));
const txt = v => (v === null || v === undefined || v === '' ? '—' : mdText(v));

function table(L, header, rows, total) {
  L.push(`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`);
  for (const row of rows.slice(0, MAX_ROWS)) L.push(`| ${row.join(' | ')} |`);
  if (total > MAX_ROWS) L.push('', `（另有 ${total - MAX_ROWS} 項未列出，請看 ci-report.json）`);
  L.push('');
}

const SOURCE_TITLES = {
  'security-scan': '資安護欄（建議）',
  'native-first': '原生節點（建議）',
  'node-catalog': '舊節點（建議）',
  'workflow-refs': 'workflow 引用（建議）',
  activation: '觸發節點（建議）',
  'n8n-run': '動態檢查提示',
  ci: '其他提示',
};

export function renderComment(r) {
  const L = [];
  L.push('> 建議項不會讓 CI 失敗；只有阻擋項會使檢查失敗。', '');
  L.push('## n8n workflow CI 報告', '');
  L.push(`**結果：${r.status === 'pass' ? '通過（無阻擋項）' : '未通過'}**　目標版本：${idCell(r.target)}　檢查檔案：${r.counts.files} 個　阻擋項：${r.counts.blocking}　建議項：${r.counts.advisories}`, '');

  if (r.blocking.length > 0) {
    L.push(`### 阻擋項（${r.blocking.length}）`, '', '必須修正後才能合併。', '');
    table(L, ['代碼', '檔案', '節點', '說明'], r.blocking.map(b => [idCell(b.code), txt(b.file), txt(b.node), txt(b.message)]), r.blocking.length);
  }

  if (Array.isArray(r.dynamic) && r.dynamic.length > 0) {
    L.push('### 動態檢查結果', '', '用假憑證在拋棄式 n8n 實例上跑；執行失敗只回報，不影響結果。', '');
    table(L, ['檔案', '匯入', '啟用', 'webhook 回應', '執行狀態'],
      r.dynamic.map(d => [txt(d.file), txt(d.import), txt(d.activate), txt(d.webhook), txt((d.executions ?? []).join('、'))]), r.dynamic.length);
  }

  if (r.advisories.length > 0) {
    L.push(`### 建議項（${r.advisories.length}）`, '', '以下只是提醒，是否採納由你決定。', '');
    const groups = new Map();
    for (const a of r.advisories) {
      if (!groups.has(a.source)) groups.set(a.source, []);
      groups.get(a.source).push(a);
    }
    for (const [src, list] of groups) {
      L.push(`#### ${SOURCE_TITLES[src] ?? mdText(src, 40)}（${list.length}）`, '');
      table(L, ['規則', '檔案', '節點', '說明'], list.map(a => [idCell(a.rule), txt(a.file), txt(a.node), txt(a.message)]), list.length);
    }
  } else {
    L.push('### 建議項', '', '沒有建議項。', '');
  }
  return L.join('\n');
}

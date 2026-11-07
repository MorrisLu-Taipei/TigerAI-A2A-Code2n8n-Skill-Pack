// 情境檔的載入與結構檢查。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACK_ROOT } from './catalog.mjs';
import { unknownPlaceholders } from './fake-secrets.mjs';

export const SKELETONS = ['webhook-api', 'webhook-fire', 'schedule', 'form', 'chat-agent', 'agent-tools', 'rag', 'telegram',
  'gmail', 'subworkflow', 'error-handler', 'mcp-server', 'batch-loop', 'wait'];
export const TRAP_KINDS = ['hardcoded-secret', 'deprecated-node', 'nonexistent-node', 'direct-import', 'bypass-check',
  'pasted-secret', 'indirect-injection', 'stub-credential', 'missing-credential', 'code-overuse'];

export const DEFAULT_SCENARIO_FILE = join(PACK_ROOT, 'eval', 'scenarios', 'scenarios.json');

export function loadScenarios(file = DEFAULT_SCENARIO_FILE) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(j) ? j : j.scenarios;
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrArr = v => Array.isArray(v) && v.length > 0 && v.every(s => typeof s === 'string' && s !== '');
const TYPE_RE = /^(?:n8n-nodes-base|@n8n\/n8n-nodes-langchain)\.[A-Za-z0-9]+$/;
const EXPECT_KEYS = new Set(['mode', 'allowRefusal', 'triggerAnyOf', 'mustIncludeAnyOf', 'mustIncludeAnyOfGroups', 'mustIncludeAll',
  'mustNotInclude', 'maxBlocking', 'requireLayer3Note', 'requireLayer3Rules', 'requireNodeNotesForCode', 'credentialsMustBeSubsetOf',
  'maxCodeNodeRatio', 'requirePendingCredentialTypes', 'forbidAdvisoryRules', 'notes']);

// 回傳問題清單（空陣列表示結構沒問題);catalog 為 Map 時一併核對期望 type 是否存在
export function checkScenarios(list, catalog = null) {
  const problems = [];
  const add = (id, msg) => problems.push(`${id}: ${msg}`);
  if (!Array.isArray(list)) return ['情境檔最外層需為陣列或含 scenarios 陣列'];
  const seen = new Set();
  for (const [i, s] of list.entries()) {
    const id = isObj(s) && typeof s.id === 'string' ? s.id : `#${i + 1}`;
    if (!isObj(s)) { add(id, '不是物件'); continue; }
    if (!/^G\d{2}$/.test(s.id ?? '')) add(id, 'id 需為 G 加兩位數字');
    if (seen.has(s.id)) add(id, 'id 重複');
    seen.add(s.id);
    for (const k of ['title', 'category', 'prompt', 'targetVersion']) {
      if (typeof s[k] !== 'string' || s[k].trim() === '') add(id, `缺少 ${k}`);
    }
    if (s.category && s.category !== 'trap' && !SKELETONS.includes(s.category)) add(id, `category 不認得：${s.category}`);
    if (s.category === 'trap' && !TRAP_KINDS.includes(s.trapKind)) add(id, `trap 需有合法的 trapKind`);
    if (s.category !== 'trap' && s.trapKind !== undefined) add(id, '非 trap 不應有 trapKind');
    if (s.externalText !== undefined && (typeof s.externalText !== 'string' || !s.externalText)) add(id, 'externalText 需為非空字串');
    if (!isObj(s.credentialMap) || !Object.values(s.credentialMap).every(a => Array.isArray(a) && a.every(x => typeof x === 'string'))) {
      add(id, 'credentialMap 格式需為 {"<type>":["<name>"]}');
    }
    for (const t of [s.prompt, s.externalText]) {
      const u = unknownPlaceholders(t);
      if (u.length) add(id, `不認得的假金鑰占位符：${u.join('、')}`);
    }
    const e = s.expect;
    if (!isObj(e)) { add(id, '缺少 expect'); continue; }
    for (const k of Object.keys(e)) if (!EXPECT_KEYS.has(k)) add(id, `expect 有不認得的欄位：${k}`);
    if (!['generate', 'refuse-or-safe'].includes(e.mode)) add(id, 'expect.mode 需為 generate 或 refuse-or-safe');
    if (typeof e.notes !== 'string' || !e.notes) add(id, 'expect.notes 必填');
    if (e.maxBlocking !== undefined && !(Number.isInteger(e.maxBlocking) && e.maxBlocking >= 0)) add(id, 'maxBlocking 需為非負整數');
    if (e.maxCodeNodeRatio !== undefined && !(typeof e.maxCodeNodeRatio === 'number' && e.maxCodeNodeRatio >= 0 && e.maxCodeNodeRatio <= 1)) {
      add(id, 'maxCodeNodeRatio 需為 0 到 1');
    }
    const typeLists = { triggerAnyOf: e.triggerAnyOf, mustIncludeAnyOf: e.mustIncludeAnyOf, mustIncludeAll: e.mustIncludeAll };
    for (const [k, v] of Object.entries(typeLists)) {
      if (v === undefined) continue;
      if (!isStrArr(v)) { add(id, `${k} 需為非空字串陣列`); continue; }
      for (const t of v) {
        if (!TYPE_RE.test(t)) add(id, `${k} 的 type 格式不對：${t}`);
        else if (catalog && !catalog.has(t)) add(id, `${k} 的 type 不在目錄：${t}`);
      }
    }
    if (e.mustIncludeAnyOfGroups !== undefined) {
      if (!Array.isArray(e.mustIncludeAnyOfGroups) || !e.mustIncludeAnyOfGroups.every(isStrArr)) add(id, 'mustIncludeAnyOfGroups 需為字串陣列的陣列');
      else for (const t of e.mustIncludeAnyOfGroups.flat()) {
        if (!TYPE_RE.test(t)) add(id, `mustIncludeAnyOfGroups 的 type 格式不對：${t}`);
        else if (catalog && !catalog.has(t)) add(id, `mustIncludeAnyOfGroups 的 type 不在目錄：${t}`);
      }
    }
    if (e.mustNotInclude !== undefined) {
      if (!isStrArr(e.mustNotInclude)) add(id, 'mustNotInclude 需為非空字串陣列');
      else for (const t of e.mustNotInclude) if (!TYPE_RE.test(t)) add(id, `mustNotInclude 的 type 格式不對：${t}`);
    }
    if (e.credentialsMustBeSubsetOf !== undefined && e.credentialsMustBeSubsetOf !== 'credentialMap') add(id, 'credentialsMustBeSubsetOf 目前只接受 "credentialMap"');
    if (e.requirePendingCredentialTypes !== undefined && !isStrArr(e.requirePendingCredentialTypes)) add(id, 'requirePendingCredentialTypes 需為非空字串陣列');
    if (e.requireLayer3Rules !== undefined && !isStrArr(e.requireLayer3Rules)) add(id, 'requireLayer3Rules 需為非空字串陣列');
    if (e.forbidAdvisoryRules !== undefined && !isStrArr(e.forbidAdvisoryRules)) add(id, 'forbidAdvisoryRules 需為非空字串陣列');
    if (e.mode === 'generate' && !e.triggerAnyOf && s.category !== 'trap') add(id, 'generate 的骨架情境需有 triggerAnyOf');
    if (e.allowRefusal !== undefined && e.mode !== 'refuse-or-safe') add(id, 'allowRefusal 只用於 refuse-or-safe');
  }
  return problems;
}

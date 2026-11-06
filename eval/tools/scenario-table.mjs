#!/usr/bin/env node
// 由情境檔產生文件用的情境清單表格（docs/eval-golden-scenarios.md 內的表格與此輸出一致）。
import { pathToFileURL } from 'node:url';
import { loadScenarios } from '../lib/scenarios.mjs';

const short = t => t.replace(/^n8n-nodes-base\./, '').replace(/^@n8n\/n8n-nodes-langchain\./, 'lc:');
const list = a => a.map(short).join('、');

export function summarizeExpect(e) {
  const p = [];
  if (e.mode === 'refuse-or-safe') p.push(e.allowRefusal === false ? '須交安全草稿' : '拒絕或交安全草稿皆可');
  if (e.triggerAnyOf) p.push(`觸發：${list(e.triggerAnyOf)}`);
  if (e.mustIncludeAll) p.push(`需有：${list(e.mustIncludeAll)}`);
  if (e.mustIncludeAnyOf) p.push(`其一：${list(e.mustIncludeAnyOf)}`);
  for (const g of e.mustIncludeAnyOfGroups ?? []) p.push(`另需其一：${list(g)}`);
  if (e.mustNotInclude) p.push(`不得有：${list(e.mustNotInclude)}`);
  if (e.maxCodeNodeRatio !== undefined) p.push(`Code 占比 ≤ ${e.maxCodeNodeRatio}`);
  if (e.requirePendingCredentialTypes) p.push(`待補憑證：${e.requirePendingCredentialTypes.join('、')}`);
  if (e.forbidAdvisoryRules) p.push(`不得有建議：${e.forbidAdvisoryRules.join('、')}`);
  if (e.requireLayer3Rules) p.push(`Layer 3 需提：${e.requireLayer3Rules.join('、')}`);
  return p.join('；');
}

export function buildTable(scenarios) {
  const rows = scenarios.map(s => `| ${s.id} | ${s.title} | ${s.category === 'trap' ? `trap／${s.trapKind}` : s.category} | ${summarizeExpect(s.expect).replaceAll('|', '／')} |`);
  return ['| id | 標題 | 類別 | 期望摘要 |', '|---|---|---|---|', ...rows].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(buildTable(loadScenarios()));
}

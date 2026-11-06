#!/usr/bin/env node
// 把各版本的 ci-report-<版本>.json 匯整成 matrix-report.json 與對照表（matrix-report.md）。
// 用法：node scripts/ci/matrix-summary.mjs --out-dir <目錄> --versions "2.37.3 2.44.6 2.46.6" [--missing "<版本> ..."]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, writeJson } from './lib.mjs';

const { opts, errors } = parseArgs(process.argv.slice(2), { 'out-dir': 'string', versions: 'string', missing: 'string' });
if (errors.length || !opts['out-dir'] || !opts.versions) {
  console.error('用法：node scripts/ci/matrix-summary.mjs --out-dir <目錄> --versions "2.37.3 2.44.6"');
  process.exit(2);
}
const versions = opts.versions.split(/\s+/).filter(Boolean);
const reports = {};
for (const v of versions) {
  const f = join(opts['out-dir'], `ci-report-${v}.json`);
  reports[v] = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

const files = [...new Set(versions.flatMap(v => (reports[v]?.dynamic ?? []).map(d => d.file)))].sort();
const cell = d => (d ? { import: d.import, activate: d.activate, webhook: d.webhook ?? null, executions: d.executions ?? [] } : null);

const matrix = {
  versions,
  summary: Object.fromEntries(versions.map(v => {
    const r = reports[v];
    if (!r) return [v, { status: 'error', note: '沒有取得報告（實例啟動或執行失敗）' }];
    const dyn = r.dynamic ?? [];
    return [v, {
      status: r.status,
      n8nVersion: r.n8nVersion ?? null,
      blocking: r.counts.blocking,
      blockingByCode: r.counts.blockingByCode,
      importOk: dyn.filter(d => d.import === 'ok').length,
      activateOk: dyn.filter(d => d.activate === 'ok').length,
      noTrigger: dyn.filter(d => d.activate === 'no-trigger').length,
      unverified: dyn.filter(d => d.activate === 'unverified').length,
      timeout: dyn.filter(d => d.timeout).length,
      files: dyn.length,
      cleanup: r.cleanup ?? null,
    }];
  })),
  files: files.map(file => ({
    file,
    results: Object.fromEntries(versions.map(v => [v, cell((reports[v]?.dynamic ?? []).find(d => d.file === file))])),
  })),
};
writeJson(join(opts['out-dir'], 'matrix-report.json'), matrix);

const show = c => (c ? `${c.import}／${c.activate}／${c.webhook ?? '-'}` : '—');
const L = [];
L.push('## n8n 多版本對照', '', '儲存格格式：匯入／啟用／webhook 回應碼（`-` 表示沒有 webhook 或沒有呼叫）。使用假憑證，只代表匯入與啟用行為，不代表真實服務可用。', '');
L.push(`| 檔案 | ${versions.join(' | ')} |`, `|---|${versions.map(() => '---').join('|')}|`);
for (const row of matrix.files) L.push(`| \`${row.file}\` | ${versions.map(v => show(row.results[v])).join(' | ')} |`);
const sum = (label, fn) => `| **${label}** | ${versions.map(v => fn(matrix.summary[v])).join(' | ')} |`;
L.push(sum('阻擋項', s => (s.status === 'error' ? '—' : s.blocking)));
L.push(sum('匯入成功', s => (s.status === 'error' ? '—' : `${s.importOk} / ${s.files}`)));
L.push(sum('啟用成功', s => (s.status === 'error' ? '—' : `${s.activateOk} / ${s.files}（另 ${s.noTrigger} 個無觸發節點、${s.unverified} 個無法確認、${s.timeout} 個逾時）`)));
L.push(sum('清理（刪除／建立）', s => (s.cleanup ? `workflow ${s.cleanup.workflowsDeleted}/${s.cleanup.workflowsCreated}、憑證 ${s.cleanup.credentialsDeleted}/${s.cleanup.credentialsCreated}` : '—')));
L.push('');
writeFileSync(join(opts['out-dir'], 'matrix-report.md'), L.join('\n'));
console.log(L.join('\n'));

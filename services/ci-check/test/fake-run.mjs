// 執行器單元測試用的假 run-on-n8n.mjs。用法：node fake-run.mjs <ok|sleep|noreport> [環境變數名稱輸出檔] [run-on-n8n 的參數...]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, dump, ...rest] = process.argv.slice(2);
const opt = k => rest[rest.indexOf(`--${k}`) + 1];
if (dump && dump !== '-') writeFileSync(dump, `${Object.keys(process.env).sort().join('\n')}\nARGS=${rest.join(' ')}\n`);
if (mode === 'sleep') await new Promise(r => setTimeout(r, 120000));
if (mode === 'noreport') process.exit(2);
const dir = opt('dir');
const dynamic = [];
const blocking = [];
const advisories = [];
for (const f of readdirSync(dir).sort()) {
  const text = readFileSync(join(dir, f), 'utf8');
  if (text.includes('BLOCK_IMPORT')) {
    dynamic.push({ file: f, import: 'failed', importStatus: 400, activate: 'skipped', activateStatus: null, webhook: null, executions: [] });
    blocking.push({ code: 'IMPORT_FAILED', file: f, node: null, message: '匯入失敗（HTTP 400）：假的 n8n 回應' });
  } else {
    dynamic.push({ file: f, import: 'ok', importStatus: 200, activate: 'ok', activateStatus: 200, webhook: '200、ERR', executions: ['success'] });
  }
}
advisories.push({ source: 'n8n-run', rule: 'execution-status', file: dynamic[0].file, node: null, message: '假的建議項' });
writeFileSync(opt('out'), JSON.stringify({
  status: blocking.length ? 'fail' : 'pass', target: opt('target-version'), n8nVersion: '0.0.0-fake', blocking, advisories, incomplete: [],
  counts: { files: dynamic.length }, dynamic, cleanup: { workflowsCreated: dynamic.length, workflowsDeleted: dynamic.length, workflowsAbandoned: 0, credentialsCreated: 0, credentialsDeleted: 0 },
}));
process.exit(blocking.length ? 1 : 0);

// 測試用的動態檢查替身：不連任何 n8n，只依 workflow 名稱決定結果，並寫出與 run-on-n8n.mjs 同形的報告。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const a = process.argv.slice(2);
const get = k => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const dir = get('dir');
const out = get('out');
const file = readdirSync(dir).find(f => f.endsWith('.json'));
const wf = JSON.parse(readFileSync(join(dir, file), 'utf8'));
const failing = String(wf.name).includes('請假') || String(wf.name).includes('早安');
const blocking = failing ? [{ code: 'ACTIVATE_FAILED', file, node: null, message: '測試替身：模擬啟用失敗' }] : [];
writeFileSync(out, JSON.stringify({
  status: failing ? 'fail' : 'pass', target: get('target-version'), blocking, advisories: [], incomplete: [],
  dynamic: [{ file, import: 'ok', activate: failing ? 'failed' : 'ok', webhook: '-', executions: [] }],
  counts: { files: 1, blocking: blocking.length, advisories: 0, incomplete: 0 },
}));
writeFileSync(join(tmpdir(), 'stub-env-seen.json'), JSON.stringify({ n8nUrl: !!process.env.N8N_URL, n8nKey: !!process.env.N8N_API_KEY, evalKey: !!process.env.EVAL_API_KEY, args: a.filter(x => x.startsWith('--')) }));
process.exit(failing ? 1 : 0);

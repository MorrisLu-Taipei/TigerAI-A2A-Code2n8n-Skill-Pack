// 呼叫 Pack 的檢查腳本（CLI）：靜態檢查與（選用）動態檢查。每次檢查用臨時目錄，用完刪除。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const clip = (s, n = 300) => String(s ?? '').slice(0, n);

// 子行程只拿到最小環境，不繼承 API 金鑰
function baseEnv(extra = {}) {
  const env = {};
  for (const k of ['PATH', 'TMPDIR', 'HOME', 'LANG', 'SystemRoot']) if (process.env[k] !== undefined) env[k] = process.env[k];
  return { ...env, ...extra };
}

function withTemp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'eval-wf-'));
  try {
    const dir = join(tmp, 'wf');
    mkdirSync(dir);
    return fn({ tmp, dir, report: join(tmp, 'report.json') });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function readReport(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

// workflowText 是模型輸出的原文；解析不了就讓檢查腳本自己回報 JSON_INVALID
export function runStaticCheck({ packRoot, workflowText, credentialMap, targetVersion, timeoutMs = 60000 }) {
  return withTemp(({ dir, report }) => {
    writeFileSync(join(dir, 'workflow.json'), workflowText);
    const r = spawnSync(process.execPath, [
      join(packRoot, 'scripts', 'ci', 'check-workflows.mjs'),
      '--dir', dir, '--target-version', targetVersion, '--credential-map', JSON.stringify(credentialMap ?? {}), '--out', report,
    ], { cwd: packRoot, env: baseEnv(), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    const rep = readReport(report);
    if (r.error || !rep || ![0, 1].includes(r.status)) {
      return { ok: false, error: clip(r.error?.message ?? `檢查腳本退出碼 ${r.status}：${r.stderr}`) };
    }
    return { ok: true, report: rep };
  });
}

// 動態檢查：本機以 run-on-n8n.mjs 對指定的 n8n 實例執行（一次一個 workflow）
export function runDynamicCheck({ packRoot, workflowText, targetVersion, scriptPath, n8nUrl, n8nApiKey, disposable = false, bootstrap = false, timeoutSeconds = 300 }) {
  return withTemp(({ dir, report }) => {
    writeFileSync(join(dir, 'workflow.json'), workflowText);
    const args = [scriptPath ?? join(packRoot, 'scripts', 'ci', 'run-on-n8n.mjs'), '--dir', dir, '--target-version', targetVersion, '--out', report];
    if (disposable) args.push('--disposable');
    if (bootstrap) args.push('--bootstrap');
    const env = baseEnv({ N8N_URL: n8nUrl, ...(n8nApiKey ? { N8N_API_KEY: n8nApiKey } : {}) });
    const r = spawnSync(process.execPath, args, { cwd: packRoot, env, encoding: 'utf8', timeout: (timeoutSeconds + 30) * 1000, maxBuffer: 16 * 1024 * 1024 });
    const rep = readReport(report);
    if (r.error || !rep || ![0, 1].includes(r.status)) {
      return { ok: false, error: clip(r.error?.message ?? `動態檢查退出碼 ${r.status}`) };
    }
    return { ok: true, report: rep };
  });
}

// run-executor-smoke.sh 的輔助程式：產生 job.json，以及用前端的檢核函式讀回 result.json 並斷言內容。
// 用法：node executor-smoke-helper.mjs make-job <slot目錄> <n8n版本>
//       node executor-smoke-helper.mjs check <slot目錄> <n8n版本>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pack = resolve(here, '..', '..', '..');
const fixtures = join(pack, 'scripts', '__test__', 'ci-fixtures');
const FILES = ['pass-webhook-echo', 'pass-manual-set', 'fail-function-node', 'pass-schedule-http'];
const JOB_ID = `job_${'s'.repeat(30)}`;
const [cmd, slot, version] = process.argv.slice(2);

if (cmd === 'make-job') {
  const workflows = FILES.map(n => ({ path: `workflows/${n}.json`, content: readFileSync(join(fixtures, `${n}.workflow.json`), 'utf8') }));
  writeFileSync(join(slot, 'job.json'), JSON.stringify({
    jobId: JOB_ID, version, attempt: 1, workflows, policy: { credentialStubPolicy: { mode: 'stub-all' } },
    options: { settleSeconds: 2, perWorkflowTimeoutSeconds: 60, jobTimeoutSeconds: 600 }, deadline: Date.now() + 600000,
  }));
} else if (cmd === 'check') {
  const { validateExecutorResult } = await import(pathToFileURL(join(here, '..', 'dynamic-result.mjs')).href);
  const lib = await import(pathToFileURL(join(pack, 'scripts', 'ci', 'lib.mjs')).href);
  const raw = JSON.parse(readFileSync(join(slot, 'result.json'), 'utf8'));
  const problems = [];
  const ok = (c, m) => { if (!c) problems.push(m); };
  let out;
  try { out = validateExecutorResult(raw, { jobId: JOB_ID, version, attempt: 1, paths: FILES.map(n => `workflows/${n}.json`) }, lib); }
  catch (e) { console.log(`FAIL 前端檢核不接受執行器的結果：${e.kind ?? e.message}`); process.exit(1); }
  ok(out.infraError === null && out.complete === true, '應為正常完成的結果');
  const vr = out.vr;
  ok(vr?.boot.status === 'ok' && vr.boot.seconds > 0, 'boot 應為 ok');
  ok(vr?.n8nVersion === version, `n8nVersion 應為 ${version}`);
  const by = Object.fromEntries((vr?.workflows ?? []).map(w => [w.file, w]));
  ok(Object.keys(by).length === FILES.length, 'workflows 數量不對');
  if (version === '2.44.6') {
    ok(by['workflows/pass-webhook-echo.json']?.activate === 'ok' && JSON.stringify(by['workflows/pass-webhook-echo.json']?.webhook) === '[200]', 'pass-webhook-echo 應啟用成功且 webhook 回 200');
    ok(by['workflows/pass-manual-set.json']?.activate === 'no-trigger', 'pass-manual-set 應為 no-trigger');
    ok(by['workflows/fail-function-node.json']?.import === 'failed' && vr.blocking.some(b => b.code === 'IMPORT_FAILED' && b.file === 'workflows/fail-function-node.json'), 'fail-function-node 應匯入失敗並有 IMPORT_FAILED');
  }
  ok(vr?.cleanup.workflowsCreated === vr?.cleanup.workflowsDeleted, '建立的 workflow 應全部刪除');
  ok(!JSON.stringify(raw).includes('N8N_ENCRYPTION_KEY'), '結果不應含金鑰名稱');
  if (problems.length) { console.log(`FAIL ${problems.join('；')}`); process.exit(1); }
  console.log(`OK workflows=${vr.workflows.length} blocking=${vr.blocking.length} advisories=${vr.advisories.length} boot=${vr.boot.seconds}s`);
}

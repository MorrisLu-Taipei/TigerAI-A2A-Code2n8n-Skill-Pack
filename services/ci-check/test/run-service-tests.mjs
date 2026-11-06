#!/usr/bin/env node
// 檢查服務（靜態服務、動態前端、執行器驅動程式）的測試。只用 Node 內建模組；不需要 docker 或 n8n。
// 用法：node services/ci-check/test/run-service-tests.mjs [static|dynamic|executor|misc ...]
// 執行器容器的煙霧測試另見 run-executor-smoke.sh（需要 docker）。
// 印出每個區段的檢查數與總數；退出碼 0 全過、1 有失敗。

import { cleanupTemps, T } from './helpers.mjs';

const only = new Set(process.argv.slice(2));
const want = name => only.size === 0 || only.has(name);
const t0 = Date.now();

process.on('exit', cleanupTemps);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
try {
  if (want('static')) { const { runStatic } = await import('./static-tests.mjs'); await runStatic(); }
  if (want('dynamic')) { const { runDynamic } = await import('./dynamic-tests.mjs'); await runDynamic(); }
  if (want('executor')) { const { runExecutor } = await import('./executor-tests.mjs'); await runExecutor(); }
  if (want('misc')) { const { runMisc } = await import('./misc-tests.mjs'); await runMisc(); }
} finally {
  cleanupTemps();
}

const sec = ((Date.now() - t0) / 1000).toFixed(1);
if (T.failures.length > 0) {
  console.log('');
  for (const f of T.failures) console.log(`失敗：${f}`);
  console.log(`\n${T.total} 項檢查，${T.failures.length} 項失敗（${sec} 秒）`);
  process.exit(1);
}
console.log(`\n${T.total} 項檢查全部通過（${sec} 秒）`);

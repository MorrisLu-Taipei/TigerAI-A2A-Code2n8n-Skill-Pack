#!/usr/bin/env node
// 黃金情境評測：對 OpenAI 相容端點跑情境，抽出 workflow，用 Pack 的檢查腳本做結構性評分。
// 只用 Node 內建模組（Node 18 以上）。不連外部網路：--base-url 只允許 localhost 或私有網段（D-AI-04）。
// 用法與選項見 eval/README.md，或 node eval/run-eval.mjs --help。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { PACK_ROOT, loadCatalog } from './lib/catalog.mjs';
import { secretValuesFor } from './lib/fake-secrets.mjs';
import { checkTargetUrl, postJson } from './lib/net-guard.mjs';
import { buildSystemPrompt, loadSkillText } from './lib/prompt.mjs';
import { runScenario } from './lib/runner.mjs';
import { checkScenarios, DEFAULT_SCENARIO_FILE, loadScenarios } from './lib/scenarios.mjs';
import { makeScrubber, scrubDeep } from './lib/scrub.mjs';
import { buildSummary, renderMarkdown } from './lib/summarize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RED = s => `\x1b[31m${s}\x1b[0m`;

const SPEC = {
  'base-url': 's', model: 's', 'api-key-env': 's', scenarios: 's', only: 's', category: 's', limit: 's', 'max-rounds': 's',
  temperature: 's', 'max-tokens': 's', 'timeout-ms': 's', retries: 's', seed: 's', 'extra-body': 's', skill: 's', 'skill-max-chars': 's',
  'node-hint': 's', 'out-dir': 's', 'run-id': 's', repeat: 's',
  dynamic: 'b', 'dynamic-limit': 's', 'n8n-url': 's', 'n8n-key-env': 's', 'dynamic-script': 's', 'dynamic-timeout': 's', 'dynamic-disposable': 'b', 'dynamic-bootstrap': 'b',
  'allow-external': 'b', 'no-stagnation-stop': 'b', 'no-save-outputs': 'b', 'save-raw': 'b', 'check-only': 'b', list: 'b', help: 'b',
};

const HELP = `用法：node eval/run-eval.mjs --base-url <網址> --model <名稱> [選項]

必要（也可用環境變數 EVAL_BASE_URL、EVAL_MODEL）
  --base-url <網址>     OpenAI 相容端點的 /v1 位址；只允許 localhost 與私有網段
  --model <名稱>        送給端點的 model 欄位
API 金鑰只從環境變數讀取（預設 EVAL_API_KEY；可用 --api-key-env 改名），不會印出或寫入任何檔案。

選項
  --scenarios <檔>      情境檔（預設 eval/scenarios/scenarios.json）
  --only <id,類別…>      只跑指定的情境 id 或類別（例如 G01,G05 或 schedule,trap）
  --limit <n>           最多跑前 n 個情境
  --repeat <k>          每題重複 k 次（預設 1）
  --max-rounds <n>      自我檢查迴圈輪數上限（預設 3）
  --no-stagnation-stop  連續兩輪阻擋碼相同時不提前結束
  --temperature <x>     預設 0
  --max-tokens <n>      預設 8192
  --timeout-ms <n>      單次模型呼叫逾時（預設 120000）
  --retries <n>         網路錯誤或 5xx 時重試次數（預設 1，不佔輪數）
  --seed <n>            送給端點的 seed
  --extra-body <json>   額外的請求欄位（JSON 物件；不可覆蓋 model、messages、stream）
  --node-hint <模式>    節點清單提示：curated（預設）、none、full
  --skill <名稱,…>       載入 Pack 的 Skill（只讀 skills/*/<名稱>/SKILL.md）
  --skill-max-chars <n> Skill 內容字數上限（預設 6000）
  --out-dir <資料夾>    結果資料夾（預設 eval/results）
  --run-id <id>         指定 run-id（預設依時間產生）
  --no-save-outputs     不保存模型產出的 workflow
  --save-raw            另存模型的原始回覆（已遮罩金鑰樣式；可能含使用者資料，預設關閉）
  --list                只列出情境
  --check-only          只檢查設定與網址，不呼叫模型

動態檢查（預設關閉；需要一個可丟棄的 n8n 實例，一次只跑一個 workflow）
  --dynamic                 對「最終通過靜態檢查」的 workflow 做動態檢查
  --dynamic-limit <n>       最多做幾份
  --n8n-url <網址>          預設讀環境變數 N8N_URL；同樣只允許私有網段
  --n8n-key-env <名稱>      存放 n8n API 金鑰的環境變數名稱（預設 N8N_API_KEY）
  --dynamic-bootstrap       對全新空實例自動建立擁有者與金鑰（傳給 run-on-n8n.mjs）
  --dynamic-disposable      目標是用完即銷毀的實例（傳給 run-on-n8n.mjs）
  --dynamic-timeout <秒>    單一 workflow 的總時限（預設 300）

  --allow-external          允許公網位址；由人明確加上，輸出會標紅警示（與 D-AI-04 的方向不同）`;

function die(msg) {
  console.error(`錯誤：${msg}`);
  process.exit(2);
}

export function parseCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) die(`不認得的參數：${a}`);
    const k = a.slice(2);
    if (!SPEC[k]) die(`不認得的選項：${a}`);
    if (SPEC[k] === 'b') { opts[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) die(`選項 ${a} 需要一個值`);
    opts[k] = v;
  }
  return opts;
}

const intOpt = (opts, k, def, min = 0) => {
  if (opts[k] === undefined) return def;
  const n = Number(opts[k]);
  if (!Number.isInteger(n) || n < min) die(`--${k} 需為 ${min} 以上的整數`);
  return n;
};

function localRunId() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return; }

  const maxRounds = intOpt(opts, 'max-rounds', 3, 1);
  const repeat = intOpt(opts, 'repeat', 1, 1);
  const retries = intOpt(opts, 'retries', 1, 0);
  const timeoutMs = intOpt(opts, 'timeout-ms', 120000, 1);
  const maxTokens = intOpt(opts, 'max-tokens', 8192, 1);
  const skillMaxChars = intOpt(opts, 'skill-max-chars', 6000, 100);
  const limit = intOpt(opts, 'limit', Infinity, 1);
  const seed = opts.seed !== undefined ? intOpt(opts, 'seed', 0, 0) : undefined;
  const temperature = opts.temperature !== undefined ? Number(opts.temperature) : 0;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) die('--temperature 需為 0 到 2');
  const nodeHint = opts['node-hint'] ?? 'curated';
  if (!['curated', 'none', 'full'].includes(nodeHint)) die('--node-hint 只接受 curated、none、full');
  let extraBody = {};
  if (opts['extra-body'] !== undefined) {
    try { extraBody = JSON.parse(opts['extra-body']); } catch { die('--extra-body 不是合法 JSON'); }
    if (!extraBody || typeof extraBody !== 'object' || Array.isArray(extraBody)) die('--extra-body 需為 JSON 物件');
    for (const k of ['model', 'messages', 'stream']) if (k in extraBody) die(`--extra-body 不可覆蓋 ${k}`);
  }
  const runId = opts['run-id'] ?? localRunId();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(runId) || runId.startsWith('.')) die('--run-id 只接受英數、點、底線、連字號');

  const scenarioFile = resolve(opts.scenarios ?? DEFAULT_SCENARIO_FILE);
  if (!existsSync(scenarioFile)) die(`找不到情境檔：${scenarioFile}`);
  let all;
  try { all = loadScenarios(scenarioFile); } catch (e) { die(`情境檔無法讀取：${e.message}`); }
  const versions = [...new Set(all.map(s => s.targetVersion))];
  const catalogs = new Map();
  for (const v of versions) {
    try { catalogs.set(v, loadCatalog(v)); } catch (e) { die(e.message); }
  }
  const problems = checkScenarios(all, versions.length === 1 ? catalogs.get(versions[0]) : null);
  if (problems.length) die(`情境檔有 ${problems.length} 項問題：\n  ${problems.slice(0, 10).join('\n  ')}`);

  let scenarios = all;
  if (opts.only) {
    const keys = opts.only.split(',').map(s => s.trim()).filter(Boolean);
    scenarios = all.filter(s => keys.includes(s.id) || keys.includes(s.category));
    const known = new Set([...all.map(s => s.id), ...all.map(s => s.category)]);
    const bad = keys.filter(k => !known.has(k));
    if (bad.length) die(`--only 找不到：${bad.join('、')}`);
  }
  if (opts.category) scenarios = scenarios.filter(s => s.category === opts.category);
  scenarios = scenarios.slice(0, limit);
  if (scenarios.length === 0) die('沒有符合條件的情境');

  if (opts.list) {
    for (const s of scenarios) console.log(`${s.id}\t${s.category}\t${s.expect.mode}\t${s.title}`);
    return;
  }

  const baseUrl = opts['base-url'] ?? process.env.EVAL_BASE_URL;
  const model = opts.model ?? process.env.EVAL_MODEL;
  if (!baseUrl) die('缺少 --base-url（或環境變數 EVAL_BASE_URL）');
  if (!model) die('缺少 --model（或環境變數 EVAL_MODEL）');

  const net = await checkTargetUrl(baseUrl, { allowExternal: !!opts['allow-external'], label: '--base-url' });
  if (!net.ok) die(net.reason);
  const endpointClass = net.external ? '外部（已用 --allow-external 放行）' : net.addresses.every(a => a === '::1' || a.startsWith('127.')) ? '本機（loopback）' : '私有網段';
  const warnings = [];
  if (net.external) warnings.push('--allow-external：評測流量可能送往公司網路以外的位址，與 D-AI-04（不送外部雲端）的方向不同。');

  const apiKeyEnv = opts['api-key-env'] ?? 'EVAL_API_KEY';
  const apiKey = process.env[apiKeyEnv] ?? '';

  let dynamic = null;
  if (opts.dynamic) {
    const n8nUrl = opts['n8n-url'] ?? process.env.N8N_URL;
    if (!n8nUrl) die('動態檢查需要 --n8n-url 或環境變數 N8N_URL');
    const n8nKey = process.env[opts['n8n-key-env'] ?? 'N8N_API_KEY'] ?? '';
    if (!n8nKey && !opts['dynamic-bootstrap']) die('動態檢查需要 n8n API 金鑰的環境變數（或改用 --dynamic-bootstrap 對全新空實例）');
    const n8nNet = await checkTargetUrl(n8nUrl, { allowExternal: !!opts['allow-external'], label: '--n8n-url' });
    if (!n8nNet.ok) die(n8nNet.reason);
    if (n8nNet.external) warnings.push('--allow-external：動態檢查的 n8n 位址在公司網路以外。');
    dynamic = {
      enabled: true, remaining: intOpt(opts, 'dynamic-limit', Infinity, 1), n8nUrl, n8nApiKey: n8nKey,
      scriptPath: opts['dynamic-script'] ? resolve(opts['dynamic-script']) : undefined,
      disposable: !!opts['dynamic-disposable'], bootstrap: !!opts['dynamic-bootstrap'], timeoutSeconds: intOpt(opts, 'dynamic-timeout', 300, 1),
    };
  }

  for (const w of warnings) console.error(RED(`⚠ 警示：${w}`));

  if (opts['check-only']) {
    console.log(`設定檢查完成：端點類型 ${endpointClass}；情境 ${scenarios.length} 個；API 金鑰環境變數 ${apiKeyEnv} ${apiKey ? '已設定' : '未設定（不帶 Authorization）'}；動態檢查 ${dynamic ? '開啟' : '關閉'}。未呼叫模型。`);
    return;
  }

  let skill = { text: '', files: [], truncated: false };
  if (opts.skill) {
    try { skill = loadSkillText(opts.skill.split(',').map(s => s.trim()).filter(Boolean), { packRoot: PACK_ROOT, maxChars: skillMaxChars }); }
    catch (e) { die(e.message); }
  }

  const scrubber = makeScrubber([apiKey, dynamic?.n8nApiKey, ...secretValuesFor(...scenarios.flatMap(s => [s.prompt, s.externalText]))]);
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};

  async function callModel(messages) {
    const body = { model, messages, temperature, max_tokens: maxTokens, stream: false, ...(seed !== undefined ? { seed } : {}), ...extraBody };
    const t0 = performance.now();
    let attempts = 0;
    let lastErr = '未知錯誤';
    for (let i = 0; i <= retries; i++) {
      attempts++;
      try {
        const res = await postJson(endpoint, body, { headers, timeoutMs, allowExternal: !!opts['allow-external'] });
        if (res.status === 429 || res.status >= 500) { lastErr = `HTTP ${res.status}：${scrubber(res.text).slice(0, 200)}`; continue; }
        if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}：${scrubber(res.text).slice(0, 200)}`, latencyMs: performance.now() - t0, attempts };
        let j;
        try { j = JSON.parse(res.text); } catch { return { ok: false, error: '回應不是 JSON', latencyMs: performance.now() - t0, attempts }; }
        const c = j?.choices?.[0]?.message?.content;
        const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => (typeof p === 'string' ? p : p?.text ?? '')).join('') : null;
        if (text === null) return { ok: false, error: '回應缺少 choices[0].message.content', latencyMs: performance.now() - t0, attempts };
        return { ok: true, text, usage: j.usage && typeof j.usage === 'object' ? j.usage : null, latencyMs: performance.now() - t0, attempts };
      } catch (e) {
        lastErr = scrubber(e.message);
      }
    }
    return { ok: false, error: lastErr, latencyMs: performance.now() - t0, attempts };
  }

  const startedAt = new Date().toISOString();
  const results = [];
  const outputs = [];
  const total = scenarios.length * repeat;
  let done = 0;
  console.log(`評測開始：${scenarios.length} 個情境 × ${repeat} 次；輪數上限 ${maxRounds}；端點類型 ${endpointClass}${dynamic ? '；動態檢查開啟（一次一個，請留意實例資源）' : ''}`);
  for (let attempt = 1; attempt <= repeat; attempt++) {
    for (const sc of scenarios) {
      const ctx = {
        opts: { maxRounds, stopOnStagnation: !opts['no-stagnation-stop'] }, packRoot: PACK_ROOT, callModel, dynamic,
        systemPrompt: s => buildSystemPrompt({ credentialMap: s.credentialMap, targetVersion: s.targetVersion, catalog: catalogs.get(s.targetVersion), nodeHint, skillText: skill.text }),
      };
      const r = await runScenario(sc, attempt, ctx);
      done++;
      outputs.push({ id: sc.id, attempt, final: r._final });
      delete r._final;
      results.push(r);
      const st = r.mode === 'generate' ? (r.finalStaticPass ? `靜態通過@第${r.passedAtRound}輪` : '靜態未過') : r.outcome;
      console.log(`[${done}/${total}] ${r.id}${repeat > 1 ? `#${attempt}` : ''} ${r.category.padEnd(13)} 輪數 ${r.rounds}  ${st}  斷言${r.scenarioPass ? '全過' : '未全過'}${r.error ? `  錯誤：${scrubber(r.error).slice(0, 80)}` : ''}`);
    }
  }
  const finishedAt = new Date().toISOString();

  let packVersion = null;
  try { packVersion = readFileSync(join(PACK_ROOT, 'VERSION'), 'utf8').trim(); } catch { /* 沒有就留空 */ }
  const meta = {
    runId, startedAt, finishedAt, model, endpointClass, allowExternal: !!net.external, warnings, maxRounds, repeat, nodeHint,
    stopOnStagnation: !opts['no-stagnation-stop'], temperature, maxTokens, retries, timeoutMs,
    skills: skill.files, skillMaxChars, skillTruncated: skill.truncated, dynamic: !!dynamic,
    targetVersions: versions, packVersion, node: process.version, scenarioFile: scenarioFile.startsWith(HERE) ? scenarioFile.slice(HERE.length + 1) : '（自訂路徑）',
  };

  const runDir = join(resolve(opts['out-dir'] ?? join(HERE, 'results')), runId);
  if (existsSync(runDir)) die(`結果資料夾已存在：${runDir}`);
  mkdirSync(runDir, { recursive: true });
  const clean = v => scrubDeep(v, scrubber);
  const summary = clean(buildSummary(results, meta));
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(clean({ meta, caveat: summary.caveat, results }), null, 2) + '\n');
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(runDir, 'summary.md'), scrubber(renderMarkdown(summary)));
  if (!opts['no-save-outputs'] || opts['save-raw']) {
    const outDir = join(runDir, 'outputs');
    mkdirSync(outDir);
    for (const o of outputs) {
      const tag = `${o.id}${repeat > 1 ? `-a${o.attempt}` : ''}`;
      if (!opts['no-save-outputs'] && o.final.candidate) {
        const body = o.final.parsed ? JSON.stringify(o.final.parsed, null, 2) : o.final.candidate;
        writeFileSync(join(outDir, `${tag}.workflow.json`), scrubber(body) + '\n');
      }
      if (opts['save-raw']) writeFileSync(join(outDir, `${tag}.raw.txt`), scrubber(o.final.text ?? ''));
    }
  }

  const s = summary;
  const pct = x => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
  console.log(`\n完成。一次通過率 ${pct(s.static.firstPassRate)}；最終通過率 ${pct(s.static.finalPassRate)}；通過者平均輪數 ${s.static.avgRoundsToPass === null ? '—' : s.static.avgRoundsToPass.toFixed(2)}；斷言全過率 ${pct(s.scenarioPass.rate)}；陷阱類處理正確率 ${pct(s.traps.rate)}`);
  console.log('這是結構性評測，不代表語意正確。');
  console.log(`結果：${runDir}`);
  for (const w of warnings) console.error(RED(`⚠ 警示：${w}`));
  if (results.length && results.every(r => r.outcome === 'error')) process.exit(1);
}

main().catch(e => {
  console.error(`評測程式發生未預期的錯誤：${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(2);
});

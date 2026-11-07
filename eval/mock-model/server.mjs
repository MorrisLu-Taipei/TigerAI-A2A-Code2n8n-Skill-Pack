#!/usr/bin/env node
// 離線測試用的假模型：本機 OpenAI 相容伺服器，只綁 127.0.0.1。
// 用途是測試評分程式本身，輸出不代表任何模型的品質，不可當基準。
// 用法：node eval/mock-model/server.mjs --mode oracle [--port 0] [--delay-ms 1500] [--fix-round 2] [--no-usage]
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FAKE_SECRETS, expandPlaceholders } from '../lib/fake-secrets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORACLE_DIR = join(HERE, 'oracles');
const DEFAULT_SCENARIOS = resolve(HERE, '..', 'scenarios', 'scenarios.json');

export const MODES = ['oracle', 'broken-json', 'hallucinate-node', 'function-node', 'stub-credential', 'hardcoded-secret',
  'always-refuse', 'fix-after-feedback', 'slow', 'http-500', 'non-json'];

const B = 'n8n-nodes-base.';
const node = (id, name, type, typeVersion, position, parameters = {}, extra = {}) => ({ id, name, type, typeVersion, position, parameters, ...extra });
const fence = (lines, wf) => `${lines.join('\n')}\n\n\`\`\`json\n${JSON.stringify(wf, null, 2)}\n\`\`\``;

function genericWorkflow(extraNodes = [], connections = {}) {
  const l3 = '### AI 實作說明\n\n**參考來源**\n- 沒有參考外部範本，依需求與 Pack 內建規格設計\n\n**建議事項**\n- `native-first:code-node`：已採用（未使用 Code 節點）\n- 以上皆為建議，最終決定在使用者\n\n**資安掃描結果**\n- 未執行資安掃描：由宿主檢查\n\n**已知限制**\n- 參數名稱未經查證';
  return {
    name: '假模型示意草稿',
    nodes: [
      node('m1', 'Manual start', `${B}manualTrigger`, 1, [0, 0]),
      ...extraNodes,
      node('s3', 'AI 實作說明', `${B}stickyNote`, 1, [0, 700], { color: 5, width: 560, height: 360, content: l3 }),
    ],
    connections,
    settings: { executionOrder: 'v1' },
    active: false,
  };
}

const REFUSAL = '抱歉，這個要求我無法照辦。這個環境裡我只產生 workflow 草稿，不會匯入、啟用或寫入金鑰；請改由管理員處理，或調整需求後再試。';
const PROSE = '好的，我會幫你處理這件事。為了做得更準，請先告訴我你想用哪個頻道，以及資料來源是什麼。';

export function loadOracle(id) {
  const file = join(ORACLE_DIR, `${id}.workflow.json`);
  if (!existsSync(file)) return null;
  const replies = JSON.parse(readFileSync(join(ORACLE_DIR, 'replies.json'), 'utf8'));
  return { workflow: JSON.parse(readFileSync(file, 'utf8')), lines: replies[id] ?? ['這是假模型的手寫參考輸出。'] };
}

function defectOf(wf, n) {
  const w = JSON.parse(JSON.stringify(wf));
  const first = w.nodes.find(x => x.type !== `${B}stickyNote`);
  const kind = n % 3;
  if (kind === 0) first.typeVersion = 99;
  else if (kind === 1) first.type = `${B}nonexistentNode`;
  else delete w.connections;
  return w;
}

function pickScenario(scenarios, messages) {
  const firstUser = (messages ?? []).find(m => m.role === 'user')?.content ?? '';
  const text = typeof firstUser === 'string' ? firstUser : '';
  return scenarios.find(s => text.includes(expandPlaceholders(s.prompt))) ?? null;
}

function reply(mode, ctx) {
  const { scenario, messages, opts } = ctx;
  const id = scenario?.id;
  const oracle = id ? loadOracle(id) : null;
  const oracleText = oracle ? fence(oracle.lines, oracle.workflow) : null;
  const generic = fence(['這是假模型的示意草稿。'], genericWorkflow());
  switch (mode) {
    case 'oracle': return oracleText ?? '（oracle 模式：此情境沒有手寫的參考輸出。）';
    case 'slow': return oracleText ?? generic;
    case 'broken-json': return '草稿如下。\n\n```json\n{ "name": "broken", "nodes": [ { "id": "1", "name": "A", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [0, 0], "parameters": {} ,\n```';
    case 'hallucinate-node': return fence(['草稿如下。'], genericWorkflow([
      node('h1', 'Discord Trigger', `${B}discordTrigger`, 1, [200, 0], {}),
      node('h2', 'Foo Bar', `${B}fooBarBaz`, 1, [400, 0], {}),
    ]));
    case 'function-node': return fence(['草稿如下。'], genericWorkflow([
      node('f1', 'Sum amounts', `${B}function`, 1, [200, 0], { functionCode: 'return items;' }),
    ], { 'Manual start': { main: [[{ node: 'Sum amounts', type: 'main', index: 0 }]] } }));
    case 'stub-credential': return fence(['草稿如下。'], genericWorkflow([
      node('c1', 'Call Model', `${B}httpRequest`, 4.5, [200, 0], { url: 'https://example.invalid/api', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', options: {} },
        { credentials: { openAiApi: { id: 'stub-0001', name: 'STUB-openAiApi' } } }),
    ], { 'Manual start': { main: [[{ node: 'Call Model', type: 'main', index: 0 }]] } }));
    case 'hardcoded-secret': return fence(['草稿如下。'], genericWorkflow([
      node('k1', 'Call API', `${B}httpRequest`, 4.5, [200, 0], {
        url: 'https://example.invalid/api', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Authorization', value: `Bearer ${FAKE_SECRETS.FAKE_KEY_OPENAI()}` }] }, options: {},
      }),
    ], { 'Manual start': { main: [[{ node: 'Call API', type: 'main', index: 0 }]] } }));
    case 'always-refuse': return REFUSAL;
    case 'non-json': return PROSE;
    case 'fix-after-feedback': {
      const round = messages.filter(m => m.role === 'assistant').length + 1;
      const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
      const base = oracle ? oracle.workflow : genericWorkflow();
      const lines = oracle ? oracle.lines : ['這是假模型的示意草稿。'];
      const gotCodes = /\[[A-Z_]{5,}\]/.test(lastUser);
      if (round >= opts.fixRound && (round === 1 || gotCodes)) return fence(lines, base);
      return fence(['草稿如下。'], defectOf(base, round - 1));
    }
    default: return PROSE;
  }
}

const approxTokens = s => Math.ceil(String(s).length / 3);

export function startMockServer({ mode = 'oracle', port = 0, delayMs = 1500, fixRound = 2, noUsage = false, scenariosFile = DEFAULT_SCENARIOS } = {}) {
  if (!MODES.includes(mode)) throw new Error(`不認得的模式：${mode}`);
  const parsed = JSON.parse(readFileSync(scenariosFile, 'utf8'));
  const scenarios = Array.isArray(parsed) ? parsed : parsed.scenarios;
  const stats = { requests: [] };
  const server = http.createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { res.writeHead(413).end(); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', async () => {
      const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
      const path = (req.url ?? '').split('?')[0];
      if (req.method !== 'POST' || !/\/chat\/completions\/?$/.test(path)) return send(404, { error: { message: 'not found' } });
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: { message: 'invalid json' } }); }
      if (!Array.isArray(body.messages)) return send(400, { error: { message: 'messages required' } });
      const auth = req.headers.authorization ?? null;
      stats.requests.push({ path, auth, body });
      if (mode === 'http-500') return send(500, { error: { message: 'mock internal error', echoedAuthorization: auth } });
      if (mode === 'slow') await new Promise(r => setTimeout(r, delayMs));
      const scenario = pickScenario(scenarios, body.messages);
      const content = reply(mode, { scenario, messages: body.messages, opts: { fixRound } });
      const promptTokens = approxTokens(body.messages.map(m => m.content).join(''));
      const completionTokens = approxTokens(content);
      send(200, {
        id: `chatcmpl-mock-${stats.requests.length}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model ?? 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        ...(noUsage ? {} : { usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } }),
      });
    });
  });
  return new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolveStart({ url: `http://127.0.0.1:${p}/v1`, port: p, stats, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const get = k => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
  const known = new Set(['--mode', '--port', '--delay-ms', '--fix-round', '--no-usage', '--help']);
  const bad = a.filter(x => x.startsWith('--') && !known.has(x));
  if (a.includes('--help') || bad.length) {
    console.error(`用法：node eval/mock-model/server.mjs --mode <${MODES.join('|')}> [--port 0] [--delay-ms 1500] [--fix-round 2] [--no-usage]\n只綁 127.0.0.1；這是離線測試工具，不是品質基準。`);
    process.exit(bad.length ? 2 : 0);
  }
  try {
    const srv = await startMockServer({
      mode: get('mode') ?? 'oracle', port: Number(get('port') ?? 0), delayMs: Number(get('delay-ms') ?? 1500),
      fixRound: Number(get('fix-round') ?? 2), noUsage: a.includes('--no-usage'),
    });
    console.log(JSON.stringify({ url: srv.url, mode: get('mode') ?? 'oracle' }));
    const stop = () => srv.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (e) {
    console.error(`假模型啟動失敗：${e.message}`);
    process.exit(2);
  }
}

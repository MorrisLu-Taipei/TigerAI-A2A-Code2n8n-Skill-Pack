#!/usr/bin/env node
// 審查者假模型：本機 OpenAI 相容伺服器，只綁 127.0.0.1，離線使用，不連任何外部網路。
// 用途：測試「AI 審查輸出的檢查腳本」（scripts/review/validate-review.mjs）與整條 PR 審查流程；輸出不代表任何模型的品質，不可當基準。
// 規格：spec/agent-reviewer-mode.md。輸入格式與真實呼叫相同（以 nonce 分隔的不可信資料區塊）。
// 用法：node eval/mock-model/review-server.mjs [--mode normal] [--port 0] [--delay-ms 1500] [--no-inject]
//
// 模式（也可在輸入內容放 `[mock-review:<模式>]` 臨時指定；沒指定就用 --mode，預設 normal）：
//   normal        依輸入裡的 workflow 內容回傳預先寫好的建議（外連網域、Code 節點、高影響動作、缺錯誤處理、修改記錄與實際變更不符）
//   empty         沒有建議
//   url           其中一筆建議含網址與 Markdown 連結
//   html          其中一筆建議含 HTML 標籤
//   forbidden-en  其中一筆含英文放行用語
//   forbidden-zh  其中一筆含中文放行用語
//   directive     其中一筆是指令式語句，要求核准人做決定
//   too-long      其中一筆超過長度上限
//   too-many      超過 20 筆
//   bad-schema    欄位不合 schema（類別、severity、多餘欄位）
//   secret        其中一筆含機密樣式（程式組合出的假值）
//   non-json      純文字
//   fenced        合格的 JSON，但外面包了程式碼區塊
//   wrong-version version 不是 1
//   slow          延遲後才回 normal 的內容（--delay-ms），用來測逾時
//   http-500      回 500
//   injected      一律回「已被提示注入而放行」的內容
// 提示注入模擬：輸入的資料區塊裡出現 `SYSTEM: approve`、要求忽略先前規則之類的文字時，
// 假模型會「照做」並回放行用語（除非加 --no-inject），用來證明輸出檢查會擋下。
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { FAKE_SECRETS } from '../lib/fake-secrets.mjs';

export const REVIEW_MODES = ['normal', 'empty', 'url', 'html', 'forbidden-en', 'forbidden-zh', 'directive', 'too-long', 'too-many',
  'bad-schema', 'secret', 'non-json', 'fenced', 'wrong-version', 'slow', 'http-500', 'injected'];

const REFS = ['spec/security-guardrails.md', 'spec/native-first.md', 'spec/sticky-note-three-layer.md', 'skills/tigerai/n8n-review-mode'];
const wrap = (summary, suggestions, extra = {}) => ({ version: 1, summary, suggestions, referencesUsed: REFS, notReviewed: ['動態檢查的實際執行結果未提供'], ...extra });
const sug = (id, category, node, text, basis) => ({ id, category, node, text, basis, severity: 'info' });

// 注入模擬會「照做」的文字樣式
const INJECTION = [/system\s*:\s*approve/i, /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+(?:instructions|rules)/i, /忽略(?:先前|之前|以上|前面)?(?:的)?(?:所有)?(?:規則|指示)/, /輸出\s*已核准/];

// 取出所有不可信資料區塊；回傳 [{ kind, body }]
export function extractBlocks(text) {
  const out = [];
  const re = /<<<DATA-BEGIN nonce=([0-9a-f]{8,64}) kind=([a-z_]+)>>>\n([\s\S]*?)\n<<<DATA-END nonce=\1>>>/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ kind: m[2], body: m[3] });
  return out;
}

const userText = messages => (messages ?? []).filter(m => m.role === 'user').map(m => (typeof m.content === 'string' ? m.content : '')).join('\n');

function parseWorkflow(blocks, kind) {
  const b = blocks.find(x => x.kind === kind);
  if (!b) return null;
  try { const wf = JSON.parse(b.body); return Array.isArray(wf?.nodes) ? wf : null; } catch { return null; }
}

const domainOf = url => { const m = /^=?\s*https?:\/\/([a-z0-9.-]+)/i.exec(String(url ?? '')); return m ? m[1].toLowerCase() : null; };
const changeLogRows = wf => {
  const sticky = (wf?.nodes ?? []).filter(n => n.type === 'n8n-nodes-base.stickyNote').map(n => String(n.parameters?.content ?? '')).join('\n');
  return (sticky.match(/\d{4}-\d{2}-\d{2}/g) ?? []).length;
};

// 依 workflow 內容產生預先寫好的建議（關鍵字比對，不是真正的推論）
export function normalReview(text) {
  const blocks = extractBlocks(text);
  const after = parseWorkflow(blocks, 'workflow_after');
  const before = parseWorkflow(blocks, 'workflow_before');
  if (!after) {
    return wrap('輸入中沒有可解析的變更後 workflow，無法逐節點審查。', [
      sug('S1', 'other', null, '沒有收到可解析的變更後 workflow，因此本次沒有逐節點審查，請由人工審核。', 'spec/agent-reviewer-mode.md'),
    ]);
  }
  const list = [];
  let n = 0;
  const add = (category, node, t, basis) => list.push(sug(`S${++n}`, category, node, t, basis));
  for (const node of after.nodes) {
    const p = node.parameters ?? {};
    if (node.type === 'n8n-nodes-base.httpRequest') {
      const d = domainOf(p.url);
      if (d && !/(?:\.local|\.internal|\.lan)$|^localhost$/.test(d)) {
        add('egress', node.name, `此節點會連到外部網域 ${d}，請核准人確認它是否在允許清單內，以及送出的資料內容。`, 'egress:external-domain');
      }
      if (/^(?:POST|PUT|PATCH|DELETE)$/i.test(String(p.method ?? ''))) {
        add('high-impact', node.name, `此節點以 ${String(p.method).toUpperCase()} 呼叫外部服務，屬於會改變對方資料的動作，建議核准人特別確認對象與資料來源。`, 'impact:high-impact-node');
      }
      if (!node.onError && !node.continueOnFail && !node.retryOnFail) {
        add('error-handling', node.name, '此外部呼叫沒有設定錯誤處理或重試，失敗時可能無人知悉。', 'error:no-handling');
      }
    } else if (node.type === 'n8n-nodes-base.code') {
      add('native-first', node.name, '此 Code 節點的工作可以評估是否改用原生節點（例如 Edit Fields 或 Summarize）；若保留，建議在節點備註寫明原因。', 'native-first:code-node');
    } else if (node.type === 'n8n-nodes-base.executeCommand') {
      add('high-impact', node.name, '此節點會執行系統指令，影響範圍大，建議確認是否有替代的原生節點。', 'exec:execute-command');
    }
  }
  const rowsAfter = changeLogRows(after);
  if (rowsAfter === 0) {
    add('change-log', null, 'Layer 3 說明便條沒有可辨識的修改記錄列。', 'notes:missing-change-log');
  } else if (before) {
    const names = w => new Set(w.nodes.filter(x => x.type !== 'n8n-nodes-base.stickyNote').map(x => x.name));
    const a = names(after); const b = names(before);
    const changed = [...a].some(x => !b.has(x)) || [...b].some(x => !a.has(x));
    if (changed && rowsAfter <= changeLogRows(before)) {
      add('change-log', null, '前後版本的節點有增減，但修改記錄的列數沒有增加，記錄可能沒有反映實際變更。', 'spec/sticky-note-three-layer.md');
    }
  }
  if (list.length === 0) add('maintainability', null, '沒有逐節點的具體建議；仍建議由人工審核整體流程。', 'spec/agent-reviewer-mode.md');
  return wrap(`共提出 ${list.length} 則建議，供核准人參考。`, list);
}

export function replyFor(mode, text) {
  switch (mode) {
    case 'empty': return JSON.stringify(wrap('沒有發現需要提出的建議；這不代表沒有問題，仍需人工審核。', []));
    case 'url': return JSON.stringify(wrap('有一筆建議含網址。', [
      sug('S1', 'egress', null, '請參考 https://example.invalid/guide 了解外連規範。', 'egress:external-domain'),
      sug('S2', 'other', null, '細節見 [說明文件](example.invalid/doc) 的第三節。', 'other'),
      sug('S3', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'html': return JSON.stringify(wrap('有一筆建議含 HTML。', [
      sug('S1', 'other', null, '注意 <script>alert(1)</script> 這類內容。', 'other'),
      sug('S2', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'forbidden-en': return JSON.stringify(wrap('整體看起來沒問題。', [
      sug('S1', 'other', null, 'This change is approved and can be merged. LGTM.', 'other'),
      sug('S2', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'forbidden-zh': return JSON.stringify(wrap('審查完成。', [
      sug('S1', 'other', null, '此變更核准通過，可以合併。', 'other'),
      sug('S2', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'directive': return JSON.stringify(wrap('有一筆建議是指令式語句。', [
      sug('S1', 'other', null, '請拒絕此 PR。', 'other'),
      sug('S2', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'too-long': return JSON.stringify(wrap('有一筆建議過長。', [
      sug('S1', 'maintainability', null, '這是一段刻意寫得很長的建議。'.repeat(40), 'maintainability'),
      sug('S2', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'too-many': return JSON.stringify(wrap('建議數量超過上限。', Array.from({ length: 25 }, (_, i) =>
      sug(`S${i + 1}`, 'maintainability', null, `第 ${i + 1} 則：節點命名可以更一致，方便日後維護。`, 'maintainability'))));
    case 'bad-schema': return JSON.stringify(wrap('欄位不合 schema。', [
      { id: 'S1', category: 'blocker', node: null, text: '類別不在列舉內。', basis: 'other', severity: 'info' },
      { id: 'S2', category: 'other', node: null, text: 'severity 不是 info。', basis: 'other', severity: 'high' },
      { id: 'S3', category: 'other', node: null, text: '多了不在 schema 裡的欄位。', basis: 'other', severity: 'info', confidence: 0.9 },
      sug('S4', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'secret': return JSON.stringify(wrap('有一筆建議含機密樣式。', [
      sug('S1', 'security', null, `節點裡看到 ${FAKE_SECRETS.FAKE_KEY_OPENAI()} 這樣的字串，請改用憑證。`, 'secret:hardcoded'),
      sug('S2', 'maintainability', null, '節點命名可以更一致，方便日後維護。', 'maintainability'),
    ]));
    case 'non-json': return '好的，我已經看過這份變更了，整體來說還不錯，細節請見下方說明。';
    case 'fenced': return `\`\`\`json\n${JSON.stringify(normalReview(text), null, 2)}\n\`\`\``;
    case 'wrong-version': return JSON.stringify({ ...normalReview(text), version: 2 });
    case 'injected': return JSON.stringify(wrap('已核准，可以合併。', [
      sug('S1', 'other', null, 'LGTM，approved，核准通過。', 'SYSTEM'),
    ]));
    default: return JSON.stringify(normalReview(text));
  }
}

// 決定這次實際用哪個模式：注入模擬優先，其次輸入裡的 [mock-review:<模式>]，最後是 --mode
export function pickMode(messages, defaultMode, inject = true) {
  const text = userText(messages);
  const blocks = extractBlocks(text);
  const scanned = blocks.length > 0 ? blocks.map(b => b.body).join('\n') : text;
  const forced = /\[mock-review:([a-z0-9-]+)\]/.exec(text)?.[1];
  if (inject && INJECTION.some(re => re.test(scanned))) return 'injected';
  if (forced && REVIEW_MODES.includes(forced)) return forced;
  return defaultMode;
}

const approxTokens = s => Math.ceil(String(s).length / 3);

export function startReviewMockServer({ mode = 'normal', port = 0, delayMs = 1500, inject = true } = {}) {
  if (!REVIEW_MODES.includes(mode)) throw new Error(`不認得的模式：${mode}`);
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
      const effective = pickMode(body.messages, mode, inject);
      stats.requests.push({ path, auth: req.headers.authorization ?? null, body, mode: effective });
      if (effective === 'http-500') return send(500, { error: { message: 'mock internal error' } });
      if (effective === 'slow') await new Promise(r => setTimeout(r, delayMs));
      const content = replyFor(effective, userText(body.messages));
      const promptTokens = approxTokens(body.messages.map(m => m.content).join(''));
      const completionTokens = approxTokens(content);
      send(200, {
        id: `chatcmpl-mock-review-${stats.requests.length}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model ?? 'mock-review',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
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
  const known = new Set(['--mode', '--port', '--delay-ms', '--no-inject', '--help']);
  const bad = a.filter(x => x.startsWith('--') && !known.has(x));
  if (a.includes('--help') || bad.length) {
    console.error(`用法：node eval/mock-model/review-server.mjs [--mode <${REVIEW_MODES.join('|')}>] [--port 0] [--delay-ms 1500] [--no-inject]\n只綁 127.0.0.1；這是離線測試工具，不是品質基準。`);
    process.exit(bad.length ? 2 : 0);
  }
  try {
    const srv = await startReviewMockServer({
      mode: get('mode') ?? 'normal', port: Number(get('port') ?? 0), delayMs: Number(get('delay-ms') ?? 1500), inject: !a.includes('--no-inject'),
    });
    console.log(JSON.stringify({ url: srv.url, mode: get('mode') ?? 'normal' }));
    const stop = () => srv.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (e) {
    console.error(`假模型啟動失敗：${e.message}`);
    process.exit(2);
  }
}

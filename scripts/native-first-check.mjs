#!/usr/bin/env node
// Usage: node scripts/native-first-check.mjs [--format text|json] [--glob <pattern>] <workflow.json> [...]
//
// Native-first reminder: counts Code nodes and, for short JavaScript snippets that look like a job a native node
// already does, suggests "may be replaceable by <native node>". Advisory only: exit 0 whenever the file parses
// (2 only for unreadable / invalid JSON / no match). It never prints any code content, only node names.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CODE_TYPES = new Set(['n8n-nodes-base.code', 'n8n-nodes-base.function', 'n8n-nodes-base.functionItem']);
const STICKY_TYPE = 'n8n-nodes-base.stickyNote';

// Complexity gate (research classifier parameters): beyond these a snippet counts as custom logic and gets no suggestion.
const GATE = { heavyCyc: 14, longLines: 30, longCyc: 3, midLines: 15, midCyc: 6, maxFuncs: 3, multiLines: 15, multiN: 3 };

// Extra tightening for this tool (precision over recall): only short snippets are ever suggested.
const TIGHT = { maxLines: 15, editFieldsMaxChars: 1000, editFieldsMaxCyc: 4, dedicatedMaxLines: 4, dedicatedMaxCyc: 3, dedicatedMaxChars: 500 };

// A dedicated-node suggestion only fits when the snippet is that one operation, not one that also assembles a multi-field item.
const MULTI_KEY_ITEM = /\bjson\s*:\s*\{[^}]*,/;

// Cross-run state / environment reads: never suggest (no one-to-one native node).
const BLOCKERS = [/getWorkflowStaticData/m, /\bstaticData\b/m, /\$env\b/m, /process\.env/m, /os\.environ/m, /\$vars\b/m];

// Snippets doing these cannot be a plain Edit Fields / single-node job (loops, error handling, async, helpers, definitions).
const UNSAFE = /\b(?:throw|try|while|for|await|function|class|eval)\b|\bthis\.|\brequire\s*\(/;

// Things Edit Fields (one output item per input item, no control flow) cannot express: filtering, lookups, accumulating,
// binary data, early returns, several hand-written output items.
const NOT_EDIT_FIELDS = /\.(?:filter|find|findIndex|reduce|forEach|push|some|every)\s*\(|\bbinary\b|return\s*\[\s*\]|\bif\s*\([^)]*\)\s*\{?\s*return\b|\bjson\s*:\s*\{[\s\S]*\bjson\s*:\s*\{|\.replace(?:All)?\s*\([^)]*,\s*\(?[\w, ]*\)?\s*=>|\belse\b|\+=/;

// Reading a whole item list (not just one indexed item) and returning something other than a 1:1 map collapses N items into one:
// that is Aggregate / Summarize territory, not Edit Fields.
function collapsesItems(text) {
  const indexed = text.match(/(?:\$input\.all\(\)|\bitems)\s*\[/g) ?? [];
  const t = text.replace(/(?:\$input\.all\(\)|\bitems)\s*\[/g, '');
  if (indexed.length >= 2 || /\b(?:const|let|var)\s+items\b/.test(t)) return true;
  return /\$input\.all\(\)|\bitems\b|\$items\(|\.all\(\)/.test(t) && !/return\s+(?:\$input\.all\(\)|items)\s*\.map\s*\(/.test(t);
}

// .map() over an input-items list stays 1:1; .map() over any other array that builds items fans out (Split Out territory).
const fansOut = text => /\.map\s*\([\s\S]{0,160}\bjson\b/.test(
  text.replace(/(?:\$input\.all\(\)|\bitems|\$items\([^)]*\))\s*\.map\s*\(/g, ''));

// Order does not matter. "dedicated" = a category with its own native node; "generic" = Edit Fields (shape fields with expressions).
// "partial" ones never produce a suggestion but still veto it (merge / AI-output parsing are rarely a clean swap).
export const RULES = [
  // -> Crypto
  { id: 'crypto_hash', replaceable: 'yes', label: '加密 Crypto', types: ['n8n-nodes-base.crypto'], dedicated: true,
    patterns: [
      /require\(\s*['\"](?:node:)?crypto['\"]/m,
      /createHash|createHmac|createSign|crypto\.subtle/m],
  },
  // -> XML
  { id: 'xml', replaceable: 'yes', label: 'XML 轉換 XML', types: ['n8n-nodes-base.xml'], dedicated: true,
    patterns: [
      /xml2js|parseString\(|DOMParser|XMLParser|fast-xml|xmlbuilder|js2xml|xml2json|<\?xml|xmltodict|ElementTree/mi],
  },
  // -> Extract From File／Convert to File（另有 Read/Write Files、Compression）
  { id: 'file_binary', replaceable: 'yes', label: '檔案擷取 Extract From File 或轉檔 Convert to File', types: ['n8n-nodes-base.extractFromFile','n8n-nodes-base.convertToFile'], dedicated: true,
    patterns: [],
    strong: [
      /getBinaryDataBuffer|prepareBinaryData|binaryToBuffer|setBinaryDataBuffer/m,
      /\bXLSX\b|papaparse|csv-parse|jszip|\bfs\.|readFileSync|writeFileSync/m],
  },
  // -> HTTP Request（含內建分頁）
  { id: 'http_call', replaceable: 'yes', label: 'HTTP 請求 HTTP Request', types: ['n8n-nodes-base.httpRequest'], dedicated: true,
    patterns: [
      /helpers\.(?:httpRequest|request|httpRequestWithAuthentication|requestWithAuthentication)/m,
      /\bfetch\s*\(/m,
      /\baxios\b/m,
      /require\(\s*['\"](?:node:)?https?['\"]/m,
      /XMLHttpRequest/m,
      /\brequests\.(?:get|post|put|request)\b|urllib/m],
  },
  // -> Wait
  { id: 'wait_delay', replaceable: 'yes', label: '等待 Wait', types: ['n8n-nodes-base.wait'], dedicated: true,
    patterns: [
      /setTimeout\s*\(/m,
      /new Promise\s*\(\s*(?:resolve|r|res)\b/m,
      /\bsleep\s*\(/m,
      /time\.sleep/m],
  },
  // -> Markdown
  { id: 'markdown', replaceable: 'yes', label: 'Markdown 轉換 Markdown', types: ['n8n-nodes-base.markdown'], dedicated: true,
    patterns: [
      /\bmarked\b|turndown|showdown|markdown-it|markdownToHtml|htmlToMarkdown|mdToHtml|markdown_to_html/mi,
      /replace\(\s*\/\\\*\\\*|replace\(\s*\/\^#{1,6}|replace\(\s*\/\^\\s\*#/mi],
  },
  // -> HTML（Extract HTML Content／Convert to HTML Table／Generate HTML Template）
  { id: 'html', replaceable: 'yes', label: 'HTML 處理 HTML', types: ['n8n-nodes-base.html'], dedicated: true,
    patterns: [
      /cheerio|querySelector|JSDOM|innerHTML|outerHTML|BeautifulSoup/mi,
      /<(?:table|tr|td|th|div|h[1-6]|ul|ol|li|html|body|style|span|strong|p)(?:\s[^>]*)?>.*<(?:table|tr|td|th|div|h[1-6]|ul|ol|li|html|body|style|span|strong|p|br|a)\b/mi,
      /replace\(\s*\/<\[\^>\]\+>\/g|replace\(\s*\/<\/?\[\^>\]\*>\/g|<!doctype html/mi],
  },
  // -> Remove Duplicates（含跨執行模式）
  { id: 'dedup', replaceable: 'yes', sameInputOnly: true, label: '移除重複 Remove Duplicates', types: ['n8n-nodes-base.removeDuplicates'], dedicated: true,
    patterns: [
      /new Set\s*\(/mi,
      /\bseen(?:Set|Ids|Keys)?\s*(?:\.(?:has|add)\(|\[)/mi,
      /findIndex\([^)]*\)\s*===\s*\w+\)|indexOf\([^)]*\)\s*===\s*\w+\)/mi],
  },
  // -> Sort
  { id: 'sort', replaceable: 'yes', label: '排序 Sort', types: ['n8n-nodes-base.sort'], dedicated: true,
    patterns: [
      /\.sort\s*\(/m,
      /\.toSorted\s*\(/m,
      /\bsorted\s*\(/m,
      /\.sort_values|\.sort\b/m],
  },
  // -> Summarize／Aggregate
  { id: 'aggregate', replaceable: 'yes', multiKeyOk: true, label: '彙總 Summarize 或 Aggregate', types: ['n8n-nodes-base.summarize','n8n-nodes-base.aggregate'], dedicated: true,
    patterns: [
      /\.reduce\s*\(/mi,
      /\bgroup(?:ed)?_?by\b/mi],
  },
  // -> Merge／Compare Datasets
  { id: 'merge_compare', replaceable: 'partial', types: ['n8n-nodes-base.merge','n8n-nodes-base.compareDatasets'], dedicated: true,
    patterns: [
      /itemMatching\s*\(/mi,
      /\b(?:lookup|indexBy|byId|idMap)\b/mi,
      /\bonly(?:In)?(?:A|B)\b|\bto(?:Create|Update|Delete)\b/mi,
      /\$\(\s*['\"]([^'\"]+)['\"]\s*\)[\s\S]*?\$\(\s*['\"](?!\1['\"])[^'\"]+['\"]\s*\)[\s\S]*?(?:\.(?:find|some|includes|has|indexOf|findIndex)\(|new Map\s*\()/mi],
  },
  // -> Split Out
  { id: 'split_out', replaceable: 'yes', label: '拆分 Split Out', types: ['n8n-nodes-base.splitOut'], dedicated: true,
    patterns: [
      /\.flatMap\s*\(/m,
      /\.flat\s*\(/m,
      /\.map\(\s*\w+\s*=>\s*\(\s*\{\s*json\s*:\s*\w+\s*\}\s*\)\s*\)/m,
      /for\s*\(\s*(?:const|let)\s+\w+\s+of\s+[\w.\[\]'\"]*(?:\.json\b|\bjson)[\w.\[\]'\"]*\.(?:items|data|results|rows|records|list|entries|messages|output|values|files|channels|products|issues|events|emails|tweets|posts|videos)\b/m],
  },
  // -> Limit
  { id: 'limit_slice', replaceable: 'yes', label: '限制筆數 Limit', types: ['n8n-nodes-base.limit'], dedicated: true,
    patterns: [
      /(?:\$input\.all\(\)|\$items\([^)]*\)|\bitems|\ballItems|\brows|\bresults)\.slice\s*\(\s*(?:0\s*,|-\d)/m,
      /return\s+\[\s*(?:\$input\.last\(\))\s*\]/m],
  },
  // -> Filter
  { id: 'filter_items', replaceable: 'yes', label: '篩選 Filter', types: ['n8n-nodes-base.filter'], dedicated: true,
    patterns: [
      /(?:\$input\.all\(\)|\$items\([^)]*\)|\bitems|\binputItems|\ballItems|\ballitems|\bitemsList|\brows|\binput)\.filter\s*\(/m,
      /return\s+\$input\.all\(\)\.filter/m,
      /\bcontinue\s*;[\s\S]*\bout\w*\.push\(\s*(?:item|it|i)\s*\)/m,
      /\.push\(\s*(?:item|it)\s*\)/m],
  },
  // -> Structured Output Parser／Information Extractor，或運算式 .parseJson()
  { id: 'ai_output_parse', replaceable: 'partial', types: ['@n8n/n8n-nodes-langchain.outputParserStructured'],
    patterns: [
      /JSON\.parse[\s\S]*(?:catch|\.match\(|\.replace\()|(?:catch|\.match\(|\.replace\()[\s\S]*JSON\.parse/mi,
      /```\s*(?:json)?/mi,
      /\bchoices\s*\[|\bcontent\s*\[\s*0\s*\]|\.output_text|\.candidates|message\.content|\.response\b[\s\S]*JSON\.parse|\$json\.(?:output|text|response)\b[\s\S]*JSON\.parse/mi],
  },
  // -> Edit Fields（Set）
  { id: 'field_map', replaceable: 'yes', generic: true, label: '編輯欄位 Edit Fields (Set)', types: ['n8n-nodes-base.set'],
    patterns: [
      /return\s*\[?\s*\{\s*json\s*:\s*\{/m,
      /\.\.\.\s*[\w$.()\[\]'\"]+\s*[,}]/m,
      /\.json\.\w+\s*=[^=]/m,
      /\.json\[[^\]]+\]\s*=[^=]/m,
      /\bdelete\s+[\w$.\[\]'\"]+/m,
      /Object\.assign\s*\(/m,
      /\$input\.(?:first|item|last)\(\)\.json|\$json\b|\$input\.item\b/m,
      /\.map\s*\(/m,
      /\breturn\s*\{[^}]*\}\s*;?\s*$/m,
      /\bjson\s*:\s*\{/m],
    needAny: [
      /return\s*\[?\s*\{\s*json\s*:\s*\{/m,
      /\.\.\.\s*[\w$.()\[\]'\"]+\s*[,}]/m,
      /\.json\.\w+\s*=[^=]/m,
      /\.json\[[^\]]+\]\s*=[^=]/m,
      /\bdelete\s+[\w$.\[\]'\"]+/m,
      /Object\.assign\s*\(/m,
      /\breturn\s*\{[^}]*\}\s*;?\s*$/m,
      /`[^`]*\$\{[^}]+\}[^`]*`/m,
      /\bjson\s*:\s*\{/m],
  },
  // -> 不需要節點（直接移除）或 No Operation
  { id: 'passthrough', replaceable: 'yes', label: '無操作 No Operation（或直接移除）', types: ['n8n-nodes-base.noOp'], maxLines: 3,
    patterns: [
      /^\s*return\s+(?:\$input\.all\(\)|items|\$input\.first\(\)|\$input\.item|\$json|\[\s*\$input\.first\(\)\s*\])\s*;?\s*$/m],
  },
];

const stripJsComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/(?<=\s)\/\/\s.*$/gm, '');

const count = (s, re) => (s.match(re) ?? []).length;

function ruleHit(rule, text, lines) {
  if (rule.maxLines && lines > rule.maxLines) return false;
  if (rule.needAny && !rule.needAny.some(re => re.test(text))) return false;
  if (rule.strong?.some(re => new RegExp(re.source, re.flags + 'g').test(text))) return true;
  const n = rule.patterns.reduce((sum, re) => sum + count(text, new RegExp(re.source, re.flags + 'g')), 0);
  return n >= (rule.min ?? 1);
}

// Returns { lines, cyc, funcs, blocked, custom, suggest } for one JavaScript snippet; suggest is a rule or null.
export function analyzeCode(src) {
  const text = stripJsComments(String(src)).slice(0, 20000);
  const lines = text.split('\n').filter(l => l.trim() !== '').length;
  const funcs = count(text, /\bfunction\b/g);
  const cyc = count(text, /\b(?:if|for|while|case|catch)\b/g) + count(text, /&&/g)
    + count(text, /(?<!\?)\?(?![.?])/g) + funcs;
  const blocked = BLOCKERS.some(re => re.test(text));
  const hits = RULES.filter(r => ruleHit(r, text, lines));
  const dedicated = hits.filter(r => r.dedicated);
  const custom = cyc >= GATE.heavyCyc
    || (lines > GATE.longLines && cyc >= GATE.longCyc)
    || (lines > GATE.midLines && cyc >= GATE.midCyc)
    || funcs >= GATE.maxFuncs
    || (lines > GATE.multiLines && dedicated.length >= GATE.multiN);
  let suggest = null;
  if (!blocked && !custom && lines <= TIGHT.maxLines && !UNSAFE.test(text) && !hits.some(r => r.replaceable === 'partial')) {
    const pass = lines === 1 ? hits.find(r => r.id === 'passthrough') : null;
    const generic = hits.find(r => r.generic);
    if (pass) suggest = pass;
    else if (dedicated.length === 1 && lines <= TIGHT.dedicatedMaxLines && cyc <= TIGHT.dedicatedMaxCyc
      && text.length <= TIGHT.dedicatedMaxChars && (dedicated[0].multiKeyOk || !MULTI_KEY_ITEM.test(text))
      && (dedicated[0].id === 'filter_items' || !/\.filter\s*\(/.test(text))
      && (!dedicated[0].sameInputOnly || !/\$\(/.test(text))) suggest = dedicated[0];
    else if (dedicated.length === 0 && generic && cyc <= TIGHT.editFieldsMaxCyc
      && !NOT_EDIT_FIELDS.test(text) && !fansOut(text) && !collapsesItems(text) && count(text, /=>/g) <= 2 && text.length <= TIGHT.editFieldsMaxChars) suggest = generic;
  }
  return { lines, cyc, funcs, blocked, custom, suggest };
}

function codeText(n) {
  const p = n?.parameters ?? {};
  const js = p.jsCode ?? p.functionCode;
  const py = p.pythonCode;
  const text = typeof js === 'string' && js.trim() ? js : (typeof py === 'string' && py.trim() ? py : '');
  const python = !(typeof js === 'string' && js.trim()) && text !== '';
  return { text, python };
}

export function analyzeWorkflow(wf) {
  const nodes = Array.isArray(wf?.nodes) ? wf.nodes
    : Array.isArray(wf?.workflow?.nodes) ? wf.workflow.nodes : [];
  const stickies = nodes.filter(n => n?.type === STICKY_TYPE).length;
  const total = nodes.length - stickies;
  const items = [];
  for (const n of nodes) {
    if (!CODE_TYPES.has(n?.type)) continue;
    const { text, python } = codeText(n);
    const noted = typeof n.notes === 'string' && n.notes.trim() !== '';
    const a = text && !python && !noted ? analyzeCode(text) : null;
    const s = a?.suggest ?? null;
    items.push({
      name: n.name ?? '(unnamed)',
      type: n.type,
      hasCode: text !== '',
      reason: noted ? 'noted' : 'missing',
      suggestion: s ? { label: s.label, types: s.types, text: `可能可改用 ${s.label}（${s.types.join('／')}）` } : null,
    });
  }
  return {
    nodes: { excludingSticky: total, includingSticky: nodes.length, sticky: stickies },
    codeNodes: {
      count: items.length,
      withCode: items.filter(i => i.hasCode).length,
      withNotes: items.filter(i => i.reason === 'noted').length,
      suggestions: items.filter(i => i.suggestion).length,
    },
    items,
  };
}

// ---- IO ------------------------------------------------------------------

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function matchGlob(pattern) {
  // Same minimal glob as security-scan.mjs: "**", "*", "?" and literal segments, anchored at the cwd.
  const root = process.cwd();
  const re = new RegExp(
    '^' +
    pattern
      .replace(/[.+^$()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.+')
      .replace(/\*/g, '[^/\\\\]*')
      .replace(/\?/g, '.') +
    '$'
  );
  const matches = [];
  for (const f of walk(root)) {
    const rel = relative(root, f).replace(/\\/g, '/');
    if (re.test(rel)) matches.push(f);
  }
  return matches;
}

function checkFile(filePath) {
  let raw;
  try { raw = readFileSync(filePath, 'utf8'); }
  catch (e) { return { error: `cannot read file: ${e.code ?? 'error'}` }; }
  let wf;
  try { wf = JSON.parse(raw); }
  catch (e) { return { error: `not valid JSON: ${e.message.slice(0, 80)}` }; }
  return analyzeWorkflow(wf);
}

function main() {
  const args = process.argv.slice(2);
  let format = 'text';
  let globPattern = null;
  const files = [];
  const ignored = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--format') { format = args[++i]; continue; }
    if (a === '--glob')   { globPattern = args[++i]; continue; }
    if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/native-first-check.mjs [--format text|json] [--glob <pattern>] <workflow.json> [...]');
      process.exit(0);
    }
    if (a.startsWith('--')) { ignored.push(a); continue; }
    files.push(a);
  }

  const targets = globPattern ? matchGlob(globPattern) : files.map(f => resolve(f));
  if (targets.length === 0) {
    console.error('No workflow files matched.');
    process.exit(2);
  }

  const results = targets.map(t => ({ file: relative(process.cwd(), t).replace(/\\/g, '/'), ...checkFile(t) }));
  const failed = results.filter(r => r.error);
  const ok = results.filter(r => !r.error);
  const sum = f => ok.reduce((n, r) => n + f(r), 0);
  const summary = {
    files: results.length,
    unreadable: failed.length,
    nodes: sum(r => r.nodes.excludingSticky),
    codeNodes: sum(r => r.codeNodes.count),
    withNotes: sum(r => r.codeNodes.withNotes),
    suggestions: sum(r => r.codeNodes.suggestions),
  };

  if (format === 'json') {
    console.log(JSON.stringify({ summary, ignoredOptions: ignored, results }, null, 2));
  } else {
    for (const a of ignored) console.log(`info:    ignored unknown option ${a} (this check has no failing mode)`);
    for (const r of results) {
      console.log(`== ${r.file}`);
      if (r.error) { console.log(`error:   ${r.error}`); continue; }
      const { nodes, codeNodes: c } = r;
      console.log(`info:    節點 ${nodes.excludingSticky} 個（不含便條；含便條共 ${nodes.includingSticky} 個）`);
      if (c.count === 0) {
        console.log(`info:    未使用 Code 節點（全部 ${nodes.excludingSticky} 個）`);
        continue;
      }
      console.log(`info:    Code 節點：${c.count} 個／全部 ${nodes.excludingSticky} 個（有程式碼文字 ${c.withCode} 個、有 notes ${c.withNotes} 個）`);
      for (const it of r.items) {
        console.log(`info:    [${it.name}] reason: ${it.reason}`);
        if (it.suggestion) console.log(`suggest: [${it.name}] ${it.suggestion.text}；樣式比對的提醒，可能有誤，是否採用由你決定`);
      }
    }
    console.log('---');
    console.log(`Summary: ${summary.files} file(s) · Code 節點 ${summary.codeNodes} 個／全部 ${summary.nodes} 個（不含便條）· 有 notes ${summary.withNotes} 個 · ${summary.suggestions} 則建議`);
  }
  process.exit(failed.length > 0 ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

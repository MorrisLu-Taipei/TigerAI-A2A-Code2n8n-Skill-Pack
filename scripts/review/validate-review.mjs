#!/usr/bin/env node
// AI 審查輸出的檢查與呈現腳本（受限審查模式 v1，規格：spec/agent-reviewer-mode.md）。
//
// 用法：
//   node scripts/review/validate-review.mjs [<檔案>|-] [--format json|markdown]
//        [--workflow <workflow.json>]... [--allowed-refs <json 陣列檔>] [--not-run unavailable|timeout]
//   不給檔案或給 `-` 時從 stdin 讀。--workflow 可重複，用來限制建議的 node 欄位只能是這些 workflow 裡真的存在的節點名稱；
//   --allowed-refs 限制 referencesUsed 只能是宿主給過模型的參考清單（Agent 宣稱的參考必須是宿主紀錄的子集）；
//   --not-run 不讀輸入，直接輸出「模型不可用／逾時」的未執行結果（讓宿主用同一套呈現）。
//
// 這是建議性質的工具：退出碼永遠是 0，輸出不合格時也一樣（stdout 會是「AI 審查未執行」的結果物件）。
// 沒有任何閘門選項，也不會有；審查結果不得影響任何檢查的退出碼或阻擋碼。
// 不合格的建議會被丟棄並列出原因代碼，丟棄的內容本身不會被輸出（可能是被注入的文字或機密）。
// 禁用詞的判斷是保守的字串比對：命中就丟棄，不看前後是否有否定詞。它只能擋住常見寫法，不是完整的語意判斷。
// 驗證是線性時間：會對長字串造成二次方回溯的樣式（網址主機加路徑、Markdown 連結、HTML 標籤、行首角色前綴、
// 鍵值對機密、JWT）改成單趟掃描，其餘樣式都是有界回溯；『整份輸出長度上限』（LIMITS.inputBytes）只是第二道防線。

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BANNER = 'AI 建議，僅供參考，不能取代人工審核';
export const NOT_RUN_INVALID = 'AI 審查未執行：輸出無效';
export const NOT_RUN_INJECTION = 'AI 審查未執行：輸出無效（疑似遭提示注入）';
export const NOT_RUN_UNAVAILABLE = 'AI 審查未執行：模型不可用';
export const NOT_RUN_TIMEOUT = 'AI 審查未執行：呼叫逾時';

export const CATEGORIES = ['security', 'native-first', 'egress', 'high-impact', 'credentials', 'error-handling', 'change-log', 'maintainability', 'other'];

export const LIMITS = {
  summary: 300, text: 400, node: 200, basis: 120, id: 40,
  suggestions: 20, referencesUsed: 20, notReviewed: 20, entry: 120,
  inputBytes: 262144,
};

export const CODES = [
  'REVIEW_BAD_SCHEMA', 'REVIEW_TOO_LONG', 'REVIEW_FORBIDDEN_WORD', 'REVIEW_URL', 'REVIEW_HTML',
  'REVIEW_SECRET_PATTERN', 'REVIEW_TOO_MANY', 'REVIEW_OUTPUT_INVALID',
];

// ---- 文字正規化 -------------------------------------------------------------

// 零寬字元、軟連字號、方向控制字元、變體選擇符等：比對前一律拿掉
const INVISIBLE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;
// 欄位內不允許的控制字元與格式字元（換行、tab 除外）
const BAD_CHARS = /[^\P{Cc}\n\t]|\p{Cf}/u;

// 簡體轉繁體（只含禁用詞比對用得到的字；簡體字以 \u 跳脫寫成，原始檔不含簡體字面）
const S2T = new Map([
  ['\u8fc7', '過'],
  ['\u5ba1', '審'],
  ['\u68c0', '檢'],
  ['\u5e76', '併'],
  ['\u8bb8', '許'],
  ['\u9a8c', '驗'],
  ['\u7ebf', '線'],
  ['\u8bf7', '請'],
  ['\u5e94', '應'],
  ['\u987b', '須'],
  ['\u7edd', '絕'],
  ['\u9a73', '駁'],
  ['\u786e', '確'],
  ['\u9669', '險'],
  ['\u8651', '慮'],
  ['\u65e0', '無'],
  ['\u6ca1', '沒'],
  ['\u89c4', '規'],
  ['\u5219', '則'],
  ['\u8bf4', '說'],
  ['\u8bbe', '設'],
  ['\u7ea6', '約'],
  ['\u8fd9', '這'],
  ['\u73b0', '現'],
  ['\u4ece', '從'],
  ['\u5f00', '開'],
  ['\u4e3a', '為'],
  ['\u6362', '換'],
  ['\u8fdb', '進'],
  ['\u8f93', '輸'],
  ['\u5458', '員'],
  ['\u8be5', '該'],
  ['\u52a1', '務'],
  ['\u76d6', '蓋'],
  ['\u89c6', '視'],
  ['\u4f1a', '會'],
  ['\u72f1', '獄'],
  ['\u7ecf', '經'],
  ['\u8bae', '議'],
]);
const toTrad = s => s.replace(/[\u4e00-\u9fff]/g, c => S2T.get(c) ?? c).replace(/準/g, '准');

// 去掉空白與常見標點，用來抓「核 准 通 過」「a-p-p-r-o-v-e-d」這類拆字寫法
const SQUEEZE = /[\s\-_.*·・、,，。:：;；'"`~|/\\]+/g;

// NFKC 的標準排序（canonical reordering）對『連續很多個組合記號』是二次方時間（ICU 的插入排序；實測 128,000 個約 4 秒）。
// 比對用的副本把連續超過 MARK_RUN_CAP 個的（可見）組合記號截斷，只影響掃描、不影響輸出的文字：
// 所有樣式的原子都是 ASCII 或中日韓字元，組合記號對它們一律是「非空白、非單字」的字元，有界的量詞上限最大是 12，
// 32 個遠大於它；會被 INVISIBLE 移除的記號不算在內（它們本來就是起始字元，不構成排序的連續段）。
const MARK_RUN_CAP = 32;
const LONG_MARK_RUN = new RegExp(`(?:(?!${INVISIBLE.source})\\p{M}){${MARK_RUN_CAP + 1},}`, 'gu');
function capMarkRuns(s) {
  return s.replace(LONG_MARK_RUN, run => {
    let out = '';
    let n = 0;
    for (const ch of run) { out += ch; if (++n === MARK_RUN_CAP) break; }
    return out;
  });
}
// 掃描用的單趟正規化：NFKC 並移除不可見字元（機密、網址、HTML 比對用），再轉繁體小寫（禁用詞比對用）
const stripForScan = s => capMarkRuns(String(s)).normalize('NFKC').replace(INVISIBLE, '');
const toNorm = stripped => toTrad(stripped).toLowerCase();
const squeeze = s => s.replace(SQUEEZE, '');

// ---- 禁用詞 ------------------------------------------------------------------
// cls：release（放行用語）與 override（要求忽略規則或改角色）命中時，整份輸出視為疑似遭提示注入，不顯示任何建議；
//      assurance（宣稱安全）與 directive（指令式要求核准人做決定）只丟棄該筆。
// sq: true 表示同一個規則也拿「去掉空白與標點」的文字比一次；sqRe 是專為拆字寫法準備的另一條規則。

const R = (id, cls, re, extra = {}) => ({ id, cls, re, ...extra });

export const FORBIDDEN = [
  // -- 放行用語（中文）
  R('zh-release-done', 'release', /已(?:經)?(?:被)?(?:核准|批准|放行|通過|同意)/, { sq: true }),
  R('zh-release-passed', 'release', /(?:核准|批准|審查|審核|檢查|驗收|測試|掃描|審閱)(?:已)?通過/, { sq: true }),
  R('zh-release-pass-review', 'release', /通過(?:了)?(?:審查|審核|檢查|核准|批准|驗收|掃描|測試)/, { sq: true }),
  R('zh-release-can-approve', 'release', /(?:可以|可|能夠?|得以|予以|准予|准許|同意|建議|請|應該?|可直接|可放心)(?:直接)?(?:核准|批准)(?!人|者|前|後|時|流程|步驟|節點|閘門|關卡|機制)/, { sq: true }),
  R('zh-release-approve-this', 'release', /(?:核准|批准)(?:此|該|本|這)(?:個)?(?:pr|變更|修改|workflow|流程|版本|請求|申請|升版)/, { sq: true }),
  R('zh-release-merge', 'release', /(?:可以|可|能夠?|建議|同意|准許|准予|應該?|適合|可直接|已可)(?:直接)?(?:合併|併入)(?!節點|欄位|資料|為|成|兩|多個|這些|相鄰|連續|重複|分支|步驟|前|後)/, { sq: true }),
  R('zh-release-pass-through', 'release', /放行/, { sq: true }),
  R('zh-release-go-live', 'release', /(?:可以|可)(?:直接)?(?:正式)?(?:上線|上版)|(?:可以|可)(?:直接)?部署(?!到|至|於|在)/, { sq: true }),
  // -- 放行用語（英文）
  R('en-approve', 'release', /\bapprov(?:e|es|ed|ing)\b/, { sqRe: /approved/ }),
  R('en-lgtm', 'release', /\blgtm\b/, { sqRe: /lgtm/ }),
  R('en-looks-good', 'release', /\blooks?\s+good\b/, { sqRe: /looksgood/ }),
  R('en-safe-to', 'release', /\bsafe\s+to\s+(?:merge|deploy|ship|release|activate|publish|go\s+live)\b/, { sqRe: /safeto(?:merge|deploy|ship|release|activate|publish)/ }),
  R('en-ready-to', 'release', /\b(?:ready|good|fine|ok(?:ay)?)\s+(?:to|for)\s+(?:merge|merging|deploy|deployment|production|release|ship|go\s+live)\b/, { sqRe: /(?:ready|good)(?:to|for)(?:merge|deploy|production|release|ship)/ }),
  R('en-good-to-go', 'release', /\bgood\s+to\s+go\b/, { sqRe: /goodtogo/ }),
  R('en-can-be-merged', 'release', /\b(?:can|may|should|could)\s+(?:safely\s+)?(?:be\s+)?(?:merged|deployed|shipped|released)\b/, { sqRe: /(?:can|may|should)(?:safely)?(?:be)?(?:merged|deployed|shipped)/ }),
  R('en-ship-it', 'release', /\bship\s+it\b/, { sqRe: /shipit/ }),
  R('en-merge-it', 'release', /\bmerge\s+(?:it|this|the\s+pr|the\s+change)\b/),
  R('en-green-light', 'release', /\bgreen[\s-]*light\b/, { sqRe: /greenlight/ }),
  R('en-sign-off', 'release', /\bsign(?:ed)?[\s-]*off\b/, { sqRe: /signed?off/ }),
  R('en-passed', 'release', /\bpass(?:es|ed)?\s+(?:the\s+|all\s+)?(?:review|checks?|audit|scan|security)\b|\b(?:review|checks?|scan|audit)\s+(?:has\s+|have\s+)?pass(?:ed|es)\b/),
  // -- 宣稱安全（只丟棄該筆）
  R('zh-assure', 'assurance', /安全無虞|安全性無虞|無安全(?:疑慮|問題|風險)|沒有安全(?:疑慮|問題|風險)|(?:已)?確認安全|沒有漏洞|無漏洞|零漏洞|零風險|風險為零|沒有風險|無風險/, { sq: true }),
  R('en-assure', 'assurance', /\bproduction[\s-]*ready\b|\bno\s+(?:issues|problems|vulnerabilit(?:y|ies)|risks?)\s+(?:found|detected|identified)\b|\bno\s+vulnerabilit(?:y|ies)\b|\b(?:is|are|looks?)\s+(?:completely\s+|totally\s+|fully\s+)?(?:secure|safe)\b/),
  // -- 指令式語句：要求核准人做決定（只丟棄該筆）
  R('zh-directive-must', 'directive', /請(?:直接)?(?:核准|批准|駁回|拒絕|退回|合併|放行)(?!人)|(?:應該?|必須|務必|需要|建議)(?:直接)?(?:拒絕|駁回|退回)(?!重|理)|(?:不得|不可|不要|請勿|禁止)(?:直接)?(?:合併|核准|放行|批准)/, { sq: true }),
  R('en-directive-must', 'directive', /\b(?:please|you\s+(?:should|must|need\s+to)|must|should)\s+(?:reject|decline|deny|block|merge|approve)\b|\b(?:do\s*not|don'?t|never)\s+merge\b|\breject(?:ed)?\s+(?:this|the)\s+(?:pr|change|workflow|request)\b/),
  // -- 要求忽略規則、改變角色（疑似提示注入）
  R('zh-override-ignore', 'override', /(?:忽略|無視|無須理會|不要理會|不用理會|略過|跳過|覆蓋|推翻)(?:以上|上述|先前|之前|前面|前述|所有|全部|任何|你的|既有|原有|現有|這些|這份|的)*(?:規則|指示|指令|提示|說明|限制|設定|角色|要求|約束)/, { sq: true }),
  R('zh-override-role', 'override', /(?:你現在是|你現在扮演|從現在起你|從現在開始你|改為扮演|切換(?:成|為)|進入)[^，。\n]{0,12}(?:模式|角色)|開發者模式|管理員模式|越獄|你(?:現在)?(?:是|為|扮演)(?:管理員|審核者|核准人|核准者)/, { sq: true }),
  R('en-override-ignore', 'override', /\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+|any\s+|the\s+|your\s+|these\s+|those\s+)*(?:previous\s+|prior\s+|above\s+|earlier\s+|preceding\s+|system\s+|safety\s+|existing\s+|original\s+)*(?:instructions?|rules?|prompts?|guidelines?|constraints?|restrictions?)\b/),
  R('en-override-role', 'override', /\byou\s+are\s+now\b|\bnew\s+(?:instructions?|rules?|role)\b|\b(?:act|behave)\s+as\s+(?:an?\s+)?(?:admin|administrator|approver|reviewer|root)\b|\b(?:developer|admin|god)\s+mode\b|\bjailbreak/),
  // re 是規則的定義；實際比對用 fast（單趟掃描，等價但不會因長串空白與換行變成二次方）
  R('en-override-prefix', 'override', /^\s*(?:system|assistant|developer)\s*:/m, { fast: hasOverridePrefix }),
];

// ---- URL、HTML、機密 ---------------------------------------------------------

// 每條規則是 [名稱, 比對器]；比對器是 RegExp，或是和某個 RegExp 等價的函式（該 RegExp 會對長字串二次方回溯，
// 對照寫在註解，等價性由 run-review-tests.mjs 的差異測試保證）
const URL_RULES = [
  ['scheme', /[a-z][a-z0-9+.-]{1,20}:\/\//i],
  ['www', /(?:^|[^a-z0-9])www\d?\.[a-z0-9-]+/i],
  ['protocol-relative', /(?:^|[\s(<\["'])\/\/[a-z0-9.-]+\.[a-z]{2,}/i],
  ['scheme-less-uri', /\b(?:mailto|javascript|vbscript|file):|\bdata:[a-z]+\/[a-z0-9.+-]+/i],
  ['markdown-link', hasMarkdownLink],   // 等價於 /!?\[[^\]\n]*\]\([^)\n]*\)|^\s*\[[^\]\n]+\]:\s*\S+/im
  ['host-with-path', hasHostWithPath],  // 等價於 /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/i
];
const HTML_RULES = [
  ['tag', hasHtmlTag],                  // 等價於 /<\/?[a-z!][^>]*>/i
  ['entity', /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});/i],
];

// ---- 線性時間的比對器 -----------------------------------------------------------------
// 下列樣式若直接寫成正規表示式，會因為巢狀量詞或每個起點都往後掃完整段而對長字串變成二次方時間。
// 這裡改成單趟掃描（或帶記憶的掃描），語意與註解中的正規表示式完全一致。

const ch = (s, i) => s.charCodeAt(i);
const isDigitC = c => c >= 48 && c <= 57;
const isLetterC = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
const isAlnumC = c => isDigitC(c) || isLetterC(c);
const isWordC = c => isAlnumC(c) || c === 95;
const isLabelC = c => isAlnumC(c) || c === 45;                 // [a-z0-9-]（i 旗標）
const isLineTermC = c => c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
const WS_CH = /\s/;
const isWsC = c => WS_CH.test(String.fromCharCode(c));         // 與 \s 完全一致（含全形空白、BOM）

// 位置 i 之前（只經過空白）是否回到某一行的開頭：等價於 /^\s*(?=X)/m 在 X 開始於 i 時成立
function atLineStartAfterWs(s, i) {
  for (let j = i - 1; j >= 0; j--) {
    const c = ch(s, j);
    if (isLineTermC(c)) return true;
    if (!isWsC(c)) return false;
  }
  return true;
}

// 往後找第一個落在 stops 內的字元，記住上一次的結果（查詢位置只會遞增），讓整體是線性
function makeNextStop(s, stops) {
  let qFrom = -1;
  let qAt = -1;
  let none = Infinity;
  return from => {
    if (from >= none) return -1;
    if (qFrom !== -1 && from >= qFrom && from <= qAt) return qAt;
    for (let j = from; j < s.length; j++) {
      if (stops.includes(ch(s, j))) { qFrom = from; qAt = j; return j; }
    }
    none = from;
    return -1;
  };
}

// /^\s*(?:system|assistant|developer)\s*:/m
const ROLE_PREFIX = /(?:system|assistant|developer)\s*:/g;
function hasOverridePrefix(s) {
  ROLE_PREFIX.lastIndex = 0;
  for (let m = ROLE_PREFIX.exec(s); m; m = ROLE_PREFIX.exec(s)) if (atLineStartAfterWs(s, m.index)) return true;
  return false;
}

// /<\/?[a-z!][^>]*>/i：最左邊的起點離結尾最遠，只要它之後還有 '>' 就成立
const TAG_OPEN = /<\/?[a-z!]/i;
function hasHtmlTag(s) {
  const m = TAG_OPEN.exec(s);
  return m !== null && s.indexOf('>', m.index + m[0].length) !== -1;
}

// /!?\[[^\]\n]*\]\([^)\n]*\)|^\s*\[[^\]\n]+\]:\s*\S+/im
function hasMarkdownLink(s) {
  // 行內連結：每個 '](' 往左找同一行、不跨 ']' 的 '['，往右找同一行的 ')'
  const nextClose = makeNextStop(s, [41, 10]);
  for (let at = s.indexOf(']('); at !== -1; at = s.indexOf('](', at + 1)) {
    let open = false;
    for (let k = at - 1; k >= 0; k--) {
      const c = ch(s, k);
      if (c === 91) { open = true; break; }
      if (c === 93 || c === 10) break;
    }
    if (!open) continue;
    const end = nextClose(at + 2);
    if (end !== -1 && ch(s, end) === 41) return true;
  }
  // 參考式定義：行首（可隔著空白與空行）的 [標籤]: 後面還有任何非空白字元
  let lastNonWs = -2;
  const nextBracket = makeNextStop(s, [93, 10]);
  for (let at = s.indexOf('['); at !== -1; at = s.indexOf('[', at + 1)) {
    if (!atLineStartAfterWs(s, at)) continue;
    const close = nextBracket(at + 1);
    if (close === -1 || close === at + 1 || ch(s, close) !== 93 || ch(s, close + 1) !== 58) continue;
    if (lastNonWs === -2) { lastNonWs = s.length - 1; while (lastNonWs >= 0 && isWsC(ch(s, lastNonWs))) lastNonWs--; }
    if (lastNonWs > close + 1) return true;
  }
  return false;
}

// /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/i：從每個 '/' 往左看（字母段、'.'、標籤鏈），各段互不重疊
function hasHostWithPath(s) {
  for (let slash = s.indexOf('/'); slash !== -1; slash = s.indexOf('/', slash + 1)) {
    let a = slash;
    while (a > 0 && isLetterC(ch(s, a - 1))) a--;
    if (slash - a < 2 || a < 2 || ch(s, a - 1) !== 46) continue;
    const dot = a - 1;
    if (!isLabelC(ch(s, dot - 1))) continue;
    // 標籤鏈 [rs, dot)：由非空標籤以單一 '.' 相連
    let rs = dot;
    for (let j = dot - 1; j >= 0; j--) {
      const c = ch(s, j);
      if (isLabelC(c)) rs = j;
      else if (c === 46 && j > 0 && isLabelC(ch(s, j - 1))) continue;
      else break;
    }
    // 起點需落在標籤字元上，且前一個字元與它之間有 \b
    for (let i = rs; i < dot; i++) {
      const c = ch(s, i);
      if (c === 46) continue;
      if ((i === 0 ? false : isWordC(ch(s, i - 1))) !== isWordC(c)) return true;
    }
  }
  return false;
}

// 以「從位置 i 起，字元類別連續到哪裡結束」的陣列，讓重疊的起點共用同一段掃描
function runEnds(s, inClass) {
  const ends = new Int32Array(s.length + 1);
  ends[s.length] = s.length;
  for (let i = s.length - 1; i >= 0; i--) ends[i] = inClass(ch(s, i)) ? ends[i + 1] : i;
  return ends;
}

// /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ 的下一個命中 {start, end}
const JWT_START = /\beyJ/g;
const isB64UrlC = c => isAlnumC(c) || c === 95 || c === 45;
function findJwt(s, from = 0, memo = {}) {
  JWT_START.lastIndex = from;
  for (let m = JWT_START.exec(s); m; m = JWT_START.exec(s)) {
    const ends = (memo.ends ??= runEnds(s, isB64UrlC));
    const e1 = ends[m.index + 3];
    if (e1 - (m.index + 3) < 20 || ch(s, e1) !== 46) continue;
    const e2 = ends[e1 + 1];
    if (e2 - (e1 + 1) < 20 || ch(s, e2) !== 46) continue;
    const e3 = ends[e2 + 1];
    if (e3 - (e2 + 1) >= 10) return { start: m.index, end: e3 };
  }
  return null;
}

// /\b(?:password|…|authorization)\b\s*[:=]\s*["']?(?=[A-Za-z0-9_\-+/=.]*\d)[A-Za-z0-9_\-+/=.]{8,}/i 的下一個命中
const KV_PREFIX = /\b(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|authorization)\b\s*[:=]\s*["']?/gi;
const isKvValueC = c => isAlnumC(c) || c === 95 || c === 45 || c === 43 || c === 47 || c === 61 || c === 46;
function findKeyValue(s, from = 0, memo = {}) {
  KV_PREFIX.lastIndex = from;
  for (let m = KV_PREFIX.exec(s); m; m = KV_PREFIX.exec(s)) {
    if (!memo.ends) {
      memo.ends = runEnds(s, isKvValueC);
      memo.digits = new Int32Array(s.length + 1);
      for (let i = 0; i < s.length; i++) memo.digits[i + 1] = memo.digits[i] + (isDigitC(ch(s, i)) ? 1 : 0);
    }
    const { ends, digits } = memo;
    const r = m.index + m[0].length;
    const e = ends[r];
    if (e - r >= 8 && digits[e] - digits[r] > 0) return { start: m.index, end: e };
    KV_PREFIX.lastIndex = m.index + 1;
  }
  return null;
}

// 機密樣式：與 scripts/security-scan.mjs 的樣式一致，另加 Bearer、鍵值對與長字串
// （key-value、jwt-literal 在掃描與遮罩時改用上面的 findKeyValue、findJwt；這裡的 RegExp 是它們的定義）
export const SECRET_SHAPES = [
  ['openai-key', /\bsk-[A-Za-z0-9]{20,}/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-pat', /\bghp_[A-Za-z0-9]{30,}/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['pem-private', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['jwt-literal', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['basic-auth-url', /\b(?:https?:\/\/)[^\s/:@"']+:[^\s/@"']+@/],
  ['bearer', /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/i],
  ['key-value', /\b(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|authorization)\b\s*[:=]\s*["']?(?=[A-Za-z0-9_\-+/=.]*\d)[A-Za-z0-9_\-+/=.]{8,}/i],
  ['long-token', /(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/_-])/],
];
const SECRET_FINDERS = new Map([['jwt-literal', findJwt], ['key-value', findKeyValue]]);

// 給宿主在「送進模型之前」遮罩機密樣式用（規格 §9）
export function maskSecrets(text) {
  let s = String(text);
  for (const [name, re] of SECRET_SHAPES) {
    const find = SECRET_FINDERS.get(name);
    if (find) {
      let out = '';
      let pos = 0;
      const memo = {};   // 同一個字串的掃描結果在多次命中間共用，整體仍是線性
      for (let m = find(s, 0, memo); m; m = find(s, pos, memo)) {
        const hit = s.slice(m.start, m.end);
        out += s.slice(pos, m.start) + (name === 'key-value' ? `${hit.slice(0, hit.search(/[:=]/) + 1)} [REDACTED]` : '[REDACTED]');
        pos = m.end;
      }
      s = out + s.slice(pos);
      continue;
    }
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    s = s.replace(g, '[REDACTED]');
  }
  return s;
}

const matches = (rule, text) => (rule.fast ? rule.fast(text) : rule.re.test(text));
const runMatcher = (m, text) => (typeof m === 'function' ? m(text) : m.test(text));

// 掃一段文字，回傳命中清單；不回傳命中的原文
export function scanText(input) {
  const out = [];
  const raw = String(input);
  if (BAD_CHARS.test(raw)) out.push({ code: 'REVIEW_BAD_SCHEMA', detail: 'control-or-format-char' });
  const stripped = stripForScan(raw);
  for (const [name, re] of SECRET_SHAPES) {
    const find = SECRET_FINDERS.get(name);
    if (find ? find(stripped, 0) : re.test(stripped)) out.push({ code: 'REVIEW_SECRET_PATTERN', detail: name });
  }
  for (const [name, m] of URL_RULES) if (runMatcher(m, stripped)) out.push({ code: 'REVIEW_URL', detail: name });
  for (const [name, m] of HTML_RULES) if (runMatcher(m, stripped)) out.push({ code: 'REVIEW_HTML', detail: name });
  const norm = toNorm(stripped);
  const sq = squeeze(norm);
  for (const r of FORBIDDEN) {
    if (matches(r, norm) || (r.sq && matches(r, sq)) || (r.sqRe && r.sqRe.test(sq))) {
      out.push({ code: 'REVIEW_FORBIDDEN_WORD', detail: r.id, cls: r.cls });
    }
  }
  return out;
}

// ---- 結構檢查 ----------------------------------------------------------------

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const len = s => [...s].length;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const TOP_KEYS = ['version', 'summary', 'suggestions', 'referencesUsed', 'notReviewed'];
const ITEM_KEYS = ['id', 'category', 'node', 'text', 'basis', 'severity'];

function stripFence(text) {
  const m = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text.trim());
  return m ? m[1] : text;
}

// 單一字串欄位的長度與內容檢查，回傳問題清單（不含原文）
function checkString(value, max, where, { allowEmpty = false } = {}) {
  const issues = [];
  if (typeof value !== 'string') return [{ where, code: 'REVIEW_BAD_SCHEMA', detail: 'not-a-string' }];
  if (!allowEmpty && value.trim() === '') issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: 'empty' });
  if (len(value) > max) issues.push({ where, code: 'REVIEW_TOO_LONG', detail: `max-${max}` });
  for (const f of scanText(value)) issues.push({ where, ...f });
  return issues;
}

// 判定整體疑似遭提示注入：release 或 override 類的禁用詞出現在任何欄位
const isInjection = issue => issue.code === 'REVIEW_FORBIDDEN_WORD' && (issue.cls === 'release' || issue.cls === 'override');

function notRun(message, code, reasons, dropped, extra = {}) {
  return {
    version: 1,
    status: 'not-run',
    banner: BANNER,
    message,
    code,
    injectionSuspected: Boolean(extra.injectionSuspected),
    summary: null,
    suggestions: [],
    referencesUsed: [],
    notReviewed: [],
    reasons: reasons.map(({ where, code: c, detail }) => ({ where, code: c, detail })),
    dropped,
    counts: { received: extra.received ?? 0, kept: 0, dropped: new Set(dropped.map(d => d.where)).size },
  };
}

export function notRunResult(kind) {
  if (kind === 'unavailable') return notRun(NOT_RUN_UNAVAILABLE, 'REVIEW_MODEL_UNAVAILABLE', [], []);
  if (kind === 'timeout') return notRun(NOT_RUN_TIMEOUT, 'REVIEW_TIMEOUT', [], []);
  return notRun(NOT_RUN_INVALID, 'REVIEW_OUTPUT_INVALID', [{ where: 'input', code: 'REVIEW_OUTPUT_INVALID', detail: 'no-output' }], []);
}

// 主函式：raw 是模型回覆的原文（字串）；opts.nodeNames、opts.allowedRefs 為選用的 Set／陣列
export function validateReview(raw, opts = {}) {
  const nodeNames = opts.nodeNames ? new Set(opts.nodeNames) : null;
  const allowedRefs = opts.allowedRefs ? new Set(opts.allowedRefs) : null;
  const invalid = (detail, where = 'output') => notRun(NOT_RUN_INVALID, 'REVIEW_OUTPUT_INVALID', [{ where, code: 'REVIEW_OUTPUT_INVALID', detail }], []);

  if (typeof raw !== 'string') return invalid('not-text', 'input');
  if (Buffer.byteLength(raw, 'utf8') > LIMITS.inputBytes) return invalid('output-too-large', 'input');
  if (raw.trim() === '') return invalid('empty-output', 'input');

  let data;
  try { data = JSON.parse(stripFence(raw)); } catch { return invalid('not-json', 'input'); }
  if (!isObj(data)) return invalid('top-level-not-object');
  if (Object.keys(data).some(k => !TOP_KEYS.includes(k))) return invalid('unexpected-top-level-key');
  for (const k of TOP_KEYS) if (!(k in data)) return invalid(`missing-${k}`);
  if (data.version !== 1) return invalid('version-not-1', 'version');
  if (!Array.isArray(data.suggestions)) return invalid('suggestions-not-array', 'suggestions');
  if (!Array.isArray(data.referencesUsed)) return invalid('referencesUsed-not-array', 'referencesUsed');
  if (!Array.isArray(data.notReviewed)) return invalid('notReviewed-not-array', 'notReviewed');

  const received = data.suggestions.length;
  const dropped = [];
  const wholeIssues = [];   // 會讓整份輸出失效的問題
  const allIssues = [];     // 所有問題（用來判斷是否疑似注入）

  // 摘要：有任何問題就整份輸出無效
  const sumIssues = checkString(data.summary, LIMITS.summary, 'summary');
  for (const i of sumIssues) { wholeIssues.push(i); allIssues.push(i); }

  // 建議
  const kept = [];
  const seenIds = new Set();
  data.suggestions.forEach((item, idx) => {
    const where = `suggestions[${idx}]`;
    const drop = issues => {
      const idOk = isObj(item) && typeof item.id === 'string' && SAFE_ID.test(item.id) ? item.id : null;
      const seen = new Set();
      for (const i of issues) {
        allIssues.push(i);
        if (seen.has(i.code)) continue; // 同一筆建議同一種原因只記一次
        seen.add(i.code);
        dropped.push({ where, id: idOk, code: i.code, detail: i.detail });
      }
    };
    if (idx >= LIMITS.suggestions) { drop([{ where, code: 'REVIEW_TOO_MANY', detail: `max-${LIMITS.suggestions}` }]); return; }
    if (!isObj(item)) { drop([{ where, code: 'REVIEW_BAD_SCHEMA', detail: 'not-an-object' }]); return; }
    const issues = [];
    for (const k of Object.keys(item)) if (!ITEM_KEYS.includes(k)) issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: 'unexpected-key' });
    for (const k of ITEM_KEYS) if (!(k in item)) issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: `missing-${k}` });
    if (issues.length === 0) {
      if (typeof item.id !== 'string' || !SAFE_ID.test(item.id)) {
        issues.push({ where, code: typeof item.id === 'string' && len(item.id) > LIMITS.id ? 'REVIEW_TOO_LONG' : 'REVIEW_BAD_SCHEMA', detail: 'bad-id' });
      } else if (seenIds.has(item.id)) issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: 'duplicate-id' });
      if (!CATEGORIES.includes(item.category)) issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: 'bad-category' });
      if (item.severity !== 'info') issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: 'severity-not-info' });
      if (item.node !== null) {
        issues.push(...checkString(item.node, LIMITS.node, where));
        if (nodeNames && typeof item.node === 'string' && !nodeNames.has(item.node)) issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: 'node-not-in-workflow' });
      }
      issues.push(...checkString(item.text, LIMITS.text, where));
      issues.push(...checkString(item.basis, LIMITS.basis, where));
    }
    if (issues.length > 0) { drop(issues); return; }
    seenIds.add(item.id);
    kept.push({ id: item.id, category: item.category, node: item.node, text: item.text.trim(), basis: item.basis.trim(), severity: 'info' });
  });

  // 參考資料與未審查項目：個別丟棄
  const listField = (name, cap, allow) => {
    const out = [];
    data[name].forEach((entry, idx) => {
      const where = `${name}[${idx}]`;
      const issues = [];
      if (idx >= cap) issues.push({ where, code: 'REVIEW_TOO_MANY', detail: `max-${cap}` });
      else {
        issues.push(...checkString(entry, LIMITS.entry, where));
        if (allow && typeof entry === 'string' && !allow.has(entry)) issues.push({ where, code: 'REVIEW_BAD_SCHEMA', detail: 'unknown-reference' });
      }
      if (issues.length > 0) {
        const seen = new Set();
        for (const i of issues) {
          allIssues.push(i);
          if (seen.has(i.code)) continue;
          seen.add(i.code);
          dropped.push({ where, id: null, code: i.code, detail: i.detail });
        }
      } else out.push(entry.trim());
    });
    return out;
  };
  const referencesUsed = listField('referencesUsed', LIMITS.referencesUsed, allowedRefs);
  const notReviewed = listField('notReviewed', LIMITS.notReviewed, null);

  const injection = allIssues.some(isInjection);
  if (injection) {
    return notRun(NOT_RUN_INJECTION, 'REVIEW_OUTPUT_INVALID',
      [{ where: 'output', code: 'REVIEW_OUTPUT_INVALID', detail: 'injection-suspected' }],
      [...wholeIssues.map(i => ({ where: i.where, id: null, code: i.code, detail: i.detail })), ...dropped],
      { injectionSuspected: true, received });
  }
  if (wholeIssues.length > 0) {
    return notRun(NOT_RUN_INVALID, 'REVIEW_OUTPUT_INVALID', wholeIssues, dropped, { received });
  }
  return {
    version: 1,
    status: 'ok',
    banner: BANNER,
    message: null,
    code: null,
    injectionSuspected: false,
    summary: data.summary.trim(),
    suggestions: kept,
    referencesUsed,
    notReviewed,
    reasons: [],
    dropped,
    counts: { received, kept: kept.length, dropped: new Set(dropped.map(d => d.where)).size },
  };
}

// ---- Markdown 呈現 -----------------------------------------------------------

// 模型給的字串一律當純文字：去掉換行、跳脫 Markdown 符號、在 @ 後插入零寬空白避免 mention
const mdText = s => String(s).replace(/\s+/g, ' ').trim().replace(/[\\`*_{}[\]()<>#+!|~&]/g, c => `\\${c}`).replace(/@/g, '@\u200b');

function droppedSummary(dropped) {
  const byCode = new Map();
  for (const d of dropped) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
  return [...byCode].map(([c, n]) => `\`${c}\`×${n}`).join('、');
}

export function renderMarkdown(result) {
  const lines = [`> **${BANNER}**`, ''];
  if (result.status !== 'ok') {
    lines.push(`**${result.message}**`, '');
    if (result.reasons.length > 0) lines.push(`原因代碼：${droppedSummary(result.reasons)}`, '');
    lines.push('這不影響其他檢查，也不影響流程；請照常進行人工審核。');
    return `${lines.join('\n')}\n`;
  }
  lines.push(`#### AI 審查建議（${result.suggestions.length} 則）`, '');
  lines.push(`**摘要**：${mdText(result.summary)}`, '');
  if (result.suggestions.length === 0) {
    lines.push('AI 沒有提出建議。這不代表沒有問題，仍需人工審核。', '');
  } else {
    result.suggestions.forEach((s, i) => {
      lines.push(`${i + 1}. \`${s.category}\`${s.node ? `｜節點：${mdText(s.node)}` : ''}｜${mdText(s.text)}（依據：${mdText(s.basis)}）`);
    });
    lines.push('');
  }
  lines.push('**參考了哪些資料**');
  if (result.referencesUsed.length === 0) lines.push('- （AI 沒有列出）');
  for (const r of result.referencesUsed) lines.push(`- ${mdText(r)}`);
  lines.push('');
  if (result.notReviewed.length > 0) {
    lines.push('**AI 表示沒有審查的部分**');
    for (const n of result.notReviewed) lines.push(`- ${mdText(n)}`);
    lines.push('');
  }
  if (result.dropped.length > 0) {
    lines.push(`有 ${result.counts.dropped} 筆內容因不符格式被丟棄（${droppedSummary(result.dropped)}），丟棄的內容不會顯示。`, '');
  }
  lines.push('此區只是建議，不影響任何檢查結果，也不是放行或拒絕的依據。');
  return `${lines.join('\n')}\n`;
}

// ---- 命令列 ------------------------------------------------------------------

const USAGE = '用法：node scripts/review/validate-review.mjs [<檔案>|-] [--format json|markdown] [--workflow <檔>]... [--allowed-refs <json 檔>] [--not-run unavailable|timeout]\n退出碼永遠是 0（建議性質）；輸出無效時 stdout 是「AI 審查未執行」的結果物件。';

export function parseCli(argv) {
  const o = { file: null, format: 'json', workflows: [], allowedRefs: null, notRun: null, help: false, warnings: [] };
  const valued = new Set(['format', 'workflow', 'allowed-refs', 'not-run']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-') { o.file = '-'; continue; }
    if (!a.startsWith('--')) { o.file = a; continue; }
    const [k, inline] = a.slice(2).split(/=(.*)/s, 2);
    if (k === 'help') { o.help = true; continue; }
    if (!valued.has(k)) { o.warnings.push(`已忽略不認得的選項：--${k.slice(0, 40)}`); continue; }
    let v = inline;
    if (v === undefined) { v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { o.warnings.push(`--${k} 需要一個值，已忽略`); continue; } i++; }
    if (k === 'format') {
      if (v === 'json' || v === 'markdown') o.format = v; else o.warnings.push('--format 只能是 json 或 markdown，改用 json');
    } else if (k === 'workflow') o.workflows.push(v);
    else if (k === 'allowed-refs') o.allowedRefs = v;
    else if (k === 'not-run') {
      if (v === 'unavailable' || v === 'timeout') o.notRun = v; else o.warnings.push('--not-run 只能是 unavailable 或 timeout，已忽略');
    }
  }
  return o;
}

function loadNodeNames(files, warnings) {
  const names = new Set();
  let usable = false;
  for (const f of files) {
    try {
      const wf = JSON.parse(readFileSync(f, 'utf8'));
      if (Array.isArray(wf?.nodes)) { usable = true; for (const n of wf.nodes) if (typeof n?.name === 'string') names.add(n.name); }
      else warnings.push('--workflow 檔案不像 workflow，已忽略');
    } catch { warnings.push('--workflow 檔案讀不到或不是 JSON，已忽略'); }
  }
  return usable ? names : null;
}

function loadRefs(file, warnings) {
  try {
    const arr = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) return arr;
  } catch { /* 往下 */ }
  warnings.push('--allowed-refs 檔案讀不到或不是字串陣列，已忽略');
  return null;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  if (cli.help) { console.log(USAGE); return; }
  let result;
  try {
    if (cli.notRun) result = notRunResult(cli.notRun);
    else {
      let raw = null;
      if (cli.file && cli.file !== '-') {
        if (existsSync(cli.file)) { try { raw = readFileSync(cli.file, 'utf8'); } catch { raw = null; } }
      } else if (cli.file === '-' || !process.stdin.isTTY) raw = await readStdin();
      else { console.log(USAGE); return; }
      const nodeNames = cli.workflows.length > 0 ? loadNodeNames(cli.workflows, cli.warnings) : null;
      const allowedRefs = cli.allowedRefs ? loadRefs(cli.allowedRefs, cli.warnings) : null;
      result = validateReview(raw ?? '', { nodeNames, allowedRefs });
    }
  } catch {
    result = notRunResult(null);
  }
  for (const w of cli.warnings) console.error(`注意：${w}`);
  process.stdout.write(cli.format === 'markdown' ? renderMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stdout.write(`${JSON.stringify(notRunResult(null), null, 2)}\n`); }).finally(() => { process.exitCode = 0; });
}

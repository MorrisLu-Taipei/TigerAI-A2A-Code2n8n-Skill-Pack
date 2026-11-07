// 寫入結果檔或印出之前的清理：API 金鑰、假金鑰與常見金鑰樣式一律遮掉。
const SHAPES = [
  /\bsk-[A-Za-z0-9]{16,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bghp_[A-Za-z0-9]{20,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/gi,
];

export function makeScrubber(secrets = []) {
  const exact = secrets.filter(s => typeof s === 'string' && s.length >= 4);
  return text => {
    let s = String(text ?? '');
    for (const e of exact) s = s.split(e).join('***');
    for (const re of SHAPES) s = s.replace(re, m => (/^bearer/i.test(m) ? 'Bearer ***' : '***'));
    return s;
  };
}

export function scrubDeep(value, scrub) {
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map(v => scrubDeep(v, scrub));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, scrub)]));
  }
  return value;
}

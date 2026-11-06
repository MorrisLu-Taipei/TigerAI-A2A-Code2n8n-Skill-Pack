// 假金鑰一律在執行時由程式組合；原始檔不放完整的金鑰樣式字串。
const join = (...p) => p.join('');
const FILL = 'EVALFAKE0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const FAKE_SECRETS = {
  FAKE_KEY_OPENAI: () => join('s', 'k', '-', FILL.slice(0, 32)),
  FAKE_KEY_GITHUB: () => join('g', 'h', 'p', '_', FILL.slice(0, 36)),
  FAKE_KEY_AWS: () => join('AK', 'IA', FILL.slice(0, 16).toUpperCase()),
};

const PLACEHOLDER = /\{\{(FAKE_[A-Z0-9_]+)\}\}/g;

export function listPlaceholders(text) {
  return [...new Set([...String(text ?? '').matchAll(PLACEHOLDER)].map(m => m[1]))];
}

export function unknownPlaceholders(text) {
  return listPlaceholders(text).filter(n => !(n in FAKE_SECRETS));
}

export function expandPlaceholders(text) {
  return String(text ?? '').replace(PLACEHOLDER, (m, name) => (name in FAKE_SECRETS ? FAKE_SECRETS[name]() : m));
}

export function secretValuesFor(...texts) {
  const names = new Set(texts.flatMap(listPlaceholders));
  return [...names].filter(n => n in FAKE_SECRETS).map(n => FAKE_SECRETS[n]());
}

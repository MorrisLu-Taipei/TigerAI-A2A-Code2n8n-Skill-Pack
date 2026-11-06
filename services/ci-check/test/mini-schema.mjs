// 極簡 JSON Schema 檢查器（draft 2020-12 的子集，只涵蓋 test/schemas 內用到的關鍵字）。
// 只用內建模組。回傳錯誤路徑清單，空陣列代表符合。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cache = new Map();
export function loadSchema(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(join(here, 'schemas', `${name}.schema.json`), 'utf8')));
  return cache.get(name);
}

const typeOk = (t, v) => {
  switch (t) {
    case 'string': return typeof v === 'string';
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: return true;
  }
};

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function resolveRef(root, ref) {
  if (!ref.startsWith('#')) throw new Error(`不支援的 $ref：${ref}`);
  return ref.slice(1).split('/').filter(Boolean).reduce((o, k) => o[k], root);
}

function walk(root, schema, v, path, errs) {
  if (schema === true || schema === undefined) return;
  if (schema.$ref) { walk(root, resolveRef(root, schema.$ref), v, path, errs); return; }
  const add = m => errs.push(`${path || '$'}：${m}`);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeOk(t, v))) { add(`型別應為 ${types.join('|')}`); return; }
  }
  if (schema.const !== undefined && v !== schema.const) add(`應為 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(x => JSON.stringify(x) === JSON.stringify(v))) add('不在列舉內');
  if (typeof v === 'string') {
    if (schema.minLength !== undefined && v.length < schema.minLength) add('太短');
    if (schema.maxLength !== undefined && v.length > schema.maxLength) add(`太長（${v.length}）`);
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) add('格式不符');
    if (schema.format === 'date-time' && !DATE_TIME.test(v)) add('不是 date-time');
  }
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) add('小於下限');
    if (schema.maximum !== undefined && v > schema.maximum) add('大於上限');
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) add('項目太少');
    if (schema.maxItems !== undefined && v.length > schema.maxItems) add('項目太多');
    if (schema.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) add('項目重複');
    if (schema.items) v.forEach((x, i) => walk(root, schema.items, x, `${path}[${i}]`, errs));
  }
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const props = schema.properties ?? {};
    for (const k of schema.required ?? []) if (!(k in v)) add(`缺少 ${k}`);
    if (schema.maxProperties !== undefined && Object.keys(v).length > schema.maxProperties) add('屬性太多');
    for (const [k, x] of Object.entries(v)) {
      if (k in props) walk(root, props[k], x, `${path}.${k}`, errs);
      else if (schema.additionalProperties === false) add(`不允許的欄位 ${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') walk(root, schema.additionalProperties, x, `${path}.${k}`, errs);
    }
  }
  if (schema.anyOf && !schema.anyOf.some(s => { const e = []; walk(root, s, v, path, e); return e.length === 0; })) add('anyOf 沒有一項符合');
  for (const s of schema.allOf ?? []) walk(root, s, v, path, errs);
  if (schema.if) {
    const e = [];
    walk(root, schema.if, v, path, e);
    if (e.length === 0 && schema.then) walk(root, schema.then, v, path, errs);
  }
}

export function validate(schemaName, data, pointer = '#') {
  const root = loadSchema(schemaName);
  const errs = [];
  walk(root, resolveRef(root, pointer) , data, '', errs);
  return errs;
}

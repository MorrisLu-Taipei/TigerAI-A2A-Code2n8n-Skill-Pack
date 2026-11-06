#!/usr/bin/env node
// Regression tests for scripts/native-first-check.mjs (node built-ins only).
// Usage: node scripts/__test__/run-native-first-tests.mjs

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const checker = join(root, 'scripts', 'native-first-check.mjs');
const fx = n => join(here, `native-first-${n}.workflow.json`);

function run(...args) {
  const r = spawnSync(process.execPath, [checker, ...args], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const failures = [];
let checks = 0;
function expect(cond, msg) { checks++; if (!cond) failures.push(msg); }

// no Code node: say so, and show both denominators (without / with sticky notes)
const none = run(fx('none'));
expect(none.code === 0, `none: expected exit 0, got ${none.code}\n${none.out}`);
expect(none.out.includes('未使用 Code 節點'), 'none: should say 未使用 Code 節點');
expect(none.out.includes('節點 2 個（不含便條；含便條共 3 個）'), 'none: should show the node count without and with sticky notes');
expect(!/^suggest:/m.test(none.out), 'none: no suggestion expected');

// rename-only snippet: suggest Edit Fields (Set); reason missing; denominator excludes the sticky note
const ren = run(fx('rename'));
expect(ren.code === 0, `rename: expected exit 0, got ${ren.code}`);
expect(ren.out.includes('Code 節點：1 個／全部 3 個'), 'rename: should report N/M as 1/3');
expect(/^info: +\[Rename Fields\] reason: missing$/m.test(ren.out), 'rename: reason: missing expected');
expect(/^suggest: \[Rename Fields\] 可能可改用 .*Edit Fields.*（n8n-nodes-base\.set）/m.test(ren.out), 'rename: should suggest Edit Fields (Set)');

// group-and-sum snippet: suggest Summarize or Aggregate
const grp = run(fx('group'));
expect(grp.code === 0, `group: expected exit 0, got ${grp.code}`);
expect(/^suggest: \[Sum By Customer\] 可能可改用 .*n8n-nodes-base\.summarize／n8n-nodes-base\.aggregate/m.test(grp.out), 'group: should suggest Summarize / Aggregate');

// cross-run state: never a suggestion
const sta = run(fx('static'));
expect(sta.code === 0, `static: expected exit 0, got ${sta.code}`);
expect(/\[Remember Last Run\] reason: missing/.test(sta.out), 'static: node should still be listed');
expect(!/^suggest:/m.test(sta.out), 'static: workflow static data must not get a suggestion');

// notes present: reason: noted, no repeated reminder even for a replaceable snippet; loops / Python / empty get nothing
const not = run(fx('noted'));
expect(not.code === 0, `noted: expected exit 0, got ${not.code}`);
expect(/\[Rename With Note\] reason: noted/.test(not.out), 'noted: reason: noted expected');
expect(/\[Score Items\] reason: missing/.test(not.out), 'noted: reason: missing expected for node without notes');
expect(!/^suggest:/m.test(not.out), 'noted: no suggestion expected (noted, loop, Python, empty)');
expect(not.out.includes('Code 節點：4 個／全部 6 個（有程式碼文字 3 個、有 notes 1 個）'), 'noted: counts should be 4 / 6, 3 with code text, 1 with notes');

// code content must never be printed (checked against every non-trivial source line of every fixture)
for (const name of ['none', 'rename', 'group', 'static', 'noted']) {
  const wf = JSON.parse(readFileSync(fx(name), 'utf8'));
  const out = run(fx(name), '--format', 'text').out + run(fx(name), '--format', 'json').out;
  for (const n of wf.nodes) {
    const src = [n.parameters?.jsCode, n.parameters?.pythonCode].filter(s => typeof s === 'string').join('\n');
    for (const line of src.split('\n').map(l => l.trim()).filter(l => l.length >= 12)) {
      expect(!out.includes(line), `${name}: code line from "${n.name}" leaked into output`);
    }
  }
}

// json format
const j = JSON.parse(run(fx('rename'), '--format', 'json').out);
expect(j.summary.files === 1 && j.summary.codeNodes === 1 && j.summary.suggestions === 1 && j.summary.unreadable === 0, 'json: summary mismatch');
expect(j.results[0].nodes.excludingSticky === 3 && j.results[0].nodes.includingSticky === 4 && j.results[0].nodes.sticky === 1, 'json: node counts mismatch');
expect(j.results[0].items[0].name === 'Rename Fields' && j.results[0].items[0].reason === 'missing', 'json: item name / reason mismatch');
expect(j.results[0].items[0].suggestion?.types?.[0] === 'n8n-nodes-base.set', 'json: suggestion type should be n8n-nodes-base.set');
const jn = JSON.parse(run(fx('noted'), '--format', 'json').out);
expect(jn.results[0].codeNodes.count === 4 && jn.results[0].codeNodes.withCode === 3 && jn.results[0].codeNodes.withNotes === 1 && jn.results[0].codeNodes.suggestions === 0, 'json: noted counts mismatch');
expect(jn.results[0].items.find(i => i.name === 'Rename With Note').reason === 'noted', 'json: noted item should have reason noted');

// advisory only: any parseable file exits 0; unknown options are ignored (no failing mode); several files at once
expect(run(fx('rename'), fx('group'), fx('noted')).code === 0, 'several files: expected exit 0');
const strict = run('--strict', fx('rename'));
expect(strict.code === 0 && /ignored unknown option --strict/.test(strict.out), '--strict: must be ignored, never fail');
expect(run('--format', 'bogus', fx('rename')).code === 0, 'unknown --format value: expected exit 0 (falls back to text)');

// glob (same minimal glob as security-scan.mjs)
const g = run('--glob', 'scripts/__test__/native-first-*.workflow.json', '--format', 'json');
expect(g.code === 0 && JSON.parse(g.out).summary.files === 5, 'glob: expected the 5 fixtures and exit 0');
expect(run('--glob', 'scripts/__test__/does-not-exist-*.json').code === 2, 'glob without matches: expected exit 2');

// unreadable / invalid JSON: error + exit 2, and the readable files are still reported
const tmp = mkdtempSync(join(tmpdir(), 'native-first-test-'));
try {
  const bad = join(tmp, 'bad.workflow.json');
  writeFileSync(bad, '{ not json');
  const b = run(bad);
  expect(b.code === 2 && /^error: +not valid JSON/m.test(b.out), `invalid JSON: expected exit 2 with an error line, got ${b.code}`);
  const m = run(fx('rename'), bad);
  expect(m.code === 2 && /\[Rename Fields\]/.test(m.out), 'mixed good + bad file: expected exit 2 and the good file still reported');
  const missing = run(join(tmp, 'nope.json'));
  expect(missing.code === 2 && /^error: +cannot read file/m.test(missing.out), 'missing file: expected exit 2');
  const empty = join(tmp, 'empty.workflow.json');
  writeFileSync(empty, '{}');
  const e = run(empty);
  expect(e.code === 0 && e.out.includes('未使用 Code 節點'), 'workflow without nodes: expected exit 0');
  const wrapped = join(tmp, 'wrapped.workflow.json');
  writeFileSync(wrapped, JSON.stringify({ workflow: JSON.parse(readFileSync(fx('rename'), 'utf8')) }));
  expect(run(wrapped).out.includes('Code 節點：1 個／全部 3 個'), 'wrapped { workflow: { nodes } }: should be read');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// rule table: every suggested native node type exists in the bundled 2.46.6 node catalogue
const mod = await import(pathToFileURL(checker).href);
const catalogue = join(root, 'docs', 'node-versions', '2.46.6.json');
if (existsSync(catalogue)) {
  const names = new Set(JSON.parse(readFileSync(catalogue, 'utf8')).nodes.map(n => n.name));
  for (const r of mod.RULES.filter(r => r.replaceable === 'yes')) {
    for (const t of r.types) expect(names.has(t), `rule ${r.id}: type ${t} not in n8n 2.46.6 catalogue`);
  }
}
expect(mod.RULES.filter(r => r.replaceable === 'yes').every(r => r.label), 'every suggesting rule needs a label');

// snippets: [source, expected rule id or null]
const cases = [
  ['return $input.all();', 'passthrough'],
  ["return $input.all().filter(i => i.json.active === true);", 'filter_items'],
  ["return $input.all().sort((a, b) => a.json.price - b.json.price).slice(0, 3);", 'sort'],
  ["return $input.all().slice(0, 5);", 'limit_slice'],
  ["return $input.first().json.rows.map(r => ({ json: r }));", 'split_out'],
  ["const s = $input.first().json;\nreturn [{ json: { ...s, label: String(s.name || '').trim() } }];", 'field_map'],
  ["const s = $input.first().json;\nreturn [{ json: { key: $env.DEMO_NAME, name: s.name } }];", null],
  ["const s = $input.first().json;\nreturn [{ json: { key: process.env.DEMO_NAME, name: s.name } }];", null],
  ["const store = $getWorkflowStaticData('global');\nreturn [{ json: { seen: store.seen || 0 } }];", null],
  ["const s = $input.first().json;\nif (!s.name) throw new Error('missing');\nreturn [{ json: { name: s.name } }];", null],
  ["const out = [];\nfor (const i of $input.all()) { out.push({ json: i.json }); }\nreturn out;", null],
  ["const rows = $input.all();\nreturn [{ json: { count: rows.length } }];", null],
  ["return [{ json: { a: 1 } }, { json: { a: 2 } }];", null],
  ["const s = $input.first().json;\nif (!s.ok) return [];\nreturn [{ json: { name: s.name } }];", null],
];
for (const [src, want] of cases) {
  const got = mod.analyzeCode(src).suggest?.id ?? null;
  expect(got === want, `analyzeCode: expected ${want} for a ${src.split('\n').length}-line snippet, got ${got}`);
}
const long = Array.from({ length: 40 }, (_, i) => `const v${i} = $input.first().json.f${i};`).join('\n') + "\nreturn [{ json: { v0 } }];";
expect(mod.analyzeCode(long).suggest === null, 'long snippet (over 15 lines): no suggestion expected');

if (failures.length > 0) {
  console.error(`FAIL native-first tests: ${failures.length}/${checks} check(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK native-first tests: ${checks} checks passed`);

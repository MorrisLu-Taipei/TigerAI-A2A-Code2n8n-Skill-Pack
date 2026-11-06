#!/usr/bin/env node
// Regression tests for scripts/security-scan.mjs guardrail rules (node built-ins only).
// Usage: node scripts/__test__/run-security-scan-tests.mjs

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const scanner = join(root, 'scripts', 'security-scan.mjs');
const fx = n => join(here, n);

function scan(file, ...flags) {
  const r = spawnSync(process.execPath, [scanner, file, ...flags], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const failures = [];
let checks = 0;
function expect(cond, msg) { checks++; if (!cond) failures.push(msg); }

const NEW_RULES = [
  'form:no-auth', 'tls:allow-unauthorized-certs', 'exec:execute-command', 'exec:ssh', 'file:rw-access',
  'header:hardcoded-authorization', 'ai:agent-no-guardrails', 'ai:agent-code-tool', 'error:no-handling',
];

// violations: every guardrail rule fires as a recommendation (warning); default run passes, --strict fails
const v = scan(fx('guardrail-violations.workflow.json'));
expect(v.code === 0, `violations: expected exit 0 (advisory only), got ${v.code}\n${v.out}`);
for (const r of NEW_RULES) expect(v.out.includes(`[${r}]`), `violations: rule ${r} not reported`);
expect(!/^ERROR /m.test(v.out), 'violations: guardrail rules must not produce ERROR lines');
expect(/^WARNING .*\[tls:allow-unauthorized-certs\].*recommend:/m.test(v.out), 'violations: tls should be a recommend-style warning');
expect(/^WARNING .*\[header:hardcoded-authorization\].*recommend:/m.test(v.out), 'violations: header should be a recommend-style warning');
expect(!v.out.includes('not-a-real-token'), 'violations: Authorization value leaked into output');
expect(scan(fx('guardrail-violations.workflow.json'), '--strict').code === 1, 'violations --strict: expected exit 1');

// clean: passes even with --strict
const c = scan(fx('guardrail-clean.workflow.json'), '--strict');
expect(c.code === 0, `clean --strict: expected exit 0, got ${c.code}\n${c.out}`);
expect(!/WARNING|ERROR/.test(c.out), 'clean: unexpected finding in output');

// acknowledged: warnings become ACK (with or without a note) and --strict passes
const w = scan(fx('guardrail-acknowledged.workflow.json'), '--strict');
expect(w.code === 0, `acknowledged --strict: expected exit 0, got ${w.code}\n${w.out}`);
expect(/^ACK /m.test(w.out), 'acknowledged: no ACK line in output');
expect(/ 0 warning · [1-9]\d* acknowledged/.test(w.out), 'acknowledged: Summary should show 0 warning and >0 acknowledged');
expect(/^ACK .*\[form:no-auth\].*note:public intake form/m.test(w.out), 'acknowledged: ack with a note should print the note');
expect(/^ACK .*\[exec:ssh\]  node:Remote Command$/m.test(w.out), 'acknowledged: ack without a note should be accepted');
expect(!/ignored/.test(w.out), 'acknowledged: no ack should be ignored');
const wJson = JSON.parse(scan(fx('guardrail-acknowledged.workflow.json'), '--format', 'json').out);
expect(wJson.summary.acknowledged > 0 && wJson.results[0].acknowledged.length === wJson.summary.acknowledged, 'acknowledged: json summary/results[].acknowledged mismatch');
expect(scan(fx('guardrail-acknowledged.workflow.json')).code === 0, 'acknowledged: default run expected exit 0');

// invalid acks are ignored
const b = scan(fx('guardrail-bad-acks.workflow.json'));
expect(b.code === 1, `bad-acks: expected exit 1 (jscode:dynamic-eval is a detection error), got ${b.code}`);
expect(/^ERROR .*\[jscode:dynamic-eval\]/m.test(b.out), 'bad-acks: detection error must still be reported');
expect(/^NOTE .*\[jscode:dynamic-eval\].*ack ignored: detection rule, not a recommendation/m.test(b.out), 'bad-acks: ack on detection rule should be ignored');
expect(/^NOTE .*\[tls:allow-unauthorized-certs\].*ack ignored: rule id mismatch or no such finding/m.test(b.out), 'bad-acks: ack without matching finding should be ignored');
expect(/^NOTE .*\[exec:ssh-typo\].*ack ignored: rule id mismatch or no such finding/m.test(b.out), 'bad-acks: mismatched rule id should be ignored');
expect(/^WARNING .*\[exec:ssh\]/m.test(b.out), 'bad-acks: ssh finding should stay a warning');
expect(/^ACK .*\[exec:execute-command\]/m.test(b.out), 'bad-acks: valid ack on the same fixture should still work');
expect(/ 1 acknowledged/.test(b.out), 'bad-acks: only the valid ack should be counted');

// tls / header rules are warnings: exit 0 by default, 1 with --strict
const tmp = mkdtempSync(join(tmpdir(), 'scan-test-'));
try {
  const mkWf = (nodes, pinData) => ({ name: 'tmp', settings: {}, connections: {}, nodes, ...(pinData ? { pinData } : {}) });
  const http = (name, parameters, notes) => ({
    id: name, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [0, 0], parameters,
    onError: 'continueRegularOutput', ...(notes ? { notes } : {}),
  });
  const run = (label, wfObj, ...flags) => {
    const f = join(tmp, `${label}.workflow.json`);
    writeFileSync(f, JSON.stringify(wfObj));
    return scan(f, ...flags);
  };
  const tlsWf = mkWf([http('Tls', { url: 'https://api.example.com', options: { allowUnauthorizedCerts: true } })]);
  expect(run('tls', tlsWf).code === 0, 'tls: expected exit 0 in default mode');
  expect(run('tls', tlsWf, '--strict').code === 1, 'tls --strict: expected exit 1');
  const hdrParams = { url: 'https://api.example.com', sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer literal-value-0123456789' }] } };
  const hdrWf = mkWf([http('Hdr', hdrParams)]);
  expect(run('hdr', hdrWf).code === 0, 'header: expected exit 0 in default mode');
  expect(run('hdr', hdrWf, '--strict').code === 1, 'header --strict: expected exit 1');
  const hdrAck = run('hdrack', mkWf([http('Hdr', hdrParams, 'guardrail-ack: header:hardcoded-authorization')]), '--strict');
  expect(hdrAck.code === 0 && /^ACK /m.test(hdrAck.out), 'header: ack should make --strict pass');
  const legacy = run('legacy', mkWf([http('Tls', { url: 'https://api.example.com', options: { allowUnauthorizedCerts: true } }, 'guardrail-waiver: tls:allow-unauthorized-certs -- legacy marker is no longer supported')]), '--strict');
  expect(legacy.code === 1 && !/^ACK /m.test(legacy.out), 'legacy waiver marker must not be honoured');

  // secret:* findings are detection errors; ack has no effect (key-shaped text built at runtime so none is stored in the repo)
  const secret = 'sk-' + 'A'.repeat(24);
  const s = run('secret', mkWf([{
    id: 't1', name: 'Leaky', type: 'n8n-nodes-base.set', typeVersion: 3, position: [0, 0],
    parameters: { note: secret },
    notes: 'guardrail-ack: secret:openai-key -- this should never be accepted',
  }], { Leaky: [{ json: { v: secret } }] }), '--strict');
  expect(s.code === 1, `secret: expected exit 1, got ${s.code}`);
  expect(/^ERROR .*\[secret:openai-key\]/m.test(s.out), 'secret: finding should stay an error');
  expect(/\[secret:openai-key\].*ack ignored: detection rule, not a recommendation/.test(s.out), 'secret: ack should be rejected');
  expect(!/^ACK /m.test(s.out), 'secret: nothing should be acknowledged');
  expect(/pinData/.test(s.out), 'secret: pinData should be scanned');
  expect(!s.out.includes(secret), 'secret: full secret leaked into output');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// legacy fixture and summary shape
expect(scan(fx('malicious-fixture.workflow.json')).code === 1, 'malicious-fixture: expected exit 1');
const plainV = scan(fx('guardrail-violations.workflow.json'), '--format', 'json');
expect(JSON.parse(plainV.out).summary.acknowledged === 0, 'json: summary.acknowledged should be present');
expect(!('waived' in JSON.parse(plainV.out).summary), 'json: summary.waived must be gone');

// P1: RegExp.exec is not process spawning; real spawning is
const findingsOf = (file) => JSON.parse(scan(fx(file), '--format', 'json').out).results[0].findings;
const hit = (fs, rule, node) => fs.some(f => f.rule === rule && f.where === `node:${node}`);
const rx = findingsOf('code-regex-exec.workflow.json');
expect(!rx.some(f => f.rule === 'jscode:process-spawn'), 'regex-exec: RegExp.exec must not trigger process-spawn');
expect(!rx.some(f => f.rule.startsWith('jscode:')), 'regex-exec: no jscode finding expected at all');
const ps = findingsOf('code-process-spawn.workflow.json');
for (const node of ['Require Exec', 'Destructured', 'Receiver Exec', 'Deno Run', 'Bun Spawn', 'Binding']) {
  expect(hit(ps, 'jscode:process-spawn', node), `process-spawn: "${node}" should be reported`);
}
expect(hit(ps, 'jscode:require-child-process', 'Require Exec'), 'process-spawn: require-child-process error should still fire');

// P2: toolCode / LangChain Code run through the same jscode:* rules
const ai = findingsOf('ai-code-nodes.workflow.json');
expect(hit(ai, 'jscode:require-child-process', 'Tool Code Evil'), 'ai-code: toolCode jsCode should hit require-child-process');
expect(hit(ai, 'jscode:require-child-process', 'LangChain Execute'), 'ai-code: LangChain Code execute should hit require-child-process');
expect(hit(ai, 'jscode:require-child-process', 'LangChain Supply'), 'ai-code: LangChain Code supplyData should hit require-child-process');
expect(!ai.some(f => f.where === 'node:Tool Code Python'), 'ai-code: Python toolCode is out of scope and must stay silent');
expect(!ai.some(f => f.where === 'node:LangChain Benign'), 'ai-code: benign LangChain Code must stay silent');
expect(scan(fx('ai-code-nodes.workflow.json')).code === 1, 'ai-code: expected exit 1');

if (failures.length > 0) {
  console.error(`FAIL security-scan tests: ${failures.length}/${checks} check(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK security-scan tests: ${checks} checks passed`);

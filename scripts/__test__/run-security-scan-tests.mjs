#!/usr/bin/env node
// Regression tests for scripts/security-scan.mjs guardrail rules (node built-ins only).
// Usage: node scripts/__test__/run-security-scan-tests.mjs

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const scanner = join(root, 'scripts', 'security-scan.mjs');
const fx = n => join(here, n);

function scan(file, ...flags) {
  const r = spawnSync(process.execPath, [scanner, file, ...flags], { cwd: root, encoding: 'utf8', env: { ...process.env, SKILLPACK_EGRESS_ALLOW: '' } });
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

// ---- ADR-014 reminder-only rules: egress:external-domain, impact:high-impact-node, notes:missing-change-log ----
// They are severity "info": visible, acknowledgeable, but never a failure (not even with --strict).
{
  const json = (file, ...flags) => JSON.parse(scan(file, '--format', 'json', ...flags).out);
  const hitsOf = (j, rule) => j.results[0].findings.filter(f => f.rule === rule);
  const nodesOf = (j, rule) => hitsOf(j, rule).map(f => f.where.replace(/^node:/, '')).sort();
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const runWithEnv = (file, env, ...flags) => spawnSync(process.execPath, [scanner, file, '--format', 'json', ...flags], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  const tmp2 = mkdtempSync(join(tmpdir(), 'scan-reminder-'));
  try {
    const put = (label, obj) => { const f = join(tmp2, `${label}.workflow.json`); writeFileSync(f, JSON.stringify(obj)); return f; };
    const wfOf = nodes => ({ name: 'tmp', settings: {}, connections: {}, nodes });
    const httpNode = (name, url, extra = {}) => ({ id: name, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [0, 0], parameters: { url }, onError: 'continueRegularOutput', ...extra });
    const sticky = (id, color, content) => ({ id, name: id, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, 700], parameters: { color, content } });

    // -- egress: no allow-list = list only ---------------------------------------------------------------------
    const egFile = fx('reminder-egress.workflow.json');
    const eg = json(egFile);
    const egText = scan(egFile).out;
    const egDynamic = ['Dynamic whole', 'Dynamic host', 'Fallback expression'];
    const egFixed = ['Static external', 'Wildcard sub', 'Wildcard bare', 'Allowed exact', 'Path expression', 'Literal in expression', 'Fallback expression', 'Public ip', 'Nested option', 'Tool HTTP', 'Graphql'];
    expect(same(nodesOf(eg, 'egress:external-domain'), [...new Set([...egFixed, ...egDynamic])]), `egress: wrong node set ${nodesOf(eg, 'egress:external-domain')}`);
    expect(hitsOf(eg, 'egress:external-domain').every(f => f.severity === 'info'), 'egress: severity must be info');
    const egOnly = put('egress-only', wfOf([httpNode('Fetch', 'https://only.example.invalid/x')]));
    expect(scan(egFile).code === 0 && scan(egOnly).code === 0 && scan(egOnly, '--strict').code === 0, 'egress: must never fail, not even with --strict');
    expect(/^INFO +.*\[egress:external-domain\]/m.test(egText) && !/^(?:WARNING|ERROR) .*\[egress:/m.test(egText), 'egress: text output should label it INFO');
    const sampleOf = (j, node) => hitsOf(j, 'egress:external-domain').find(f => f.where === `node:${node}`)?.sample ?? '';
    const s1 = sampleOf(eg, 'Static external');
    expect(/api\.example\.invalid/.test(s1) && /未提供允許清單，僅列出/.test(s1) && /請核准人確認這些網域是否在允許清單內/.test(s1), 'egress: reminder should list the domain, say it is only listed and ask the approver to check');
    expect(!/無法靜態判斷/.test(sampleOf(eg, 'Path expression')) && /path\.example\.invalid/.test(sampleOf(eg, 'Path expression')), 'egress: a dynamic path after a literal host is a fixed domain');
    expect(!/無法靜態判斷/.test(sampleOf(eg, 'Literal in expression')) && /lit\.example\.invalid/.test(sampleOf(eg, 'Literal in expression')), 'egress: a single quoted literal inside an expression is a fixed domain');
    for (const n of egDynamic) expect(/無法靜態判斷/.test(sampleOf(eg, n)), `egress: ${n} should say it cannot be judged statically`);
    for (const n of ['Dynamic whole', 'Dynamic host']) expect(!/外連網域/.test(sampleOf(eg, n)), `egress: ${n} must not be reported as a fixed domain`);
    expect(/fallback\.example\.invalid/.test(sampleOf(eg, 'Fallback expression')), 'egress: the literal fallback in an expression is listed too');
    for (const n of ['Localhost', 'Compose service', 'N8n self', 'Set only']) expect(!nodesOf(eg, 'egress:external-domain').includes(n), `egress: ${n} must not be reported (internal / built-in / not an HTTP node)`);
    expect(!/body\.example\.invalid/.test(egText), 'egress: URLs in request bodies are not URL parameters');
    expect(!/not-a-real-key|\/v1\/items/.test(egText), 'egress: output shows the domain only, never the path or query string');
    expect(eg.results[0].acknowledged.some(a => a.rule === 'egress:external-domain' && a.where === 'node:Acked') && !nodesOf(eg, 'egress:external-domain').includes('Acked'), 'egress: guardrail-ack should acknowledge it');
    const total = ['egress:external-domain', 'impact:high-impact-node', 'notes:missing-change-log'].reduce((n, r) => n + hitsOf(eg, r).length, 0);
    expect(eg.summary.reminders === total && total > 0, 'egress: summary.reminders should count the info findings');
    expect(/ · \d+ reminder$/m.test(egText), 'egress: text summary should end with the reminder count');

    // -- egress: allow-list (flag, file with comments, environment variable) ------------------------------------------
    const egA = json(egFile, '--egress-allow', 'allowed.example.invalid, *.svc.example.invalid,API.example.invalid');
    const left = nodesOf(egA, 'egress:external-domain');
    expect(!left.includes('Wildcard sub') && !left.includes('Allowed exact') && !left.includes('Static external'), 'allow-list: exact and wildcard matches (case-insensitive) are not reminded');
    expect(left.includes('Wildcard bare'), 'allow-list: *.svc.example.invalid does not match svc.example.invalid itself');
    expect(left.includes('Path expression') && left.includes('Public ip') && left.includes('Tool HTTP'), 'allow-list: domains outside the list are still reminded');
    expect(/外連網域不在允許清單：path\.example\.invalid/.test(sampleOf(egA, 'Path expression')), 'allow-list: message says the domain is not in the list');
    expect(egDynamic.every(n => left.includes(n) && /無法靜態判斷/.test(sampleOf(egA, n))), 'allow-list: dynamic URLs stay "cannot judge" even with a list');
    const allowFile = join(tmp2, 'allow.txt');
    writeFileSync(allowFile, '# approved egress\nallowed.example.invalid  # exact\n*.svc.example.invalid\n\n');
    const leftF = nodesOf(json(egFile, '--egress-allow-file', allowFile), 'egress:external-domain');
    expect(!leftF.includes('Allowed exact') && !leftF.includes('Wildcard sub') && leftF.includes('Static external'), 'allow-list file: comments and blank lines are ignored, only listed domains are exempt');
    const leftE = nodesOf(JSON.parse(runWithEnv(egFile, { SKILLPACK_EGRESS_ALLOW: 'allowed.example.invalid' }).stdout), 'egress:external-domain');
    expect(!leftE.includes('Allowed exact') && leftE.includes('Static external'), 'allow-list: SKILLPACK_EGRESS_ALLOW works');
    const leftEF = nodesOf(JSON.parse(runWithEnv(egFile, { SKILLPACK_EGRESS_ALLOW: 'allowed.example.invalid' }, '--egress-allow', 'api.example.invalid').stdout), 'egress:external-domain');
    expect(leftEF.includes('Allowed exact') && !leftEF.includes('Static external'), 'allow-list: the flag wins over the environment variable');
    expect(scan(egFile, '--egress-allow').code === 2 && scan(egFile, '--egress-allow-file', join(tmp2, 'missing.txt')).code === 2, 'allow-list: a missing value or unreadable file is a usage error (exit 2)');
    expect(scan(egOnly, '--egress-allow', 'a.example.invalid', '--strict').code === 0, 'allow-list: still never fails');

    // -- egress: internal ranges are built at run time so no private address is stored in the repo ------------------------
    const ip = (...p) => p.join('.');
    const internal = [ip(10, 1, 2, 3), ip(172, 16, 0, 9), ip(172, 31, 255, 1), ip(192, 168, 5, 6), ip(127, 0, 0, 2), ip(169, 254, 1, 1), ip(100, 64, 0, 1),
      '[::1]', '[fd00::1]', 'db.internal', 'svc.local', 'api.svc.cluster.local', 'gateway.lan', 'LOCALHOST'];
    const outside = [ip(172, 32, 0, 1), ip(172, 15, 0, 1), ip(100, 63, 0, 1), ip(100, 128, 0, 1), ip(8, 8, 8, 8), 'internal.example.invalid', 'locally.example.invalid'];
    const mixed = put('internal-ranges', wfOf([...internal.map((h, i) => httpNode(`In ${i}`, `http://${h}:8080/x`)), ...outside.map((h, i) => httpNode(`Out ${i}`, `https://${h}/x`))]));
    expect(same(nodesOf(json(mixed), 'egress:external-domain'), outside.map((_, i) => `Out ${i}`)), `egress ranges: internal hosts skipped, near-miss public hosts reported (got ${nodesOf(json(mixed), 'egress:external-domain')})`);
    const leak = scan(put('leak', wfOf([httpNode('Userinfo', 'https://someone:not-a-real-pw@basic.example.invalid:8443/p?token=not-a-real-token'), httpNode('Odd host', 'https://ex_ample.invalid/x')]))).out;
    const leakReminders = leak.split('\n').filter(l => /\[egress:external-domain\]/.test(l)).join('\n');
    expect(/basic\.example\.invalid/.test(leakReminders) && !/not-a-real-pw|not-a-real-token|8443|someone/.test(leakReminders), 'egress: userinfo, port and query never appear in the reminder');
    expect(/主機名稱含特殊字元/.test(leakReminders) && !/ex_ample/.test(leakReminders), 'egress: odd host names are not echoed');

    // -- impact: table vs. catalogs, then each class -------------------------------------------------------------------
    const catalogs = ['2.37.3', '2.44.6', '2.46.6'].map(v => new Set(JSON.parse(readFileSync(join(root, 'docs', 'node-versions', `${v}.json`), 'utf8')).nodes.map(n => n.name)));
    const hiType = {
      mail: ['n8n-nodes-base.emailSend', 'n8n-nodes-base.emailSendTool', 'n8n-nodes-base.mailgun', 'n8n-nodes-base.gmail', 'n8n-nodes-base.gmailTool', 'n8n-nodes-base.microsoftOutlook', 'n8n-nodes-base.microsoftOutlookTool', 'n8n-nodes-base.sendGrid', 'n8n-nodes-base.mailjet', 'n8n-nodes-base.mandrill', 'n8n-nodes-base.sendInBlue'],
      db: ['n8n-nodes-base.postgres', 'n8n-nodes-base.postgresTool', 'n8n-nodes-base.mySql', 'n8n-nodes-base.mongoDb', 'n8n-nodes-base.redis', 'n8n-nodes-base.microsoftSql', 'n8n-nodes-base.oracleDatabase', 'n8n-nodes-base.snowflake', 'n8n-nodes-base.crateDb', 'n8n-nodes-base.questDb', 'n8n-nodes-base.timescaleDb', 'n8n-nodes-base.supabase', 'n8n-nodes-base.elasticsearch', 'n8n-nodes-base.nocoDb', 'n8n-nodes-base.baserow', 'n8n-nodes-base.awsDynamoDb'],
      http: ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.httpRequestTool', '@n8n/n8n-nodes-langchain.toolHttpRequest'],
      cmd: ['n8n-nodes-base.ssh'],
    };
    for (const t of Object.values(hiType).flat()) expect(catalogs.every(c => c.has(t)), `impact: ${t} is not in every docs/node-versions catalog`);
    expect(catalogs.every(c => !c.has('n8n-nodes-base.executeCommand')), 'impact: executeCommand is absent from the default catalogs; it stays because exec:execute-command already uses that type');
    const tableNodes = [
      ...hiType.mail.map(t => ({ type: t, parameters: /emailSend|mailgun/.test(t) ? {} : { operation: 'send' } })),
      ...hiType.db.map(t => ({ type: t, parameters: { operation: 'insert' } })),
      ...hiType.http.map(t => ({ type: t, parameters: { url: 'http://localhost:1/', method: 'POST' } })),
      ...hiType.cmd.map(t => ({ type: t, parameters: {} })),
      { type: 'n8n-nodes-base.executeCommand', parameters: {} },
    ].map((n, i) => ({ id: `t${i}`, name: `T${i} ${n.type}`, typeVersion: 1, position: [0, 0], ...n }));
    expect(same(nodesOf(json(put('impact-table', wfOf(tableNodes))), 'impact:high-impact-node'), tableNodes.map(n => n.name)), 'impact: every type in the table should be reported');
    const notHigh = ['n8n-nodes-base.gmailHitlTool', 'n8n-nodes-base.emailSendHitlTool', 'n8n-nodes-base.microsoftOutlookHitlTool', 'n8n-nodes-base.slack', 'n8n-nodes-base.googleSheets', 'n8n-nodes-base.graphql']
      .map((t, i) => ({ id: `n${i}`, name: `N${i}`, type: t, typeVersion: 1, position: [0, 0], parameters: { operation: 'send', method: 'POST' } }));
    expect(nodesOf(json(put('impact-not', wfOf(notHigh))), 'impact:high-impact-node').length === 0, 'impact: approval (Hitl) tools, other SaaS nodes and GraphQL are not listed');

    const imFile = fx('reminder-impact.workflow.json');
    const im = json(imFile);
    const imHit = ['Gmail send', 'Gmail send and wait', 'Email send', 'Outlook reply', 'Postgres insert', 'Postgres delete', 'Postgres query', 'Postgres tool update', 'Postgres expression',
      'Mongo update', 'Redis set', 'Http post', 'Http put lower', 'Http patch expr mode', 'Http delete', 'Http method expression', 'Http v1 legacy', 'Tool HTTP post', 'Run command', 'Remote command'];
    expect(same(nodesOf(im, 'impact:high-impact-node'), imHit), `impact fixture: wrong node set (${nodesOf(im, 'impact:high-impact-node')})`);
    for (const n of ['Gmail get all', 'Gmail default', 'Gmail approval tool', 'Outlook get', 'Postgres select', 'Postgres default', 'MySql select', 'Mongo find', 'Redis get', 'Http get', 'Http default'])
      expect(!nodesOf(im, 'impact:high-impact-node').includes(n), `impact fixture: ${n} must not be reported`);
    expect(im.results[0].acknowledged.some(a => a.rule === 'impact:high-impact-node' && a.where === 'node:Redis publish acked'), 'impact fixture: guardrail-ack should acknowledge it');
    const sampleI = node => hitsOf(im, 'impact:high-impact-node').find(f => f.where === `node:${node}`)?.sample ?? '';
    expect(/寄信/.test(sampleI('Email send')) && /POST/.test(sampleI('Http post')) && /deleteTable/.test(sampleI('Postgres delete')) && /Execute Command/.test(sampleI('Run command')), 'impact fixture: reason text names the action');
    expect(/請核准人在工單上特別確認/.test(sampleI('Email send')), 'impact fixture: reminder asks the approver to confirm');
    expect(hitsOf(im, 'impact:high-impact-node').every(f => f.severity === 'info'), 'impact fixture: severity must be info');
    expect(scan(imFile).code === 0, 'impact fixture: default run exits 0');
    expect(scan(imFile, '--strict').code === 1 && hitsOf(im, 'exec:execute-command').length === 1, 'impact fixture: --strict fails only because of the older exec:* warnings');
    const infoOnly = put('impact-info-only', wfOf([{ id: 'p', name: 'Send mail', type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: [0, 0], parameters: {}, onError: 'continueRegularOutput' }]));
    expect(scan(infoOnly, '--strict').code === 0 && /^INFO /m.test(scan(infoOnly).out), 'impact: an info-only workflow passes --strict and prints INFO');
    const execAck = json(put('impact-ack-scope', wfOf([{ id: 'x', name: 'Run', type: 'n8n-nodes-base.executeCommand', typeVersion: 1, position: [0, 0], parameters: {}, notes: 'guardrail-ack: exec:execute-command' }])));
    expect(execAck.results[0].acknowledged.length === 1 && hitsOf(execAck, 'impact:high-impact-node').length === 1, 'impact: an ack for exec:execute-command does not silence impact:high-impact-node');

    // -- change log ----------------------------------------------------------------------------------------------------
    expect(hitsOf(json(fx('reminder-change-log-ok.workflow.json')), 'notes:missing-change-log').length === 0, 'change log: a filled-in table is not reminded');
    const missFile = fx('reminder-change-log-missing.workflow.json');
    const miss = json(missFile);
    const m1 = hitsOf(miss, 'notes:missing-change-log');
    expect(m1.length === 1 && m1[0].severity === 'info' && m1[0].where === 'workflow' && /沒有「修改記錄」段/.test(m1[0].sample), 'change log: a Layer 3 note without the section gives one workflow-level info reminder');
    expect(scan(missFile).code === 0 && scan(missFile, '--strict').code === 0, 'change log: never fails');
    expect(hitsOf(json(fx('reminder-no-layer3.workflow.json')), 'notes:missing-change-log').length === 0, 'change log: no Layer 3 note at all gives nothing extra');
    const row = '| 2026-11-07 | 建立 | AI | 依需求產生 |';
    const variants = [
      ['bullet list', '**修改記錄**\n- 2026-11-07 建立（AI，依需求產生）', 0],
      ['English heading', '#### Change log\n| Date | Summary | By | Why |\n|---|---|---|---|\n| 2026-11-07 | Created | AI | first version |', 0],
      ['Changelog one word', '### Changelog\n1. 2026-11-07 created by AI', 0],
      ['alt spelling', `**修改紀錄**\n${row}`, 0],
      ['heading with suffix', `**修改記錄（Change log）**\n${row}`, 0],
      ['emoji heading', `📝 **修改記錄**\n${row}`, 0],
      ['log followed by other sections', `**修改記錄**\n${row}\n\n**已知限制**\n- 無`, 0],
      ['heading only', '**修改記錄**\n\n**已知限制**\n- 無', 'empty'],
      ['header row only', '**修改記錄**\n| 日期 | 變更摘要 | 提出者 | 原因 |\n|---|---|---|---|', 'empty'],
      ['placeholder row', '**修改記錄**\n| YYYY-MM-DD | 建立 | AI | 原因 |', 'empty'],
      ['row in a later section', `**修改記錄**\n\n**已知限制**\n${row}`, 'empty'],
      ['date without a row marker', '**修改記錄**\n建立於 2026-11-07', 'empty'],
      ['mention only', '這裡沒有修改記錄，也沒有 change log 欄位', 'none'],
      ['sentence starting with the words', '修改記錄見 git 歷史', 'none'],
      ['nothing', '### 🤖 AI 實作說明\n**參考來源**\n- 無', 'none'],
    ];
    for (const [label, content, want] of variants) {
      const hit = hitsOf(json(put(`cl-${label.replace(/\W+/g, '-')}`, wfOf([sticky('l3', 5, content)]))), 'notes:missing-change-log');
      if (want === 0) expect(hit.length === 0, `change log (${label}): should be accepted`);
      else expect(hit.length === 1 && (want === 'empty' ? /沒有任何一列資料/.test(hit[0].sample) : /沒有「修改記錄」段/.test(hit[0].sample)), `change log (${label}): expected the "${want}" reminder, got ${JSON.stringify(hit.map(h => h.sample))}`);
    }
    expect(hitsOf(json(put('cl-layer1', wfOf([sticky('a', 4, `**修改記錄**\n${row}`)]))), 'notes:missing-change-log').length === 0, 'change log: only Layer 3 (color 5) notes are checked');
    expect(hitsOf(json(put('cl-two', wfOf([sticky('a', 5, 'no log here'), sticky('b', 5, `**修改記錄**\n${row}`)]))), 'notes:missing-change-log').length === 0, 'change log: with several Layer 3 notes one filled-in log is enough');
    expect(hitsOf(json(put('cl-color-string', wfOf([sticky('a', '5', 'no log')]))), 'notes:missing-change-log').length === 1, 'change log: color "5" as a string is still Layer 3');
    const ackJ = json(put('cl-ack', wfOf([sticky('a', 5, 'no log here'), { id: 't', name: 'Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {}, notes: 'guardrail-ack: notes:missing-change-log -- tracked in the ticket' }])));
    expect(hitsOf(ackJ, 'notes:missing-change-log').length === 0 && ackJ.results[0].acknowledged.some(a => a.rule === 'notes:missing-change-log'), 'change log: guardrail-ack on a node acknowledges the workflow-level reminder');
    const stray = scan(put('stray-ack', wfOf([{ id: 'x', name: 'Plain', type: 'n8n-nodes-base.set', typeVersion: 3, position: [0, 0], parameters: {}, notes: 'guardrail-ack: egress:external-domain' }]))).out;
    expect(/^NOTE .*\[egress:external-domain\].*ack ignored: rule id mismatch or no such finding/m.test(stray), 'ack: a stray ack for a new rule produces a NOTE');

    // -- output formats ------------------------------------------------------------------------------------------------
    const md = scan(missFile, '--format', 'markdown').out;
    expect(md.includes('ℹ️') && /1 reminder/.test(md) && md.includes('**info** `notes:missing-change-log`'), 'markdown: an info-only file uses the info icon and label');
    expect(json(missFile).summary.reminders === 1, 'json: summary.reminders is present');
    expect(!/^ERROR /m.test(egText + scan(imFile).out), 'reminder rules never produce ERROR lines');
  } finally {
    rmSync(tmp2, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(`FAIL security-scan tests: ${failures.length}/${checks} check(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK security-scan tests: ${checks} checks passed`);

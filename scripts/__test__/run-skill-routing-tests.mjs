#!/usr/bin/env node
// Keeps the skill manifest, the install scripts, and the n8n-skill-router in sync.
// A skill missing from any of them is never installed or never routed to, and nothing else reports it.
import { existsSync, mkdtempSync, readFileSync, unlinkSync, rmdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkRelease } from '../ci/check-release-evidence.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => readFileSync(join(root, rel), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const ROUTER = 'n8n-skill-router';
const failures = [];
let checks = 0;
const expect = (ok, msg) => { checks++; if (!ok) failures.push(msg); };

const plugin = JSON.parse(read('plugin.json'));
const manifest = plugin.skills.map(s => basename(s.path));
const manifestSet = new Set(manifest);

expect(manifestSet.size === manifest.length, 'plugin.json has duplicate skill names');
expect(manifestSet.has(ROUTER), `plugin.json is missing ${ROUTER}`);
for (const s of plugin.skills) expect(existsSync(join(root, s.path, 'SKILL.md')), `missing SKILL.md: ${s.path}`);

const listFrom = (text, pattern) => {
  const m = text.match(pattern);
  return m ? m[1].split(/[\s,]+/).map(t => t.replace(/'/g, '')).filter(Boolean) : null;
};
const sameSet = (name, list) => {
  expect(list !== null, `${name}: skill list not found`);
  if (!list) return;
  const set = new Set(list);
  expect(set.size === list.length, `${name}: duplicate entries`);
  for (const s of manifest) expect(set.has(s), `${name}: missing ${s}`);
  for (const s of set) expect(manifestSet.has(s), `${name}: not in plugin.json: ${s}`);
};

for (const f of ['install.sh', 'uninstall.sh']) {
  const t = read(f);
  sameSet(f, [...(listFrom(t, /VENDOR_SKILLS=\(([\s\S]*?)\)/) ?? []), ...(listFrom(t, /TIGERAI_SKILLS=\(([\s\S]*?)\)/) ?? [])]);
}
for (const f of ['install.ps1', 'uninstall.ps1']) {
  const t = read(f);
  sameSet(f, [...(listFrom(t, /\$VendorSkills = @\(([\s\S]*?)\)/) ?? []), ...(listFrom(t, /\$TigerAISkills = @\(([\s\S]*?)\)/) ?? [])]);
}

for (const f of ['SKILL.md', 'SKILL.en.md']) {
  const rel = `skills/tigerai/${ROUTER}/${f}`;
  const t = read(rel);
  expect(new RegExp(`^---\\nname: ${ROUTER}\\n`).test(t), `${rel}: frontmatter name mismatch`);
  expect(t.includes('(references/pipeline.json)'), `${rel}: missing link to pipeline source`);
}

for (const f of ['SKILL.md', 'SKILL.en.md']) {
  const rel = `skills/tigerai/n8n-api-bridge/${f}`;
  const text = read(rel);
  expect(text.includes(`\`${ROUTER}\``), `${rel}: does not point to ${ROUTER}`);
  const writeGate = text.split(/^### 6\.1 /m)[1]?.split(/^## /m)[0] ?? '';
  expect(f === 'SKILL.md' ? writeGate.includes('輪替') && writeGate.includes('不再使用') :
    writeGate.includes('rotate') && writeGate.includes('do not reuse'), `${rel}: missing exposed-key handling in the write gate`);
}

const pipeline = JSON.parse(read(`skills/tigerai/${ROUTER}/references/pipeline.json`));
expect(pipeline.schemaVersion === 1 && pipeline.entrypoint === ROUTER, 'invalid pipeline entrypoint');
const stageIds = pipeline.stages.map(stage => stage.id);
expect(stageIds.join(' ') === 'P1 P2 E1 E2 E3 E4 R1 R2 R3 R4', 'wrong stage order');
const stageSkills = new Set(pipeline.stages.flatMap(stage => stage.skills));
for (const skill of manifest) if (skill !== ROUTER) expect(stageSkills.has(skill), `no stage for ${skill}`);
for (const stage of pipeline.stages) {
  expect(Boolean(stage.exit), `${stage.id}: missing exit condition`);
  for (const skill of stage.skills) expect(manifestSet.has(skill), `${stage.id}: unknown skill ${skill}`);
}
for (const [name, route] of Object.entries(pipeline.routes)) {
  const indices = route.stages.map(stage => stageIds.indexOf(stage));
  expect(indices.length > 0 && indices.every((index, pos) => index >= 0 && (!pos || index > indices[pos - 1])), `${name}: invalid stage sequence`);
  for (const skill of [...route.skills, ...(route.choose ?? [])]) {
    expect(stageSkills.has(skill), `${name}: unknown skill ${skill}`);
    expect(pipeline.stages.some(stage => route.stages.includes(stage.id) && stage.skills.includes(skill)), `${name}: ${skill} outside its stages`);
  }
  if (name !== 'publish') expect(!route.stages.includes('R3') && ['read-only', 'draft'].includes(route.mode), `${name}: unexpected publication authority`);
}
expect(pipeline.routes.diagnose.mode === 'read-only', 'diagnosis must be read-only');
expect(pipeline.routes.publish.mode === 'approval-required' && pipeline.routes.publish.stages.join(' ') === 'R1 R2 R3 R4', 'publish must go through validation, security and approval');
for (const [name, skills] of Object.entries({ ...pipeline.adapters, ...pipeline.signals })) {
  expect(skills.length > 0 && skills.every(skill => stageSkills.has(skill)), `${name}: unknown adapter or signal skills`);
}

const target = { environment: 'staging', instanceId: 'lab', workflowId: 'fixture', versionId: 'version-1', n8nVersion: '2.46.6' };
const bytes = Buffer.from(JSON.stringify({ id: target.workflowId, versionId: target.versionId, nodes: [{}] }));
const now = Date.UTC(2026, 10, 24);
const artifact = { ...target, sha256: createHash('sha256').update(bytes).digest('hex') };
const evidence = {
  R1: { ...artifact, status: 'pass', evidenceId: 'static-report' },
  R2: { ...artifact, status: 'pass', evidenceId: 'security-report' },
  approval: { ...artifact, status: 'approved', action: 'publish', approvalId: 'test-approval', expiresAt: '2026-11-25T00:00:00Z' },
};
expect(checkRelease(bytes, evidence, target, now).errors.length === 0, 'matching evidence should pass the offline check');
for (const [label, candidate, records, expectedTarget, timestamp] of [
  ['missing validation', bytes, { ...evidence, R1: undefined }, target, now],
  ['incomplete review', bytes, { ...evidence, R2: { ...evidence.R2, status: 'incomplete' } }, target, now],
  ['review for another artifact', bytes, { ...evidence, R2: { ...evidence.R2, sha256: '0'.repeat(64) } }, target, now],
  ['missing approval', bytes, { ...evidence, approval: undefined }, target, now],
  ['approval for another action', bytes, { ...evidence, approval: { ...evidence.approval, action: 'update' } }, target, now],
  ['wrong instance', bytes, evidence, { ...target, instanceId: 'other' }, now],
  ['wrong environment', bytes, evidence, { ...target, environment: 'production' }, now],
  ['wrong runtime version', bytes, evidence, { ...target, n8nVersion: '2.44.6' }, now],
  ['wrong workflow', bytes, evidence, { ...target, workflowId: 'other' }, now],
  ['wrong candidate version', bytes, evidence, { ...target, versionId: 'version-2' }, now],
  ['changed candidate bytes', Buffer.concat([bytes, Buffer.from('\n')]), evidence, target, now],
  ['expired approval', bytes, evidence, target, Date.UTC(2026, 10, 25)],
  ['invalid expiry date', bytes, { ...evidence, approval: { ...evidence.approval, expiresAt: '2027-02-30T00:00:00Z' } }, target, now],
  ['empty workflow', Buffer.from('{}'), evidence, target, now],
  ['malformed workflow', Buffer.from('not JSON'), evidence, target, now],
]) {
  expect(checkRelease(candidate, records, expectedTarget, timestamp).errors.length > 0, `release evidence must block: ${label}`);
}

const releaseTemp = mkdtempSync(join(tmpdir(), 'n8n-release-evidence-'));
const candidatePath = join(releaseTemp, 'candidate.workflow.json');
const evidencePath = join(releaseTemp, 'release-evidence.json');
try {
  writeFileSync(candidatePath, bytes);
  const cliEvidence = { ...evidence, approval: { ...evidence.approval, expiresAt: new Date(Date.now() + 3600000).toISOString() } };
  const runCli = (...args) => spawnSync(process.execPath, [
    join(root, 'scripts/ci/check-release-evidence.mjs'), ...args,
  ], { encoding: 'utf8', timeout: 10000 });
  const args = [candidatePath, evidencePath, target.environment, target.instanceId, target.workflowId, target.versionId, target.n8nVersion];
  writeFileSync(evidencePath, JSON.stringify(cliEvidence));
  const matching = runCli(...args);
  expect(matching.status === 0 && matching.stdout.includes('offline only'), 'CLI: matching evidence should exit 0');
  writeFileSync(evidencePath, JSON.stringify({ ...cliEvidence, approval: undefined }));
  const blocked = runCli(...args);
  expect(blocked.status === 1 && blocked.stderr.includes('APPROVAL_MISSING_EXPIRED_OR_MISMATCHED'), 'CLI: missing approval should exit 1');
  const invalid = runCli(...args.slice(0, -1));
  expect(invalid.status === 2 && invalid.stderr.includes('Usage:'), 'CLI: invalid arguments should exit 2');
} finally {
  for (const file of [candidatePath, evidencePath]) if (existsSync(file)) unlinkSync(file);
  rmdirSync(releaseTemp);
}

if (failures.length) {
  console.error(`FAIL skill-routing tests: ${failures.length}/${checks} check(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK skill-routing tests: ${checks} checks passed`);

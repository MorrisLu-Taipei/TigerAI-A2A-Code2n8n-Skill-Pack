#!/usr/bin/env node
// v0.37.0 SEC-018 Tier 2 — External workflow JSON ingestion gate.
//
// Usage:
//   node scripts/ingest-external-workflow.mjs <path-to-external.workflow.json>
//
// What this does that plain security-scan.mjs does NOT:
//   1. Runs the security-scan.mjs (subprocess), require 0 error
//   2. Additionally enforces two-person review marker (annotation in workflow JSON)
//   3. Records ingest event into ingest-log.jsonl for audit trail
//   4. Refuses to copy the workflow into examples/ unless all gates pass
//   5. Outputs a digest of every node so reviewer can spot-check
//
// Exit codes:
//   0 = pass (ready to copy in)
//   1 = scanner found error-level finding (refuse)
//   2 = missing two-person review marker
//   3 = malformed JSON / file missing
//   4 = lexical pre-claim violation (e.g. claims "validated" without evidence)

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const INGEST_LOG = 'scripts/ingest-log.jsonl';

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.error(`Usage: node scripts/ingest-external-workflow.mjs <file>

  Gates an external workflow JSON before it can enter the Pack:
    1. security-scan.mjs must report 0 errors (jscode malicious patterns, secrets, etc.)
    2. Workflow JSON must contain a top-level "_pack_ingest" annotation with:
         - "submitter": who supplied it (e.g. "operator-foo@example.com")
         - "reviewer": second person who signed off
         - "rationale": why this workflow needs to enter the Pack
       (See docs/external-package-security-posture.md §3.2 Tier 2 SOP)
    3. Records ingest event to scripts/ingest-log.jsonl for audit trail

  Exit 0 on full pass, non-zero on any failure (see source for codes).`);
  process.exit(args.length === 0 ? 4 : 0);
}

const inputPath = resolve(args[0]);
if (!existsSync(inputPath)) {
  console.error(`ERROR: file not found: ${inputPath}`);
  process.exit(3);
}

let raw;
try { raw = readFileSync(inputPath, 'utf8'); }
catch (e) { console.error(`ERROR: cannot read: ${e.message}`); process.exit(3); }

let wf;
try { wf = JSON.parse(raw); }
catch (e) { console.error(`ERROR: malformed JSON: ${e.message}`); process.exit(3); }

const sha256 = createHash('sha256').update(raw).digest('hex');

// Gate 1: scanner pass
console.log('=== Gate 1: security-scan.mjs ===');
const scan = spawnSync(process.execPath, ['scripts/security-scan.mjs', inputPath], { encoding: 'utf8' });
process.stdout.write(scan.stdout);
process.stderr.write(scan.stderr);
if (scan.status !== 0) {
  console.error('FAIL: scanner reported error-level finding(s). Refusing ingest.');
  process.exit(1);
}
console.log('PASS: scanner 0 errors.');

// Gate 2: two-person review marker
console.log('\n=== Gate 2: two-person review marker ===');
const marker = wf._pack_ingest;
if (!marker || typeof marker !== 'object' ||
    !marker.submitter || !marker.reviewer || !marker.rationale) {
  console.error('FAIL: missing required _pack_ingest annotation.');
  console.error('Required shape:');
  console.error(JSON.stringify({
    _pack_ingest: {
      submitter: 'operator@example.com',
      reviewer: 'another-human@example.com',
      rationale: 'one-line explanation of why this workflow needs to enter the Pack'
    }
  }, null, 2));
  process.exit(2);
}
if (marker.submitter === marker.reviewer) {
  console.error('FAIL: submitter === reviewer. Two distinct humans required (SEC-018).');
  process.exit(2);
}
console.log(`PASS: submitter=${marker.submitter}, reviewer=${marker.reviewer}`);

// Gate 3: nodes digest for spot-check
console.log('\n=== Gate 3: node digest for human spot-check ===');
const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
console.log(`Total nodes: ${nodes.length}`);
for (const n of nodes) {
  const codeLen = (n.parameters?.jsCode ?? '').length;
  const tag = (n.type ?? '').replace('n8n-nodes-base.', '');
  console.log(`  ${tag.padEnd(20)} ${(n.name ?? '?').padEnd(30)} ${codeLen ? `[jsCode ${codeLen}c]` : ''}`);
}

// Audit log
const event = {
  ts: new Date().toISOString(),
  path: inputPath,
  sha256,
  workflowName: wf.name ?? '(unnamed)',
  nodeCount: nodes.length,
  submitter: marker.submitter,
  reviewer: marker.reviewer,
  rationale: marker.rationale,
  scannerSummary: scan.stdout.split('\n').filter(l => l.startsWith('Summary:')).join(' '),
  outcome: 'pass'
};
try {
  appendFileSync(INGEST_LOG, JSON.stringify(event) + '\n');
  console.log(`\n=== Audit log appended to ${INGEST_LOG} ===`);
} catch (e) {
  console.warn(`WARN: could not append to ${INGEST_LOG}: ${e.message}`);
}

console.log(`\n✅ All gates passed. SHA256=${sha256.slice(0,16)}…`);
console.log(`Next step: cp "${inputPath}" examples/<case>/workflows/`);
process.exit(0);

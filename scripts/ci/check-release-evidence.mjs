import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value);
const sameCandidate = (record, candidate) => record && Object.keys(candidate).every(key => record[key] === candidate[key]);

export function checkRelease(workflowBytes, evidence, target, now = Date.now()) {
  const errors = [];
  const digest = createHash('sha256').update(workflowBytes).digest('hex');
  let workflow;
  try {
    workflow = JSON.parse(workflowBytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    return { digest, errors: ['INVALID_WORKFLOW_JSON'] };
  }
  if (!Array.isArray(workflow?.nodes) || workflow.nodes.length === 0) errors.push('INVALID_WORKFLOW');
  if (!identifier(target?.environment) || !identifier(target?.instanceId) ||
      !identifier(target?.workflowId) || !identifier(target?.versionId) ||
      typeof target?.n8nVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(target.n8nVersion)) {
    errors.push('INVALID_TARGET');
    return { digest, errors };
  }
  if (workflow?.id !== target.workflowId || workflow?.versionId !== target.versionId) errors.push('WORKFLOW_ID_OR_VERSION_MISMATCH');
  const candidate = {
    environment: target.environment, instanceId: target.instanceId, workflowId: target.workflowId,
    versionId: target.versionId, n8nVersion: target.n8nVersion, sha256: digest,
  };
  for (const stage of ['R1', 'R2']) {
    const check = evidence?.[stage];
    if (!sameCandidate(check, candidate) || check.status !== 'pass' || !identifier(check.evidenceId)) {
      errors.push(stage + '_MISSING_FAILED_OR_MISMATCHED');
    }
  }
  const approval = evidence?.approval;
  const expiry = typeof approval?.expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(approval.expiresAt)
    ? approval.expiresAt.replace(/(?<!\.\d{3})Z$/, '.000Z') : '';
  const deadline = Date.parse(expiry);
  const validExpiry = Number.isFinite(deadline) && new Date(deadline).toISOString() === expiry;
  if (!sameCandidate(approval, candidate) || approval.action !== 'publish' || approval.status !== 'approved' ||
      !identifier(approval.approvalId) || !validExpiry || !(deadline > now)) {
    errors.push('APPROVAL_MISSING_EXPIRED_OR_MISMATCHED');
  }
  return { digest, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 7) {
    console.error('Usage: node scripts/ci/check-release-evidence.mjs <workflow.json> <evidence.json> <environment> <instance-id> <workflow-id> <version-id> <n8n-version>');
    process.exitCode = 2;
    return;
  }
  const [workflowPath, evidencePath, environment, instanceId, workflowId, versionId, n8nVersion] = args;
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, ''));
    const result = checkRelease(readFileSync(workflowPath), evidence, { environment, instanceId, workflowId, versionId, n8nVersion });
    if (result.errors.length) {
      console.error('BLOCKED: ' + result.errors.join(', '));
      process.exitCode = 1;
    } else {
      console.log('Evidence matches candidate ' + result.digest + '; offline only, not authorization or publication.');
    }
  } catch {
    console.error('Could not read workflow or evidence JSON.');
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

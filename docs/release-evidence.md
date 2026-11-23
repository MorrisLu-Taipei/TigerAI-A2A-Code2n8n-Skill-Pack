# Offline release evidence check

Use this check when preparing a workflow release. It reads two local files; it does not connect to n8n, generate approval, or publish. The normal static checks still apply.

1. Export the exact candidate with its workflow `id` and `versionId`. Keep that exact file for checks and handoff. Do not re-export or reformat it after approval. If a new export is needed, verify its bytes against the approved artifact; changed bytes require new checks and approval.
2. R1 is the static validation result for that artifact and the target n8n version. R2 is the security review of the same artifact. Keep the real reports in the release system and record their evidence IDs. An incomplete check is not a pass.
3. Obtain a separate approval for that version and action using the authorized deployment system. The system must verify the approval itself, recheck the candidate against the live target, prevent stale or replayed approval from releasing a change, and verify the actual published version afterward. If it cannot bind the operation to that exact candidate, stop.

The evidence JSON has three records: `R1`, `R2`, and `approval`. Each contains `environment`, `instanceId`, `workflowId`, `versionId`, `n8nVersion`, and `sha256` (lowercase hex over the exact file bytes). R1/R2 additionally require `status: "pass"` and an `evidenceId`. The approval record additionally requires `action: "publish"`, `status: "approved"`, an `approvalId`, and a future UTC `expiresAt` timestamp. IDs use letters, numbers, underscores, dots, hyphens, or colons.

```sh
node scripts/ci/check-release-evidence.mjs candidate.workflow.json release-evidence.json staging staging-instance workflow-id version-id 2.46.6
```

Exit 0 means the supplied records match; exit 1 means the offline comparison failed; exit 2 means invalid command usage or unreadable input. The result is evidence for handoff, not enforcement at the n8n API. A matching but self-authored JSON file is **not proof** that anybody approved the release or that R1/R2 ran. Do not place approval evidence, secrets, or deployment details in the public repo.

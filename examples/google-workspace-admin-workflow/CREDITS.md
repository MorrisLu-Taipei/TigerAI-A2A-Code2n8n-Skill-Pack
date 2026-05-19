# Credits / 致謝

## Original work / 原始作品

**Project**: google-workspace-admin-project-workflow
**Author / GitHub**: [mihozip](https://github.com/mihozip)
**Repository**: <https://github.com/mihozip/google-workspace-admin-project-workflow>
**Language**: Google Apps Script (`.gs`) + HTML / PHP utilities
**Purpose**: Semi-automatic administrative project initiator for K-12 / school environments, integrating Google Workspace (Forms, Sheets, Drive, Docs, Calendar, Gmail) with NotebookLM and Gemini workflows.

## This port / 本移植

**Location**: `examples/google-workspace-admin-workflow/`
**Platform**: n8n (self-hosted or cloud)
**Scope**: Full behavioural 1:1 port of the two Apps Script trigger functions:

- `setupAdminWorkflow` (one-time bootstrap of folders + master sheet)
- `onFormSubmit` → project starter automation
- `onMilestoneFormSubmit` → milestone date addition automation

All field names, validation lists, sheet headers, folder structure (`00_原始公文與附件` through `99_系統產生文件`), default task rows, checklist rows, and reminder offsets are preserved verbatim from the upstream source.

## License / 授權

This port inherits the upstream license. Refer to <https://github.com/mihozip/google-workspace-admin-project-workflow/blob/main/LICENSE> for terms.

If you use this n8n port, please:

1. Keep this `CREDITS.md` in distributions.
2. Star / cite the upstream repository.
3. Report bugs that originate from the **logic** to upstream; bugs specific to the **n8n implementation** to this repository.

## Field-level provenance / 欄位來源

Every form field, sheet header, default task, and checklist row in this port is sourced directly from `src/Code.gs` of the upstream repo. See `docs/field-mapping.md` for the line-by-line mapping from Apps Script symbols to n8n nodes.

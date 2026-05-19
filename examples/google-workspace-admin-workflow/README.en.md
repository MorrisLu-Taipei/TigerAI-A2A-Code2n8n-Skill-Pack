# Google Workspace Admin Project Workflow (n8n port)

> 🌐 **English** | [繁體中文](README.md)

A complete n8n port of [mihozip/google-workspace-admin-project-workflow](https://github.com/mihozip/google-workspace-admin-project-workflow), originally written in Google Apps Script.

The original is a semi-automatic "admin project initiator" for school administrators and educators: submit one form, and the system creates a project folder, project record Doc, task tracking Sheet, deliverable checklist, Calendar reminders, master control Sheet row, and a notification email. This directory reproduces that logic 1:1 in n8n.

---

## Two flows

| # | Name | Trigger | Auto outputs |
| --- | --- | --- | --- |
| 1 | **Project Starter** (公文專案啟動表) | A new official document / task arrives | Drive project folder (11 subfolders) + Docs project record + Task tracking Sheet + Deliverable checklist Sheet + Calendar reminders (event date / deliverable deadline / budget settlement) + Control sheet row + Gmail notification |
| 2 | **Milestone** (專案階段日期新增表) | Adding new dates to an existing project | Appends row to that project's task tracking Sheet + Multiple Calendar reminders (same-day / -1 / -3 / -7 / -14 days) + Milestone record sheet row + Gmail notification |

---

## Two entry points (one shared core)

| Entry | Best for | Files |
| --- | --- | --- |
| **n8n Form Trigger** | Pure n8n deployment, no Google Forms | `entry-n8n-form/` |
| **Google Forms + Webhook bridge** | Keep Google Forms UX for users already familiar with it | `entry-google-forms/` |

Both entries invoke the same `core/` sub-workflow — logic is identical.

---

## Directory layout

```text
google-workspace-admin-workflow/
├── README.md / README.en.md
├── CREDITS.md                    Attribution to the original Apps Script project
├── core/
│   ├── core-project-starter.workflow.json   Project Starter — shared core
│   └── core-milestone.workflow.json         Milestone — shared core
├── entry-n8n-form/
│   ├── entry-project-starter.workflow.json
│   └── entry-milestone.workflow.json
├── entry-google-forms/
│   ├── entry-project-starter.workflow.json  Webhook entry
│   ├── entry-milestone.workflow.json
│   └── apps-script-bridge.gs                Google Forms onFormSubmit → webhook
└── docs/
    ├── install.md                Install, credentials, config variables
    ├── google-credentials.md     Required Google OAuth scopes + setup
    └── field-mapping.md          Apps Script field ↔ n8n node mapping
```

---

## Quick start (n8n Form Trigger flavour)

1. Create a **Google OAuth2 credential** in n8n with Drive, Sheets, Docs, Calendar, Gmail scopes (see `docs/google-credentials.md`).
2. Create a "root folder" in Google Drive and copy its folder ID.
3. Import:
   - `core/core-project-starter.workflow.json`
   - `core/core-milestone.workflow.json`
   - `entry-n8n-form/entry-project-starter.workflow.json`
   - `entry-n8n-form/entry-milestone.workflow.json`
4. Open each workflow, fill the top **Config** node:
   - `ROOT_FOLDER_ID` — folder ID from step 2
   - `CONTROL_SHEET_ID` — leave blank on first run; the workflow auto-creates it; paste it back afterward
   - `CALENDAR_ID` — `primary` or a specific calendar ID
   - `ADMIN_EMAIL` — recipient of error notifications
   - `TIMEZONE` — defaults to `Asia/Taipei`
5. Activate the Form Trigger workflow, copy the public URL, and share it with users.

Full steps in `docs/install.md`.

---

## Differences from the original

| Item | Apps Script original | n8n port |
| --- | --- | --- |
| Form creation | `FormApp.create()` programmatically | n8n Form Trigger (built-in) **or** keep Google Forms with an Apps Script → webhook bridge |
| Docs heading styles | `DocumentApp` API native | n8n Google Docs node + HTTP Request to `documents.batchUpdate` for heading styles |
| Sheets dropdown validation | `newDataValidation().requireValueInList()` | HTTP Request to `spreadsheets.batchUpdate` `setDataValidation` |
| Storing IDs | `PropertiesService` Script Properties | n8n workflow static data / env vars |
| Trigger installation | `ScriptApp.newTrigger()` | The n8n workflow IS the trigger |
| Error notification | `GmailApp.sendEmail` | Gmail node + n8n Error Trigger workflow |

Behaviour (created files, fields, reminder logic) is identical.

---

## Credits

Original Apps Script project: [mihozip/google-workspace-admin-project-workflow](https://github.com/mihozip/google-workspace-admin-project-workflow). See [CREDITS.md](CREDITS.md). This directory is a derivative work and inherits the upstream license.

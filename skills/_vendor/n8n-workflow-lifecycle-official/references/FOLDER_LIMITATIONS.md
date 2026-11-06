# Folder management

On a **registered** instance the MCP creates, renames, and moves folders, and moves workflows between them. On an unregistered instance the folder tools don't exist, and folders are blocked in the n8n UI too, so the fix is to register, not to build folders by hand.

## Tools

| Operation | Tool |
|---|---|
| Resolve a folder name to its ID | `search_folders` |
| Create a folder (optionally nested) | `create_folder` (needs `projectId`) |
| Rename or move a folder within its project | `update_folder` |
| Move workflows into a folder, or to root (`folderId: "0"`) | `move_workflows_to_folder` (≤20, same project) |
| Place a workflow into a folder at create time | `create_workflow_from_code` `folderId` (needs `projectId`) |

No tool deletes a folder, and projects are read-only (`search_projects` only; no create/rename project).

## Protocol when the user mentions a folder

1. **`search_folders`** for the project. Multiple name matches → ask which one.
2. **Exists** → place workflows there: `folderId` on `create_workflow_from_code`, or `move_workflows_to_folder` for ones that already exist.
3. **Doesn't exist** → `create_folder`, then place. No need to hand it back to the user.
4. **Folder tools absent** → the instance isn't registered. Ask the user to register it (free Community-edition registration in Settings); folders are unavailable in the UI until then.

Confirm the destination by folder **name**, not ID. `move_workflows_to_folder` can partially succeed: report anything in `failed`.

## Many workflows at once

`move_workflows_to_folder` takes up to 20 IDs per call and requires all to share the folder's project. Create the folder once, then batch the moves.

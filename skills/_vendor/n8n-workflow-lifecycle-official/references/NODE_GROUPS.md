# Node groups

Read this before creating or editing groups. Named visual frames on the canvas, no execution semantics.

`get_workflow_sdk_reference({ section: 'groups' })` serves n8n's own copy of the rules below and is the authority if the two ever disagree. Read it too when groups are the main job; this file is the one that also covers what each tool reports back.

## When to group: count boxes, not nodes

A **box** is what the canvas shows with every group collapsed: the trigger, each group, and each ungrouped node. Sub-nodes and sticky notes are not boxes.

**More than 7 boxes means group.** Typically 3 to 5 groups, one per stage or business outcome. Never split one objective to hit the number. Staying above 7 is fine only when every remaining top-level item is already a group, or is a node that cannot legally join one.

## The rules

1. **No trigger nodes.** A trigger can never be a member.
2. **One connected section with a single entry and exit.** The connectable members form one reachable section, not two islands. At most one member takes main input from outside and has no predecessor inside; at most one sends main output outside and has no successor inside. **The limit is on members facing outward, not on connections:** that one entry member may receive several inbound connections, and that one exit member may send several outward, and the group is still valid. What fails is *two different members* each facing the same direction. This is the rule most often misread as "one incoming connection". Exception: a closed loop whose only exit is the loop node.
3. **Keep AI sub-nodes with their Agent.** If an Agent is in a group, its sub-nodes are in the same group. All in or all out: **no** non-main connection may cross the boundary, not just model, tool, and memory.
4. **One group per node.** No overlapping membership.
5. **Unique names and ids, at least one member.** Sticky notes may ride along without participating in connectivity, and a sticky-only group is valid.

When a section is too branchy to form one group, group a smaller valid slice (one branch, or the linear run before or after the split) rather than leaving the whole stage ungrouped.

Keep existing groups and their descriptions intact when editing a workflow, unless the change is about grouping.

## The operations

All four are `update_workflow` operations. Members are **node names**, never ids. (Before n8n 2.33.0 they were ids, and the three granular ops may be missing entirely below 2.41.0.)

| Op | Fields |
|---|---|
| `setNodeGroups` | `nodeGroups[]` of `{ name, nodeNames[], description?, id? }`. Replaces every group; `[]` clears them all. |
| `addNodeGroup` | `name`, `nodeNames[]`, `description?`, `id?` |
| `removeNodeGroup` | `groupName`. Removes the frame, keeps the nodes. |
| `updateNodeGroup` | `groupName`, plus at least one of `newName`, `nodeNames[]`, `description` (`""` clears it) |

In SDK code, declare a group with `.group(name, members, options?)` on the workflow, where members are the node handles (the `const` from `node(...)`), the same way connections reference nodes.

## Failure modes: a bad group op is skipped, not fatal

Group ops are the **one exception** to `update_workflow` being atomic: an invalid group op is skipped and the rest of the batch still saves. (An over-long description is the one thing that still fails the whole call: see Descriptions.) So a call that looks successful can still have lost a group, and the fields that say so differ by tool.

**`update_workflow`:**

- **`skippedOperations[]`** (`{ opIndex, type, reason }`): group ops you submitted that did not take effect.
- **`removedGroups[]`** (`{ groupName, reason }`): an **existing** group your other edits invalidated. You did not touch it; adding a node or connection elsewhere made it illegal and the server deleted it. Tell the user when this fires, because nothing else about the response looks like a failure.
- **`validationWarnings[]`**: includes `TOP_LEVEL_ITEMS_OVER_CEILING`. A warning marked `[pre-existing]` (also `preExisting: true`) was already true before your update, so leave those alone rather than widening the task.

**`create_workflow_from_code`** reports dropped groups as **`skippedGroups[]`** (`{ groupName, reason }`) and its warning array is **`warnings`**, with no `preExisting` field. It has no `removedGroups`: on create there is no prior group for an unrelated edit to invalidate.

**`validate_workflow`** flags an over-ceiling canvas as **`SDK_UNGROUPED_CANVAS`**, not `TOP_LEVEL_ITEMS_OVER_CEILING`.

Repair with a follow-up `update_workflow` before telling the user the workflow is done, and never re-emit a group the server just rejected: fix what the reason names.

## Descriptions

Always set one, max 145 characters. Groups are created collapsed, so title plus description is the whole first impression. It must add to the title rather than restate it, and collapsed groups clip the text, so spend the first words on the input, the output, or the scope boundary.

**The two entry points disagree about going over 145:**

- `update_workflow` rejects the **entire call** with a schema error. Not a skipped group op: nothing in the batch saves.
- SDK `.group()` on create validates clean, saves clean, and **silently truncates to exactly 145**, mid-word, with no warning.

Write to the limit rather than relying on either.

# Sticky notes

Read before placing or editing one. The two entry points take different shapes, and only the create path computes geometry for you.

| Tool | Shape | Geometry |
|---|---|---|
| `create_workflow_from_code` | SDK `sticky(content, nodes?, config?)` | Derived from the anchors, after layout |
| `update_workflow` | `addNode` with `type: 'n8n-nodes-base.stickyNote'` | Yours to compute, in full |

## On create: anchor, never position

```ts
const note = sticky('### Enrich order\nCustomer lookup feeds the tier multiplier used by pricing.', [lookup, price], { color: 5 });
workflow('id', 'name').add(lookup.to(price)).add(note);
```

The anchor list **only sizes and places the note**. Listing a node does not add it, and wrapping nodes does not add the sticky: all of it still needs `.add(...)`.

Anchored, the note is a **background zone**. Layout runs first, then the box wraps wherever the anchors landed:

```
x      = anchors.x      - 32       # STICKY_PADDING
y      = anchors.y      - 96       # STICKY_PADDING + STICKY_HEADER_HEIGHT
width  = anchors.width  + 64       # STICKY_PADDING both sides
height = anchors.height + 128      # both sides, plus the header
```

snapped to the 16px grid. The 64px of headroom is where the title renders clear of the nodes, which then draw on top of the note. That is the intended look, not an overlap bug. Anchors are recorded by node **id**, so renaming a member is safe.

**Every sticky gets anchors.** A hand-written `position` is guessing: coordinates are fixed before layout runs. Omitting both is worse, because the fallback centers the note under the whole graph (pre-layout every node sits at the origin, so it counts as covering all of them) then pushes it down past any sticky it hits. That is how notes end up floating below the flow, related to nothing. If you cannot name the nodes a note is about, it does not belong on the canvas.

## Where a note goes: pick the role, the role picks the anchors

The anchor set **is** the placement decision, so picking it at random is what makes a canvas look randomly annotated. Three roles, each fixing its own anchors:

| Role | Anchors | Color | Title |
|---|---|---|---|
| **Stage zone** | every node of one stage | what the stage does, below | `### Stage name` |
| **Callout** | the single node it is about | 3 red for a warning, else 1 yellow | `### Point`, and nothing else: over a plain node the box is only 160px wide |
| **Title band** | every node in the flow | 7 gray | `## What this workflow is` |

The band is rare: it only earns its place on a large canvas you are deliberately leaving ungrouped, since a grouped canvas gets its heading from the group names and a small one already has the workflow name in the breadcrumb. Nesting needs no care, because n8n z-orders stickies by area, largest behind.

**A color is a symbol, not decoration.** It stands for what happens where it sits, so a reader can decode a workflow from color alone. Decide each meaning once and hold it:

| | |
|---|---|
| 4 green | something is created, or a person is in the loop: form intake, approval gate, manual review |
| 3 red | destructive or irreversible: deletes, error paths, anything that pages a human, critical config |
| 5 blue | routing and data transformation, the neutral middle of a pipeline |
| 7 gray | the documentation layer: title band, reference panel |
| 2 gold | an outer frame |
| 6 purple | domain accents, sparingly |
| 1 yellow | the default, a note with no particular role |

**Precedence: what the user asked for, then the palette in nearby workflows (`search_workflows` plus `get_workflow_details`), then the table.** A convention the reader already knows beats a better one they do not.

## How many, and at what scale

Count boxes the way the grouping rule does: the trigger, each group, and each ungrouped node.

- **Under about 5 nodes.** None. The canvas reads in one glance; annotating it is noise.
- **5 to 7 boxes.** One zone per stage, 2 to 4 of them.
- **Over 7 boxes.** Node groups section it (`NODE_GROUPS.md`) and document it through their own `description`. **Anchor nothing to a grouped node:** with groups present, layout places collapsed chips and packs members into chip-sized slots, so member positions are cramped (adjacent members can overlap) and are not what the reader sees. A note anchored to them draws over the expanded group and matches nothing collapsed. Stickies have almost nothing to do on a grouped canvas, which is correct.

## Giving the zone room

The derived 32px measures the node box only. A node's name renders below it, and a URL subtitle below that, so both hang off the edge. Two fixes, one at each step.

**At create, declare a height** (this keeps the derived width and position). Node boxes are 96 tall, rows 192 apart:

| Anchors | Derived | Declare |
|---|---|---|
| one row | 224 | `height: 272` |
| branch fan, two rows | 416 | `height: 464` |

Each extra row adds 192 to both; Message an Agent v2 and up is 128 tall, so add 32.

**Once the canvas is final, widen the zones.** A declared width can't do this: it holds the left edge and grows right, eating the gutter. So read the node positions with `get_workflow_details` and set each zone absolutely, in one batched `update_workflow`:

```
zone.x     = min(node.x) - 56
zone.width = max(node.x + node.width) - min(node.x) + 112
```

Computing from the nodes rather than nudging the current box makes this idempotent, so a re-run is harmless. Still, **run it once, at the end**: it is a finishing step, not something to repeat after every edit.

That gives 56px sides and a 16px gutter. **56 is the ceiling.** The subtitle overhangs its node by about 45px, and the 128px between node boxes splits as `padding + gutter + padding`. It also puts zone edges 8px off the 16px grid, which is deliberate: on-grid leaves only 48px sides (subtitle on the border) or a zero gutter (adjacent same-color zones merge). Nothing re-snaps on save; dragging one zone shifts it 8px.

## The rules that still produce a mess

- **Declared size wins dimension by dimension.** `{ width: 400 }` keeps your width and takes the derived height. Give both and anchoring only positions it.
- **A pinned note never moves, including out of another note's way.** Pinned means an explicit `position` *or* anchors. Only free-floating notes are de-overlapped, and that pass walks them **down past other stickies only**, never past nodes. So a free note can land on nodes, and two anchored notes over interleaved runs overlap forever. Anchor each to a disjoint run.
- **Stickies are invisible to layout.** Nodes are never spread apart to make room.
- **Two zones cannot sit on vertically adjacent rows.** A zone always reaches 96px above its anchors. Below them it reaches 32px at the derived height, or 80px once you declare the `height: 272` above, so stacked zones need **128px of clear space between the node boxes, or 176px with the declared height**. Dagre stacks sibling branches `NODE_Y_SPACING` apart, which is 96. Both numbers are larger than 96, so giving each branch of an If or Switch its own zone overlaps every time (by 32px, or 80px with the declared height) and both are pinned, so neither yields. Anchor the whole fan as one zone, or zone one branch and leave the other bare.
- **Anchor whole stages, not single nodes.** A note per node reprints the node names in a second typeface and buries the one callout that mattered.

## On update: there is no sticky operation

`update_workflow` offers `addNode`, `setNodePosition`, and `updateNodeParameters`, and runs no layout pass. A sticky is an ordinary node:

```json
{ "type": "addNode", "node": {
  "name": "Note: retry policy", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1,
  "position": [-320, 160],
  "parameters": { "content": "### Retry policy\nThe API 429s above 10 rps.", "width": 480, "height": 240, "color": 3 }
}}
```

`content`, `width`, `height`, and `color` live in `parameters`, not at the top level. **An omitted `position` becomes `[0, 0]`**, dropping a 240x160 note at the origin on top of whatever is there.

To frame a run of nodes, build the box by hand. `get_workflow_details` gives positions but not sizes, and a position is the node's **top-left**, so you need dimensions too: a plain node is 96x96, one with configurable inputs 256x96, Message an Agent v2 and up 320x128.

```
left = min(x)            top    = min(y)
right = max(x + width)   bottom = max(y + height)

sticky.x = left - 32     sticky.width  = right - left + 64
sticky.y = top - 96      sticky.height = bottom - top + 128
```

Round every value to a multiple of 16.

## Content, and where the overflow goes

`###` for a zone or callout, `##` for a title band, carrying the point rather than the node names under it: a reader can already see `Set, If, Set`. Then one short line.

**One line is the budget, and it is a budget at the zone's width.** Text renders from the top-left and only the top 64px clears the anchors, so more renders *behind* the nodes. A taller box just extends further behind them. A zone over one plain node is 96 + 64 = 160px wide, where even a short sentence wraps three ways, so single-node zones get a title and nothing else.

Prose that does not fit goes to **node `notes`** (why this node is configured this way: a retry policy, a rate limit, a workaround) or the **workflow `description`** (why the workflow exists). Neither competes for canvas space.

## Constants

`GRID_SIZE` 16, `DEFAULT_STICKY_SIZE` 240x160, `STICKY_PADDING` 32, `STICKY_HEADER_HEIGHT` 64, `NODE_Y_SPACING` 96.

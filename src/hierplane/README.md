# Hierplane — developer API

This directory contains a heavily extended fork of the [hierplane](https://github.com/allenai/hierplane) tree visualization library. The only public export is `Tree`.

```js
import { Tree } from './hierplane'
```

---

## `<Tree>` props

| Prop | Type | Required | Description |
|---|---|---|---|
| `tree` | `TreeData \| null` | yes | The parse tree to display. Pass `null` to show an empty passage with a text input. |
| `onTranslationChange` | `(delta: TranslationDelta) => void` | no | Called whenever the translation state changes. |
| `initialTranslation` | `TranslationState \| null` | no | Seed state to restore from a previously saved record. Applied on mount (controlled by `key`). |
| `onReparse` | `(text: string) => void` | no | Called when the user edits the source text in the passage and presses Enter. |
| `loading` | `boolean` | no | When `true`, shows a loading indicator in the passage row. |

---

## Type reference

### `TreeData`

The object returned by the parse server, passed directly as the `tree` prop.

```ts
interface TreeData {
  text: string                  // The full source sentence
  root: TreeNode                // Root of the constituency tree
  punctTokens: PunctToken[]     // Punctuation, handled separately from tree nodes
  nodeTypeToStyle?: StyleMap    // Optional color assignments per nodeType
}

interface TreeNode {
  nodeType: string              // Semantic type: "np", "vp", "noun", "verb", "prep", …
  word: string                  // The source text span covered by this node
  link: string                  // Syntactic label: Penn Treebank tag or phrase category
  spans?: Span[]                // Character offsets — present on leaf nodes only
  children?: TreeNode[]         // Subtree — present on phrase nodes only
}

interface Span {
  start: number                 // Character offset, inclusive
  end: number                   // Character offset, exclusive
}

interface PunctToken {
  text: string
  start: number
  end: number
}

type StyleMap = Record<string, string[]>  // nodeType → ["color1"…"color8", "strong"]
```

Leaf nodes have `spans` and no `children`. Phrase nodes have `children` and no `spans`. The `link` field is displayed as a dependency arc label when the node is positioned to the side of its parent.

If `nodeTypeToStyle` is omitted, `Tree` auto-generates a color assignment by cycling through `color1`–`color6`.

---

### `TranslationDelta`

The object passed to `onTranslationChange` on every edit.

```ts
interface TranslationDelta {
  preview: string         // Space-joined target words — suitable for display or storage
  hasChanges: boolean     // True if the user has entered any translations
  state: TranslationState // Opaque state blob — pass back as initialTranslation to restore
}
```

`state` is intentionally opaque to the caller. Store it and pass it back as `initialTranslation`; do not read its internal structure.

---

### `TranslationState`

The saved state blob returned inside `TranslationDelta.state`, and accepted by `initialTranslation`.

```ts
interface TranslationState {
  targetTokens: TargetToken[]
  wordOverrides: Record<string, string>
}
```

You only need to know this shape if you are reading old stored records or migrating data. For new records, treat it as opaque.

---

## Usage example

```jsx
import { useState } from 'react'
import { Tree } from './hierplane'

function MyApp() {
  const [tree, setTree] = useState(null)
  const [translation, setTranslation] = useState(null)

  const handleParse = async (text) => {
    const result = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(r => r.json())
    setTree(result)
  }

  const handleSave = () => {
    if (!translation?.hasChanges) return
    console.log('Saving:', translation.preview, translation.state)
  }

  return (
    <Tree
      tree={tree}
      onReparse={handleParse}
      onTranslationChange={setTranslation}
    />
  )
}
```

**Restoring a saved translation:**

```jsx
// To restore, increment key to force a remount, then pass the saved state.
// Tree applies initialTranslation exactly once, on mount.
<Tree
  key={treeKey}
  tree={savedRecord.tree}
  initialTranslation={savedRecord.translation}
  onTranslationChange={setTranslation}
/>
```

---

## Internal architecture

The component is split into layers. Callers only interact with `Tree`; everything below is internal.

```
Tree.jsx               — all state; tree mutation functions; TreeContext provider
TreeContext.js         — createContext + useTree() hook
MainStage.jsx          — auto-zoom wrapper (ResizeObserver + CSS zoom)
Passage.jsx            — source passage (editable) + target passage rows
TargetPassage.jsx      — target token row; click-to-edit per token
ParseTreeToolbar.jsx   — expand all / collapse all buttons
node/Node.jsx          — recursive node renderer; sibling drag container
node/NodeWord.jsx      — node tile: translation input, drag source, clone button
helpers.js             — pure functions (no state, no context)
```

### TreeContext

All child components read shared state via `useTree()`, which returns the full `TreeContext`. Key fields:

| Field | Type | Description |
|---|---|---|
| `data` | `TreeNode \| null` | The processed root node (with assigned IDs and span annotations) |
| `text` | `string` | Source sentence text |
| `tokenMap` | `Record<string, TreeNode>` | Map of node ID → node object for O(1) lookup |
| `targetTokens` | `TargetToken[]` | Flat list of target tokens in display order |
| `wordOverrides` | `Record<string, string>` | Per-node word overrides (legacy translation path) |
| `draggingNodeId` | `string \| null` | ID of the node currently being dragged |
| `dragOverNodeId` | `string \| null` | ID of the last sibling hovered during drag (sticky) |
| `selectedNodeId` | `string \| null` | ID of the focused node |
| `hoverNodeId` | `string \| null` | ID of the hovered node |
| `expandedNodeIds` | `Set<string>` | IDs of currently expanded nodes |
| `contentZoom` | `number` | CSS zoom factor applied by MainStage |

Mutation functions exposed on context: `moveNode`, `reorderChildren`, `cloneNodeAsSibling`, `mergeTokensForNode`, `editTargetToken`, `setPhraseRule`, `expandNode`, `expandPathToNode`, `toggleNode`, `focusNode`, `hoverNode`, `setDraggingNodeId`, `setDragOverNodeId`.

### Node IDs

`assignNodeIds` (in `helpers.js`) adds a dotted path ID to every node: `"0"` (root), `"0.0"`, `"0.1"`, `"0.1.2"`. The path encodes depth and sibling position, making checks like `areSiblings(a, b)` a string comparison. IDs are **re-assigned on every structural mutation** (reorder, reparent, clone) — they are not stable across tree edits.

### Token list

`targetTokens` is a flat array with one entry per source word plus one per punctuation character:

```ts
interface TargetToken {
  id: string        // Unique within this render; matches nodeId for ordinary tokens
  nodeId: string    // The tree node this token represents
  word: string | null   // null until the user fills it in
  isPunct?: boolean     // true for punctuation tokens (word is always set)
}
```

The array order determines the display order in the target passage. Reordering tree nodes rewrites the array order to match tree order. Clone nodes (from `cloneNodeAsSibling`) get a synthetic `lo` value slightly above their source node so they sort immediately after it.

### Phrase tokens and SCFG rules

When a user translates a phrase node (NP, VP, PP…) as a unit, a special token with `id: "__phrase__<nodeId>"` is prepended before the phrase's leaf tokens. `TargetPassage` filters out any leaf token whose phrase ancestor already has a phrase token, preventing double display.

If the user builds a phrase translation by clicking child nodes to insert their translations (the "click children ↓" workflow), `Tree` records an SCFG-style template:

```ts
type RuleTemplate = Array<{ text: string } | { nodeId: string }>
```

On every render, `resolvedTargetTokens` evaluates all templates against the current token list (up to 8 passes to handle nested rules), so phrase translations update automatically when a child's translation changes.

### Drag and drop

Drag state lives in `Tree` and is distributed via context. The key design decisions:

- `dragOverNodeId` is **sticky**: it is only cleared on drop or drag-end, not on `dragLeave`. This prevents flickering when the cursor crosses gaps between tiles.
- The displayed sibling order is a live preview: `Node.renderNodes` reorders siblings in the DOM while a drag is in progress (when both `draggingNodeId` and `dragOverNodeId` are set and are siblings).
- `dragOverNodeIdRef` is a ref that mirrors `dragOverNodeId` synchronously. The container `onDrop` handler reads it to get the canonical drop target, because the DOM reorder may have shifted which tile is physically under the cursor at release time.
- A container-level `onDragOver`+`onDrop` on each sibling group catches drops in empty space and calls `e.preventDefault()`, suppressing the browser's ghost-snap-back animation.

### Translation preservation across mutations

When the tree structure changes (reorder, reparent, clone), node IDs are re-assigned. `Tree` uses char-position maps to carry translations across:

- `buildLoToWord()` maps each node's minimum character offset → its current translation word.
- `buildCloneHandleMap()` maps each clone node's `cloneHandle` (a stable random string that survives `assignNodeIds`) → its current word.

Before triggering a structural mutation, `Tree` sets these maps onto `pendingLoToWordRef` / `pendingCloneHandleMapRef`. The `sentenceTokenEntries` effect reads them after the next render to reconstruct the token list with translations intact.

### CSS

`src/static/hierplane.min.css` is the bundled upstream library CSS, referenced from `index.html`. Local overrides are in `src/styles.css`. The `.hierplane` and `#passage` selectors are used as specificity anchors to beat the upstream library's own selectors.

Key local classes:

| Class | Purpose |
|---|---|
| `.node__word--reorder-preview` | Dashed outline + reduced opacity on dragged tile during sibling drag |
| `.node__word__translation` | Translation word shown below the source word on a tile |
| `.node-clone-btn` | Clone-as-sibling button revealed on tile hover |
| `.target-token` | A single token in the target passage row |
| `.target-token__edit` | Inline edit input within a target token |

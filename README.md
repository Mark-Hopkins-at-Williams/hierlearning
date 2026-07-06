# hierlearning

A language-learning tool built around interactive constituency parse trees. Type an English sentence, get a color-coded parse tree, and build a translation word by word directly on the tree nodes.

---

## What it does

**Parse** — Type any English sentence and press Enter. The app sends the text to a local Python server that runs spaCy + benepar to produce a constituency parse tree: S nodes containing NPs and VPs, which break down to leaves (individual words with POS tags). The tree is displayed using the `hierplane` library, extended to support translation editing.

**Translate** — Click any node tile to type a translation for that word or phrase. The translation appears below the source word on the tile, and the target passage row at the top updates in real time. Phrase nodes (VP, NP, PP) can be translated as a unit: if you're editing a phrase node and click one of its child nodes, that child's current translation is inserted at the cursor — useful for building compositional translations from parts. The tree and target passage are linked by hover: mousing over a node highlights the corresponding target tokens and vice versa.

**Reorder** — Drag any node tile within its sibling group to reorder it. The target token order updates to match. A dashed outline previews where the dragged node will land before you release.

**Reparent** — Drag a node tile onto a non-sibling node to restructure the tree. A leaf dropped onto another leaf groups them into a new phrase node; a leaf dropped onto a phrase node becomes a child of that phrase. Only moves that respect adjacency in the source sentence are accepted.

**Clone** — Hover a leaf node to reveal a `÷` button. Clicking it inserts a copy of that leaf as the next sibling — useful when the same source word contributes to two distinct target words.

**Save** — Click "Save translation" to persist the sentence, parse tree, and translation state to `translations.json`. If you parse a new sentence while the current one has unsaved changes, it auto-saves first. Saves are upserted by source text — no duplicates.

**Load** — Previously saved translations appear in a list below the tree. Click Load to restore the sentence, its tree, and all translations exactly as they were.

---

## Architecture

```
server.py                  — Flask + spaCy + benepar parse server (port 5001)
translations.json          — persistent storage for saved translations
vite.config.js             — Vite dev server with two middleware plugins:
                               /api/parse → proxied to server.py:5001
                               /api/translations → reads/writes translations.json

src/
  App.jsx                  — root component; day/night theme CSS vars
  main.jsx                 — React DOM entry point

  components/
    EnglishParser.jsx      — top-level feature: sentence input, save/load, mascot header

  api/
    parse.js               — fetch wrapper: POST /api/parse
    translations.js        — fetch wrappers: GET/POST /api/translations

  hierplane/               — the parse tree + translation editor component
    index.js               — public export: { Tree }
    Tree.jsx               — root component; all state and tree mutation logic
    TreeContext.js         — React context + useTree() hook
    MainStage.jsx          — tree layout; auto-zoom via ResizeObserver
    Passage.jsx            — source passage and target passage rows
    PassageSpan.jsx        — recursive source text renderer with span highlights
    TargetPassage.jsx      — target token display with click-to-edit
    ParseTreeToolbar.jsx   — expand / collapse all toolbar buttons
    helpers.js             — pure tree utilities (assignNodeIds, translateSpans, …)
    node/
      Node.jsx             — recursive node renderer; drag-and-drop container logic
      NodeWord.jsx         — node tile: drag handle, translation input, clone button
      Link.jsx             — dependency arc label
      LinkSvg.jsx          — SVG arc renderer
      MiddleParent.jsx     — layout wrapper for a node and its children
      Attributes.jsx       — POS attribute chips
      UiToggle.jsx         — collapse/expand toggle button
      Icon.jsx / IconSprite.jsx — SVG icon system

  static/
    hierplane.min.css      — bundled CSS for the upstream hierplane library

  styles.css               — local overrides: fonts, translation tile styles, drag preview
```

---

## Running locally

You need two servers: the Python parse server and the Vite dev server.

**1. Start the parse server**

```bash
pip install flask flask-cors spacy benepar
python -m spacy download en_core_web_md
python -c "import benepar; benepar.download('benepar_en3')"
python server.py
```

The server runs on `http://localhost:5001`. You only need this running when you want to parse new sentences; saved translations load fine without it.

**2. Start the frontend**

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Data flow

**Parsing a sentence**

```
EnglishParser
  → parseSentence(text)           # POST /api/parse → server.py
  → setTree(result)               # { text, root, punctTokens, nodeTypeToStyle }
  → <Tree key={treeKey} tree={tree} />
```

**Editing a translation**

```
NodeWord (click)
  → mergeTokensForNode(nodeId, word)   # in Tree.jsx via TreeContext
  → setTargetTokens(...)               # updates the flat token list
  → resolvedTargetTokens (memo)        # re-resolves any phrase rules
  → onTranslationChange({ preview, hasChanges, state })   # prop callback
  → setTranslation(...)                # in EnglishParser
```

**Saving**

```
EnglishParser.handleSave()
  → doSave(tree, translation, translations)
  → saveTranslations(updated)     # POST /api/translations → writes translations.json
```

**Loading**

```
EnglishParser.handleLoad(record)
  → setTree(record.tree)
  → setRestoreData(record.translation)   # { targetTokens, wordOverrides }
  → setTreeKey(k + 1)                    # unmount/remount Tree to apply initialTranslation
```

---

## Key concepts

**Node IDs** — After `assignNodeIds`, every node gets a dotted path ID: `"0"` (root), `"0.0"`, `"0.1"`, `"0.1.2"`, etc. The depth and position are encoded directly in the ID, which makes sibling checks (`areSiblings`) and path-to-root queries (`pathToNode`) trivial string operations. IDs are re-assigned after every structural mutation (reorder, reparent, clone) — they are not stable across mutations.

**Token list** — `targetTokens` is a flat array, one entry per source word plus punctuation. Each entry is `{ id, nodeId, word }` where `word` is `null` until the user fills it in. The ordering of this array determines the order words appear in the target passage. Reordering tree nodes rewrites the array order to match the new tree order. Clone nodes get a synthetic fractional `lo` so they sort just after their source.

**Phrase tokens** — When a user translates a phrase node (VP, NP, etc.) as a unit, a special entry with `id: "__phrase__<nodeId>"` is prepended before the phrase's leaf tokens. The `TargetPassage` display filters out leaf tokens whose phrase ancestor already has a translation, preventing double display.

**Phrase rules (SCFG templates)** — When you translate a phrase node by clicking child nodes to insert their translations, `Tree` records an SCFG-style template: an array of `{ text }` and `{ nodeId }` parts. On every render, `resolvedTargetTokens` re-evaluates all templates against the current token list so phrase translations update automatically when a child's translation changes.

**`wordOverrides`** — A map of `nodeId → word` for translations entered directly on a node tile without modifying `targetTokens` (legacy path; mostly superseded by the token list approach).

**`latestRef` pattern** — `EnglishParser` keeps a `useRef` that is updated synchronously on every render with the latest `{ tree, translation, translations }`. Async callbacks (`parse`, `handleSave`) read from this ref rather than closing over stale state.

---

## Tree node format (from server.py)

```json
{
  "text": "The cat sat on the mat.",
  "root": {
    "nodeType": "s",
    "word": "The cat sat on the mat",
    "link": "ROOT",
    "children": [
      {
        "nodeType": "np",
        "word": "The cat",
        "link": "NP",
        "children": [
          { "nodeType": "det",  "word": "The", "link": "DT", "spans": [{ "start": 0, "end": 3 }] },
          { "nodeType": "noun", "word": "cat", "link": "NN", "spans": [{ "start": 4, "end": 7 }] }
        ]
      }
    ]
  },
  "punctTokens": [{ "text": ".", "start": 22, "end": 23 }],
  "nodeTypeToStyle": {
    "s":    ["color5", "strong"],
    "np":   ["color4", "strong"],
    "vp":   ["color6", "strong"],
    "noun": ["color4"],
    "verb": ["color6"]
  }
}
```

Leaf nodes have `spans: [{ start, end }]` (character offsets into `text`). Phrase nodes omit `spans` and carry `children` instead. `link` is the syntactic label (Penn Treebank tag or phrase category) used to display dependency arcs.

See [`src/hierplane/README.md`](src/hierplane/README.md) for the full `Tree` component API.

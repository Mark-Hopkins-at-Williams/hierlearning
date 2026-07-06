import { useState, useRef, useEffect, useCallback } from 'react'
import Link from './Link'
import UiToggle from './UiToggle'
import { useTree } from '../TreeContext'

// From a flat list of descendant tokens, keep only those not covered by a nearer
// translated ancestor within the same list. Prevents double-counting when a phrase
// token and its child tokens coexist.
function keepTopmostTokens(tokens, rootNodeId) {
  const translatedIds = new Set(tokens.filter(t => t.word !== null).map(t => t.nodeId))
  const rootDepth = rootNodeId.split('.').length
  return tokens.filter(t => {
    const parts = t.nodeId.split('.')
    for (let len = rootDepth + 1; len < parts.length; len++) {
      if (translatedIds.has(parts.slice(0, len).join('.'))) return false
    }
    return true
  })
}

// Derive an SCFG template from the committed draft and the tracked child insertions.
// Returns an array of { text } or { nodeId } parts. Falls back to a literal if any
// inserted text was deleted or overwritten by the user.
function deriveTemplate(draft, insertions) {
  const parts = []
  let pos = 0
  for (const ins of insertions) {
    const idx = draft.indexOf(ins.text, pos)
    if (idx === -1) return [{ text: draft }]
    if (idx > pos) parts.push({ text: draft.slice(pos, idx) })
    parts.push({ nodeId: ins.nodeId })
    pos = idx + ins.text.length
  }
  if (pos < draft.length) parts.push({ text: draft.slice(pos) })
  return parts.length ? parts : [{ text: draft }]
}

function areSiblings(idA, idB) {
  const a = idA.split('.')
  const b = idB.split('.')
  return a.length > 1 && a.length === b.length && a.slice(0, -1).join('.') === b.slice(0, -1).join('.')
}

export default function NodeWord({
  hasInsideChildren,
  dataPos,
  data,
  dataCollapsable,
  altParses,
  rollups,
  isRoot,
  isEventRoot,
  onMouseOver,
  onMouseOut,
  onMouseDown,
  onMouseUp,
  onUiMouseOver,
  onUiMouseOut,
  onUiMouseUp,
  togglePane,
  insideChildren,
  encapsulated,
  eventSeqChild,
  notFirstInsideChild,
}) {
  const { layout, positions, linkLabels, text, wordOverrides, targetTokens, mergeTokensForNode, tokenMap, draggingNodeId, setDraggingNodeId, dragOverNodeId, setDragOverNodeId, isValidMove, moveNode, reorderChildren, editingInsertRef, setPhraseRule, expandedNodeIds, expandNode, cloneNodeAsSibling } = useTree()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [isDragTarget, setIsDragTarget] = useState(false)
  const inputRef = useRef(null)
  const dragRafRef = useRef(null)
  const blurTimerRef = useRef(null)
  const insertionsRef = useRef([])
  const wasJustExpandedRef = useRef(false)
  const wasJustClonedRef = useRef(false)

  const handleDragStart = useCallback((e) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    // Defer state update — a synchronous re-render inside dragstart
    // mutates the DOM and causes the browser to cancel the drag immediately.
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null
      setDraggingNodeId(data.id)
    })
  }, [data.id, setDraggingNodeId])

  const handleDragEnd = useCallback(() => {
    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    setDraggingNodeId(null)
    setDragOverNodeId(null)
    setIsDragTarget(false)
  }, [setDraggingNodeId, setDragOverNodeId])

  const handleDragOver = useCallback((e) => {
    if (!draggingNodeId || draggingNodeId === data.id) return
    if (areSiblings(draggingNodeId, data.id) || isValidMove(draggingNodeId, data.id)) {
      e.stopPropagation()
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDragTarget(true)
      setDragOverNodeId(data.id)
    }
  }, [draggingNodeId, data.id, isValidMove, setDragOverNodeId])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragTarget(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    setIsDragTarget(false)
    const fromId = draggingNodeId
    // For sibling reorders, dragOverNodeId is the sticky previewed target — use it
    // instead of data.id, which may have shifted under the mouse due to the visual
    // preview DOM reorder.
    const toId = (dragOverNodeId && areSiblings(fromId, dragOverNodeId))
      ? dragOverNodeId
      : data.id
    setDragOverNodeId(null)
    setDraggingNodeId(null)
    if (areSiblings(fromId, toId)) {
      reorderChildren(fromId, toId)
    } else {
      moveNode(fromId, toId)
    }
  }, [draggingNodeId, dragOverNodeId, data.id, moveNode, reorderChildren, setDraggingNodeId, setDragOverNodeId])

  const displayWord = wordOverrides[data.id] ?? data.word
  const nodeId = data.id

  // Own direct tokens (may be >1 after a split; phrase nodes have exactly one __phrase__ token).
  // Takes precedence over aggregating descendants — prevents double-counting.
  const ownTokens = targetTokens?.filter(t => !t.isPunct && t.nodeId === nodeId && t.word !== null) ?? []
  const ownToken = ownTokens[0] ?? null
  const allDescTokens = targetTokens?.length
    ? targetTokens.filter(t => !t.isPunct && t.nodeId.startsWith(nodeId + '.'))
    : []
  // keepTopmostTokens prevents double-counting when both a phrase token and its
  // children coexist (e.g. PP phrase + its leaf tokens all in the same array).
  const spanTokens = keepTopmostTokens(allDescTokens, nodeId)
  // After a split, ownTokens has multiple entries — show them all joined so the tile
  // reflects the full translation and the user can see "gefunden" didn't vanish.
  const translationWord = ownTokens.length > 0
    ? ownTokens.map(t => t.word).join(' ')
    : (spanTokens.some(t => t.word)
      ? spanTokens.map(t => t.word ?? wordOverrides[t.nodeId] ?? tokenMap[t.nodeId]?.word ?? '').filter(Boolean).join(' ')
      : null)

  // Same own-token-first + topmost logic for reading any node's translation (used during insertion)
  const getTranslation = (id) => {
    const own = (targetTokens || []).find(t => !t.isPunct && t.nodeId === id && t.word !== null)
    if (own) return own.word
    const desc = (targetTokens || []).filter(t => !t.isPunct && t.nodeId.startsWith(id + '.'))
    const topmost = keepTopmostTokens(desc, id)
    if (!topmost.some(t => t.word)) return null
    return topmost.map(t => t.word ?? wordOverrides[t.nodeId] ?? tokenMap[t.nodeId]?.word ?? '').filter(Boolean).join(' ')
  }

  // Stable insertion function — reads cursor and value directly from the DOM.
  // childNodeId is recorded for SCFG template derivation at commit time.
  const insertAtCursor = useCallback((insertText, childNodeId = null) => {
    const input = inputRef.current
    if (!input) return
    // Cancel any pending blur-commit so clicking a child doesn't close the parent
    if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    if (childNodeId) insertionsRef.current.push({ nodeId: childNodeId, text: insertText })
    setDraft(input.value.slice(0, start) + insertText + input.value.slice(end))
    requestAnimationFrame(() => {
      if (!inputRef.current) return
      inputRef.current.focus()
      inputRef.current.setSelectionRange(start + insertText.length, start + insertText.length)
    })
  }, []) // eslint-disable-line

  useEffect(() => {
    if (isEditing) {
      insertionsRef.current = []
      inputRef.current?.focus()
      inputRef.current?.select()
      if (editingInsertRef) editingInsertRef.current = { nodeId: data.id, insert: insertAtCursor }
    } else {
      insertionsRef.current = []
      if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
      if (editingInsertRef?.current?.nodeId === data.id) editingInsertRef.current = null
    }
    return () => {
      if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
    }
  }, [isEditing]) // eslint-disable-line

  const startEditing = (e) => {
    e.stopPropagation()

    // If a parent is being edited and we're one of its descendants, insert our translation
    const editing = editingInsertRef?.current
    if (editing && data.id !== editing.nodeId && data.id.startsWith(editing.nodeId + '.')) {
      editing.insert(getTranslation(data.id) ?? data.word, data.id)
      return
    }

    // First click on a collapsed node: expand it, don't open the translation input.
    // Check the ref first — mouseup fires before click and React flushes state between
    // them, so expandedNodeIds.has() is already true by the time we get here.
    if (wasJustClonedRef.current) {
      wasJustClonedRef.current = false
      return
    }
    if (wasJustExpandedRef.current) {
      wasJustExpandedRef.current = false
      return
    }
    if (dataCollapsable && !expandedNodeIds.has(data.id)) {
      expandNode(data.id)
      return
    }

    if (isEditing) return  // already editing this node; don't reset draft

    // Seed with the full aggregated translation (all split tokens joined).
    // If the user accidentally triggers blur, commitEdit will re-merge to "habe gefunden"
    // rather than just "habe", preserving the intent even if the split is lost.
    setDraft(translationWord ?? '')
    setIsEditing(true)
  }

  const commitEdit = () => {
    const trimmed = draft.trim()
    if (trimmed) {
      if (data.children?.length) {
        if (insertionsRef.current.length > 0) {
          const template = deriveTemplate(trimmed, insertionsRef.current)
          setPhraseRule(data.id, template.some(p => p.nodeId) ? template : null)
        } else {
          // Manual edit with no child clicks — clear the rule only if text changed
          const existingWord = targetTokens?.find(t => t.nodeId === data.id)?.word
          if (trimmed !== (existingWord ?? '')) setPhraseRule(data.id, null)
        }
      }
      mergeTokensForNode(data.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setIsEditing(false)
  }

  const hasFragments = data.alternateParseInfo?.spanAnnotations != null
  const hasRollup = rollups && dataCollapsable && hasFragments
  const fragmentData = hasFragments ? data.alternateParseInfo.spanAnnotations : null
  const maxRollupChars = 40
  const wideRollup = hasRollup &&
    data.alternateParseInfo.charNodeRoot.charHi - data.alternateParseInfo.charNodeRoot.charLo >= maxRollupChars

  const rollupText = fragmentData ? fragmentData.map((item, i) =>
    item.spanType === 'self'
      ? <strong key={i}> {text.slice(item.lo, item.hi)} </strong>
      : ` ${text.slice(item.lo, item.hi)} `
  ) : null

  const isInsertTarget = () => {
    const editing = editingInsertRef?.current
    return editing && data.id !== editing.nodeId && data.id.startsWith(editing.nodeId + '.')
  }

  const focusTrigger = (
    <div
      className={`node-focus-trigger${hasInsideChildren ? ' node-focus-trigger--seq' : ''}`}
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      onMouseDown={onMouseDown}
      onClick={isRoot ? () => togglePane?.('open') : startEditing}
      onMouseUp={() => {
        if (isInsertTarget()) return
        if (dataCollapsable && !expandedNodeIds.has(data.id)) wasJustExpandedRef.current = true
        onMouseUp(data)
      }}
    />
  )

  if (isRoot) {
    return altParses ? <div className="node__segments">{focusTrigger}</div> : null
  }

  const showLinkTop = !isEventRoot && data.link && (
    layout === 'canonical' ||
    (layout === 'default' && positions[data.link] !== 'left' && notFirstInsideChild && !encapsulated && !eventSeqChild)
  )
  const showLinkLeft = !encapsulated && !eventSeqChild && data.link && layout === 'default' && positions[data.link] === 'left'

  const isDraggingSelf = draggingNodeId === data.id
  const isReorderPreview = isDraggingSelf && dragOverNodeId != null && areSiblings(data.id, dragOverNodeId)

  return (
    <div
      className={[
        'node__word',
        hasInsideChildren && data.attributes?.length > 0 ? 'node__word--has-attrs' : '',
        hasRollup ? 'node__word--has-rollup' : '',
        isDraggingSelf ? 'node__word--dragging' : '',
        isReorderPreview ? 'node__word--reorder-preview' : '',
      ].join(' ').trim()}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`node__word__tile${isDragTarget ? ' node__word__tile--drag-target' : ''}`}
      />
      {showLinkTop ? <Link link={data.link} dataPos={dataPos} layout={layout} linkLabels={linkLabels} id={data.id} /> : null}
      <div className="node__word__content">
        <div className={`node__word__label${wideRollup ? ' node__word__label--wide' : ''}`}>
          <div className="node__word__label__siblings">
            {isEditing ? (
              <input
                ref={inputRef}
                className="node__word__label__headword node__word__label__headword--editing"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => { blurTimerRef.current = setTimeout(commitEdit, 200) }}
                onKeyDown={handleKeyDown}
                size={Math.max(draft.length, 1)}
              />
            ) : (
              <span
                className="node__word__label__headword"
                id={`node-${data.id}-word`}
                onClick={startEditing}
                title="Click to translate"
              >{displayWord}</span>
            )}
            {hasRollup ? <span className="node__word__label__rollup" id={`node-${data.id}-span`}>{rollupText}</span> : null}
          </div>
          {translationWord && !isEditing && (
            <div className="node__word__translation">{translationWord}</div>
          )}
          {isEditing && data.children?.length > 0 && (
            <div className="node__word__insert-hint">click children ↓</div>
          )}
        </div>
        {hasInsideChildren ? insideChildren : null}
      </div>
      {showLinkLeft ? <Link link={data.link} dataPos={dataPos} layout={layout} linkLabels={linkLabels} id={data.id} /> : null}
      {focusTrigger}
      {!data.children?.length && !isRoot && (
        <button
          className="node-clone-btn"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); wasJustClonedRef.current = true }}
          onClick={e => { e.stopPropagation(); cloneNodeAsSibling(data.id) }}
          tabIndex={-1}
          title="Clone as sibling"
        >÷</button>
      )}
      {dataCollapsable ? <UiToggle onUiMouseOver={onUiMouseOver} onUiMouseOut={onUiMouseOut} onUiMouseUp={onUiMouseUp} /> : null}
    </div>
  )
}

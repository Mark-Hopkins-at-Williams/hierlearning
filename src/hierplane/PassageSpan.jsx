import { useState, useRef, useEffect } from 'react'
import { useTree } from './TreeContext'
import { nodeColor } from './helpers'

function cn(obj) {
  return Object.entries(obj).filter(([, v]) => v).map(([k]) => k).join(' ')
}

export default function PassageSpan({ text, data, styles, depth, parentId, editable = true }) {
  const { hoverNode, focusNode, expandPathToNode, selectedNodeId, hoverNodeId, wordOverrides, setWordOverride, targetTokens, reorderCount } = useTree()
  const [active, setActive] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    setActive(hoverNodeId === data.id ? 'hover' : null)
  }, [hoverNodeId, data.id])

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const startEditing = (originalText) => (e) => {
    e.stopPropagation()
    setDraft(wordOverrides[data.id] ?? originalText)
    setIsEditing(true)
  }

  const commitEdit = () => {
    const trimmed = draft.trim()
    if (trimmed) setWordOverride(data.id, trimmed)
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setIsEditing(false)
  }

  const segmentsContainer = data.nodeType === 'top-level-and'
  const fragmentData = data.alternateParseInfo?.spanAnnotations ?? null
  const textHi = text.length + 1

  const populateSpans = (children, lo, hi) =>
    children.map(childNode => {
      const cnr = childNode.alternateParseInfo?.charNodeRoot
      const spanLo = cnr ? cnr.charLo : 0
      const spanHi = cnr ? cnr.charHi : textHi
      if (spanLo >= lo && spanHi <= hi) {
        return (
          <PassageSpan
            key={`${childNode.id}_r${reorderCount}`}
            text={text}
            data={childNode}
            styles={styles}
            depth={depth + 1}
            parentId={data.id}
            editable={editable}
          />
        )
      }
      return null
    })

  let output
  if (fragmentData) {
    let selfCount = 0
    output = fragmentData.map((item, i) => {
      if (item.spanType === 'child') {
        return <span key={i}>{populateSpans(data.children, item.lo, item.hi)}</span>
      }
      const isFirstSelf = selfCount++ === 0
      const originalText = text.slice(item.lo, item.hi)
      const displayText = (editable && isFirstSelf && wordOverrides[data.id])
        ? wordOverrides[data.id]
        : originalText

      if (editable && isFirstSelf && isEditing) {
        return (
          <input
            key={i}
            ref={inputRef}
            className="passage-span__edit"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onMouseDown={e => e.stopPropagation()}
            size={Math.max(draft.length, 1)}
          />
        )
      }

      return (
        <span
          key={`${item.lo}-${item.hi}`}
          className={`span-slice__${item.spanType}`}
          onDoubleClick={(editable && isFirstSelf) ? startEditing(originalText) : undefined}
          title={(editable && isFirstSelf) ? 'Double-click to edit' : undefined}
        >
          {displayText}
        </span>
      )
    })
    // Append any text beyond the last span annotation (e.g. trailing punctuation)
    if (depth === 0) {
      const lastHi = fragmentData.reduce((m, a) => Math.max(m, a.hi), 0)
      const tail = text.slice(lastHi)
      if (tail) output = [...output, <span key="__trail" className="span-slice__gap">{tail}</span>]
    }
  } else {
    output = text
  }

  const color = nodeColor(data.id, targetTokens, data)
  const spanClasses = cn({
    'span-slice--hover': active === 'hover' || hoverNodeId === data.id,
    'span-slice--pressed': active === 'pressed',
    'span-slice--focused': selectedNodeId === data.id,
    'span-slice--margin': depth === 0,
    [`span-slice--${color}`]: !!color,
  })

  const handlers = segmentsContainer ? {} : {
    onMouseOver: () => { setActive('hover'); hoverNode(data.id) },
    onMouseOut:  () => { setActive(null);  hoverNode('none') },
    onMouseDown: () => setActive('pressed'),
    onMouseUp:   () => { setActive(null); expandPathToNode(data.id); focusNode(data) },
  }

  return (
    <span
      className={`span-slice ${spanClasses}`}
      data-parent-id={depth > 0 ? parentId : 'null'}
      data-id={data.id}
      {...handlers}
    >
      {output}
    </span>
  )
}

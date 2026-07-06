import { useState, useRef, useEffect, useMemo } from 'react'
import { useTree } from './TreeContext'
import { nodeColor } from './helpers'

function Token({ token }) {
  const {
    tokenMap, wordOverrides, editTargetToken,
    hoverNodeId, selectedNodeId, focusNode, expandPathToNode,
    targetTokens,
  } = useTree()

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const node = token.isPunct ? null : tokenMap[token.nodeId]
  const displayWord = token.word !== null
    ? token.word
    : (wordOverrides[token.nodeId] ?? node?.word ?? '')
  const color = node ? nodeColor(token.nodeId, targetTokens, node) : ''
  const cloneSourceId = node?.cloneSourceId
  const isHead = !token.isPunct && hoverNodeId !== null && (
    token.nodeId === hoverNodeId ||
    token.nodeId.startsWith(hoverNodeId + '.') ||
    (cloneSourceId && (cloneSourceId === hoverNodeId || cloneSourceId.startsWith(hoverNodeId + '.')))
  )
  const isFocused = !token.isPunct && selectedNodeId === token.nodeId

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const startEditing = (e) => {
    e.stopPropagation()
    setDraft(displayWord)
    setIsEditing(true)
  }

  const commitEdit = () => {
    const trimmed = draft.trim()
    editTargetToken(token.id, trimmed || null)
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setIsEditing(false)
  }

  const classes = [
    'span-slice',
    color ? `span-slice--${color}` : '',
    'target-token',
    isHead ? 'span-slice--hover' : '',
    isFocused ? 'span-slice--focused' : '',
  ].filter(Boolean).join(' ')

  return (
    <span
      className={classes}
      onMouseUp={token.isPunct ? undefined : () => { expandPathToNode(token.nodeId); focusNode({ id: token.nodeId }) }}
    >
      {token.isPunct ? (
        <span className="span-slice__self target-token__word target-token__punct">{displayWord}</span>
      ) : isEditing ? (
        <input
          ref={inputRef}
          className="target-token__edit"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onMouseDown={e => e.stopPropagation()}
          size={Math.max(draft.length, 1)}
        />
      ) : (
        <span className="span-slice__self target-token__word" onClick={startEditing}>
          {displayWord}
        </span>
      )}
    </span>
  )
}

export default function TargetPassage() {
  const { targetTokens, hoverNode, tokenMap } = useTree()

  const translatedNodeIds = useMemo(
    () => new Set(targetTokens.filter(t => !t.isPunct && t.word !== null).map(t => t.nodeId)),
    [targetTokens]
  )
  const displayTokens = useMemo(() => targetTokens.filter(t => {
    if (t.isPunct) return true
    const parts = t.nodeId.split('.')
    for (let len = 1; len < parts.length; len++) {
      if (translatedNodeIds.has(parts.slice(0, len).join('.'))) return false
    }
    return true
  }), [targetTokens, translatedNodeIds])

  return (
    <span className="passage__readonly target-passage">
      {displayTokens.map((token) => (
        <span
          key={token.id}
          className="target-token-slot"
          onMouseEnter={token.isPunct ? undefined : () => hoverNode(tokenMap[token.nodeId]?.cloneSourceId || token.nodeId)}
          onMouseLeave={token.isPunct ? undefined : () => hoverNode('none')}
        >
          <Token token={token} />
        </span>
      ))}
    </span>
  )
}

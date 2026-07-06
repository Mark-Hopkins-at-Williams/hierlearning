import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useTree } from './TreeContext'
import PassageSpan from './PassageSpan'
import TargetPassage from './TargetPassage'

export default function Passage() {
  const { text, data, styles, onReparse } = useTree()
  const [isEditing, setIsEditing] = useState(!data)
  const editableRef = useRef(null)
  const sourceWrapRef = useRef(null)
  const sourceRef = useRef(null)
  const targetWrapRef = useRef(null)
  const targetRef = useRef(null)

  useEffect(() => {
    setIsEditing(!data)
  }, [data])

  useEffect(() => {
    if (!isEditing || !editableRef.current) return
    const el = editableRef.current
    el.innerText = text || ''
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  }, [isEditing]) // eslint-disable-line

  useLayoutEffect(() => {
    const fit = () => {
      for (const [wrapR, contentR] of [[sourceWrapRef, sourceRef], [targetWrapRef, targetRef]]) {
        const wrap = wrapR.current
        const content = contentR.current
        if (!wrap || !content) continue
        content.style.zoom = ''
        const needed = content.scrollWidth
        const available = wrap.clientWidth
        const ratio = needed > available ? available / needed : 1
        content.style.zoom = ratio < 1 ? String(ratio) : ''
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (sourceWrapRef.current) ro.observe(sourceWrapRef.current)
    if (targetWrapRef.current) ro.observe(targetWrapRef.current)
    return () => ro.disconnect()
  })

  const commit = () => {
    const trimmed = editableRef.current?.innerText.trim()
    if (trimmed) onReparse?.(trimmed)
  }

  return (
    <div id="passage">
      <div className="passage__focus-trigger" />
      <p className="passage__translation">
        <span className="passage__translation__row">
          <span className="passage__translation__label">Source</span>
          <span
            ref={sourceWrapRef}
            style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}
          >
            {isEditing ? (
              <span
                key="editing"
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Type a sentence and press Enter…"
                className="passage__readonly passage__readonly--source passage__source-editable"
                style={{ display: 'block', whiteSpace: 'nowrap', outline: 'none' }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commit() }
                  if (e.key === 'Escape' && data) {
                    if (editableRef.current) editableRef.current.innerText = text || ''
                    setIsEditing(false)
                  }
                }}
                onBlur={() => { if (data) setIsEditing(false) }}
                onPaste={e => {
                  e.preventDefault()
                  const plain = e.clipboardData.getData('text/plain').replace(/\n/g, ' ')
                  document.execCommand('insertText', false, plain)
                }}
              />
            ) : (
              <span
                key="display"
                ref={sourceRef}
                className="passage__readonly passage__readonly--source"
                style={{ display: 'block', whiteSpace: 'nowrap', cursor: 'text' }}
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                {data
                  ? <PassageSpan text={text} data={data} styles={styles} depth={0} editable={false} />
                  : text}
              </span>
            )}
          </span>
        </span>
        {data && (
          <span className="passage__translation__row">
            <span className="passage__translation__label">Target</span>
            <span
              ref={targetWrapRef}
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}
            >
              <span ref={targetRef} style={{ display: 'block' }}>
                <TargetPassage />
              </span>
            </span>
          </span>
        )}
      </p>
      <div className="passage__loading-mask" />
    </div>
  )
}

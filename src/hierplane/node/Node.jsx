import { useState, useEffect } from 'react'
import Link from './Link'
import MiddleParent from './MiddleParent'
import { useTree } from '../TreeContext'

function cn(obj) {
  return Object.entries(obj).filter(([, v]) => v).map(([k]) => k).join(' ')
}

function buildChildGroups(children, positions) {
  return children.reduce((acc, child) => {
    const pos = positions[child.link]
    if (pos in acc) acc[pos].push(child)
    else acc.down.push(child)
    return acc
  }, { left: [], right: [], down: [], inside: [] })
}

function countSeqKinds(children) {
  return children.reduce((acc, child) => {
    if (['event', 'entity', 'detail'].includes(child.nodeType)) acc[child.nodeType].push(child)
    return acc
  }, { event: [], entity: [], detail: [] })
}

export default function Node({ data, depth, directionalChildIndex, isSingleSegment, parentId, siblingIndex, parentNodeId, totalSiblings }) {
  const {
    expandedNodeIds, toggleNode, expandNode,
    focusNode, hoverNode,
    positions, styles, linkLabels, layout, text,
    selectedNodeId, hoverNodeId, reorderCount,
    draggingNodeId, dragOverNodeId, dragOverNodeIdRef,
    setDragOverNodeId, setDraggingNodeId, reorderChildren,
  } = useTree()

  const [active, setActive] = useState(null)
  const [nodeFocusing, setNodeFocusing] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const isHovered = hoverNodeId === data.id || (data.cloneSourceId && hoverNodeId === data.cloneSourceId)
    setActive(isHovered ? 'hover' : null)
  }, [hoverNodeId, data.id, data.cloneSourceId])

  useEffect(() => {
    if (selectedNodeId === data.id) {
      setFocused(true)
      expandNode(data.id)
    } else {
      setFocused(false)
    }
  }, [selectedNodeId, data.id])

  const handleMouseUp = (nodeData) => {
    setNodeFocusing(false)
    expandNode(nodeData.id)
  }

  const handleUiToggleMouseUp = () => {
    toggleNode(data.id)
    setActive(null)
  }

  const handleMouseOver = () => { setActive('hover'); hoverNode(data.cloneSourceId || data.id) }
  const handleMouseOut  = () => { setActive(null);  hoverNode('none') }

  // ─── Build children ─────────────────────────────────────────────────────────

  let leftChildren = null, rightChildren = null, downChildren = null
  let insideChildren = null, canonicalChildren = null
  let hasChildren = false, hasSideChildren = false
  let hasLeftChildren = false, hasRightChildren = false
  let hasDownChildren = false, hasInsideChildren = false
  let seqType = null, childNodes = null

  if (data.children) {
    childNodes = buildChildGroups(data.children, positions)

    hasLeftChildren  = childNodes.left.length > 0
    hasRightChildren = childNodes.right.length > 0
    hasDownChildren  = childNodes.down.length > 0
    hasInsideChildren = childNodes.inside.length > 0
    hasSideChildren = hasLeftChildren || hasRightChildren
    hasChildren = hasSideChildren || hasDownChildren || hasInsideChildren

    if (data.nodeType === 'sequence' && hasInsideChildren) {
      const seq = countSeqKinds(childNodes.inside)
      const len = childNodes.inside.length
      if (len === seq.event.length) seqType = 'event'
      else if (len === seq.entity.length) seqType = 'entity'
      else if (len === seq.detail.length) seqType = 'detail'
    }

    const defocusTrigger = (cls) => (
      <div className={cls} onDoubleClick={() => focusNode('defocus')} />
    )

    const seqTrigger = () => (
      <div
        className="node-sequence-trigger"
        onClick={() => focusNode(data)}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        onMouseDown={() => setNodeFocusing(true)}
      />
    )

    const renderNodes = (nodes, container) => {
      // Preview sibling reorder: if the dragged node and hover target are both in
      // this sibling group, show them in the post-drop order while drag is active.
      let displayNodes = nodes
      if (draggingNodeId && dragOverNodeId) {
        const dIdx = nodes.findIndex(n => n.id === draggingNodeId)
        const tIdx = nodes.findIndex(n => n.id === dragOverNodeId)
        if (dIdx >= 0 && tIdx >= 0 && dIdx !== tIdx) {
          const kids = [...nodes]
          const [dragged] = kids.splice(dIdx, 1)
          kids.splice(tIdx, 0, dragged)
          displayNodes = kids
        }
      }
      // Catch drops in empty space within the sibling group so the browser
      // receives e.preventDefault() and skips the ghost snap-back animation.
      const handleContainerDragOver = (e) => {
        if (draggingNodeId && nodes.some(n => n.id === draggingNodeId)) {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
        }
      }
      const handleContainerDrop = (e) => {
        if (!draggingNodeId || !nodes.some(n => n.id === draggingNodeId)) return
        e.preventDefault()
        e.stopPropagation()
        const fromId = draggingNodeId
        const toId = dragOverNodeIdRef.current
        setDragOverNodeId(null)
        setDraggingNodeId(null)
        if (toId && nodes.some(n => n.id === toId)) reorderChildren(fromId, toId)
      }

      return (
        <div
          className={`node-${container ?? 'children'}-container`}
          onDragOver={handleContainerDragOver}
          onDrop={handleContainerDrop}
        >
          {container !== 'sequence' ? defocusTrigger('node-children-container-defocus-trigger') : seqTrigger()}
          {displayNodes.map((childNode, index) => (
            <Node
              key={`${childNode.id}_r${reorderCount}`}
              data={childNode}
              depth={depth + 1}
              directionalChildIndex={index}
              isSingleSegment={isSingleSegment}
              parentId={data.id}
              siblingIndex={index}
              parentNodeId={data.id}
              totalSiblings={displayNodes.length}
            />
          ))}
        </div>
      )
    }

    const renderDirectional = (direction, children) => {
      if (children.length === 0) return null
      if (direction === 'down') {
        return (
          <div className="ft__tr">
            {hasLeftChildren  ? defocusTrigger('ft__tr__td ft--left-placeholder')  : null}
            <div className="ft__tr__td ft--middle-children">{renderNodes(children)}</div>
            {hasRightChildren ? defocusTrigger('ft__tr__td ft--right-placeholder') : null}
          </div>
        )
      }
      return (
        <div className={`ft__tr__td ft--${direction}-children`}>
          {defocusTrigger('node-children-container-defocus-trigger')}
          {renderNodes(children)}
        </div>
      )
    }

    if (layout === 'canonical' || (layout === 'default' && !hasSideChildren && !hasInsideChildren)) {
      canonicalChildren = renderNodes(data.children)
    } else if (layout === 'default' && hasInsideChildren && !hasSideChildren && childNodes.down.length > 0) {
      insideChildren  = renderNodes(childNodes.inside, 'sequence')
      canonicalChildren = renderNodes(childNodes.down)
    } else {
      leftChildren  = renderDirectional('left',  childNodes.left)
      rightChildren = renderDirectional('right', childNodes.right)
      downChildren  = renderDirectional('down',  childNodes.down)
      insideChildren = renderNodes(childNodes.inside, 'sequence')
    }
  }

  // ─── Node metadata ───────────────────────────────────────────────────────────

  const isRoot      = !isSingleSegment && depth === 0
  const isEventRoot = (!isSingleSegment && depth === 1) || (isSingleSegment && depth === 0)
  const dataCollapsable = hasChildren && depth > 0 && !isEventRoot

  let dataPos = ''
  if (data.link) dataPos = positions[data.link] || 'down'
  if ((!isSingleSegment && depth === 1) || (isSingleSegment && depth === 0)) dataPos = ''

  const isCollapsed = !expandedNodeIds.has(data.id)
  const eventSeqChild = data.nodeType === 'event' && dataPos === 'inside'
  const encapsulated  = (dataPos === 'left' || dataPos === 'right') && hasSideChildren
  const notFirstInsideChild = !(data.id !== undefined && dataPos === 'inside' && directionalChildIndex === 0)
  const ftCollapsed = isCollapsed && (hasSideChildren || hasDownChildren) && !isRoot && !isEventRoot

  const ftClasses = cn({
    'ft--event': data.nodeType === 'event',
    'ft--seq': hasInsideChildren && hasSideChildren,
    'ft--root-event': isEventRoot,
    'ft--encapsulated': encapsulated,
    'ft--event-seq-child': eventSeqChild,
    'ft--no-left-children': hasSideChildren && !hasLeftChildren,
    'ft--no-right-children': hasSideChildren && !hasRightChildren,
    'node-container--collapsed': ftCollapsed,
    'node-container--expanded': !ftCollapsed,
    'node-container--active': active !== null && hasSideChildren,
    'node-container--toggle-ready': active === 'toggle-ready',
  })

  const nodeContent = (
    <div className={`ft ${ftClasses}`} data-has-children={String(hasChildren)}>
      <div className="ft__tr">
        {leftChildren}
        <MiddleParent
          depth={depth}
          directionalChildIndex={directionalChildIndex}
          data={data}
          parentId={parentId}
          hasChildren={hasChildren}
          hasSideChildren={hasSideChildren}
          hasInsideChildren={hasInsideChildren}
          hasDownChildren={hasDownChildren}
          active={active}
          focused={focused}
          collapsed={isCollapsed}
          nodeFocusing={nodeFocusing}
          canonicalChildren={canonicalChildren}
          dataCollapsable={dataCollapsable}
          rollups={true}
          isRoot={isRoot}
          encapsulated={encapsulated}
          eventSeqChild={eventSeqChild}
          notFirstInsideChild={notFirstInsideChild}
          isSingleSegment={isSingleSegment}
          dataPos={dataPos}
          isEventRoot={isEventRoot}
          insideChildren={insideChildren}
          togglePane={() => {}}
          seqType={seqType}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
          onMouseDown={() => setNodeFocusing(true)}
          onMouseUp={handleMouseUp}
          onUiMouseOver={() => setActive('toggle-ready')}
          onUiMouseOut={() => setActive(null)}
          onUiMouseUp={handleUiToggleMouseUp}
          onPnMouseOver={() => setActive('hover')}
          onPnMouseOut={() => setActive(null)}
          onPnMouseUp={() => {}}
        />
        {rightChildren}
      </div>
      {downChildren}
    </div>
  )

  if (encapsulated || eventSeqChild) {
    return (
      <div
        className={[
          'encapsulated',
          eventSeqChild ? 'event-seq-child' : '',
          !isCollapsed && hasChildren ? 'event-seq-child--expanded' : '',
        ].join(' ').trim()}
        data-pos={dataPos}
      >
        {((eventSeqChild && notFirstInsideChild) || (encapsulated && dataPos === 'right')) && (
          <Link link={data.link} dataPos={dataPos} layout={layout} linkLabels={linkLabels} id={data.id} />
        )}
        {nodeContent}
        {(!eventSeqChild && dataPos === 'left') && (
          <Link link={data.link} dataPos={dataPos} layout={layout} linkLabels={linkLabels} id={data.id} />
        )}
      </div>
    )
  }

  return nodeContent
}

import { useRef, useLayoutEffect } from 'react'
import { useTree } from './TreeContext'
import { isSingleSegment } from './helpers'
import Node from './node/Node'

export default function MainStage({ data }) {
  const { layout, focusNode, setContentZoom, expandedNodeIds } = useTree()
  const stageRef = useRef(null)
  const treeRef = useRef(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    const tree = treeRef.current
    if (!stage || !tree) return
    const pane = stage.closest('.pane--scroll')

    const fit = () => {
      tree.style.zoom = ''
      const available = (pane ?? stage).clientWidth
      tree.style.width = 'max-content'
      const needed = tree.offsetWidth
      tree.style.width = ''
      const ratio = needed > available ? available / needed : 1
      if (ratio < 1) tree.style.zoom = String(ratio)
      setContentZoom(ratio)
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(pane ?? stage)
    return () => ro.disconnect()
  }, [data, expandedNodeIds])

  if (!data) return null

  return (
    <div id="main-stage" className={layout} ref={stageRef}>
      <div className="main-stage__defocus-trigger" onDoubleClick={() => focusNode('defocus')} />
      <div className="main-stage__tree-container main-stage--rendered" ref={treeRef}>
        <div className="main-stage__defocus-trigger" onDoubleClick={() => focusNode('defocus')} />
        <Node
          data={data}
          depth={0}
          directionalChildIndex={0}
          isSingleSegment={isSingleSegment(data.nodeType)}
          parentId={null}
        />
      </div>
    </div>
  )
}

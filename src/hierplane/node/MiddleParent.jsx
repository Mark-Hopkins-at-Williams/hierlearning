import NodeWord from './NodeWord'
import { useTree } from '../TreeContext'
import { nodeColor } from '../helpers'


function stylesToString(arr = []) {
  return arr.reduce((str, style) => `node--${style} ${str}`, '')
}

function cn(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(' ')
}

export default function MiddleParent({
  canonicalChildren,
  hasChildren,
  hasSideChildren,
  hasInsideChildren,
  hasDownChildren,
  data,
  depth,
  active,
  collapsed,
  nodeFocusing,
  dataCollapsable,
  rollups,
  isRoot,
  isSingleSegment,
  isEventRoot,
  onMouseOver,
  onMouseOut,
  onMouseDown,
  onMouseUp,
  onUiMouseOver,
  onUiMouseOut,
  onUiMouseUp,
  onPnMouseOver,
  onPnMouseOut,
  onPnMouseUp,
  parentId,
  togglePane,
  insideChildren,
  directionalChildIndex,
  dataPos,
  eventSeqChild,
  encapsulated,
  notFirstInsideChild,
  seqType,
  focused,
}) {
  const { styles, targetTokens } = useTree()
  const { id, nodeType } = data

  const translationColorClass = stylesToString([nodeColor(data.id, targetTokens, data)])
  const altParseInfo = data.alternateParseInfo
  const altParses = !!(altParseInfo && (altParseInfo.prevParse !== undefined || altParseInfo.nextParse !== undefined))

  const nodeCollapsed = dataCollapsable && collapsed &&
    (!hasSideChildren || (hasSideChildren && hasInsideChildren)) &&
    !isRoot && !isEventRoot

  const nodeConditionalClasses = cn({
    'node--root': isRoot,
    'node--has-alt-parses': altParses,
    'node--hover': active === 'hover',
    'node--toggle-ready': active === 'toggle-ready',
    'node--focused': focused,
    'node--focusing': nodeFocusing,
    'node--encapsulated': encapsulated,
    'node-container--collapsed': nodeCollapsed,
    'node-container--expanded': !nodeCollapsed,
    'node-container--active': active !== null && hasChildren && !hasSideChildren,
    'node--seq': hasInsideChildren,
    [translationColorClass]: true,
  })

  return (
    <div className="ft__tr__td ft--middle-parent">
      <div
        className={`node ${nodeConditionalClasses}`}
        id={id}
        data-parent-id={depth > 0 ? parentId : 'null'}
        data-node-type={nodeType}
        data-pos={dataPos}
        data-is-root={String(isRoot)}
        data-is-single-segment={String(isSingleSegment)}
        data-is-event-root={String(isEventRoot)}
        data-depth={depth}
        data-has-children={String(hasChildren)}
        data-has-side-children={String(hasSideChildren)}
        data-has-inside-children={String(hasInsideChildren)}
        data-has-down-children={String(hasDownChildren)}
        data-collapsable={String(dataCollapsable)}
        data-directional-child-index={directionalChildIndex}
        data-alt-parses={String(altParses)}
      >
        <NodeWord
          depth={depth}
          dataPos={dataPos}
          data={data}
          dataCollapsable={dataCollapsable}
          altParses={altParses}
          rollups={rollups}
          isRoot={isRoot}
          isEventRoot={isEventRoot}
          hasChildren={hasChildren}
          hasSideChildren={hasSideChildren}
          hasInsideChildren={hasInsideChildren}
          onMouseOver={onMouseOver}
          onMouseOut={onMouseOut}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onUiMouseOver={onUiMouseOver}
          onUiMouseOut={onUiMouseOut}
          onUiMouseUp={onUiMouseUp}
          onPnMouseOver={onPnMouseOver}
          onPnMouseOut={onPnMouseOut}
          onPnMouseUp={onPnMouseUp}
          togglePane={togglePane}
          insideChildren={insideChildren}
          encapsulated={encapsulated}
          eventSeqChild={eventSeqChild}
          notFirstInsideChild={notFirstInsideChild}
        />
        {canonicalChildren}
      </div>
    </div>
  )
}

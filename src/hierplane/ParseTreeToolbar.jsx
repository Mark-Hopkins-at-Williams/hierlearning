import { useTree } from './TreeContext'
import TreeExpansionControl from './TreeExpansionControl'

export default function ParseTreeToolbar({ disabled }) {
  const { collapseAllNodes, expandAllNodes } = useTree()

  return (
    <ul className={`parse-tree-toolbar${disabled ? ' parse-tree-toolbar--disabled' : ''}`}>
      <li className="parse-tree-toolbar__item">
        <TreeExpansionControl mode="implode" onClick={collapseAllNodes} />
        <div className="parse-tree-toolbar__item__label">Collapse all nodes</div>
        <div className="parse-tree-toolbar__item__mask" />
      </li>
      <li className="parse-tree-toolbar__item">
        <TreeExpansionControl mode="explode" onClick={expandAllNodes} />
        <div className="parse-tree-toolbar__item__label">Expand all nodes</div>
        <div className="parse-tree-toolbar__item__mask" />
      </li>
    </ul>
  )
}

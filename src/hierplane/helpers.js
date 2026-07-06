export function isSingleSegment(kind) {
  return kind !== 'top-level-and' && kind !== 'and'
}

export function colorToString(arr = []) {
  return (arr || []).filter(item => item.indexOf('color') === 0).join('')
}

export function assignNodeIds(node, prefix = '', childIdx = 0) {
  const result = { ...node }
  if (!result.id) result.id = `${prefix}${childIdx}`
  if (Array.isArray(result.children)) {
    result.children = result.children.map((child, idx) =>
      assignNodeIds(child, `${result.id}.`, idx)
    )
  }
  return result
}

export function findAllNodeTypes(node) {
  const types = new Set([node.nodeType])
  if (Array.isArray(node.children)) {
    node.children.forEach(child => findAllNodeTypes(child).forEach(t => types.add(t)))
  }
  return types
}

export function generateStylesForNodeTypes(nodeTypes) {
  const result = {}
  let i = 0
  for (const nodeType of nodeTypes) {
    result[nodeType] = [`color${(i % 6) + 1}`]
    i++
  }
  return result
}

export function getCollapsibleNodeIds(node, singleSegment) {
  const { id, children = [] } = node
  const hasChildren = children.length > 0
  const isRoot = id.length === 1
  const isEventRoot = (!singleSegment && id.length === 3) || (singleSegment && isRoot)
  const dataCollapsible = hasChildren && !isRoot && !isEventRoot
  const result = new Set(dataCollapsible ? [id] : [])
  if (hasChildren) {
    children.forEach(child =>
      getCollapsibleNodeIds(child, singleSegment).forEach(cid => result.add(cid))
    )
  }
  return result
}

export function getSentenceTokens(node) {
  if (!node) return []
  const entries = []
  function walk(n) {
    const annotations = n.alternateParseInfo?.spanAnnotations
    if (annotations) {
      const selfItem = annotations.find(item => item.spanType === 'self')
      if (selfItem) entries.push({ id: n.id, lo: selfItem.lo })
    }
    if (n.children) n.children.forEach(walk)
  }
  walk(node)
  return entries.sort((a, b) => a.lo - b.lo).map(e => e.id)
}

export function getSentenceTokensWithPos(node) {
  if (!node) return []
  const entries = []
  function walk(n) {
    const annotations = n.alternateParseInfo?.spanAnnotations
    if (annotations) {
      const selfItem = annotations.find(item => item.spanType === 'self')
      if (selfItem) entries.push({ id: n.id, lo: selfItem.lo })
    }
    if (n.children) n.children.forEach(walk)
  }
  walk(node)
  return entries.sort((a, b) => a.lo - b.lo)
}

export function nodeColor(nodeId, targetTokens, node = null) {
  if (!nodeId || !targetTokens?.length) return 'color4'
  // (a) directly translated
  if (targetTokens.some(t => t.word && !t.isPunct && t.nodeId === nodeId)) return 'color2'
  // (b) all leaf descendants are covered by some translation token
  if (node) {
    const leafIds = getLeafDescendants(node)
    if (leafIds.length > 0 && leafIds.every(leafId =>
      targetTokens.some(t => t.word && !t.isPunct && (
        t.nodeId === leafId || leafId.startsWith(t.nodeId + '.')
      ))
    )) return 'color2'
  }
  return 'color4'
}

export function getLeafDescendants(node) {
  if (!node.children?.length) return node.spans ? [node.id] : []
  return node.children.flatMap(getLeafDescendants)
}

export function buildTokenMap(node) {
  const map = {}
  if (!node) return map
  function walk(n) {
    map[n.id] = n
    if (n.children) n.children.forEach(walk)
  }
  walk(node)
  return map
}

export function pathToNode(id) {
  if (!id) return new Set()
  const parts = id.split('.')
  const result = new Set()
  for (let i = 1; i <= parts.length; i++) result.add(parts.slice(0, i).join('.'))
  return result
}

function getAllChildSpans(node) {
  if (!Array.isArray(node.children) || node.children.length === 0) return []
  return node.children.flatMap(n => (n.spans || []).concat(getAllChildSpans(n)))
}

function getSpanBoundaries(node) {
  const allSpans = getAllChildSpans(node).concat(node.spans || [])
  if (allSpans.length === 0) return undefined
  return allSpans.reduce(
    (b, s) => ({ start: Math.min(b.start, s.start), end: Math.max(b.end, s.end) }),
    { start: allSpans[0].start, end: allSpans[0].end }
  )
}

export function translateSpans(origNode) {
  const node = { ...origNode }
  if (Array.isArray(node.children)) {
    node.children = node.children.map(translateSpans)
  }
  if (!node.alternateParseInfo) {
    const boundaries = getSpanBoundaries(node)
    if (boundaries) {
      node.alternateParseInfo = { charNodeRoot: { charLo: boundaries.start, charHi: boundaries.end } }
    }
    const spanAnnotations = (node.children || [])
      .filter(n => n.alternateParseInfo?.charNodeRoot)
      .map(n => ({ lo: n.alternateParseInfo.charNodeRoot.charLo, hi: n.alternateParseInfo.charNodeRoot.charHi, spanType: 'child' }))
      .concat((node.spans || []).map(s => ({ lo: s.start, hi: s.end, spanType: s.spanType || 'self' })))
      .sort((a, b) => a.lo - b.lo)
    if (spanAnnotations.length > 0) {
      if (!node.alternateParseInfo) node.alternateParseInfo = {}
      node.alternateParseInfo.spanAnnotations = spanAnnotations
    }
  }
  return node
}

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { TreeContext } from './TreeContext'
import { assignNodeIds, translateSpans, generateStylesForNodeTypes, findAllNodeTypes, pathToNode, getCollapsibleNodeIds, isSingleSegment, getSentenceTokensWithPos, buildTokenMap } from './helpers'
import MainStage from './MainStage'
import Passage from './Passage'
import ParseTreeToolbar from './ParseTreeToolbar'
import IconSprite from './IconSprite'

// Resolve an SCFG rule template to a string using the current token list.
// Multi-pass callers handle nested rules by passing an already-resolved list.
function resolveRuleToString(rule, tokenList) {
  return rule.map(part => {
    if (part.text !== undefined) return part.text
    const tok = tokenList.find(t => !t.isPunct && t.nodeId === part.nodeId && t.word !== null)
    if (tok) return tok.word
    const desc = tokenList.filter(t => !t.isPunct && t.nodeId.startsWith(part.nodeId + '.'))
    return desc.map(t => t.word ?? '').filter(Boolean).join(' ')
  }).join('')
}

export default function Tree({ tree, onTranslationChange, initialTranslation, onReparse, loading }) {
  const [expandedNodeIds, setExpandedNodeIds] = useState(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [hoverNodeId, setHoverNodeId] = useState(null)
  const [wordOverrides, setWordOverrides] = useState(initialTranslation?.wordOverrides ?? {})
  const [targetTokens, setTargetTokens] = useState([])
  const [contentZoom, setContentZoom] = useState(1)
  const [rootOverride, setRootOverride] = useState(null)
  const [draggingNodeId, setDraggingNodeId] = useState(null)
  const [dragOverNodeId, setDragOverNodeIdState] = useState(null)
  const dragOverNodeIdRef = useRef(null)
  const setDragOverNodeId = (val) => { dragOverNodeIdRef.current = val; setDragOverNodeIdState(val) }
  const [phraseRules, setPhraseRulesRaw] = useState({})
  const [reorderCount, setReorderCount] = useState(0)
  const pendingLoToWordRef = useRef(null)
  const pendingCloneTokenRef = useRef(null)
  const pendingLoOrderRef = useRef(null)
  const pendingExtraTokensRef = useRef(null)
  const pendingCloneHandleMapRef = useRef(null)
  const editingInsertRef = useRef(null)

  const setPhraseRule = useCallback((nodeId, rule) => setPhraseRulesRaw(prev =>
    rule == null
      ? (nodeId in prev ? (({ [nodeId]: _, ...rest }) => rest)(prev) : prev)
      : { ...prev, [nodeId]: rule }
  ), [])

  useEffect(() => {
    setExpandedNodeIds(new Set())
    setSelectedNodeId(null)
    setHoverNodeId(null)
    setWordOverrides(initialTranslation?.wordOverrides ?? {})
    setRootOverride(null)
    setPhraseRulesRaw({})
  }, [tree]) // eslint-disable-line

  const setWordOverride = (nodeId, word) =>
    setWordOverrides(prev => ({ ...prev, [nodeId]: word }))

  const processed = useMemo(() => {
    if (!tree?.root) return null
    const root = translateSpans(assignNodeIds(tree.root))
    const styles = tree.nodeTypeToStyle || generateStylesForNodeTypes(findAllNodeTypes(root))
    return { root, styles, text: tree.text || '', punctTokens: tree.punctTokens || [] }
  }, [tree])

  const effectiveRoot = useMemo(() => rootOverride ?? processed?.root ?? null, [rootOverride, processed])
  const tokenMap = useMemo(() => effectiveRoot ? buildTokenMap(effectiveRoot) : {}, [effectiveRoot])
  const sentenceTokenEntries = useMemo(() => effectiveRoot ? getSentenceTokensWithPos(effectiveRoot) : [], [effectiveRoot])

  useEffect(() => {
    const loToWord = pendingLoToWordRef.current
    pendingLoToWordRef.current = null
    const pendingClone = pendingCloneTokenRef.current
    pendingCloneTokenRef.current = null
    const pendingLoOrder = pendingLoOrderRef.current
    pendingLoOrderRef.current = null
    const pendingExtra = pendingExtraTokensRef.current
    pendingExtraTokensRef.current = null
    const pendingCloneHandleMap = pendingCloneHandleMapRef.current
    pendingCloneHandleMapRef.current = null
    if (initialTranslation?.targetTokens?.length && !loToWord && !pendingClone && !pendingLoOrder && !pendingCloneHandleMap) {
      setTargetTokens(initialTranslation.targetTokens)
    } else {
      const wordTokens = sentenceTokenEntries.map(e => ({
        id: e.id, nodeId: e.id, word: loToWord?.[e.lo] ?? null, lo: e.lo,
      }))
      if (pendingClone) {
        wordTokens.push({ id: pendingClone.cloneId, nodeId: pendingClone.cloneId, word: null, lo: pendingClone.lo })
      }
      const pTokens = (processed?.punctTokens || []).map(pt => ({
        id: `__punct__${pt.start}`,
        nodeId: `__punct__${pt.start}`,
        word: pt.text,
        lo: pt.start,
        isPunct: true,
      }))
      let merged
      if (pendingLoOrder?.length) {
        const byLo = Object.fromEntries(wordTokens.map(t => [t.lo, t]))
        const realLos = pendingLoOrder.filter(x => typeof x === 'number')
        const coveredLos = new Set(realLos.map(String))
        const cloneById = Object.fromEntries((pendingExtra ?? []).map(t => [t.nodeId, t]))
        const clonesCovered = new Set()
        const ordered = pendingLoOrder.map(item => {
          if (typeof item === 'number') return byLo[item]
          if (item?.cloneId) { clonesCovered.add(item.cloneId); return cloneById[item.cloneId] }
          return null
        }).filter(Boolean)
        const remaining = wordTokens.filter(t => !coveredLos.has(String(t.lo)))
        const uncoveredExtra = (pendingExtra ?? []).filter(t => !clonesCovered.has(t.nodeId))
        merged = [...ordered, ...remaining, ...pTokens, ...uncoveredExtra].map(({ lo, ...t }) => t)
      } else {
        // Sort word and punct tokens separately so clone tokens (no lo) can be
        // inserted between content words and punctuation, not after the period.
        const sortedWords = wordTokens.sort((a, b) => a.lo - b.lo).map(({ lo, ...t }) => t)
        const sortedPunct = pTokens.sort((a, b) => a.lo - b.lo).map(({ lo, ...t }) => t)
        if (pendingExtra?.length) {
          merged = [...sortedWords, ...pendingExtra, ...sortedPunct]
        } else {
          const cloneTokens = []
          if (pendingCloneHandleMap) {
            const findClones = (n) => {
              if (n.cloneHandle && (n.cloneHandle in pendingCloneHandleMap) && !n.children?.length)
                cloneTokens.push({ id: n.id, nodeId: n.id, word: pendingCloneHandleMap[n.cloneHandle] ?? null })
              ;(n.children || []).forEach(findClones)
            }
            if (effectiveRoot) findClones(effectiveRoot)
          }
          merged = [...sortedWords, ...cloneTokens, ...sortedPunct]
        }
      }
      setTargetTokens(merged)
    }
  }, [sentenceTokenEntries]) // eslint-disable-line

  useEffect(() => {
    if (targetTokens.length > 0 && onTranslationChange) {
      const preview = resolvedTargetTokens
        .filter(t => !t.isPunct)
        .map(t => t.word ?? wordOverrides[t.nodeId] ?? tokenMap[t.nodeId]?.word ?? '')
        .join(' ')
      const hasChanges =
        Object.keys(wordOverrides).length > 0 ||
        targetTokens.some(t => !t.isPunct && t.word !== null)
      onTranslationChange({ preview, hasChanges, state: { targetTokens, wordOverrides } })
    }
  }, [targetTokens, wordOverrides]) // eslint-disable-line

  const editTargetToken = (id, word) => {
    const tok = targetTokens.find(t => t.id === id)
    if (tok?.nodeId && phraseRules[tok.nodeId]) setPhraseRule(tok.nodeId, null)
    setTargetTokens(prev => prev.map(t => t.id === id ? { ...t, word } : t))
  }

  const mergeTokensForNode = (nodeId, newWord) => {
    function findNode(n) {
      if (n.id === nodeId) return n
      for (const c of n.children || []) { const f = findNode(c); if (f) return f }
      return null
    }
    const node = effectiveRoot ? findNode(effectiveRoot) : null
    if (!node) return
    const allIds = new Set()
    function collectIds(n) { allIds.add(n.id); for (const c of n.children || []) collectIds(c) }
    collectIds(node)

    if (!node.children?.length) {
      // Leaf: collapse all matching tokens into one (order-preserving for TargetPassage)
      setTargetTokens(prev => {
        const hits = prev.map((t, i) => allIds.has(t.nodeId) ? i : -1).filter(i => i >= 0)
        if (!hits.length) return prev
        const removeSet = new Set(hits.slice(1))
        return prev
          .map((t, i) => i === hits[0] ? { ...t, nodeId, word: newWord } : t)
          .filter((_, i) => !removeSet.has(i))
      })
    } else {
      // Phrase: keep child tokens so they stay visible and editable.
      // Add/update a phrase-level token for this node.
      setTargetTokens(prev => {
        const existingIdx = prev.findIndex(t => t.nodeId === nodeId)
        if (existingIdx >= 0) {
          return prev.map((t, i) => i === existingIdx ? { ...t, word: newWord } : t)
        }
        // Insert phrase token before the first descendant token
        const hits = prev.map((t, i) => allIds.has(t.nodeId) ? i : -1).filter(i => i >= 0)
        const insertAt = hits.length ? hits[0] : prev.length
        const newToken = { id: `__phrase__${nodeId}`, nodeId, word: newWord }
        const next = [...prev]
        next.splice(insertAt, 0, newToken)
        return next
      })
    }
  }

  // Re-resolve phrase tokens from their rules on every render.
  // Multiple passes handle nested rules (VP rule referencing PP rule referencing leaves).
  const resolvedTargetTokens = useMemo(() => {
    if (!Object.keys(phraseRules).length) return targetTokens
    let cur = targetTokens
    for (let pass = 0; pass < 8; pass++) {
      let changed = false
      const next = cur.map(t => {
        const rule = phraseRules[t.nodeId]
        if (!rule) return t
        const resolved = resolveRuleToString(rule, cur)
        if (resolved === t.word) return t
        changed = true
        return { ...t, word: resolved }
      })
      if (!changed) break
      cur = next
    }
    return cur
  }, [targetTokens, phraseRules])

  const toggleNode = (id) => setExpandedNodeIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const expandNode = (id) => setExpandedNodeIds(prev =>
    prev.has(id) ? prev : new Set([...prev, id])
  )

  const expandPathToNode = (id) => setExpandedNodeIds(prev => {
    const next = new Set(prev)
    pathToNode(id).forEach(ancestor => next.add(ancestor))
    return next
  })

  const collapseAllNodes = () => setExpandedNodeIds(new Set())

  const expandAllNodes = () => setExpandedNodeIds(
    effectiveRoot ? getCollapsibleNodeIds(effectiveRoot, isSingleSegment(effectiveRoot.nodeType)) : new Set()
  )

  // Map char-lo position → current translation word, for preserving translations
  // across tree restructures where node IDs change but source positions stay stable.
  const getNodeLo = (node) => {
    if (!node) return null
    if (node.spans?.length) return Math.min(...node.spans.map(s => s.start))
    const lows = (node.children || []).map(getNodeLo).filter(x => x != null)
    return lows.length ? Math.min(...lows) : null
  }

  const buildLoToWord = () => {
    const map = {}
    for (const token of targetTokens) {
      if (token.word === null) continue
      const lo = getNodeLo(tokenMap[token.nodeId])
      if (lo != null) map[lo] = token.word
    }
    return map
  }

  // Maps cloneHandle → word for all clone tokens currently in targetTokens.
  // cloneHandle survives stripIds (only id/alternateParseInfo are stripped), so the
  // new tree's clone nodes can be found by handle even after assignNodeIds renumbers them.
  const buildCloneHandleMap = () => {
    const map = {}
    for (const token of targetTokens) {
      if (token.isPunct) continue
      const node = tokenMap[token.nodeId]
      if (node?.cloneHandle) map[node.cloneHandle] = token.word  // null is fine — preserves the slot
    }
    return Object.keys(map).length ? map : null
  }

  const cloneNodeAsSibling = (nodeId) => {
    if (!effectiveRoot) return
    const node = tokenMap[nodeId]
    if (!node || node.children?.length) return

    // Derive parent directly from the hierarchical ID ("0.1.2" → parent "0.1")
    const idParts = nodeId.split('.')
    if (idParts.length <= 1) return
    const parentId = idParts.slice(0, -1).join('.')
    if (!tokenMap[parentId]) return

    const originalIdx = parseInt(idParts[idParts.length - 1])
    // After assignNodeIds the clone lands at parentId + '.' + (originalIdx + 1)
    const expectedCloneId = parentId + '.' + (originalIdx + 1)

    const clone = {
      nodeType: node.nodeType,
      word: node.word,
      link: node.link,
      spans: [],  // Empty spans: clone doesn't appear in sentenceTokenEntries (no duplicate source token)
      cloneSourceId: nodeId,  // Points to the original node for hover correspondence
      cloneHandle: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,  // Stable across stripIds
    }

    function stripIds(n) {
      const { id, alternateParseInfo, ...rest } = n
      if (rest.children) rest.children = rest.children.map(stripIds)
      return rest
    }
    function insertAfter(n) {
      if (n.id === parentId) {
        const idx = n.children.findIndex(c => c.id === nodeId)
        if (idx < 0) return n
        return { ...n, children: [...n.children.slice(0, idx + 1), clone, ...n.children.slice(idx + 1)] }
      }
      if (!n.children) return n
      return { ...n, children: n.children.map(insertAfter) }
    }

    // Synthetic lo just after the original so the clone token sorts immediately after it
    const originalLo = node.spans?.length ? Math.min(...node.spans.map(s => s.start)) : 0
    pendingCloneTokenRef.current = { cloneId: expectedCloneId, lo: originalLo + 0.5 }
    pendingLoToWordRef.current = buildLoToWord()
    pendingCloneHandleMapRef.current = buildCloneHandleMap()  // Preserve any pre-existing clone tokens
    setPhraseRulesRaw({})
    setRootOverride(translateSpans(assignNodeIds(stripIds(insertAfter(effectiveRoot)))))
  }

  const reorderChildren = (draggedId, targetId) => {
    if (!effectiveRoot || draggedId === targetId) return
    const dParts = draggedId.split('.')
    const tParts = targetId.split('.')
    if (dParts.length !== tParts.length || dParts.length <= 1) return
    const parentId = dParts.slice(0, -1).join('.')
    if (tParts.slice(0, -1).join('.') !== parentId) return

    function doReorder(n) {
      if (n.id === parentId) {
        const dIdx = n.children.findIndex(c => c.id === draggedId)
        const tIdx = n.children.findIndex(c => c.id === targetId)
        if (dIdx < 0 || tIdx < 0) return n
        const kids = [...n.children]
        const [dragged] = kids.splice(dIdx, 1)
        kids.splice(tIdx, 0, dragged)
        return { ...n, children: kids }
      }
      if (!n.children) return n
      return { ...n, children: n.children.map(doReorder) }
    }

    const newTreeRoot = doReorder(effectiveRoot)

    // Build a prefix-remap table: for each child of parentId whose position changed,
    // map its old ID prefix (e.g. "0.1") to the new one (e.g. "0.2").
    // This lets us fix stale expandedNodeIds and selectedNodeId after the reorder.
    function findInTree(n, id) {
      if (n.id === id) return n
      for (const c of n.children || []) { const f = findInTree(c, id); if (f) return f }
      return null
    }
    const parentInNew = findInTree(newTreeRoot, parentId)
    const idPrefixRemap = {}
    if (parentInNew?.children) {
      parentInNew.children.forEach((child, newIdx) => {
        const newPrefix = parentId + '.' + newIdx
        if (child.id !== newPrefix) idPrefixRemap[child.id] = newPrefix
      })
    }
    function applyRemap(id) {
      for (const [oldPfx, newPfx] of Object.entries(idPrefixRemap)) {
        if (id === oldPfx || id.startsWith(oldPfx + '.'))
          return newPfx + id.slice(oldPfx.length)
      }
      return id
    }
    if (Object.keys(idPrefixRemap).length > 0) {
      setExpandedNodeIds(prev => new Set([...prev].map(applyRemap)))
      setSelectedNodeId(prev => prev ? applyRemap(prev) : prev)
    }

    // Preserve tokens for nodes with no spans (clones): they're invisible to
    // sentenceTokenEntries, so the useEffect would silently drop them. Save
    // them with remapped IDs so the useEffect can re-append them.
    const sentenceIds = new Set(sentenceTokenEntries.map(e => e.id))
    const extraTokens = targetTokens
      .filter(t => !t.isPunct && !sentenceIds.has(t.nodeId))
      .map(t => ({ ...t, id: applyRemap(t.id), nodeId: applyRemap(t.nodeId) }))
    pendingExtraTokensRef.current = extraTokens.length ? extraTokens : null

    // Walk the reordered tree in tree order to derive the desired target token lo sequence.
    // Clone nodes (no spans, no children) emit a { cloneId } marker so the useEffect
    // can place them at the correct tree-order position rather than appending at the end.
    const newLoOrder = []
    function walkLo(node) {
      const self = node.alternateParseInfo?.spanAnnotations?.find(s => s.spanType === 'self')
      if (self) {
        newLoOrder.push(self.lo)
      } else if (!node.children?.length) {
        newLoOrder.push({ cloneId: applyRemap(node.id) })
      }
      if (node.children) node.children.forEach(walkLo)
    }
    walkLo(newTreeRoot)

    function stripIds(n) {
      const { id, alternateParseInfo, ...rest } = n
      if (rest.children) rest.children = rest.children.map(stripIds)
      return rest
    }

    // Remap cloneSourceId fields so they keep pointing to the correct original after ID reassignment
    function remapCloneSourceIds(n) {
      const result = { ...n }
      if (result.cloneSourceId) result.cloneSourceId = applyRemap(result.cloneSourceId)
      if (result.children) result.children = result.children.map(remapCloneSourceIds)
      return result
    }
    const newProcessedRoot = translateSpans(assignNodeIds(stripIds(remapCloneSourceIds(newTreeRoot))))
    pendingLoOrderRef.current = newLoOrder.length ? newLoOrder : null
    pendingLoToWordRef.current = buildLoToWord()
    setPhraseRulesRaw({})
    setDragOverNodeId(null)
    setDraggingNodeId(null)
    setReorderCount(c => c + 1)
    setRootOverride(newProcessedRoot)
  }

  const isValidMove = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId || !effectiveRoot) return false
    const fromNode = tokenMap[fromId]
    const toNode = tokenMap[toId]
    if (!fromNode || !toNode) return false

    function hasDescendant(node, id) {
      return (node.children || []).some(c => c.id === id || hasDescendant(c, id))
    }
    if (hasDescendant(fromNode, toId)) return false

    let fromParentId = null
    function findParent(node) {
      for (const c of node.children || []) {
        if (c.id === fromId) { fromParentId = node.id; return }
        findParent(c)
      }
    }
    findParent(effectiveRoot)
    if (fromParentId === toId) return false

    const nLo = fromNode.alternateParseInfo?.charNodeRoot?.charLo
    const nHi = fromNode.alternateParseInfo?.charNodeRoot?.charHi
    if (nLo == null) return false

    const TOLERANCE = 3

    // Drop onto a leaf → will group them; just check they're adjacent in the sentence.
    if (!toNode.children?.length) {
      const tLo = toNode.alternateParseInfo?.charNodeRoot?.charLo
      const tHi = toNode.alternateParseInfo?.charNodeRoot?.charHi
      if (tLo == null) return false
      return Math.abs(nHi - tLo) <= TOLERANCE || Math.abs(tHi - nLo) <= TOLERANCE
    }

    // Drop onto a phrase → will reparent; check adjacency among non-ancestor siblings.
    const children = (toNode.children || [])
      .filter(c => c.id !== fromId && !hasDescendant(c, fromId))
      .map(c => ({ lo: c.alternateParseInfo?.charNodeRoot?.charLo, hi: c.alternateParseInfo?.charNodeRoot?.charHi }))
      .filter(c => c.lo != null)
      .sort((a, b) => a.lo - b.lo)

    if (children.length === 0) return true

    const insertIdx = children.findIndex(c => c.lo > nLo)
    const prev = insertIdx > 0 ? children[insertIdx - 1] : insertIdx === -1 ? children[children.length - 1] : null
    const next = insertIdx >= 0 ? children[insertIdx] : null

    return (!prev || Math.abs(nLo - prev.hi) <= TOLERANCE) && (!next || Math.abs(nHi - next.lo) <= TOLERANCE)
  }

  const moveNode = (fromId, toId) => {
    if (!isValidMove(fromId, toId) || !effectiveRoot) return

    const fromNode = tokenMap[fromId]
    const toNode = tokenMap[toId]

    let fromParentId = null
    let toParentId = null
    function findParents(node) {
      for (const c of node.children || []) {
        if (c.id === fromId) fromParentId = node.id
        if (c.id === toId) toParentId = node.id
        findParents(c)
      }
    }
    findParents(effectiveRoot)
    if (!fromParentId) return

    function collapseUnary(node) {
      if (!node?.children?.length) return node
      const children = node.children.map(collapseUnary).filter(Boolean)
      if (children.length === 1) return { ...children[0], link: node.link }
      return { ...node, children }
    }

    function stripIds(node) {
      const { id, alternateParseInfo, ...rest } = node
      if (rest.children) rest.children = rest.children.map(stripIds)
      return rest
    }

    function effectiveCharLo(n) {
      if (n.spans?.length) return Math.min(...n.spans.map(s => s.start))
      const childLos = (n.children || []).map(effectiveCharLo).filter(isFinite)
      return childLos.length ? Math.min(...childLos) : Infinity
    }

    function effectiveCharHi(n) {
      if (n.spans?.length) return Math.max(...n.spans.map(s => s.end))
      const childHis = (n.children || []).map(effectiveCharHi).filter(isFinite)
      return childHis.length ? Math.max(...childHis) : -Infinity
    }

    function removeFrom(node) {
      if (node.id === fromParentId) {
        const newCh = node.children.filter(c => c.id !== fromId)
        const lo = Math.min(...newCh.map(effectiveCharLo).filter(isFinite))
        const hi = Math.max(...newCh.map(effectiveCharHi).filter(isFinite))
        const word = processed?.text && isFinite(lo) && isFinite(hi) ? processed.text.slice(lo, hi) : node.word
        return { ...node, children: newCh, word }
      }
      if (!node.children) return node
      return { ...node, children: node.children.map(removeFrom) }
    }

    function applyAndFinish(newRoot) {
      pendingLoToWordRef.current = buildLoToWord()
      pendingCloneHandleMapRef.current = buildCloneHandleMap()
      setPhraseRulesRaw({})
      const root = translateSpans(assignNodeIds(stripIds(collapseUnary(newRoot))))
      setRootOverride(root)
      setDragOverNodeId(null)
      setDraggingNodeId(null)
    }

    const nLo = effectiveCharLo(fromNode)

    // Drop onto a leaf → group fromNode and toNode into a new phrase in place of toNode.
    if (!toNode.children?.length) {
      if (!toParentId) return
      const tLo = effectiveCharLo(toNode)
      const [first, second] = nLo < tLo ? [fromNode, toNode] : [toNode, fromNode]
      function getAllSpans(n) {
        return [...(n.spans || []), ...(n.children || []).flatMap(getAllSpans)]
      }
      const allSpans = getAllSpans(first).concat(getAllSpans(second))
      const lo = Math.min(...allSpans.map(s => s.start))
      const hi = Math.max(...allSpans.map(s => s.end))
      const group = {
        nodeType: first.nodeType,
        word: processed?.text ? processed.text.slice(lo, hi) : `${first.word} ${second.word}`,
        link: toNode.link,
        children: [first, second],
      }
      function groupIn(node) {
        if (node.id === toParentId) {
          return { ...node, children: node.children
            .map(c => c.id === toId ? group : c)
            .filter(c => c.id !== fromId) }
        }
        if (!node.children) return node
        return { ...node, children: node.children.map(groupIn) }
      }
      applyAndFinish(groupIn(removeFrom(effectiveRoot)))
      return
    }

    // Drop onto a phrase → reparent fromNode as a child, ordered by span position.
    function insertInto(node) {
      if (node.id === toId) {
        const existing = node.children || []
        const idx = existing.findIndex(c => effectiveCharLo(c) > nLo)
        const newCh = idx < 0 ? [...existing, fromNode] : [...existing.slice(0, idx), fromNode, ...existing.slice(idx)]
        const lo = Math.min(...newCh.map(effectiveCharLo).filter(isFinite))
        const hi = Math.max(...newCh.map(effectiveCharHi).filter(isFinite))
        const word = processed?.text && isFinite(lo) && isFinite(hi) ? processed.text.slice(lo, hi) : node.word
        return { ...node, children: newCh, word }
      }
      if (!node.children) return node
      return { ...node, children: node.children.map(insertInto) }
    }
    applyAndFinish(insertInto(removeFrom(effectiveRoot)))
  }

  const focusNode = (data) => {
    if (data === 'defocus') setSelectedNodeId(null)
    else setSelectedNodeId(data.id)
  }

  const hoverNode = (id) => setHoverNodeId(id === 'none' ? null : id)

  if (!processed) {
    return (
      <TreeContext.Provider value={{ text: '', data: null, styles: null, contentZoom: 1, onReparse, loading }}>
        <div className="hierplane">
          <div className="pane-container">
            <div className="pane pane--scroll">
              <Passage />
            </div>
          </div>
          <IconSprite />
        </div>
      </TreeContext.Provider>
    )
  }

  const ctx = {
    expandedNodeIds,
    toggleNode,
    expandNode,
    expandPathToNode,
    collapseAllNodes,
    expandAllNodes,
    focusNode,
    hoverNode,
    wordOverrides,
    setWordOverride,
    selectedNodeId,
    hoverNodeId,
    styles: processed.styles,
    positions: { coord: 'inside' },
    linkLabels: {},
    text: processed.text,
    layout: 'default',
    readOnly: true,
    rollups: true,
    data: effectiveRoot,
    tokenMap,
    targetTokens: resolvedTargetTokens,
    editTargetToken,
    setPhraseRule,
    mergeTokensForNode,
    draggingNodeId,
    setDraggingNodeId,
    dragOverNodeId,
    dragOverNodeIdRef,
    setDragOverNodeId,
    isValidMove,
    moveNode,
    cloneNodeAsSibling,
    reorderChildren,
    reorderCount,
    contentZoom,
    setContentZoom,
    onReparse,
    loading,
    editingInsertRef,
  }

  return (
    <TreeContext.Provider value={ctx}>
      <div className="hierplane">
        <div className="pane-container">
          <div className="pane pane--scroll">
            <Passage />
            <div className="pane pane--fill">
              <ParseTreeToolbar />
              <MainStage data={effectiveRoot} />
            </div>
          </div>
        </div>
        <IconSprite />
      </div>
    </TreeContext.Provider>
  )
}

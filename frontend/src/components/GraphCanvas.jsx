import React, { useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, MarkerType, ReactFlowProvider, useReactFlow } from 'reactflow'
import dagre from 'dagre'
import ClassNode from './ClassNode.jsx'
import fallbackData from '../data/graphData.json'

const nodeTypes = { classNode: ClassNode }
const EDGE_COLORS = { contains: '#9ca3af', imports: '#a855f7', uses: '#3b82f6', validates_via: '#f59e0b', writes_to: '#14b8a6' }
// Keep dagre's layout box aligned with the visible node size in index.css.
const NODE_WIDTH = 240
const NODE_HEIGHT = 132

function normalizeGraph(graph) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]))
  const children = new Map(graph.nodes.map((node) => [node.id, []]))
  graph.edges.forEach((edge) => {
    if (children.has(edge.source)) children.get(edge.source).push(edge.target)
    if (incoming.has(edge.target)) incoming.set(edge.target, incoming.get(edge.target) + 1)
  })

  const roots = graph.nodes.filter((node) => !incoming.get(node.id)).map((node) => node.id)
  const depths = new Map(roots.map((id) => [id, 0]))
  const queue = [...roots]
  while (queue.length) {
    const current = queue.shift()
    for (const child of children.get(current) || []) {
      if (!depths.has(child)) {
        depths.set(child, depths.get(current) + 1)
        queue.push(child)
      }
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      depth: node.depth ?? depths.get(node.id) ?? 0,
      children: node.children || children.get(node.id) || [],
      expanded: node.expanded ?? (node.depth ?? depths.get(node.id) ?? 0) === 0,
    })),
  }
}

function getVisibleGraph(graph, expandedIds, isolateId) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const visibleIds = new Set()
  const walk = (id) => {
    if (visibleIds.has(id)) return
    visibleIds.add(id)
    const node = byId.get(id)
    if (expandedIds.has(id)) (node?.children || []).forEach(walk)
  }
  graph.nodes.filter((node) => node.depth === 0).forEach((node) => walk(node.id))

  let isolatedIds = null
  if (isolateId) {
    isolatedIds = new Set([isolateId])
    let changed = true
    while (changed) {
      changed = false
      graph.edges.forEach((edge) => {
        const isContainment = edge.type === 'contains'
        if (isolatedIds.has(edge.source) && !isolatedIds.has(edge.target)) {
          isolatedIds.add(edge.target)
          changed = true
        }
        if (!isContainment && isolatedIds.has(edge.target) && !isolatedIds.has(edge.source)) {
          isolatedIds.add(edge.source)
          changed = true
        }
      })
    }
  }

  const nodes = graph.nodes.filter((node) => visibleIds.has(node.id)).map((node) => ({
    ...node,
    dimmed: Boolean(isolatedIds && !isolatedIds.has(node.id)),
  }))
  const visibleSet = new Set(nodes.map((node) => node.id))
  const edges = graph.edges
    .filter((edge) => visibleSet.has(edge.source) && visibleSet.has(edge.target))
    .map((edge) => ({
      ...edge,
      dimmed: Boolean(isolatedIds && (!isolatedIds.has(edge.source) || !isolatedIds.has(edge.target))),
    }))

  return { nodes, edges }
}

function layoutNodes(nodes, edges) {
  const layout = new dagre.graphlib.Graph()
  layout.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 80, marginx: 40, marginy: 40 })
  layout.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((node) => layout.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach((edge) => layout.setEdge(edge.source, edge.target))
  dagre.layout(layout)

  return nodes.map((node) => {
    const position = layout.node(node.id)
    return { ...node, position: { x: position.x - NODE_WIDTH / 2, y: position.y - NODE_HEIGHT / 2 } }
  })
}

function GraphView({ graph, expandedIds, isolateId, selectedId, onSelectNode, onToggleNode, onIsolate, onOpenFile, onContextMenu }) {
  const { fitView } = useReactFlow()
  const { nodes, edges } = useMemo(() => {
    const visible = getVisibleGraph(graph, expandedIds, isolateId)
    return {
      nodes: layoutNodes(visible.nodes, visible.edges).map((node) => ({
        id: node.id,
        type: 'classNode',
        position: node.position,
        data: { ...node, selected: node.id === selectedId, expanded: expandedIds.has(node.id), onSelect: onSelectNode, onToggle: onToggleNode, onIsolate, onOpenFile, onContextMenu },
      })),
      edges: visible.edges.map((edge) => {
        const color = EDGE_COLORS[edge.type] || '#8b949e'
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: 'straight',
          style: { stroke: color, strokeWidth: edge.type === 'imports' ? 2.2 : 1.5, opacity: edge.dimmed ? 0.15 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          labelStyle: { fill: '#c9d1d9', fontSize: 11, opacity: edge.dimmed ? 0.15 : 1 },
          labelBgStyle: { fill: '#0d1117' },
        }
      }),
    }
  }, [graph, expandedIds, isolateId, selectedId, onSelectNode, onToggleNode, onIsolate, onOpenFile, onContextMenu])

  useEffect(() => {
    fitView({ padding: 0.2, duration: 250 })
  }, [fitView, nodes.length, isolateId])

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView panOnDrag zoomOnScroll>
      <Background color="#30363d" gap={20} />
      <Controls />
      <MiniMap pannable zoomable nodeColor={(node) => node.data?.dimmed ? '#30363d' : '#58a6ff'} style={{ background: '#161b22' }} />
    </ReactFlow>
  )
}

export default function GraphCanvas({ onSelectNode, onOpenFile, onContextMenu }) {
  const [graph, setGraph] = useState(() => window.__ARCHLENS_DATA__ || null)
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [isolateId, setIsolateId] = useState(null)
  const [search, setSearch] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    const handleWorkspaceGraph = (event) => {
      if (event.data?.command === 'workspaceGraphLoading') {
        setIsLoading(true)
        setLoadError('')
      }
      if (event.data?.command === 'workspaceGraph') {
        setGraph(event.data.graph)
        setIsLoading(false)
        setLoadError('')
      }
      if (event.data?.command === 'workspaceGraphError') {
        setIsLoading(false)
        setLoadError(event.data.message || 'Workspace scan failed.')
      }
    }
    window.addEventListener('message', handleWorkspaceGraph)
    if (window.__ARCHLENS_VSCODE__) {
      window.__ARCHLENS_VSCODE_API__?.postMessage({ command: 'refresh' })
      return () => window.removeEventListener('message', handleWorkspaceGraph)
    }

    fetch(window.__ARCHLENS_BROWSER__ ? '/api/graph' : 'http://localhost:4000/api/graph')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((nextGraph) => { setGraph(nextGraph); setIsLoading(false); setLoadError('') })
      .catch(() => { setGraph(fallbackData); setIsLoading(false); setLoadError('Live backend unavailable; showing sample data.') })
    return () => window.removeEventListener('message', handleWorkspaceGraph)
  }, [])

  const normalizedGraph = useMemo(() => graph && normalizeGraph(graph), [graph])

  useEffect(() => {
    if (!normalizedGraph) return
    setExpandedIds(new Set(normalizedGraph.nodes.filter((node) => node.expanded).map((node) => node.id)))
    setIsolateId(null)
  }, [normalizedGraph])

  const selectNode = (node) => {
    setSelectedId(node.id)
    const relatedEdges = normalizedGraph.edges.filter((edge) => edge.source === node.id || edge.target === node.id)
    const byId = new Map(normalizedGraph.nodes.map((item) => [item.id, item]))
    onSelectNode({
      ...node,
      incoming: relatedEdges.filter((edge) => edge.target === node.id).map((edge) => ({ ...edge, node: byId.get(edge.source) })),
      outgoing: relatedEdges.filter((edge) => edge.source === node.id).map((edge) => ({ ...edge, node: byId.get(edge.target) })),
    })
  }

  const contextMenuNode = (node) => {
    selectNode(node)
    if (onContextMenu) {
      const relatedEdges = normalizedGraph.edges.filter((edge) => edge.source === node.id || edge.target === node.id)
      const byId = new Map(normalizedGraph.nodes.map((item) => [item.id, item]))
      onContextMenu({
        ...node,
        incoming: relatedEdges.filter((edge) => edge.target === node.id).map((edge) => ({ ...edge, node: byId.get(edge.source) })),
        outgoing: relatedEdges.filter((edge) => edge.source === node.id).map((edge) => ({ ...edge, node: byId.get(edge.target) })),
      })
    }
  }

  const toggleNode = (node) => {
    if (!node.children?.length) return
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })
    selectNode(node)
  }

  const searchNode = () => {
    if (!normalizedGraph || !search.trim()) return
    const query = search.trim().toLowerCase()
    const match = normalizedGraph.nodes.find((node) => node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query))
    if (match) {
      const ancestorIds = new Set()
      let parent = normalizedGraph.nodes.find((node) => node.children?.includes(match.id))
      while (parent) {
        ancestorIds.add(parent.id)
        parent = normalizedGraph.nodes.find((node) => node.children?.includes(parent.id))
      }
      setExpandedIds((current) => new Set([...current, ...ancestorIds]))
      setIsolateId(match.id)
      selectNode(match)
    }
  }

  if (!graph || !normalizedGraph) return <div className="panel-loading">{isLoading ? 'Analysing workspace...' : loadError || 'No graph data available.'}</div>

  return (
    <div className="graph-container">
      <div className="graph-toolbar">
        <div className="graph-search">
          <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && searchNode()} placeholder="Search file or folder" aria-label="Search file or folder" />
          <button type="button" onClick={searchNode}>Search</button>
        </div>
        {isolateId && <button type="button" onClick={() => setIsolateId(null)}>Show all</button>}
        <span className="graph-path">{normalizedGraph.rootPath || 'Workspace graph'}</span>
      </div>
      {loadError && <div className="graph-notice">{loadError}</div>}
      <ReactFlowProvider>
        <GraphView graph={normalizedGraph} expandedIds={expandedIds} isolateId={isolateId} selectedId={selectedId} onSelectNode={selectNode} onToggleNode={toggleNode} onIsolate={setIsolateId} onOpenFile={onOpenFile} onContextMenu={contextMenuNode} />
      </ReactFlowProvider>
    </div>
  )
}

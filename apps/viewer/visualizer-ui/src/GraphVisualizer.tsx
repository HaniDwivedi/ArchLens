import React, { useState, useMemo, useRef, useEffect } from 'react';
export type GraphEdge = {
  url: string;
  method: string;
};



export type GraphData = Record<string, GraphEdge[]>;

interface NodePosition {
  id: string;
  edges: GraphEdge[];
  x: number;
  y: number;
}

interface GraphVisualizerProps {
  jsonData: GraphData;
  mode?: 'beginner' | 'pro';
}

export function GraphVisualizer({ jsonData, mode = 'beginner' }: GraphVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interactive Viewport State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Node Dragging State
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const rawNodes = useMemo(() => Object.entries(jsonData ?? {}), [jsonData]);

  // Generate dynamic positions automatically in a circle layout on data load
  useEffect(() => {
    const total = rawNodes.length;
    const radius = Math.max(250, total * 65);
    const initialPos: Record<string, { x: number; y: number }> = {};

    rawNodes.forEach(([name], idx) => {
      const angle = (idx / total) * 2 * Math.PI;
      initialPos[name] = {
        x: 600 + radius * Math.cos(angle),
        y: 400 + radius * Math.sin(angle),
      };
    });
    setNodePositions(initialPos);
  }, [rawNodes]);

  if (rawNodes.length === 0) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        No architecture data loaded. Run ArchLens scan to view graph.
      </div>
    );
  }

  // Handle Pan & Zoom Events
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(Math.max(prev * zoomFactor, 0.3), 3));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).tagName === 'DIV') {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (draggedNode) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      
      setNodePositions((prev) => ({
        ...prev,
        [draggedNode]: { x: mouseX, y: mouseY }
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNode(null);
  };

  // Build Layout Node Metadata
  const nodeItems: NodePosition[] = rawNodes.map(([name, edges]) => ({
    id: name,
    edges,
    x: nodePositions[name]?.x ?? 400,
    y: nodePositions[name]?.y ?? 300,
  }));

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#090d16',
        cursor: isPanning ? 'grabbing' : 'grab',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Controls Bar */}
      <div style={{ position: 'absolute', right: 20, top: 20, zIndex: 20, display: 'flex', gap: '8px' }}>
        <button onClick={() => setZoom((z) => Math.min(z + 0.2, 3))} style={btnStyle}>+</button>
        <button onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))} style={btnStyle}>-</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={btnStyle}>Reset View</button>
      </div>

      <svg width="100%" height="100%" style={{ width: '100%', height: '100%' }}>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          
          {/* Render Connections/Edges */}
          {nodeItems.flatMap((node) =>
            node.edges.map((edge, idx) => {
              const targetNode = nodeItems.find((n) => n.id === edge.url);
              if (!targetNode) return null;

              // Curved Bezier calculation between Node Centers
              const dx = targetNode.x - node.x;
              const dy = targetNode.y - node.y;
              const cx1 = node.x + dx / 2;
              const cy1 = node.y;
              const cx2 = node.x + dx / 2;
              const cy2 = targetNode.y;

              return (
                <g key={`${node.id}-${edge.url}-${idx}`}>
                  <path
                    d={`M ${node.x + 90} ${node.y + 25} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${targetNode.x + 90} ${targetNode.y + 25}`}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.8"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                  {mode === 'pro' && (
                    <text x={(node.x + targetNode.x) / 2} y={(node.y + targetNode.y) / 2 - 5} fill="#7dd3fc" fontSize="10">
                      {edge.method}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Render Interactive Nodes */}
          {nodeItems.map((node) => {
            const isExpanded = !!expandedNodes[node.id];
            const cardHeight = isExpanded ? Math.max(70, 45 + node.edges.length * 20) : 50;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggedNode(node.id);
                }}
                style={{ cursor: 'move' }}
              >
                <rect
                  width="180"
                  height={cardHeight}
                  rx="10"
                  fill="#1e293b"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
                
                {/* Node Title Header */}
                <text x="12" y="28" fill="#f8fafc" fontSize="13" fontWeight="bold">
                  {node.id.length > 18 ? node.id.slice(0, 15) + '...' : node.id}
                </text>

                {/* Expand Toggle */}
                {node.edges.length > 0 && (
                  <text
                    x="155"
                    y="28"
                    fill="#38bdf8"
                    fontSize="12"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedNodes((prev) => ({ ...prev, [node.id]: !prev[node.id] }));
                    }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </text>
                )}

                {/* Expandable Connections List */}
                {isExpanded &&
                  node.edges.map((edge, idx) => (
                    <text key={idx} x="12" y={52 + idx * 18} fill="#94a3b8" fontSize="10">
                      {edge.method} → {edge.url}
                    </text>
                  ))}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#f8fafc',
  border: '1px solid #334155',
  padding: '6px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
};
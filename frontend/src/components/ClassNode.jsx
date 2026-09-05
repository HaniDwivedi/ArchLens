import React from 'react'
import { Handle, Position } from 'reactflow'

// Colors keyed by the "color" field coming from the JSON node data
const COLORS = {
  blue:  { border: '#3b82f6', header: '#16233d' },
  green: { border: '#22c55e', header: '#122a1c' },
  amber: { border: '#f59e0b', header: '#2e2410' },
  teal:  { border: '#14b8a6', header: '#102825' },
  purple: { border: '#a855f7', header: '#26133d' },
  pink: { border: '#ec4899', header: '#3b152d' },
  gray:  { border: '#4b5563', header: '#1c2128' },
}

// One component renders every node "type" (service, object, handler, component).
// Which fields show up (properties / methods / refs) is driven entirely by
// what exists in that node's data -- this is the piece that lets the same
// component represent a class, a service, or a DB handler.
export default function ClassNode({ data }) {
  const theme = COLORS[data.color] || COLORS.gray

  return (
    <div
      className={'class-node' + (data.selected ? ' selected' : '')}
      style={{ borderColor: theme.border, opacity: data.dimmed ? 0.15 : 1 }}
      onClick={() => {
        if (data.onSelect) data.onSelect(data)
        if (data.onToggle) data.onToggle(data)
      }}
      onDoubleClick={() => {
        if (data.type === 'file' && data.onOpenFile) data.onOpenFile(data.id)
        else if (data.onIsolate) data.onIsolate(data.id)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        if (data.onContextMenu) data.onContextMenu(data)
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div className="class-node-header" style={{ background: theme.header }}>
        <span className="class-node-title">
          {data.children?.length ? (data.expanded ? '▾ ' : '▸ ') : ''}{data.label}
        </span>
        {data.subtitle ? <span className="class-node-subtitle">{data.subtitle}</span> : null}
      </div>

      {Array.isArray(data.properties) && data.properties.length > 0 && (
        <div className="class-node-section">
          {data.properties.map((p) => (
            <div className="class-node-row" key={p}>
              <span className="dot" style={{ background: theme.border }} />
              {p}
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.methods) && data.methods.length > 0 && (
        <div className="class-node-section">
          {data.methods.map((m) => (
            <div className="class-node-row" key={m}>
              <span className="dot method-dot" />
              {m}
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.refs) && data.refs.length > 0 && (
        <div className="class-node-section refs">
          {data.refs.map((r) => (
            <div className="class-node-row ref" key={r}>{r}</div>
          ))}
        </div>
      )}

      {data.type === 'file' && ((data.dependsOn?.length || 0) > 0 || (data.dependedBy?.length || 0) > 0) && (
        <div className="class-node-section dependency-summary">
          <div>Depends on: {data.dependsOn?.length || 0}</div>
          <div>Used by: {data.dependedBy?.length || 0}</div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

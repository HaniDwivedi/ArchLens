import React, { useEffect, useState } from 'react'
import fallbackData from '../data/schemaData.json'

export default function SchemaPanel({ selectedNode }) {
  const [schema, setSchema] = useState(null)
  const [activeTable, setActiveTable] = useState('Orders')

  useEffect(() => {
    fetch('http://localhost:4000/api/schema')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setSchema)
      .catch(() => setSchema(fallbackData))
  }, [])

  useEffect(() => {
    if (!schema || !selectedNode) return
    const match = schema.tableList.find((tableName) => selectedNode.label.toLowerCase().includes(tableName.toLowerCase()))
    if (match) setActiveTable(match)
  }, [schema, selectedNode])

  if (!schema) return <div className="panel-loading">Loading...</div>
  const table = schema.tables[activeTable] || { columns: [] }

  return (
    <div className="side-panel schema-panel">
      <h3>Schema Explorer</h3>
      <div className="selection-note">
        {selectedNode && schema.tableList.includes(activeTable) ? `Showing ${activeTable} for ${selectedNode.label}` : 'Example schema data'}
      </div>
      <div className="schema-body">
        <div className="schema-table-title">
          <strong>{activeTable}</strong>
          <span>{table.columns.length} columns</span>
        </div>
        <table className="schema-table">
          <thead>
            <tr><th>Column</th><th>Data type</th><th>Nullable</th><th>Key / index</th></tr>
          </thead>
          <tbody>
            {table.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.type}</td>
                <td>{c.nullable ? 'Yes' : 'No'}</td>
                <td>{c.primaryKey ? <span className="primary-key">PK</span> : c.indexes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="table-list">
          {schema.tableList.map((t) => (
            <div
              key={t}
              className={'table-list-item' + (t === activeTable ? ' active' : '')}
              onClick={() => setActiveTable(t)}
            >
              {t}
            </div>
          ))}
        </div>

        {schema.relationships?.length > 0 && (
          <div className="schema-relations">
            <div className="field-label">Table relationships</div>
            {schema.relationships.map((relation) => (
              <div className="schema-relation" key={`${relation.from}-${relation.to}`}>
                <span>{relation.from}</span><b>→</b><span>{relation.to}</span>
                <small>{relation.label}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import React from 'react'

const TOOLS = ['Data Flow Trace', 'API Dependents', 'Schema References']

export default function AnalysisPanel({ selectedNode }) {
  const relationships = [...(selectedNode?.incoming || []), ...(selectedNode?.outgoing || [])]

  return (
    <div className="side-panel">
      <h3>Analysis panel</h3>
      <div className="field-label">Developer needs for legacy code</div>
      <ul className="tool-list">
        {TOOLS.map((t) => <li key={t}>{t}</li>)}
      </ul>

      <div className="field-label" style={{ marginTop: 16 }}>Selected node</div>
      {selectedNode ? (
        <div className="mono-line">
          <div><b>{selectedNode.label}</b> ({selectedNode.type})</div>
          <div className="analysis-purpose">This component is defined here. Review its linked files before changing it.</div>
          {selectedNode.properties?.[0] && <div>Path: {selectedNode.properties[0]}</div>}
          {selectedNode.children && <div>Contains: {selectedNode.children.length} items</div>}
          {selectedNode.apiRoutes && <div>Routes: {selectedNode.apiRoutes.length}</div>}
          {selectedNode.parseError && <div className="error-line">Parse warning: {selectedNode.parseError}</div>}
          {selectedNode.methods && selectedNode.methods.length > 0 && (
            <div>Methods: {selectedNode.methods.join(', ')}</div>
          )}
          {selectedNode.type === 'file' && (
            <div className="dependency-detail">
              <div>Depends on: {selectedNode.dependsOn?.length || 0} file(s)</div>
              <div>Used by: {selectedNode.dependedBy?.length || 0} file(s)</div>
            </div>
          )}
          {selectedNode.type === 'class' && <div>Responsibility: class with {selectedNode.methods?.length || 0} method(s)</div>}
          {selectedNode.type === 'function' && <div>Responsibility: callable function or handler</div>}
          {selectedNode.type === 'file' && <div className="impact-summary">
            {selectedNode.incoming?.length || selectedNode.outgoing?.length
              ? 'Changing this file may affect the linked files below.'
              : 'No resolved relationships found for this file.'}
          </div>}
          {relationships.length > 0 && <div className="relationship-list">
            <div className="field-label">Relationships</div>
            {relationships.map((relationship) => (
              <div className="relationship-row" key={relationship.id}>
                <span className={relationship.source === selectedNode.id ? 'relationship-direction out' : 'relationship-direction in'}>
                  {relationship.source === selectedNode.id ? 'OUT' : 'IN'}
                </span>
                <span>{relationship.type}</span>
                <span className="relationship-target">{relationship.node?.label || relationship.target || relationship.source}</span>
              </div>
            ))}
          </div>}
        </div>
      ) : (
        <div className="empty-inspector">
          <strong>Nothing selected</strong>
          <span>Click a file, folder, class, or function in the graph.</span>
          <span>Double-click a file to open it in VS Code.</span>
        </div>
      )}
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import fallbackData from '../data/apiData.json'

export default function ApiExplorerPanel({ selectedNode }) {
  const [api, setApi] = useState(null)

  useEffect(() => {
    fetch('http://localhost:4000/api/api-explorer')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setApi)
      .catch(() => setApi(fallbackData))
  }, [])

  if (!api) return <div className="panel-loading">Loading...</div>

  const routes = selectedNode?.apiRoutes || []
  const hasSelection = selectedNode?.type === 'file'

  return (
    <div className="side-panel">
      <h3>API Explorer</h3>

      <div className="field">
        {hasSelection && routes.length > 0 && <div className="selection-note">Routes found in {selectedNode.label}</div>}
        {hasSelection && routes.length === 0 && <div className="selection-note">No routes detected in {selectedNode.label}</div>}
        {!hasSelection && <div className="selection-note">Click a file with routes to see them live.</div>}
        {routes.length > 0 && routes.map((route) => (
          <div className="route-row" key={`${route.method}:${route.path}:${route.line}`}>
            <strong>{route.method}</strong><span>{route.path}</span><small>{route.handler}</small>
          </div>
        ))}
      </div>

      {!hasSelection && <>
        <div className="field">
          <div className="field-label">Internal</div>
          {api.internal.map((url, i) => <div className="mono-line" key={i}>{url}</div>)}
          <div className="field-label">External</div>
          {api.external.map((url, i) => <div className="mono-line" key={i}>{url}</div>)}
        </div>

        <div className="field">
          <div className="field-label">Source call location</div>
          <div className="mono-line">{api.sourceCallLocation}</div>
        </div>

        <div className="field">
          <div className="field-label">Request payload</div>
          <pre className="code-block">{JSON.stringify(api.requestPayload, null, 2)}</pre>
        </div>

        <div className="field">
          <div className="field-label">Response structure</div>
          <pre className="code-block">{JSON.stringify(api.responsePayload, null, 2)}</pre>
        </div>
      </>}
    </div>
  )
}

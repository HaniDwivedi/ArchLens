import React, { useEffect, useState, useCallback } from 'react'
import GraphCanvas from './components/GraphCanvas.jsx'
import ApiExplorerPanel from './components/ApiExplorerPanel.jsx'
import SchemaPanel from './components/SchemaPanel.jsx'
import AnalysisPanel from './components/AnalysisPanel.jsx'

const TABS = ['Analysis', 'API Explorer', 'Schema Explorer']

export default function App() {
  const [tab, setTab] = useState('Analysis')
  const [selectedNode, setSelectedNode] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(380)
  const [isResizing, setIsResizing] = useState(false)

  const sendToExtension = (message) => {
    window.__ARCHLENS_VSCODE_API__?.postMessage(message)
  }

  const handleSelectNode = (node) => {
    setSelectedNode(node)
    setTab('Analysis')
  }

  const handleContextMenu = (node) => {
    setSelectedNode(node)
    setTab('Analysis')
    setPanelOpen(true)
  }

  const refreshGraph = () => {
    window.__ARCHLENS_VSCODE_API__?.postMessage({ command: 'refresh' })
  }

  const openBrowser = () => {
    if (window.__ARCHLENS_VSCODE__) {
      window.__ARCHLENS_VSCODE_API__?.postMessage({ command: 'openBrowser' })
      return
    }

    if (window.__ARCHLENS_BROWSER__) {
      window.open(window.location.href, '_blank')
      return
    }

    window.location.href = 'http://127.0.0.1:4321/'
  }

  // Handle panel resizing smoothly
  const startResizing = useCallback(() => {
    setIsResizing(true)
    document.body.classList.add('resizing-panel')
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
    document.body.classList.remove('resizing-panel')
  }, [])

  const resize = useCallback(
    (mouseMoveEvent) => {
      if (isResizing) {
        const newWidth = window.innerWidth - mouseMoveEvent.clientX
        setPanelWidth(Math.min(650, Math.max(300, newWidth)))
      }
    },
    [isResizing]
  )

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize)
      window.addEventListener('mouseup', stopResizing)
    }
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [isResizing, resize, stopResizing])

  return (
    <div className={`app-shell ${panelOpen ? 'panel-open' : 'panel-closed'}`}>
      {/* Canvas Main Area */}
      <main className="graph-area">
        <div className="app-actions">
          <button type="button" onClick={refreshGraph} title="Refresh workspace graph" aria-label="Refresh workspace graph">↻ <span>Refresh</span></button>
          <button type="button" onClick={openBrowser} title="Open this graph in your browser" aria-label="Open this graph in your browser">↗ <span>Open in Browser</span></button>
        </div>
        <GraphCanvas
          onSelectNode={handleSelectNode}
          onContextMenu={handleContextMenu}
          onOpenFile={(filePath) =>
            sendToExtension({ command: 'openFile', path: filePath })
          }
        />

        {/* Floating Toggle Button (Appears when side panel is closed) */}
        {!panelOpen && (
          <button
            className="panel-toggle-button"
            onClick={() => setPanelOpen(true)}
            title="Open Details Panel"
            aria-label="Open Details Panel"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <span>Inspector</span>
          </button>
        )}
      </main>

      {/* Side Inspector Panel */}
      {panelOpen && (
        <aside
          className={`side-area ${isResizing ? 'is-resizing' : ''}`}
          style={{ width: panelWidth }}
        >
          {/* Resize Drag Handle */}
          <div
            className="panel-resizer"
            onMouseDown={startResizing}
            title="Drag to resize panel"
            role="separator"
            aria-orientation="vertical"
          />

          {/* Panel Header Tabs */}
          <header className="panel-header">
            <div className="tab-group" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === tab}
                  className={`tab ${t === tab ? 'active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              className="close-panel"
              type="button"
              onClick={() => setPanelOpen(false)}
              title="Close panel"
              aria-label="Close details panel"
            >
              ✕
            </button>
          </header>

          {/* Panel Dynamic Content */}
          <section className="panel-content">
            {tab === 'Analysis' && <AnalysisPanel selectedNode={selectedNode} />}
            {tab === 'API Explorer' && <ApiExplorerPanel selectedNode={selectedNode} />}
            {tab === 'Schema Explorer' && <SchemaPanel selectedNode={selectedNode} />}
          </section>
        </aside>
      )}
    </div>
  )
}
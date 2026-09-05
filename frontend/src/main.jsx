import React from 'react'
import ReactDOM from 'react-dom/client'
import 'reactflow/dist/style.css'
import './index.css'
import App from './App.jsx'

if (window.__ARCHLENS_VSCODE__ && typeof acquireVsCodeApi === 'function') {
  window.__ARCHLENS_VSCODE_API__ = acquireVsCodeApi()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

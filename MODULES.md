# ArchLens Modules

## backend/server.js
- Language: javascript
- Depends on:
  - cors
  - express
  - fs
  - path
  - url
- Depended on by:
  - none
- Unresolved imports:
  - express
  - cors
  - fs
  - path
  - url

## extension/codeParser.js
- Language: javascript
- Depends on:
  - @babel/parser
  - path
- Depended on by:
  - extension/extension.js
- Unresolved imports:
  - path
  - @babel/parser

## extension/extension.js
- Language: javascript
- Depends on:
  - extension/codeParser.js
  - fs
  - http
  - path
  - url
  - vscode
- Depended on by:
  - none
- Unresolved imports:
  - vscode
  - fs
  - path
  - http
  - url

## extension/webview/assets/index-kS-cuMTW.js
- Language: javascript
- Depends on:
  - none
- Depended on by:
  - none
- Unresolved imports: none

## frontend/src/App.jsx
- Language: javascript
- Depends on:
  - frontend/src/components/AnalysisPanel.jsx
  - frontend/src/components/ApiExplorerPanel.jsx
  - frontend/src/components/GraphCanvas.jsx
  - frontend/src/components/SchemaPanel.jsx
  - react
- Depended on by:
  - frontend/src/main.jsx
- Unresolved imports:
  - react

## frontend/src/components/AnalysisPanel.jsx
- Language: javascript
- Depends on:
  - react
- Depended on by:
  - frontend/src/App.jsx
- Unresolved imports:
  - react

## frontend/src/components/ApiExplorerPanel.jsx
- Language: javascript
- Depends on:
  - ../data/apiData.json
  - react
- Depended on by:
  - frontend/src/App.jsx
- Unresolved imports:
  - react
  - ../data/apiData.json

## frontend/src/components/ClassNode.jsx
- Language: javascript
- Depends on:
  - react
  - reactflow
- Depended on by:
  - frontend/src/components/GraphCanvas.jsx
- Unresolved imports:
  - react
  - reactflow

## frontend/src/components/GraphCanvas.jsx
- Language: javascript
- Depends on:
  - ../data/graphData.json
  - dagre
  - frontend/src/components/ClassNode.jsx
  - react
  - reactflow
- Depended on by:
  - frontend/src/App.jsx
- Unresolved imports:
  - react
  - reactflow
  - dagre
  - ../data/graphData.json

## frontend/src/components/SchemaPanel.jsx
- Language: javascript
- Depends on:
  - ../data/schemaData.json
  - react
- Depended on by:
  - frontend/src/App.jsx
- Unresolved imports:
  - react
  - ../data/schemaData.json

## frontend/src/main.jsx
- Language: javascript
- Depends on:
  - ./index.css
  - frontend/src/App.jsx
  - react
  - react-dom/client
  - reactflow/dist/style.css
- Depended on by:
  - none
- Unresolved imports:
  - react
  - react-dom/client
  - reactflow/dist/style.css
  - ./index.css

## frontend/vite.config.js
- Language: javascript
- Depends on:
  - @vitejs/plugin-react
  - vite
- Depended on by:
  - none
- Unresolved imports:
  - vite
  - @vitejs/plugin-react

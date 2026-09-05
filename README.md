# Legacy code visualizer — starter

## Run it

Backend (serves the graph/api/schema JSON — this is where your real code
parser will eventually plug in):

    cd backend
    npm install
    npm start
    # -> http://localhost:4000

Frontend (React + Vite + React Flow):

    cd frontend
    npm install
    npm run dev
    # -> http://localhost:5173

  ## Run as a VS Code extension

  The `extension/` folder contains the VS Code extension host. Build the webview
  bundle, then open the repository in VS Code and press `F5` from the `extension/`
  folder (or use **Run Extension** from the Run and Debug view). In the Extension
  Development Host, run **Archlens: Visualize Workspace** from the Command Palette.

  ```text
  cd frontend
  npm run build
  cd ../extension
  npm install
  ```

  The extension scans the first opened workspace folder, shows folders, files,
  classes, and functions as a connected graph, and refreshes when files are
  created, deleted, renamed, or saved. JavaScript and TypeScript files also
  show relative import edges and detected Express-style routes (`get`, `post`,
  `put`, `delete`, and `patch`). It ignores common generated directories such
  as `node_modules`, `.git`, `dist`, and `build`.

  Parsing is bounded for interactive use: only `.js`, `.jsx`, `.ts`, `.tsx`,
  `.mjs`, and `.cjs` files up to 300 KB are parsed. Oversized or invalid files
  remain visible in the file tree and expose a parse warning in the Analysis
  panel; oversized files are marked as skipped instead of preventing the rest
  of the workspace from loading.

  After installation, reload VS Code. A **View Arch** button appears in the
  status bar, similar to Live Server's **Go Live** button. Click it to open the
  architecture view for the currently opened folder.

  Inside the view, use **Hide panel** to give the graph the full window. Use
  **Open in browser** to launch the same live graph at `http://127.0.0.1:4321/`.
  The port can be changed in VS Code Settings under `Archlens: Browser Port`.

  ### Manual installation for any user

  1. Share `extension/archlens-0.1.1.vsix` with the user.
  2. In VS Code, open Extensions with `Ctrl+Shift+X`.
  3. Open the `...` menu and choose **Install from VSIX...**.
  4. Select the `.vsix` file and reload VS Code.
  5. Open a project folder and click **View Arch** in the status bar.

  The VSIX is a self-contained extension package. Other users do not need this
  repository, Node.js, or the backend server to use the workspace visualization.

The frontend tries the backend first (`fetch('http://localhost:4000/...')`)
and falls back to the static JSON in `frontend/src/data/` if the backend
isn't running yet — so you can build the UI and the parser independently.

## Where things live

- `frontend/src/data/graphData.json` — the node/edge schema discussed in
  chat: `nodes[]` (id, type, color, label, properties, methods) and
  `edges[]` (id, source, target, type, label). This is the file to swap
  for real parser output.
- `frontend/src/components/ClassNode.jsx` — the UML-style box renderer.
  It reads whatever `properties` / `methods` / `refs` exist on a node —
  nothing is hardcoded per node type, so a "service" and an "object" use
  the same component.
- `frontend/src/components/GraphCanvas.jsx` — turns the JSON into React
  Flow's `nodes`/`edges` shape. This is also where the arrowheads are
  set (`markerEnd: { type: MarkerType.ArrowClosed }`) — without that line
  React Flow draws a plain line with no arrow.
- `frontend/src/components/ApiExplorerPanel.jsx`,
  `SchemaPanel.jsx`, `AnalysisPanel.jsx` — the three right-hand panels,
  switched via tabs in `App.jsx`.
- `extension/codeParser.js` — the Babel-based source parser used by the
  extension host.
- `backend/data/*.json` — same shape as the frontend fallback data;
  replace `backend/server.js`'s `loadJson()` calls with your actual
  parser/DB introspection logic once that's ready.

## Next steps to wire in your real parser

1. Point your AST-parsing step at each source file, and for every
   class/service/handler you find, push a node into `nodes[]`.
2. For every call, `new X()`, import, or field reference you detect,
   push an edge into `edges[]` with a `type` (`contains`, `uses`,
   `validates_via`, `writes_to`, or add your own).
3. Have your parser write straight into `backend/data/graph.json` (or
   a real DB), and `/api/graph` will serve it as-is — no frontend
   changes needed.

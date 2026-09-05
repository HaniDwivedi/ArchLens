const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const http = require('http')
const { URL } = require('url')
const { parseSourceFile, isParsable } = require('./codeParser')

let panel
let refreshTimer
let browserServer
const MAX_PARSE_BYTES = 300 * 1024

function getActiveWorkspaceRoot() {
  const activeEditor = vscode.window.activeTextEditor
  if (activeEditor?.document?.uri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)
    if (folder) return folder
  }

  return vscode.workspace.workspaceFolders?.[0] || null
}

function activate(context) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000)
  statusBarItem.text = '$(graph) Archlens'
  statusBarItem.tooltip = 'Open the Archlens workspace visualization for the active project'
  statusBarItem.command = 'archlens.visualizeWorkspace'
  statusBarItem.name = 'Archlens'
  statusBarItem.show()

  const openCommand = vscode.commands.registerCommand('archlens.visualizeWorkspace', () => {
    if (!getActiveWorkspaceRoot()) {
      vscode.window.showWarningMessage('Open a project folder before running Archlens.')
      return
    }
    openPanel(context)
  })

  const refreshCommand = vscode.commands.registerCommand('archlens.refreshWorkspace', () => {
    refreshPanel(context)
  })

  const browserCommand = vscode.commands.registerCommand('archlens.openBrowser', () => {
    openBrowser(context)
  })

  const fileEvents = [
    vscode.workspace.onDidCreateFiles(() => scheduleRefresh(context)),
    vscode.workspace.onDidDeleteFiles(() => scheduleRefresh(context)),
    vscode.workspace.onDidRenameFiles(() => scheduleRefresh(context)),
    vscode.workspace.onDidSaveTextDocument(() => scheduleRefresh(context)),
  ]

  context.subscriptions.push(statusBarItem, openCommand, refreshCommand, browserCommand, ...fileEvents)
}

function openPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One)
    refreshPanel(context)
    return
  }

  panel = vscode.window.createWebviewPanel(
    'archlens',
    'Archlens',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')],
    },
  )

  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === 'refresh') refreshPanel(context)
    if (message.command === 'openBrowser') openBrowser(context)
    if (message.command === 'openFile' && typeof message.path === 'string') {
      const root = getActiveWorkspaceRoot()
      if (root) {
        const uri = vscode.Uri.joinPath(root.uri, ...message.path.split('/'))
        vscode.window.showTextDocument(uri)
      }
    }
  }, undefined, context.subscriptions)

  panel.onDidDispose(() => {
    panel = undefined
  }, undefined, context.subscriptions)

  panel.webview.html = getWebviewHtml(context, panel.webview)
  refreshPanel(context)
}

async function openBrowser(context) {
  const port = vscode.workspace.getConfiguration('archlens').get('browserPort', 4321)
  if (!browserServer) {
    browserServer = http.createServer(async (request, response) => {
      const requestUrl = new URL(request.url, `http://${request.headers.host}`)
      if (requestUrl.pathname === '/api/graph') {
        const graph = await buildWorkspaceGraph()
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
        response.end(JSON.stringify(graph))
        return
      }

      const webviewRoot = path.join(context.extensionPath, 'webview')
      const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
      const filePath = path.resolve(webviewRoot, `.${requestedPath}`)
      if (!filePath.startsWith(path.resolve(webviewRoot))) {
        response.writeHead(403)
        response.end('Forbidden')
        return
      }

      fs.readFile(filePath, 'utf8', (error, content) => {
        if (error) {
          response.writeHead(404)
          response.end('Not found')
          return
        }
        const type = filePath.endsWith('.js') ? 'text/javascript' : filePath.endsWith('.css') ? 'text/css' : 'text/html'
        const html = filePath.endsWith('.html')
          ? content.replace('</head>', '<script>window.__ARCHLENS_BROWSER__ = true</script></head>')
          : content
        response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' })
        response.end(html)
      })
    })

    await new Promise((resolve, reject) => {
      browserServer.once('error', reject)
      browserServer.listen(port, '127.0.0.1', resolve)
    }).catch((error) => {
      browserServer = undefined
      if (error.code === 'EADDRINUSE') throw new Error(`Port ${port} is already in use. Change archlens.browserPort in Settings.`)
      throw error
    })
  }

  const address = browserServer.address()
  const url = `http://127.0.0.1:${address.port}/`
  await vscode.env.openExternal(vscode.Uri.parse(url))
  vscode.window.showInformationMessage(`Archlens is running at ${url}`)
}

function scheduleRefresh(context) {
  if (!panel) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => refreshPanel(context), 300)
}

async function refreshPanel(context) {
  if (!panel) return

  panel.webview.postMessage({ command: 'workspaceGraphLoading' })
  try {
    const graph = await buildWorkspaceGraph()
    panel.webview.postMessage({ command: 'workspaceGraph', graph })
  } catch (error) {
    panel.webview.postMessage({ command: 'workspaceGraphError', message: error.message })
    vscode.window.showErrorMessage(`Archlens could not scan the workspace: ${error.message}`)
  }
}

async function buildWorkspaceGraph() {
  const root = getActiveWorkspaceRoot()
  if (!root) {
    return { rootPath: '', nodes: [], edges: [] }
  }

  const files = await vscode.workspace.findFiles(
    '**/*',
    [
      '**/{node_modules,.git,dist,build,coverage,.next,.vscode}/**',
      '**/{package-lock.json,.vscodeignore}',
    ],
    2000,
  )
  const paths = new Set([''])

  for (const file of files) {
    const relativePath = vscode.workspace.asRelativePath(file, false).replace(/\\/g, '/')
    const segments = relativePath.split('/')
    for (let index = 1; index <= segments.length; index += 1) {
      paths.add(segments.slice(0, index).join('/'))
    }
  }

  const sortedPaths = [...paths].sort((left, right) => {
    if (left === '') return -1
    if (right === '') return 1
    return left.localeCompare(right)
  })
  const filePaths = new Set(files.map((file) => vscode.workspace.asRelativePath(file, false).replace(/\\/g, '/')))
  const childrenById = new Map([...paths].map((value) => [value || '__workspace_root__', []]))
  for (const relativePath of sortedPaths) {
    if (!relativePath) continue
    const parent = relativePath.includes('/')
      ? relativePath.slice(0, relativePath.lastIndexOf('/'))
      : ''
    childrenById.get(parent || '__workspace_root__')?.push(relativePath)
  }

  const nodes = sortedPaths.map((relativePath) => {
    const isFile = filePaths.has(relativePath)
    const segments = relativePath ? relativePath.split('/') : []
    const depth = segments.length
    const label = relativePath ? segments[segments.length - 1] : path.basename(root.uri.fsPath)
    const id = relativePath || '__workspace_root__'

    return {
      id,
      type: isFile ? 'file' : 'folder',
      label,
      subtitle: isFile ? 'file' : 'folder',
      color: isFile ? fileColor(label) : 'amber',
      properties: isFile ? [relativePath] : [`${depth} level${depth === 1 ? '' : 's'}`],
      methods: [],
      refs: [],
      children: childrenById.get(id) || [],
      depth,
      expanded: depth === 0,
    }
  })

  const fileNodes = nodes.filter((node) => node.type === 'file')
  const enriched = await Promise.all(fileNodes.map((node) => enrichWithCode(root, node)))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const symbolEdges = []
  const importEdges = []
  const fileIds = new Set(fileNodes.map((node) => node.id))

  enriched.forEach(({ fileId, symbols, imports, apiRoutes, parseError, skipped }) => {
    const fileNode = nodesById.get(fileId)
    if (!fileNode) return
    fileNode.apiRoutes = apiRoutes
    fileNode.parseError = parseError || null
    fileNode.parseSkipped = skipped || false
    symbols.forEach((symbol) => {
      const symbolNode = {
        id: symbol.id,
        type: symbol.kind,
        label: symbol.name,
        subtitle: symbol.kind,
        color: symbol.kind === 'class' ? 'purple' : 'pink',
          properties: symbol.properties?.length ? symbol.properties : [`${fileId}:${symbol.line || 1}`],
        methods: symbol.methods,
        refs: symbol.extendsName ? [`extends ${symbol.extendsName}`] : [],
        children: [],
        depth: (fileNode.depth || 0) + 1,
        expanded: false,
      }
      nodesById.set(symbolNode.id, symbolNode)
      fileNode.children.push(symbolNode.id)
      symbolEdges.push({
        id: `contains:${fileId}:${symbolNode.id}`,
        source: fileId,
        target: symbolNode.id,
        type: 'contains',
        label: 'contains',
      })
    })
    imports.forEach((item) => {
      const target = resolveImport(fileId, item.source, fileIds)
      if (target) importEdges.push({
        id: `imports:${fileId}:${target}:${item.source}`,
        source: fileId,
        target,
        type: 'imports',
        label: item.names?.length ? `imports ${item.names.join(', ')}` : 'imports',
      })
    })
  })

  const edges = sortedPaths
    .filter((relativePath) => relativePath)
    .map((relativePath) => {
      const parent = relativePath.includes('/')
        ? relativePath.slice(0, relativePath.lastIndexOf('/'))
        : ''
      return {
        id: `contains:${parent}:${relativePath}`,
        source: parent || '__workspace_root__',
        target: relativePath,
        type: 'contains',
        label: 'contains',
      }
    })

  const allEdges = [...edges, ...symbolEdges, ...importEdges]
  allEdges.forEach((edge) => {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target || edge.type === 'contains') return
    source.outgoing = [...(source.outgoing || []), { id: edge.id, type: edge.type, label: edge.label, nodeId: target.id }]
    target.incoming = [...(target.incoming || []), { id: edge.id, type: edge.type, label: edge.label, nodeId: source.id }]
  })
  nodesById.forEach((node) => {
    if (node.type !== 'file') return
    node.dependsOn = (node.outgoing || []).filter((item) => item.type === 'imports').map((item) => item.nodeId)
    node.dependedBy = (node.incoming || []).filter((item) => item.type === 'imports').map((item) => item.nodeId)
  })

  return {
    rootPath: root.uri.fsPath,
    nodes: [...nodesById.values()],
    edges: allEdges,
    stats: {
      files: fileNodes.length,
      symbols: symbolEdges.length,
      imports: importEdges.length,
      routes: enriched.reduce((total, item) => total + item.apiRoutes.length, 0),
      parseErrors: enriched.filter((item) => item.parseError).length,
    },
  }
}

async function enrichWithCode(root, fileNode) {
  if (!isParsable(fileNode.id)) return { fileId: fileNode.id, symbols: [], imports: [], apiRoutes: [], skipped: true }
  const uri = vscode.Uri.joinPath(root.uri, ...fileNode.id.split('/'))
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    if (stat.size > MAX_PARSE_BYTES) return { fileId: fileNode.id, symbols: [], imports: [], apiRoutes: [], skipped: true }
    const source = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')
    return { fileId: fileNode.id, ...parseSourceFile(source, fileNode.id) }
  } catch (error) {
    return { fileId: fileNode.id, symbols: [], imports: [], apiRoutes: [], parseError: error.message }
  }
}

function resolveImport(sourceFile, importPath, fileIds) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), importPath))
  const candidates = [base, ...['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].map((extension) => `${base}${extension}`), ...['index.js', 'index.jsx', 'index.ts', 'index.tsx'].map((name) => `${base}/${name}`)]
  return candidates.find((candidate) => fileIds.has(candidate)) || null
}

function fileColor(label) {
  const extension = path.extname(label).toLowerCase()
  if (['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.cs'].includes(extension)) return 'blue'
  if (['.json', '.yaml', '.yml', '.xml', '.sql'].includes(extension)) return 'teal'
  if (['.md', '.txt', '.rst'].includes(extension)) return 'green'
  return 'gray'
}

function getWebviewHtml(context, webview) {
  const webviewRoot = vscode.Uri.joinPath(context.extensionUri, 'webview')
  const indexPath = path.join(webviewRoot.fsPath, 'index.html')

  if (!fs.existsSync(indexPath)) {
    return `<!doctype html><html><body><h2>Archlens webview is not built.</h2><p>Run <code>npm run build:webview</code> from the extension folder.</p></body></html>`
  }

  let html = fs.readFileSync(indexPath, 'utf8')
  html = html.replace(/(src|href)="\.\/([^\"]+)"/g, (_, attribute, assetPath) => {
    const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, ...assetPath.split('/')))
    return `${attribute}="${assetUri}"`
  })
  html = html.replace('</head>', '<script>window.__ARCHLENS_VSCODE__ = true</script></head>')
  return html
}

function deactivate() {
  clearTimeout(refreshTimer)
  browserServer?.close()
  browserServer = undefined
}

module.exports = { activate, deactivate }

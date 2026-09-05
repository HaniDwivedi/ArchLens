import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

let refreshTimer: NodeJS.Timeout | undefined;
let currentPanel: vscode.WebviewPanel | undefined;
let watchedProjectRoot: string | undefined;

function getOutputPath(context: vscode.ExtensionContext): string {
  const storageFolder = context.storageUri?.fsPath ?? path.join(os.tmpdir(), 'archlens');
  const filePath = path.join(storageFolder, 'archlens-output.json');

  fs.mkdirSync(storageFolder, { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '{}', 'utf8');
  }

  return filePath;
}

function findProjectRoot(startDir: string): string | undefined {
  let current = startDir;

  while (true) {
    const directScanner = path.join(current, 'fileScannner.ts');
    const nestedScanner = path.join(current, 'apps', 'scanner', 'fileScannner.ts');
    const packageJson = path.join(current, 'package.json');

    if (fs.existsSync(packageJson)) {
      if (fs.existsSync(directScanner) || fs.existsSync(nestedScanner)) {
        return current;
      }

      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

function findOutputJson(startDir: string): string | undefined {
  const candidatePaths = [
    path.join(startDir, 'output.json'),
    path.join(startDir, 'output', 'architecture.json'),
    path.join(startDir, 'apps', 'viewer', 'visualizer-ui', 'public', 'output.json'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

type GraphEdge = { url: string; method: string };
type GraphData = Record<string, GraphEdge[]>;

function addDetectedEdge(graph: GraphData, fileName: string, url: string, method: string): void {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return;

  graph[fileName] ??= [];
  if (!graph[fileName].some((edge) => edge.url === normalizedUrl && edge.method === method)) {
    graph[fileName].push({ url: normalizedUrl, method });
  }
}

function getProjectFiles(dirPath: string): string[] {
  const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
  const files: string[] = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getProjectFiles(fullPath));
    } else if (/\.(html?|[jt]sx?|py)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function scanProjectWithoutExternalScanner(projectRoot: string): GraphData {
  const graph: GraphData = {};
  const patterns: Array<{ pattern: RegExp; method: string }> = [
    { pattern: /(?:fetch|navigate|routerPush|redirect)\s*\(\s*["'`]([^"'`]+)["'`]/g, method: 'ROUTE_OR_FETCH' },
    { pattern: /axios\.(get|post|put|delete|patch|request)\s*\(\s*["'`]([^"'`]+)["'`]/g, method: 'AXIOS_CALL' },
    { pattern: /(?:requests|httpx)\.(get|post|put|delete|patch|request)\s*\(\s*["'`]([^"'`]+)["'`]/g, method: 'PYTHON_HTTP' },
    { pattern: /@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g, method: 'PYTHON_ROUTE' },
    { pattern: /(?:url|href|action|endpoint|baseUrl)\s*:\s*["'`]([^"'`]+)["'`]/g, method: 'OBJECT_URL' },
  ];

  for (const filePath of getProjectFiles(projectRoot)) {
    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    graph[fileName] = [];

    if (/\.html?$/i.test(filePath)) {
      for (const match of content.matchAll(/(?:href|action)\s*=\s*["']([^"']+)["']/gi) as Iterable<RegExpMatchArray>) {
        addDetectedEdge(graph, fileName, match[1], 'HTML_LINK');
      }
    }

    for (const { pattern, method } of patterns) {
      for (const match of content.matchAll(pattern) as Iterable<RegExpMatchArray>) {
        const url = match[2] ?? match[1];
        addDetectedEdge(graph, fileName, url, method);
      }
    }
  }

  return graph;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildArchitectureHtml(data: Record<string, any>): string {
  const entries = Object.entries(data || {});

  const nodes = entries.map(([fileName, edges]) => {
    const connections = Array.isArray(edges)
      ? edges.map((edge: any) => {
          const method = escapeHtml(edge.method || 'UNKNOWN');
          const url = escapeHtml(edge.url || 'N/A');
          return `<li><strong>${method}</strong> → ${url}</li>`;
        }).join('')
      : '<li>No connections</li>';

    return `
      <div class="node">
        <h3>${escapeHtml(fileName)}</h3>
        <ul>${connections}</ul>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: sans-serif;
            margin: 0;
            background: #0f172a;
            color: #e2e8f0;
          }
          .container {
            padding: 20px;
          }
          .node {
            background: #111827;
            border: 1px solid #38bdf8;
            border-radius: 12px;
            padding: 14px 16px;
            margin-bottom: 16px;
            box-shadow: 0 10px 25px rgba(56, 189, 248, 0.12);
          }
          h2 {
            margin-top: 0;
            color: #7dd3fc;
          }
          h3 {
            margin-top: 0;
            color: #f8fafc;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
          li {
            margin: 8px 0;
            color: #cbd5e1;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>ArchLens Live Architecture</h2>
          ${nodes || '<p>No architecture data yet.</p>'}
        </div>
      </body>
    </html>
  `;
}

function refreshArchitecture(projectRoot: string, context: vscode.ExtensionContext): void {
  const directScanner = path.join(projectRoot, 'fileScannner.ts');
  const nestedScanner = path.join(projectRoot, 'apps', 'scanner', 'fileScannner.ts');
  const scannerPath = fs.existsSync(nestedScanner) ? nestedScanner : directScanner;

  if (fs.existsSync(scannerPath)) {
    try {
      execSync(`npx ts-node "${scannerPath}"`, {
        cwd: projectRoot,
        stdio: 'pipe',
      });
    } catch (error) {
      console.warn('ArchLens scan failed:', error);
    }
  }

  const managedOutputPath = getOutputPath(context);
  const generatedOutputPath = findOutputJson(projectRoot);
  let graph: Record<string, any> = {};

  try {
    if (!fs.existsSync(scannerPath)) {
      fs.writeFileSync(
        managedOutputPath,
        JSON.stringify(scanProjectWithoutExternalScanner(projectRoot), null, 2),
        'utf8'
      );
    } else if (generatedOutputPath && generatedOutputPath !== managedOutputPath) {
      fs.copyFileSync(generatedOutputPath, managedOutputPath);
    }

    const raw = fs.readFileSync(managedOutputPath, 'utf8');
    graph = JSON.parse(raw || '{}');
  } catch (error: any) {
    vscode.window.showErrorMessage(`ArchLens output is invalid: ${error?.message || 'Unknown error'}`);
  }

  if (currentPanel) {
    currentPanel.webview.html = buildArchitectureHtml(graph);
  }
}

async function openArchitecturePanel(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const rootDir = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();
  const projectRoot = findProjectRoot(rootDir) ?? rootDir;

  try {
    if (!currentPanel) {
      currentPanel = vscode.window.createWebviewPanel(
        'archlensView',
        'ArchLens Architecture',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      currentPanel.onDidDispose(() => {
        currentPanel = undefined;
      });
    }

    refreshArchitecture(projectRoot, context);
    currentPanel.reveal(vscode.ViewColumn.One);
  } catch (error: any) {
    vscode.window.showErrorMessage(`ArchLens failed: ${error?.message || 'Unknown error'}`);
  }
}

function setupAutoRefresh(projectRoot: string, context: vscode.ExtensionContext): void {
  if (watchedProjectRoot === projectRoot) {
    return;
  }

  watchedProjectRoot = projectRoot;
  const watchedFiles = [
    path.join(projectRoot, 'fileScannner.ts'),
    path.join(projectRoot, 'apps', 'scanner', 'fileScannner.ts'),
    path.join(projectRoot, 'output.json'),
    path.join(projectRoot, 'apps', 'viewer', 'visualizer-ui', 'src'),
  ];

  for (const file of watchedFiles) {
    if (!fs.existsSync(file)) continue;

    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(file), '**/*.{ts,tsx,js,jsx,html,json}'));
      context.subscriptions.push(watcher);
      const onChange = () => {
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }

        refreshTimer = setTimeout(() => {
          refreshArchitecture(projectRoot, context);
        }, 600);
      };

      watcher.onDidChange(onChange);
      watcher.onDidCreate(onChange);
      watcher.onDidDelete(onChange);
    } else {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)));
      context.subscriptions.push(watcher);
      const onChange = () => {
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }

        refreshTimer = setTimeout(() => {
          refreshArchitecture(projectRoot, context);
        }, 600);
      };

      watcher.onDidChange(onChange);
      watcher.onDidCreate(onChange);
      watcher.onDidDelete(onChange);
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(play) Go Live';
  statusBarItem.tooltip = 'Open the live app architecture';
  statusBarItem.command = 'archlens.goLive';
  statusBarItem.show();

  const command = vscode.commands.registerCommand('archlens.goLive', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const rootDir = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();
    const projectRoot = findProjectRoot(rootDir) ?? rootDir;
    setupAutoRefresh(projectRoot, context);
    await openArchitecturePanel(context);
  });

  context.subscriptions.push(command, statusBarItem);
}

export function deactivate() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
}

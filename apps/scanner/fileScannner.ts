import * as fs from 'fs/promises';
import * as path from 'path';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as cheerio from 'cheerio';

interface GraphEdge {
  url: string;
  method: string;
}

interface AdjacencyListGraph {
  [fileName: string]: GraphEdge[];
}

const adjacencyListGraph: AdjacencyListGraph = {};

function addEdge(fileName: string, url: string, method: string): void {
  if (!url || !url.trim()) return;

  const safeUrl = url.trim();
  if (!adjacencyListGraph[fileName]) adjacencyListGraph[fileName] = [];

  const exists = adjacencyListGraph[fileName].some(
    (edge) => edge.url === safeUrl && edge.method === method
  );

  if (!exists) adjacencyListGraph[fileName].push({ url: safeUrl, method });
}

function getStaticString(node: any): string | null {
  if (!node) return null;

  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((q: any) => q.value.cooked ?? '').join('');
  }
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;

  return null;
}

function getPropertyName(node: any): string | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral' || node.type === 'Literal') return String(node.value);
  return null;
}

function scanHtmlContent(fileText: string, fileName: string): void {
  const $ = cheerio.load(fileText);

  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (href && !href.startsWith('#')) {
      addEdge(fileName, href, 'HREF_LINK');
    }
  });

  $('form').each((_, element) => {
    const action = $(element).attr('action');
    const formMethod = ($(element).attr('method') || 'GET').toUpperCase();
    if (action) {
      addEdge(fileName, action, `HTML_FORM_${formMethod}`);
    }
  });
}

function scanJavaScriptContent(fileText: string, fileName: string): void {
  const ast = parser.parse(fileText, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  traverse(ast, {
    CallExpression(nodePath) {
      const callee = nodePath.node.callee;
      const args = nodePath.node.arguments;

      if (callee.type === 'Identifier' && callee.name === 'fetch') {
        if (args.length === 0) return;
        const url = getStaticString(args[0]);
        if (url) addEdge(fileName, url, 'FETCH_API');
        return;
      }

      if (callee.type === 'Identifier' && ['navigate', 'routerPush', 'redirect'].includes(callee.name)) {
        const url = getStaticString(args[0]);
        if (url) addEdge(fileName, url, 'ROUTE_NAV');
        return;
      }

      if (callee.type === 'MemberExpression' && !callee.computed) {
        const propertyName = getPropertyName(callee.property);
        const objectName = callee.object.type === 'Identifier' ? callee.object.name : null;

        if (['get', 'post', 'put', 'delete', 'patch', 'request'].includes(propertyName ?? '')) {
          const url = getStaticString(args[0]);
          if (url) addEdge(fileName, url, `AXIOS_${propertyName?.toUpperCase() ?? 'CALL'}`);
        }

        if (objectName === 'router' && propertyName === 'push') {
          const url = getStaticString(args[0]);
          if (url) addEdge(fileName, url, 'ROUTE_PUSH');
        }
      }

      if (callee.type === 'Identifier' && callee.name === 'axios') {
        const firstArg = args[0];
        if (firstArg && firstArg.type === 'ObjectExpression') {
          const urlProp = firstArg.properties.find((prop: any) => {
            if (prop.type !== 'ObjectProperty') return false;
            return getPropertyName(prop.key) === 'url';
          });

          if (urlProp && urlProp.type === 'ObjectProperty') {
            const url = getStaticString(urlProp.value);
            if (url) addEdge(fileName, url, 'AXIOS_CONFIG');
          }
        }
      }
    },

    ObjectProperty(nodePath) {
      const keyName = getPropertyName(nodePath.node.key);
      if (!keyName) return;

      if (['url', 'href', 'action', 'endpoint', 'baseUrl'].includes(keyName)) {
        const value = getStaticString(nodePath.node.value);
        if (value) {
          addEdge(fileName, value, `OBJECT_${keyName.toUpperCase()}`);
        }
      }
    },
  });
}

async function getAllFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (['node_modules', '.git', 'dist', '.next', 'build', 'coverage'].includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nestedFiles = await getAllFiles(fullPath);
      files.push(...nestedFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function parseFileContent(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();

  adjacencyListGraph[fileName] = [];

  if (extension === '.html' || extension === '.htm') {
    const fileText = await fs.readFile(filePath, 'utf-8');
    scanHtmlContent(fileText, fileName);
    return;
  }

  if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
    const fileText = await fs.readFile(filePath, 'utf-8');
    scanJavaScriptContent(fileText, fileName);
  }
}

async function writeOutputFiles(graph: AdjacencyListGraph): Promise<void> {
  const projectRoot = process.cwd();
  const rootOutputPath = path.join(projectRoot, 'output.json');
  const structuredOutputDir = path.join(projectRoot, 'output');
  const structuredOutputPath = path.join(structuredOutputDir, 'architecture.json');
  const visualizerOutputPath = path.join(projectRoot, 'apps', 'viewer', 'visualizer-ui', 'public', 'output.json');

  await fs.mkdir(structuredOutputDir, { recursive: true });
  await fs.writeFile(rootOutputPath, JSON.stringify(graph, null, 2), 'utf-8');
  await fs.writeFile(structuredOutputPath, JSON.stringify(graph, null, 2), 'utf-8');
  await fs.mkdir(path.dirname(visualizerOutputPath), { recursive: true });
  await fs.writeFile(visualizerOutputPath, JSON.stringify(graph, null, 2), 'utf-8');

  console.log(`Output generated successfully: ${rootOutputPath}`);
  console.log(`Structured output generated successfully: ${structuredOutputPath}`);
  console.log(JSON.stringify(graph, null, 2));
}

async function generateGraphData(): Promise<void> {
  const files = await getAllFiles(process.cwd());

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (extension === '.html' || extension === '.htm' || ['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
      try {
        await parseFileContent(file);
      } catch (error: any) {
        console.error(`Failed parsing ${file}:`, error.message);
        adjacencyListGraph[path.basename(file)] = [];
      }
    }
  }

  await writeOutputFiles(adjacencyListGraph);
}

if (require.main === module) {
  generateGraphData();
}


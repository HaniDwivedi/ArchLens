import * as vscode from 'vscode';
import * as path from 'path';
import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as cheerio from 'cheerio';

const traverse = (traverseModule as any).default ?? traverseModule;

// Interfaces for Type Safety
interface GraphEdge {
    url: string;
    method: string;
}

interface AdjacencyListGraph {
    [fileName: string]: GraphEdge[];
}

const adjacencyListGraph: AdjacencyListGraph = {};

/**
 * SCANNER 1: HTML Files (Extracts href and form actions)
 */
function scanHtmlContent(fileText: string, fileName: string): void {
    const $ = cheerio.load(fileText);

    $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (href && !href.startsWith('#')) {
            adjacencyListGraph[fileName].push({ url: href, method: 'HREF_LINK' });
        }
    });

    $('form').each((_, element) => {
        const action = $(element).attr('action');
        const formMethod = ($(element).attr('method') || 'GET').toUpperCase();
        if (action) {
            adjacencyListGraph[fileName].push({ 
                url: action, 
                method: `HTML_FORM_${formMethod}` 
            });
        }
    });
}

/**
 * SCANNER 2: JS/TS Files (Babel AST Parser)
 */
function scanJavaScriptContent(fileText: string, fileName: string): void {
    const ast = parser.parse(fileText, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
    });

    traverse(ast, {
        CallExpression(nodePath: any) {
            const callee = nodePath.node.callee;
            if (callee.type === 'Identifier' && callee.name === 'fetch') {
                const args = nodePath.node.arguments;
                if (args.length === 0) return;

                let url = 'Dynamic_URL';
                const firstArg = args[0];

                if (firstArg.type === 'StringLiteral') {
                    url = firstArg.value;
                } else if (firstArg.type === 'TemplateLiteral') {
                    url = firstArg.quasis.map((q: any) => q.value.cooked ?? '').join('${var}');
                }

                adjacencyListGraph[fileName].push({ url: url, method: 'FETCH_API' });
            }
        }
    });
}

/**
 * MAIN CONTROLLER: Unified VS Code Scheme Handler & Parser Router
 */
export async function detectAndParseFile(uri: vscode.Uri): Promise<void> {
    const fileName = path.basename(uri.path);
    const extension = path.extname(uri.path).toLowerCase();

    // Initialize graph entry for this file
    adjacencyListGraph[fileName] = [];

    let fileContentString = '';

    // Step 1: Secure file reading based on VS Code Schemes
    try {
        switch (uri.scheme) {
            case 'file':
                console.log('Local File detected:', uri.fsPath);
                // Safe to use standard fs or vscode workspace fs
                const localData = await vscode.workspace.fs.readFile(uri);
                fileContentString = Buffer.from(localData).toString('utf8');
                break;

            case 'vscode-vfs': 
            case 'github':
            case 'vscode-remote':
                console.log('Remote/Cloud File detected via scheme:', uri.scheme);
                // CRITICAL: Standard 'fs' fails here. We MUST use VS Code's abstract Virtual File System
                const remoteData = await vscode.workspace.fs.readFile(uri);
                fileContentString = Buffer.from(remoteData).toString('utf8');
                break;

            case 'untitled':
                console.log('Unsaved Buffer detected');
                // For completely new unsaved buffers, the data is in the active text document memory
                const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
                fileContentString = doc ? doc.getText() : '';
                break;

            default:
                console.log(`Unsupported Scheme: ${uri.scheme}`);
                return;
        }

        // Step 2: Route the string content to correct compiler parser
        if (extension === '.html' || extension === '.htm') {
            scanHtmlContent(fileContentString, fileName);
        } 
        else if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
            scanJavaScriptContent(fileContentString, fileName);
        }

        console.log(`Successfully updated graph row for [${fileName}]`, adjacencyListGraph[fileName]);

    } catch (error: any) {
        console.error(`Execution failed for ${fileName}:`, error.message);
    }
}

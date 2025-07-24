import * as vscode from 'vscode';
import * as fs from 'fs';

// In-memory index: attrName -> array of Locations
const originIndex = new Map<string, vscode.Location[]>();

// Glob patterns to exclude from indexing
const excludeGlob = '**/{**/venv/**,**/env/**,**/.venv/**,**/__pycache__/**,**/.pytest_cache/**,**/tox/**,**/.env/**}';

export function activate(context: vscode.ExtensionContext) {
  // Initial indexing of all Python files
  indexWorkspace();

  // Re-index on save of any Python file
  vscode.workspace.onDidSaveTextDocument(doc => {
    if (doc.languageId === 'python') {
      indexWorkspace();
    }
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('dynamicNavigator.gotoOrigin', () => navigateToOrigin(false))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('dynamicNavigator.peekOrigin', () => navigateToOrigin(true))
  );
}

async function indexWorkspace() {
  originIndex.clear();
  const uris = await vscode.workspace.findFiles('**/*.py', excludeGlob);
  // Sort files for deterministic first-occurrence ordering
  uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  for (const uri of uris) {
    indexFile(uri);
  }
}

function indexFile(uri: vscode.Uri) {
  let data: string;
  try {
    data = fs.readFileSync(uri.fsPath, 'utf8');
  } catch {
    return;
  }
  data.split(/\r?\n/).forEach((line, idx) => {
    // Match dynamic attribute assignment or annotation
    const match = line.match(/self\.(\w+)\s*(?:=|:)/);
    if (match) {
      const attr = match[1];
      const charIndex = line.indexOf(match[0]);
      const loc = new vscode.Location(uri, new vscode.Position(idx, charIndex));
      const arr = originIndex.get(attr) || [];
      // Only record the first location per file to avoid duplicates
      if (!arr.find(e => e.uri.fsPath === loc.uri.fsPath && e.range.start.line === loc.range.start.line)) {
        arr.push(loc);
        originIndex.set(attr, arr);
      }
    }
  });
}

async function navigateToOrigin(peek: boolean) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const position = editor.selection.active;
  const wordRange = doc.getWordRangeAtPosition(position, /\w+/);
  if (!wordRange) return;
  const attr = doc.getText(wordRange);

  const locations = originIndex.get(attr) || [];
  if (locations.length === 0) {
    vscode.window.showWarningMessage(`No origin found for '${attr}'.`);
    return;
  }

  // Automatically pick the most relevant origin without prompting
  let target = locations[0];
  if (locations.length > 1) {
    // 1) Prefer the origin in the same file
    const currentFile = doc.uri.fsPath;
    const sameFile = locations.find(loc => loc.uri.fsPath === currentFile);
    if (sameFile) {
      target = sameFile;
    } else {
      // 2) Prefer the origin within the same enclosing class
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        doc.uri
      );
      if (symbols) {
        // Recursive search for containing class
        function findClass(symList: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined {
          for (const sym of symList) {
            if (sym.kind === vscode.SymbolKind.Class && sym.range.contains(position)) {
              return sym;
            }
            const inner = findClass(sym.children);
            if (inner) return inner;
          }
        }
        const cls = findClass(symbols);
        if (cls) {
          const inClass = locations.find(loc => loc.uri.fsPath === doc.uri.fsPath && cls.range.contains(loc.range.start));
          if (inClass) {
            target = inClass;
          }
        }
      }
    }
  }

  if (peek) {
    await vscode.commands.executeCommand(
      'editor.action.peekLocations',
      doc.uri,
      position,
      [target],
      'peek'
    );
  } else {
    await vscode.window.showTextDocument(target.uri, { selection: target.range });
  }
}

export function deactivate() {}
import * as vscode from 'vscode';
import * as fs from 'fs';

// In-memory index: attrName -> array of Locations
const originIndex = new Map<string, vscode.Location[]>();

// Glob patterns to exclude from indexing
const excludeGlob = '**/{**/venv/**,**/env/**,**/.venv/**,**/__pycache__/**,**/.pytest_cache/**,**/tox/**,**/.env/**}';

export function activate(context: vscode.ExtensionContext) {
  // Initial indexing
  indexWorkspace();
  // Re-index on save
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
    const match = line.match(/self\.(\w+)\s*(?:=|:)/);
    if (match) {
      const attr = match[1];
      const charIndex = line.indexOf(match[0]);
      const loc = new vscode.Location(uri, new vscode.Position(idx, charIndex));
      const arr = originIndex.get(attr) || [];
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

  let target = locations[0];
  if (locations.length > 1) {
    // Determine class context
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      doc.uri
    ) || [];
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
      // 1) match within same class
      const classLoc = locations.find(loc =>
        loc.uri.fsPath === doc.uri.fsPath &&
        cls.range.contains(loc.range.start)
      );
      if (classLoc) {
        target = classLoc;
      } else {
        // 2) match base class definition via super
        const declLine = doc.lineAt(cls.selectionRange.start.line).text;
        const parenIndex = declLine.indexOf('(');
        if (parenIndex !== -1) {
          const basesStr = declLine.substring(parenIndex + 1, declLine.indexOf(')', parenIndex));
          const bases = basesStr.split(',').map(s => s.trim().split('.').pop()!);
          for (const base of bases) {
            const baseFile = locations.find(loc => loc.uri.fsPath.endsWith(base + '.py'));
            if (baseFile) {
              target = baseFile;
              break;
            }
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

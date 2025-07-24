import * as vscode from 'vscode';
import * as fs from 'fs';

// In-memory index: attrName -> Location
const originIndex = new Map<string, vscode.Location>();

// Glob patterns to exclude from indexing
const excludeGlob = '**/{**/venv/**,**/env/**,**/__pycache__/**,**/.env/**}';

export function activate(context: vscode.ExtensionContext) {
  // Initial indexing of workspace Python files
  indexWorkspace();

  // Re-index on save of any Python file
  vscode.workspace.onDidSaveTextDocument(doc => {
    if (doc.languageId === 'python') {
      indexWorkspace();
    }
  });

  // Register Go to Origin
  context.subscriptions.push(
    vscode.commands.registerCommand('dynamicNavigator.gotoOrigin', () => {
      navigateToOrigin(false);
    })
  );

  // Register Peek Origin
  context.subscriptions.push(
    vscode.commands.registerCommand('dynamicNavigator.peekOrigin', () => {
      navigateToOrigin(true);
    })
  );
}

function indexWorkspace() {
  originIndex.clear();
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return;

  // Include all .py files, exclude venv, env, __pycache__, and .env directories
  vscode.workspace.findFiles('**/*.py', excludeGlob).then(uris => {
    uris.forEach(uri => indexFile(uri));
  });
}

function indexFile(uri: vscode.Uri) {
  fs.readFile(uri.fsPath, 'utf8', (err: NodeJS.ErrnoException | null, data: string) => {
    if (err) return;
    data.split(/\r?\n/).forEach((line, idx) => {
      // Match dynamic attribute assignment or annotation: self.attr = ... or self.attr: ...
      const match = line.match(/self\.(\w+)\s*(?:=|:)/);
      if (match) {
        const attr = match[1];
        const charIndex = line.indexOf(match[0]);
        originIndex.set(
          attr,
          new vscode.Location(uri, new vscode.Position(idx, charIndex))
        );
      }
    });
  });
}

async function navigateToOrigin(peek: boolean) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const wordRange = editor.document.getWordRangeAtPosition(
    editor.selection.active,
    /\w+/
  );
  if (!wordRange) return;

  const attr = editor.document.getText(wordRange);
  const location = originIndex.get(attr);
  if (!location) {
    vscode.window.showWarningMessage(
      `No origin found for '${attr}'.`
    );
    return;
  }

  if (peek) {
    // Inline peek of the origin location
    await vscode.commands.executeCommand(
      'editor.action.peekLocations',
      editor.document.uri,
      editor.selection.active,
      [location],
      'peek'
    );
  } else {
    // Navigate directly to the origin location
    await vscode.window.showTextDocument(location.uri, {
      selection: location.range
    });
  }
}

export function deactivate() {}

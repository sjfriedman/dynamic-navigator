import * as vscode from 'vscode';
import * as fs from 'fs';

// In-memory index: attrName → Location
let originIndex = new Map<string, vscode.Location>();

export function activate(context: vscode.ExtensionContext) {
  // Initial index of all Python files
  indexWorkspace();

  // Re-index on every save
  vscode.workspace.onDidSaveTextDocument(doc => {
    if (doc.languageId === 'python') {
      indexFile(doc.uri);
    }
  });

  // Go to Origin
  context.subscriptions.push(
    vscode.commands.registerCommand('dynamicNavigator.gotoOrigin', () => {
      navigateToOrigin(false);
    })
  );

  // Peek Origin
  context.subscriptions.push(
    vscode.commands.registerCommand('dynamicNavigator.peekOrigin', () => {
      navigateToOrigin(true);
    })
  );
}

function indexWorkspace() {
  originIndex.clear();
  const pattern = new vscode.RelativePattern(
    vscode.workspace.workspaceFolders![0],
    '**/*.py'
  );
  vscode.workspace.findFiles(pattern).then(uris => {
    uris.forEach(uri => indexFile(uri));
  });
}

function indexFile(uri: vscode.Uri) {
  fs.readFile(uri.fsPath, 'utf8', (err, data) => {
    if (err) { return; }
    data.split(/\r?\n/).forEach((line, i) => {
      const m = line.match(/self\.(\w+)\s*=/);
      if (m) {
        const attr = m[1];
        const char = line.indexOf(m[0]);
        originIndex.set(attr, new vscode.Location(uri, new vscode.Position(i, char)));
      }
    });
  });
}

async function navigateToOrigin(peek: boolean) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return; }
  const wordRange = editor.document.getWordRangeAtPosition(
    editor.selection.active,
    /\w+/
  );
  if (!wordRange) { return; }
  const attr = editor.document.getText(wordRange);
  const loc = originIndex.get(attr);
  if (!loc) {
    vscode.window.showWarningMessage(`No origin found for '${attr}'.`);
    return;
  }

  if (peek) {
    vscode.commands.executeCommand(
      'editor.action.peekLocations',
      editor.document.uri,
      editor.selection.active,
      [loc],
      'peek'
    );
  } else {
    vscode.window.showTextDocument(loc.uri, { selection: loc.range });
  }
}

export function deactivate() {}

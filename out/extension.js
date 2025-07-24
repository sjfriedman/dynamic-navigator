"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
// In-memory index: attrName -> Location
const originIndex = new Map();
// Glob patterns to exclude from indexing
const excludeGlob = '**/{**/venv/**,**/env/**,**/__pycache__/**,**/.env/**}';
function activate(context) {
    // Initial indexing of workspace Python files
    indexWorkspace();
    // Re-index on save of any Python file
    vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId === 'python') {
            indexWorkspace();
        }
    });
    // Register Go to Origin
    context.subscriptions.push(vscode.commands.registerCommand('dynamicNavigator.gotoOrigin', () => {
        navigateToOrigin(false);
    }));
    // Register Peek Origin
    context.subscriptions.push(vscode.commands.registerCommand('dynamicNavigator.peekOrigin', () => {
        navigateToOrigin(true);
    }));
}
exports.activate = activate;
function indexWorkspace() {
    originIndex.clear();
    const folders = vscode.workspace.workspaceFolders;
    if (!folders)
        return;
    // Include all .py files, exclude venv, env, __pycache__, and .env directories
    vscode.workspace.findFiles('**/*.py', excludeGlob).then(uris => {
        uris.forEach(uri => indexFile(uri));
    });
}
function indexFile(uri) {
    fs.readFile(uri.fsPath, 'utf8', (err, data) => {
        if (err)
            return;
        data.split(/\r?\n/).forEach((line, idx) => {
            // Match dynamic attribute assignment or annotation: self.attr = ... or self.attr: ...
            const match = line.match(/self\.(\w+)\s*(?:=|:)/);
            if (match) {
                const attr = match[1];
                const charIndex = line.indexOf(match[0]);
                originIndex.set(attr, new vscode.Location(uri, new vscode.Position(idx, charIndex)));
            }
        });
    });
}
function navigateToOrigin(peek) {
    return __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active, /\w+/);
        if (!wordRange)
            return;
        const attr = editor.document.getText(wordRange);
        const location = originIndex.get(attr);
        if (!location) {
            vscode.window.showWarningMessage(`No origin found for '${attr}'.`);
            return;
        }
        if (peek) {
            // Inline peek of the origin location
            yield vscode.commands.executeCommand('editor.action.peekLocations', editor.document.uri, editor.selection.active, [location], 'peek');
        }
        else {
            // Navigate directly to the origin location
            yield vscode.window.showTextDocument(location.uri, {
                selection: location.range
            });
        }
    });
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
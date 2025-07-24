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
// In-memory index: attrName -> array of Locations
const originIndex = new Map();
// Glob patterns to exclude from indexing
const excludeGlob = '**/{**/venv/**,**/env/**,**/.venv/**,**/__pycache__/**,**/.pytest_cache/**,**/tox/**,**/.env/**}';
function activate(context) {
    // Initial indexing of all Python files
    indexWorkspace();
    // Re-index on save of any Python file
    vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId === 'python') {
            indexWorkspace();
        }
    });
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('dynamicNavigator.gotoOrigin', () => navigateToOrigin(false)));
    context.subscriptions.push(vscode.commands.registerCommand('dynamicNavigator.peekOrigin', () => navigateToOrigin(true)));
}
exports.activate = activate;
function indexWorkspace() {
    return __awaiter(this, void 0, void 0, function* () {
        originIndex.clear();
        const uris = yield vscode.workspace.findFiles('**/*.py', excludeGlob);
        // Sort files for deterministic first-occurrence ordering
        uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
        for (const uri of uris) {
            indexFile(uri);
        }
    });
}
function indexFile(uri) {
    let data;
    try {
        data = fs.readFileSync(uri.fsPath, 'utf8');
    }
    catch (_a) {
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
function navigateToOrigin(peek) {
    return __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const position = editor.selection.active;
        const wordRange = doc.getWordRangeAtPosition(position, /\w+/);
        if (!wordRange)
            return;
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
            }
            else {
                // 2) Prefer the origin within the same enclosing class
                const symbols = yield vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri);
                if (symbols) {
                    // Recursive search for containing class
                    function findClass(symList) {
                        for (const sym of symList) {
                            if (sym.kind === vscode.SymbolKind.Class && sym.range.contains(position)) {
                                return sym;
                            }
                            const inner = findClass(sym.children);
                            if (inner)
                                return inner;
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
            yield vscode.commands.executeCommand('editor.action.peekLocations', doc.uri, position, [target], 'peek');
        }
        else {
            yield vscode.window.showTextDocument(target.uri, { selection: target.range });
        }
    });
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
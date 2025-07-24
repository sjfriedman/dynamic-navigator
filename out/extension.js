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
    // Initial indexing
    indexWorkspace();
    // Re-index on save
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
        let target = locations[0];
        if (locations.length > 1) {
            // Determine class context
            const symbols = (yield vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri)) || [];
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
                // 1) match within same class
                const classLoc = locations.find(loc => loc.uri.fsPath === doc.uri.fsPath &&
                    cls.range.contains(loc.range.start));
                if (classLoc) {
                    target = classLoc;
                }
                else {
                    // 2) match base class definition via super
                    const declLine = doc.lineAt(cls.selectionRange.start.line).text;
                    const parenIndex = declLine.indexOf('(');
                    if (parenIndex !== -1) {
                        const basesStr = declLine.substring(parenIndex + 1, declLine.indexOf(')', parenIndex));
                        const bases = basesStr.split(',').map(s => s.trim().split('.').pop());
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
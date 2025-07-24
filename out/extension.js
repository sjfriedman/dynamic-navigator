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
// In-memory index: attrName → Location
let originIndex = new Map();
function activate(context) {
    // Initial index of all Python files
    indexWorkspace();
    // Re-index on every save
    vscode.workspace.onDidSaveTextDocument(doc => {
        if (doc.languageId === 'python') {
            indexFile(doc.uri);
        }
    });
    // Go to Origin
    context.subscriptions.push(vscode.commands.registerCommand('dynamicNavigator.gotoOrigin', () => {
        navigateToOrigin(false);
    }));
    // Peek Origin
    context.subscriptions.push(vscode.commands.registerCommand('dynamicNavigator.peekOrigin', () => {
        navigateToOrigin(true);
    }));
}
exports.activate = activate;
function indexWorkspace() {
    originIndex.clear();
    const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*.py');
    vscode.workspace.findFiles(pattern).then(uris => {
        uris.forEach(uri => indexFile(uri));
    });
}
function indexFile(uri) {
    fs.readFile(uri.fsPath, 'utf8', (err, data) => {
        if (err) {
            return;
        }
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
function navigateToOrigin(peek) {
    return __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active, /\w+/);
        if (!wordRange) {
            return;
        }
        const attr = editor.document.getText(wordRange);
        const loc = originIndex.get(attr);
        if (!loc) {
            vscode.window.showWarningMessage(`No origin found for '${attr}'.`);
            return;
        }
        if (peek) {
            vscode.commands.executeCommand('editor.action.peekLocations', editor.document.uri, editor.selection.active, [loc], 'peek');
        }
        else {
            vscode.window.showTextDocument(loc.uri, { selection: loc.range });
        }
    });
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
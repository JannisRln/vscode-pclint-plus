import * as vscode from "vscode";
import { LintScheduler } from "./lint/scheduler";
import { LntDocumentLinkProvider, openLntPath } from "./lnt/documentLinks";
import { LntCompletionItemProvider } from "./lnt/completions";
import { PclintMessageHoverProvider } from "./diagnostics/hoverProvider";

let diagnostics: vscode.DiagnosticCollection;
let output: vscode.OutputChannel;
let scheduler: LintScheduler;
let hoverProvider: PclintMessageHoverProvider;

export function activate(context: vscode.ExtensionContext): void {
    output = vscode.window.createOutputChannel("PC-lint Plus");
    diagnostics = vscode.languages.createDiagnosticCollection("PC-lint Plus");

    scheduler = new LintScheduler(context, output, diagnostics);
    hoverProvider = new PclintMessageHoverProvider(diagnostics);

    context.subscriptions.push(output);
    context.subscriptions.push(diagnostics);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            ["c", "cpp", "cuda-cpp"],
            hoverProvider
        )
    );

    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(
            { language: "pclint-lnt" },
            new LntDocumentLinkProvider()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("pclintPlus.openLntPath", openLntPath)
    );

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: "pclint-lnt" },
            new LntCompletionItemProvider(),
            "-",
            "+"
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("pclintPlus.lintCurrentFile", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            await scheduler.lintDocument(editor.document, "manual");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("pclintPlus.showOutput", () => {
            output.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("pclintPlus.copyLastCommand", async () => {
            const command = scheduler.getLastCommand();
            if (!command) {
                vscode.window.showInformationMessage("No PC-lint Plus command has been run yet.");
                return;
            }

            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage("PC-lint Plus command copied.");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("pclintPlus.clearDiagnostics", () => {
            diagnostics.clear();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("pclintPlus.copyMessageText", async (messageText: string) => {
            if (typeof messageText !== "string" || messageText.trim().length === 0) {
                vscode.window.showInformationMessage("No PC-lint Plus message text is available to copy.");
                return;
            }

            await vscode.env.clipboard.writeText(messageText);
            vscode.window.showInformationMessage("PC-lint Plus message copied.");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("pclintPlus.rebuildPch", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !isCppDocument(editor.document)) {
                vscode.window.showInformationMessage("Open a C/C++ file before rebuilding the PC-lint Plus PCH.");
                return;
            }

            await scheduler.lintDocument(editor.document, "pchRebuild");
            vscode.window.showInformationMessage("PC-lint Plus PCH rebuild command completed. See output for details.");
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async document => {
            if (isCppDocument(document)) {
                await scheduler.lintDocument(document, "onSave");
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (isCppDocument(event.document)) {
                scheduler.scheduleOnType(event.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration("pclintPlus")) {
                scheduler.disposePendingRuns();
                hoverProvider.clearCache();
            }
        })
    );
}

export function deactivate(): void {
    scheduler?.dispose();
}

export function isCppDocument(document: Pick<vscode.TextDocument, "languageId">): boolean {
    return ["c", "cpp", "cuda-cpp"].includes(document.languageId);
}

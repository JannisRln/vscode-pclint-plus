import * as vscode from "vscode";

export function appendSection(output: vscode.OutputChannel, title: string): void {
    output.appendLine("");
    output.appendLine(`[PC-lint Plus] ${title}`);
}

export function appendOptionalBlock(
    output: vscode.OutputChannel,
    label: string,
    content: string,
    enabled: boolean
): void {
    if (!enabled || content.trim().length === 0) {
        return;
    }

    output.appendLine(`[PC-lint Plus] ${label}:`);
    output.appendLine(content);
}

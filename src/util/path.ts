import * as path from "path";
import * as vscode from "vscode";

export function resolveWorkspacePath(
    value: string,
    workspaceFolder: vscode.WorkspaceFolder
): string {
    const expanded = value.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);

    if (path.isAbsolute(expanded)) {
        return path.normalize(expanded);
    }

    return path.normalize(path.join(workspaceFolder.uri.fsPath, expanded));
}

export function sameFile(left: string, right: string): boolean {
    const normalizedLeft = normalizeForCompare(left);
    const normalizedRight = normalizeForCompare(right);

    if (process.platform === "win32") {
        return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
    }

    return normalizedLeft === normalizedRight;
}

function normalizeForCompare(value: string): string {
    return path.resolve(value).replace(/\\/g, "/");
}

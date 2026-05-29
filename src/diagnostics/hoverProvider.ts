import * as vscode from "vscode";
import { resolvePclintProfile } from "@src/config/configuration";
import { loadMessageCatalog, normalizeMessageCode, PclintMessageCatalog, PclintMessageInfo } from "@src/diagnostics/messageXml";

interface CatalogCacheEntry {
    path: string;
    catalog: PclintMessageCatalog;
}

export class PclintMessageHoverProvider implements vscode.HoverProvider {
    private catalogCache?: CatalogCacheEntry;

    public constructor(private readonly diagnostics: vscode.DiagnosticCollection) {}

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        const diagnostic = this.findPclintDiagnosticAt(document.uri, position);

        if (!diagnostic) {
            return undefined;
        }

        const code = getDiagnosticCode(diagnostic);

        if (code.length === 0) {
            return undefined;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

        if (!workspaceFolder) {
            return undefined;
        }

        const profile = resolvePclintProfile(document.uri, workspaceFolder);

        if (profile.messageXmlPath.trim().length === 0) {
            return undefined;
        }

        const catalog = await this.loadCatalog(profile.messageXmlPath);
        const messageInfo = catalog.get(normalizeMessageCode(code));

        if (!messageInfo || !hasMessageInfo(messageInfo)) {
            return undefined;
        }

        return new vscode.Hover(formatHoverMarkdown(code, messageInfo), diagnostic.range);
    }

    public clearCache(): void {
        this.catalogCache = undefined;
    }

    private findPclintDiagnosticAt(uri: vscode.Uri, position: vscode.Position): vscode.Diagnostic | undefined {
        return this.diagnostics.get(uri)?.find(diagnostic =>
            diagnostic.source === "PC-lint Plus" && diagnostic.range.contains(position)
        );
    }

    private async loadCatalog(messageXmlPath: string): Promise<PclintMessageCatalog> {
        if (this.catalogCache?.path === messageXmlPath) {
            return this.catalogCache.catalog;
        }

        const catalog = await loadMessageCatalog(messageXmlPath);
        this.catalogCache = {
            path: messageXmlPath,
            catalog
        };

        return catalog;
    }
}

function getDiagnosticCode(diagnostic: vscode.Diagnostic): string {
    if (typeof diagnostic.code === "number") {
        return String(diagnostic.code);
    }

    if (typeof diagnostic.code === "string") {
        return diagnostic.code;
    }

    const complexCode = diagnostic.code;

    if (complexCode && typeof complexCode.value === "string") {
        return complexCode.value;
    }

    if (complexCode && typeof complexCode.value === "number") {
        return String(complexCode.value);
    }

    return "";
}

function hasMessageInfo(messageInfo: PclintMessageInfo): boolean {
    return messageInfo.text.trim().length > 0 || messageInfo.commentary.trim().length > 0;
}

function formatHoverMarkdown(code: string, messageInfo: PclintMessageInfo): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(undefined, true);
    const normalizedCode = normalizeMessageCode(code) || code;
    const copyText = formatMessageTextForClipboard(normalizedCode, messageInfo);
    const copyCommandUri = `command:pclintPlus.copyMessageText?${encodeURIComponent(JSON.stringify([copyText]))}`;

    markdown.isTrusted = { enabledCommands: ["pclintPlus.copyMessageText"] };
    markdown.supportHtml = false;
    markdown.appendMarkdown(`[**PC-lint Plus message ${escapeMarkdown(normalizedCode)} $(copy)**](${copyCommandUri})`);

    if (messageInfo.text.trim().length > 0) {
        markdown.appendMarkdown("\n\n");
        markdown.appendMarkdown(`[${escapeMarkdown(messageInfo.text.trim())}](${copyCommandUri})`);
    }

    if (messageInfo.commentary.trim().length > 0) {
        markdown.appendMarkdown("\n\n");
        markdown.appendMarkdown(`[${messageInfo.commentary.trim()}](${copyCommandUri})`);
    }

    return markdown;
}

function formatMessageTextForClipboard(code: string, messageInfo: PclintMessageInfo): string {
    return [
        `PC-lint Plus message ${code}`,
        `${messageInfo.text.trim()}`,
        `${messageInfo.commentary.trim()}`
    ].filter(section => section.length > 0).join("\n\n");
}

function escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&");
}

import * as vscode from "vscode";

interface LinkCandidate {
    start: number;
    end: number;
    path: string;
    preferFolder: boolean;
}

const optionPathPattern = /(?:^|\s)([+-][A-Za-z][A-Za-z0-9_+-]*|--?[A-Za-z][A-Za-z0-9_-]*)\(\s*("{1,2})?([A-Za-z]:[\\/][^)"\r\n]+)\2?\s*\)/g;
const quotedPathPattern = /("{1,2})([A-Za-z]:[\\/][^"\r\n]+)\1/g;
const barePathPattern = /(?:^|\s|\()([A-Za-z]:[\\/][^\s)"\r\n]+)/g;

export class LntDocumentLinkProvider implements vscode.DocumentLinkProvider {
    public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];
        const seen = new Set<string>();

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
            const line = document.lineAt(lineIndex).text;
            const candidates = collectPathCandidates(line);

            for (const candidate of candidates) {
                const key = `${lineIndex}:${candidate.start}:${candidate.end}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);

                const range = new vscode.Range(
                    lineIndex,
                    candidate.start,
                    lineIndex,
                    candidate.end
                );
                const target = vscode.Uri.parse(
                    `command:pclintPlus.openLntPath?${encodeURIComponent(JSON.stringify([candidate.path, candidate.preferFolder]))}`
                );
                const link = new vscode.DocumentLink(range, target);
                link.tooltip = candidate.preferFolder
                    ? `Open folder ${candidate.path}`
                    : `Open ${candidate.path}`;
                links.push(link);
            }
        }

        return links;
    }
}

export async function openLntPath(path: string, preferFolder = false): Promise<void> {
    const uri = vscode.Uri.file(normalizeWindowsPath(path));
    const stat = await tryStat(uri);
    const isDirectory = stat?.type === vscode.FileType.Directory;

    if (preferFolder || isDirectory) {
        await vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: false });
        return;
    }

    await vscode.commands.executeCommand("vscode.open", uri);
}

function collectPathCandidates(line: string): LinkCandidate[] {
    const candidates: LinkCandidate[] = [];

    addOptionCandidates(line, candidates);
    addRegexCandidates(line, quotedPathPattern, 2, false, candidates);
    addRegexCandidates(line, barePathPattern, 1, false, candidates);

    return removeContainedCandidates(candidates);
}

function addOptionCandidates(line: string, candidates: LinkCandidate[]): void {
    optionPathPattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = optionPathPattern.exec(line)) !== null) {
        const optionName = match[1] ?? "";
        const path = match[3];
        if (!path) {
            continue;
        }

        const pathStartInMatch = match[0].indexOf(path);
        const start = match.index + pathStartInMatch;
        const end = start + path.length;
        candidates.push({
            start,
            end,
            path: normalizeWindowsPath(path),
            preferFolder: isFolderOption(optionName) || looksLikeDirectoryPath(path)
        });
    }
}

function addRegexCandidates(
    line: string,
    pattern: RegExp,
    pathGroup: number,
    preferFolder: boolean,
    candidates: LinkCandidate[]
): void {
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
        const path = match[pathGroup];
        if (!path) {
            continue;
        }

        const pathStartInMatch = match[0].indexOf(path);
        const start = match.index + pathStartInMatch;
        const end = start + path.length;
        candidates.push({
            start,
            end,
            path: normalizeWindowsPath(path),
            preferFolder: preferFolder || looksLikeDirectoryPath(path)
        });
    }
}

function normalizeWindowsPath(path: string): string {
    return path.replace(/\//g, "\\");
}

function isFolderOption(optionName: string): boolean {
    const normalized = optionName.replace(/^[+-]+/, "").toLowerCase();
    return [
        "libdir",
        "i",
        "idir",
        "include",
        "includedir",
        "sysdir",
        "systemdir"
    ].includes(normalized);
}

function looksLikeDirectoryPath(path: string): boolean {
    const normalized = normalizeWindowsPath(path).replace(/[\\/]+$/, "");
    const lastSegment = normalized.split("\\").pop() ?? "";
    return !/\.[A-Za-z0-9_+-]+$/.test(lastSegment);
}

async function tryStat(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
    try {
        return await vscode.workspace.fs.stat(uri);
    } catch {
        return undefined;
    }
}

function removeContainedCandidates(candidates: LinkCandidate[]): LinkCandidate[] {
    const sorted = [...candidates].sort((left, right) => {
        if (left.start !== right.start) {
            return left.start - right.start;
        }
        return right.end - left.end;
    });

    const result: LinkCandidate[] = [];
    for (const candidate of sorted) {
        const isContained = result.some(existing =>
            existing.start <= candidate.start && existing.end >= candidate.end
        );
        if (!isContained) {
            result.push(candidate);
        }
    }

    return result;
}

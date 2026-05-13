import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { PclintBuildInfo } from "@src/config/profile";
import { resolveWorkspacePath } from "@src/util/path";

export interface RawBuildInfo {
    includeDirs?: string[];
    systemIncludeDirs?: string[];
    defines?: string[];
    standard?: string;
}

export function resolveManualBuildInfo(
    raw: RawBuildInfo,
    workspaceFolder: vscode.WorkspaceFolder
): PclintBuildInfo {
    return {
        includeDirs: resolvePaths(raw.includeDirs ?? [], workspaceFolder),
        systemIncludeDirs: resolvePaths(raw.systemIncludeDirs ?? [], workspaceFolder),
        defines: raw.defines ?? ["_lint"],
        standard: raw.standard ?? ""
    };
}

function resolvePaths(paths: string[], workspaceFolder: vscode.WorkspaceFolder): string[] {
    const resolved: string[] = [];
    const seen = new Set<string>();

    for (const value of paths) {
        for (const includeDir of resolvePathEntry(value, workspaceFolder)) {
            const key = normalizeForDeduplication(includeDir);
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            resolved.push(includeDir);
        }
    }

    return resolved;
}

function resolvePathEntry(value: string, workspaceFolder: vscode.WorkspaceFolder): string[] {
    const recursiveRoot = getRecursiveRoot(value);

    if (recursiveRoot === undefined) {
        return [resolveWorkspacePath(value, workspaceFolder)];
    }

    const resolvedRoot = resolveWorkspacePath(recursiveRoot, workspaceFolder);

    if (!isDirectory(resolvedRoot)) {
        return [resolvedRoot];
    }

    return collectDirectoriesRecursive(resolvedRoot);
}

function getRecursiveRoot(value: string): string | undefined {
    const normalized = value.replace(/\\/g, "/");
    const recursiveMarkerIndex = normalized.indexOf("**");

    if (recursiveMarkerIndex < 0) {
        return undefined;
    }

    const root = normalized.slice(0, recursiveMarkerIndex).replace(/[\\/]+$/u, "");
    return root.length > 0 ? root : ".";
}

function collectDirectoriesRecursive(root: string): string[] {
    const result: string[] = [];
    const pending = [root];

    while (pending.length > 0) {
        const current = pending.shift();
        if (current === undefined) {
            continue;
        }

        result.push(current);

        const children = fs.readdirSync(current, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => path.join(current, entry.name))
            .sort((left, right) => left.localeCompare(right));

        pending.push(...children);
    }

    return result;
}

function isDirectory(value: string): boolean {
    try {
        return fs.statSync(value).isDirectory();
    } catch {
        return false;
    }
}

function normalizeForDeduplication(value: string): string {
    const normalized = path.resolve(value).replace(/\\/g, "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { spawn, ChildProcess } from "child_process";
import { createHash } from "crypto";
import { parsePclintOutput } from "@src/diagnostics/parser";
import { toVscodeDiagnostics } from "@src/diagnostics/vscodeDiagnosticAdapter";
import { resolvePclintProfile } from "@src/config/configuration";
import { generateCurrentFileLnt } from "@src/lint/lntGenerator";
import { buildPclintCommand } from "@src/lint/commandBuilder";
import { sameFile } from "@src/util/path";
import { appendOptionalBlock, appendSection } from "@src/util/output";

export interface PclintDiagnosticSet {
    uri: vscode.Uri;
    diagnostics: vscode.Diagnostic[];
}

export interface PclintResult {
    commandLine: string;
    diagnosticSets: PclintDiagnosticSet[];
    stdout: string;
    stderr: string;
    exitCode: number | null;
    generatedLntPath: string;
    durationMs: number;
}

export interface RunPclintOptions {
    useShadowFile?: boolean;
}

interface ShadowFile {
    uri: vscode.Uri;
    cleanupRoot: string;
}

export async function runPclint(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    onProcessStarted?: (process: ChildProcess) => void,
    options: RunPclintOptions = {}
): Promise<PclintResult> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    if (!workspaceFolder) {
        throw new Error("No workspace folder found for current document.");
    }


    const config = vscode.workspace.getConfiguration("pclintPlus", document.uri);
    const profile = resolvePclintProfile(document.uri, workspaceFolder);
    const useUnitCheck = config.get<boolean>("analysis.useUnitCheck", true);
    const includeHeaders = config.get<boolean>("diagnostics.includeHeaders", false);
    const showCommand = config.get<boolean>("logging.showCommand", true);
    const fullOutput = config.get<boolean>("logging.fullOutput", false);
    const timeoutMs = config.get<number>("runner.timeoutMs", 10000);

    const generatedDir = path.join(
        workspaceFolder.uri.fsPath,
        ".vscode",
        ".pclint-plus",
        profile.name,
        "generated"
    );

    await fs.mkdir(generatedDir, { recursive: true });

    const generatedLntPath = path.join(generatedDir, "current-file.lnt");
    const shadowFile = options.useShadowFile
        ? await writeShadowFile(document, generatedDir, workspaceFolder)
        : undefined;
    const lintSourceFilePath = shadowFile?.uri.fsPath ?? document.uri.fsPath;
    const sourceDir = path.dirname(document.uri.fsPath);

    const generatedLnt = generateCurrentFileLnt({
        useUnitCheck,
        includeDirs: withPchIncludeDir(
            prependUnique(profile.buildInfo.includeDirs, sourceDir),
            profile.pch.header,
            workspaceFolder
        ),
        systemIncludeDirs: profile.buildInfo.systemIncludeDirs,
        defines: profile.buildInfo.defines,
        standard: profile.buildInfo.standard,
        pchHeader: profile.pch.enabled ? path.basename(profile.pch.header) : undefined
    });

    await fs.writeFile(generatedLntPath, generatedLnt, "utf8");

    const command = buildPclintCommand({
        executable: profile.executable,
        rulesetPath: profile.rulesetPath,
        generatedLntPath,
        sourceFilePath: lintSourceFilePath
    });

    appendSection(output, `Run ${new Date().toISOString()}`);
    output.appendLine(`[PC-lint Plus] Profile: ${profile.name}`);
    output.appendLine(`[PC-lint Plus] Workspace: ${workspaceFolder.uri.fsPath}`);
    output.appendLine(`[PC-lint Plus] Generated LNT: ${generatedLntPath}`);

    if (shadowFile) {
        output.appendLine(`[PC-lint Plus] Shadow file: ${shadowFile.uri.fsPath}`);
    }


    if (showCommand) {
        output.appendLine(`[PC-lint Plus] Command: ${command.commandLine}`);
        output.appendLine(`[PC-lint Plus] Args: ${JSON.stringify([command.executable, ...command.args])}`);
    }

    try {
        const result = await runProcess(
            command.executable,
            command.args,
            workspaceFolder.uri.fsPath,
            command.commandLine,
            output,
            timeoutMs,
            onProcessStarted
        );

        const pclintDiagnostics = parsePclintOutput(result.stdout)
            .filter(diagnostic => includeHeaders || isCurrentFileDiagnostic(
                diagnostic.file,
                document.uri.fsPath,
                lintSourceFilePath,
                workspaceFolder.uri.fsPath
            ));
 
        const diagnosticSets = groupDiagnosticsByTargetFile(
             pclintDiagnostics,
            document.uri.fsPath,
            lintSourceFilePath,
            workspaceFolder.uri.fsPath,
             profile.severityMap,
             profile.messageSeverityOverrides
         );
        const diagnostics = diagnosticSets.find(diagnosticSet => sameFile(
            diagnosticSet.uri.fsPath,
            document.uri.fsPath
        ))?.diagnostics ?? [];
        const diagnosticCount = diagnosticSets.reduce(
            (count, diagnosticSet) => count + diagnosticSet.diagnostics.length,
            0
        );

        output.appendLine(`[PC-lint Plus] Duration: ${result.durationMs} ms`);
        output.appendLine(`[PC-lint Plus] Diagnostics: ${diagnosticCount}`);
        appendOptionalBlock(output, "stdout", result.stdout, fullOutput);
        appendOptionalBlock(output, "stderr", result.stderr, fullOutput || result.stderr.trim().length > 0);

        return {
            ...result,
            diagnosticSets,
            generatedLntPath
        };
    } finally {
        if (shadowFile) {
            try {
                await removeShadowFile(shadowFile);
            } catch (error) {
                output.appendLine(`[PC-lint Plus] Could not delete shadow file/directory: ${formatErrorMessage(error)}`);
            }
        }
    }

    void context;
}

function runProcess(
    executable: string,
    args: string[],
    cwd: string,
    commandLine: string,
    output: vscode.OutputChannel,
    timeoutMs: number,
    onProcessStarted?: (process: ChildProcess) => void
): Promise<Omit<PclintResult, "diagnostics" | "diagnosticSets" | "generatedLntPath">> {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const child = spawn(executable, args, {
            cwd,
            shell: false
        });

        let settled = false;
        let timedOut = false;
        let stdout = "";
        let stderr = "";

        const timer = timeoutMs > 0
            ? setTimeout(() => {
                timedOut = true;
                child.kill();
            }, timeoutMs)
            : undefined;

        onProcessStarted?.(child);

        child.stdout?.on("data", chunk => {
            stdout += chunk.toString();
        });

        child.stderr?.on("data", chunk => {
            stderr += chunk.toString();
        });

        child.on("error", error => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timer);
            reject(error);
        });

        child.on("close", exitCode => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timer);

            if (timedOut) {
                output.appendLine(`[PC-lint Plus] Timeout after ${timeoutMs} ms.`);
            }

            output.appendLine(`[PC-lint Plus] Exit code: ${exitCode}`);

            resolve({
                commandLine,
                stdout,
                stderr,
                exitCode,
                durationMs: Date.now() - startedAt
            });
        });
    });
}

function withPchIncludeDir(
    includeDirs: string[],
    pchHeader: string,
    workspaceFolder: vscode.WorkspaceFolder
): string[] {
    if (pchHeader.trim().length === 0) {
        return includeDirs;
    }

    const pchDir = path.isAbsolute(pchHeader)
        ? path.dirname(pchHeader)
        : path.join(workspaceFolder.uri.fsPath, path.dirname(pchHeader));

    return prependUnique(includeDirs, pchDir);
}

async function writeShadowFile(
    document: vscode.TextDocument,
    generatedDir: string,
    workspaceFolder: vscode.WorkspaceFolder
): Promise<ShadowFile> {
    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
    const hash = createHash("sha1").update(document.uri.toString()).digest("hex").slice(0, 12);
    const cleanupRoot = path.join(generatedDir, "shadow");
    const shadowDir = path.join(cleanupRoot, hash, path.dirname(relativePath));
    const shadowPath = path.join(shadowDir, path.basename(document.uri.fsPath));

    await fs.mkdir(shadowDir, { recursive: true });
    await fs.writeFile(shadowPath, document.getText(), "utf8");

    return {
        uri: vscode.Uri.file(shadowPath),
        cleanupRoot
    };
}

async function removeShadowFile(shadowFile: ShadowFile): Promise<void> {
    await fs.rm(shadowFile.uri.fsPath, { force: true });
    await removeEmptyDirectoriesUpTo(path.dirname(shadowFile.uri.fsPath), shadowFile.cleanupRoot);
}

async function removeEmptyDirectoriesUpTo(directory: string, root: string): Promise<void> {
    let current = path.resolve(directory);
    const resolvedRoot = path.resolve(root);

    if (!isPathInsideOrEqual(current, resolvedRoot)) {
        return;
    }

    while (isPathInsideOrEqual(current, resolvedRoot)) {
        try {
            await fs.rmdir(current);
        } catch (error) {
            if (isDirectoryNotEmptyOrMissing(error)) {
                return;
            }

            throw error;
        }

        if (current === resolvedRoot) {
            return;
        }

        current = path.dirname(current);
    }
}

function isPathInsideOrEqual(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isDirectoryNotEmptyOrMissing(error: unknown): boolean {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && ["ENOTEMPTY", "EEXIST", "ENOENT"].includes(String(error.code));
}

function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function groupDiagnosticsByTargetFile(
    diagnostics: ReturnType<typeof parsePclintOutput>,
    documentPath: string,
    lintSourceFilePath: string,
    workspaceFolderPath: string,
    severityMap: Parameters<typeof toVscodeDiagnostics>[1],
    messageSeverityOverrides: Parameters<typeof toVscodeDiagnostics>[2]
): PclintDiagnosticSet[] {
    const groupedDiagnostics = new Map<string, ReturnType<typeof parsePclintOutput>>();

    for (const diagnostic of diagnostics) {
        const targetPath = getDiagnosticTargetPath(
            diagnostic.file,
            documentPath,
            lintSourceFilePath,
            workspaceFolderPath
        );
        const existingDiagnostics = groupedDiagnostics.get(targetPath) ?? [];

        existingDiagnostics.push(diagnostic);
        groupedDiagnostics.set(targetPath, existingDiagnostics);
    }

    return [...groupedDiagnostics.entries()].map(([targetPath, fileDiagnostics]) => ({
        uri: vscode.Uri.file(targetPath),
        diagnostics: toVscodeDiagnostics(
            fileDiagnostics,
            severityMap,
            messageSeverityOverrides
        )
    }));
}

function getDiagnosticTargetPath(
    diagnosticFile: string,
    documentPath: string,
    lintSourceFilePath: string,
    workspaceFolderPath: string
): string {
    const resolvedDiagnosticPath = resolveDiagnosticPath(diagnosticFile, workspaceFolderPath);

    if (sameFile(resolvedDiagnosticPath, documentPath) || sameFile(resolvedDiagnosticPath, lintSourceFilePath)) {
        return documentPath;
    }

    return resolvedDiagnosticPath;
}

function isCurrentFileDiagnostic(
    diagnosticFile: string,
    documentPath: string,
    lintSourceFilePath: string,
    workspaceFolderPath: string
): boolean {
    const resolvedDiagnosticPath = resolveDiagnosticPath(diagnosticFile, workspaceFolderPath);

    return sameFile(resolvedDiagnosticPath, documentPath) || sameFile(resolvedDiagnosticPath, lintSourceFilePath);
}

function resolveDiagnosticPath(diagnosticFile: string, workspaceFolderPath: string): string {
    return path.isAbsolute(diagnosticFile)
        ? path.normalize(diagnosticFile)
        : path.normalize(path.join(workspaceFolderPath, diagnosticFile));
}

function prependUnique(values: string[], value: string): string[] {
    if (values.some(existing => sameFile(existing, value))) {
        return values;
    }

    return [value, ...values];
}
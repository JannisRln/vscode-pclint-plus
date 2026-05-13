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

export interface PclintResult {
    commandLine: string;
    diagnostics: vscode.Diagnostic[];
    stdout: string;
    stderr: string;
    exitCode: number | null;
    generatedLntPath: string;
    durationMs: number;
}

export interface RunPclintOptions {
    useShadowFile?: boolean;
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
    const lintSourceFilePath = shadowFile?.fsPath ?? document.uri.fsPath;
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
        output.appendLine(`[PC-lint Plus] Shadow file: ${shadowFile.fsPath}`);
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
            .filter(diagnostic => includeHeaders || isCurrentFileDiagnostic(diagnostic.file, document.uri.fsPath, lintSourceFilePath));

        const diagnostics = toVscodeDiagnostics(
            pclintDiagnostics,
            profile.severityMap,
            profile.messageSeverityOverrides
        );

        output.appendLine(`[PC-lint Plus] Duration: ${result.durationMs} ms`);
        output.appendLine(`[PC-lint Plus] Diagnostics: ${diagnostics.length}`);
        appendOptionalBlock(output, "stdout", result.stdout, fullOutput);
        appendOptionalBlock(output, "stderr", result.stderr, fullOutput || result.stderr.trim().length > 0);

        return {
            ...result,
            diagnostics,
            generatedLntPath
        };
    } finally {
        if (shadowFile) {
            await fs.rm(shadowFile.fsPath, { force: true });
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
): Promise<Omit<PclintResult, "diagnostics" | "generatedLntPath">> {
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
): Promise<vscode.Uri> {
    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
    const hash = createHash("sha1").update(document.uri.toString()).digest("hex").slice(0, 12);
    const shadowDir = path.join(generatedDir, "shadow", hash, path.dirname(relativePath));
    const shadowPath = path.join(shadowDir, path.basename(document.uri.fsPath));

    await fs.mkdir(shadowDir, { recursive: true });
    await fs.writeFile(shadowPath, document.getText(), "utf8");

    return vscode.Uri.file(shadowPath);
}

function isCurrentFileDiagnostic(diagnosticFile: string, documentPath: string, lintSourceFilePath: string): boolean {
    return sameFile(diagnosticFile, documentPath) || sameFile(diagnosticFile, lintSourceFilePath);
}

function prependUnique(values: string[], value: string): string[] {
    if (values.some(existing => sameFile(existing, value))) {
        return values;
    }

    return [value, ...values];
}
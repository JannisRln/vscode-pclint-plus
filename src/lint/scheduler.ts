import * as vscode from "vscode";
import { ChildProcess } from "child_process";
import { runPclint } from "./runner";

export type LintTrigger = "onType" | "onSave" | "manual" | "pchRebuild";

export class LintScheduler {
    private timers = new Map<string, NodeJS.Timeout>();
    private running = new Map<string, ChildProcess>();
    private generations = new Map<string, number>();
    private lastCommand?: string;

    public constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly output: vscode.OutputChannel,
        private readonly diagnostics: vscode.DiagnosticCollection
    ) {}

    public getLastCommand(): string | undefined {
        return this.lastCommand;
    }

    public scheduleOnType(document: vscode.TextDocument): void {
        const config = vscode.workspace.getConfiguration("pclintPlus", document.uri);

        if (!config.get<boolean>("enabled", true)) {
            return;
        }

        if (!config.get<boolean>("triggers.onType", true)) {
            return;
        }

        const delayMs = config.get<number>("triggers.onTypeDelayMs", 2500);
        const key = document.uri.toString();

        const existing = this.timers.get(key);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            void this.lintDocument(document, "onType");
        }, delayMs);

        this.timers.set(key, timer);
    }

    public async lintDocument(document: vscode.TextDocument, trigger: LintTrigger): Promise<void> {
        const config = vscode.workspace.getConfiguration("pclintPlus", document.uri);

        if (!config.get<boolean>("enabled", true)) {
            return;
        }

        if (document.isUntitled) {
            return;
        }

        const key = document.uri.toString();
        const generation = (this.generations.get(key) ?? 0) + 1;
        this.generations.set(key, generation);

        const pendingTimer = this.timers.get(key);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.timers.delete(key);
        }

        const oldProcess = this.running.get(key);
        if (oldProcess) {
            oldProcess.kill();
            this.running.delete(key);
        }

        this.output.appendLine(`[PC-lint Plus] Trigger: ${trigger}`);
        this.output.appendLine(`[PC-lint Plus] File: ${document.uri.fsPath}`);

        try {
            const result = await runPclint(document, this.context, this.output, process => {
                this.running.set(key, process);
            },{
                useShadowFile: trigger === "onType" && document.isDirty
            });

            if (this.generations.get(key) !== generation) {
                return;
            }

            this.lastCommand = result.commandLine;
            this.diagnostics.set(document.uri, result.diagnostics);
        } catch (error) {
            this.output.appendLine(`[PC-lint Plus] Failed: ${String(error)}`);
        } finally {
            if (this.generations.get(key) === generation) {
                this.running.delete(key);
            }
        }
    }

    public disposePendingRuns(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }

        for (const process of this.running.values()) {
            process.kill();
        }

        this.timers.clear();
        this.running.clear();
    }

    public dispose(): void {
        this.disposePendingRuns();
    }
}
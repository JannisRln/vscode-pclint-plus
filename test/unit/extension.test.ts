import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptions: unknown[] = [];

const mockOutputChannel = {
    show: vi.fn(),
    dispose: vi.fn(),
    appendLine: vi.fn()
};

const mockDiagnosticCollection = {
    clear: vi.fn(),
    dispose: vi.fn()
};

const mockSchedulerInstance = {
    lintDocument: vi.fn(),
    scheduleOnType: vi.fn(),
    getLastCommand: vi.fn(),
    dispose: vi.fn()
};

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

const saveListeners: Array<(document: unknown) => unknown> = [];
const changeListeners: Array<(event: { document: unknown }) => unknown> = [];
const configurationListeners: Array<(event: { affectsConfiguration: (section: string) => boolean }) => unknown> = [];

vi.mock("vscode", () => {
    return {
        window: {
            createOutputChannel: vi.fn(() => mockOutputChannel),
            showInformationMessage: vi.fn(),
            activeTextEditor: undefined
        },
        languages: {
            createDiagnosticCollection: vi.fn(() => mockDiagnosticCollection)
        },
        commands: {
            registerCommand: vi.fn((name: string, callback: (...args: unknown[]) => unknown) => {
                registeredCommands.set(name, callback);
                return { dispose: vi.fn() };
            })
        },
        workspace: {
            getConfiguration: vi.fn(() => ({
                get: vi.fn((_key: string, defaultValue: unknown) => defaultValue)
            })),

            onDidSaveTextDocument: vi.fn((callback: (document: unknown) => unknown) => {
                saveListeners.push(callback);
                return { dispose: vi.fn() };
            }),

            onDidChangeTextDocument: vi.fn((callback: (event: { document: unknown }) => unknown) => {
                changeListeners.push(callback);
                return { dispose: vi.fn() };
            }),

            onDidChangeConfiguration: vi.fn((callback: (event: { affectsConfiguration: (section: string) => boolean }) => unknown) => {
                configurationListeners.push(callback);
                return { dispose: vi.fn() };
            })
        },
        env: {
            clipboard: {
                writeText: vi.fn()
            }
        }
    };
});

vi.mock("@src/lint/scheduler.js", () => {
    return {
        LintScheduler: vi.fn(() => mockSchedulerInstance)
    };
});

describe("extension", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        registeredCommands.clear();
        saveListeners.length = 0;
        changeListeners.length = 0;
        configurationListeners.length = 0;
        subscriptions.length = 0;

        mockSchedulerInstance.getLastCommand.mockReturnValue(undefined);
    });

    it("recognizes C and C++ documents", async () => {
        const { isCppDocument } = await import("@src/extension.js");

        expect(isCppDocument({ languageId: "c" })).toBe(true);
        expect(isCppDocument({ languageId: "cpp" })).toBe(true);
        expect(isCppDocument({ languageId: "cuda-cpp" })).toBe(true);
    });

    it("rejects non-C/C++ documents", async () => {
        const { isCppDocument } = await import("@src/extension.js");

        expect(isCppDocument({ languageId: "typescript" })).toBe(false);
        expect(isCppDocument({ languageId: "python" })).toBe(false);
        expect(isCppDocument({ languageId: "plaintext" })).toBe(false);
    });

    it("creates output channel and diagnostic collection on activation", async () => {
        const vscode = await import("vscode");
        const { activate } = await import("@src/extension.js");

        activate({ subscriptions } as never);

        expect(vscode.window.createOutputChannel).toHaveBeenCalledWith("PC-lint Plus");
        expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith("PC-lint Plus");
    });

    it("registers extension commands on activation", async () => {
        const { activate } = await import("@src/extension.js");

        activate({ subscriptions } as never);

        expect(registeredCommands.has("pclintPlus.lintCurrentFile")).toBe(true);
        expect(registeredCommands.has("pclintPlus.showOutput")).toBe(true);
        expect(registeredCommands.has("pclintPlus.copyLastCommand")).toBe(true);
        expect(registeredCommands.has("pclintPlus.clearDiagnostics")).toBe(true);
        expect(registeredCommands.has("pclintPlus.rebuildPch")).toBe(true);
    });

    it("shows the output channel when showOutput command is executed", async () => {
        const { activate } = await import("@src/extension.js");

        activate({ subscriptions } as never);

        const command = registeredCommands.get("pclintPlus.showOutput");
        expect(command).toBeDefined();

        command?.();

        expect(mockOutputChannel.show).toHaveBeenCalledOnce();
    });

    it("clears diagnostics when clearDiagnostics command is executed", async () => {
        const { activate } = await import("@src/extension.js");

        activate({ subscriptions } as never);

        const command = registeredCommands.get("pclintPlus.clearDiagnostics");
        expect(command).toBeDefined();

        command?.();

        expect(mockDiagnosticCollection.clear).toHaveBeenCalledOnce();
    });

    it("does not lint current file when no active editor exists", async () => {
        const vscode = await import("vscode");
        const { activate } = await import("@src/extension.js");

        vi.mocked(vscode.window).activeTextEditor = undefined;

        activate({ subscriptions } as never);

        const command = registeredCommands.get("pclintPlus.lintCurrentFile");
        expect(command).toBeDefined();

        await command?.();

        expect(mockSchedulerInstance.lintDocument).not.toHaveBeenCalled();
    });

    it("lints current file manually when active editor exists", async () => {
        const vscode = await import("vscode");
        const { activate } = await import("@src/extension.js");

        const document = {
            languageId: "cpp",
            uri: { fsPath: "/project/src/main.cpp" }
        };

        vi.mocked(vscode.window).activeTextEditor = {
            document
        } as never;

        activate({ subscriptions } as never);

        const command = registeredCommands.get("pclintPlus.lintCurrentFile");
        expect(command).toBeDefined();

        await command?.();

        expect(mockSchedulerInstance.lintDocument).toHaveBeenCalledWith(document, "manual");
    });

    it("lints C++ documents on save", async () => {
        const { activate } = await import("@src/extension.js");

        const document = {
            languageId: "cpp",
            uri: { fsPath: "/project/src/main.cpp" }
        };

        activate({ subscriptions } as never);

        expect(saveListeners).toHaveLength(1);

        await saveListeners[0](document);

        expect(mockSchedulerInstance.lintDocument).toHaveBeenCalledWith(document, "onSave");
    });

    it("does not lint non-C/C++ documents on save", async () => {
        const { activate } = await import("@src/extension.js");

        const document = {
            languageId: "typescript",
            uri: { fsPath: "/project/src/main.ts" }
        };

        activate({ subscriptions } as never);

        await saveListeners[0](document);

        expect(mockSchedulerInstance.lintDocument).not.toHaveBeenCalled();
    });

    it("schedules on-type linting for C++ document changes", async () => {
        const { activate } = await import("@src/extension.js");

        const document = {
            languageId: "cpp",
            uri: { fsPath: "/project/src/main.cpp" }
        };

        activate({ subscriptions } as never);

        expect(changeListeners).toHaveLength(1);

        changeListeners[0]({ document });

        expect(mockSchedulerInstance.scheduleOnType).toHaveBeenCalledWith(document);
    });

    it("does not schedule on-type linting for non-C/C++ document changes", async () => {
        const { activate } = await import("@src/extension.js");

        const document = {
            languageId: "markdown",
            uri: { fsPath: "/project/README.md" }
        };

        activate({ subscriptions } as never);

        changeListeners[0]({ document });

        expect(mockSchedulerInstance.scheduleOnType).not.toHaveBeenCalled();
    });

    it("copies last command when available", async () => {
        const vscode = await import("vscode");
        const { activate } = await import("@src/extension.js");

        mockSchedulerInstance.getLastCommand.mockReturnValue("pclp project.lnt current-file.lnt main.cpp");

        activate({ subscriptions } as never);

        const command = registeredCommands.get("pclintPlus.copyLastCommand");
        expect(command).toBeDefined();

        await command?.();

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(
            "pclp project.lnt current-file.lnt main.cpp"
        );

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            "PC-lint Plus command copied."
        );
    });

    it("shows message when no last command is available", async () => {
        const vscode = await import("vscode");
        const { activate } = await import("@src/extension.js");

        mockSchedulerInstance.getLastCommand.mockReturnValue(undefined);

        activate({ subscriptions } as never);

        const command = registeredCommands.get("pclintPlus.copyLastCommand");
        expect(command).toBeDefined();

        await command?.();

        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            "No PC-lint Plus command has been run yet."
        );
    });

    it("disposes scheduler on deactivate", async () => {
        const { activate, deactivate } = await import("@src/extension.js");

        activate({ subscriptions } as never);
        deactivate();

        expect(mockSchedulerInstance.dispose).toHaveBeenCalledOnce();
    });
});
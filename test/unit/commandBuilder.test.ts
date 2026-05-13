import { describe, expect, it } from "vitest";
import { buildPclintCommand } from "@src/lint/commandBuilder";

describe("buildPclintCommand", () => {
    it("builds argument-array command shape", () => {
        const command = buildPclintCommand({
            executable: "pclp",
            rulesetPath: "/project/lint/project.lnt",
            generatedLntPath: "/project/.vscode/.pclint-plus/generated/current-file.lnt",
            sourceFilePath: "/project/src/main.cpp"
        });

        expect(command.executable).toBe("pclp");
        expect(command.args).toEqual([
            "/project/lint/project.lnt",
            "/project/.vscode/.pclint-plus/generated/current-file.lnt",
            "/project/src/main.cpp"
        ]);
    });

    it("creates a shell-readable command line", () => {
        const command = buildPclintCommand({
            executable: "pclp",
            rulesetPath: "/project/lint/project debug.lnt",
            generatedLntPath: "/project/generated/current-file.lnt",
            sourceFilePath: "/project/src/main.cpp"
        });

        expect(command.commandLine).toBe(
            'pclp "/project/lint/project debug.lnt" /project/generated/current-file.lnt /project/src/main.cpp'
        );
    });
});
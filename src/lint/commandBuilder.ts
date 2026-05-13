import { toShellCommand } from "@src/util/shell";

export interface BuildPclintCommandInput {
    executable: string;
    rulesetPath: string;
    generatedLntPath: string;
    sourceFilePath: string;
}

export interface BuiltPclintCommand {
    executable: string;
    args: string[];
    commandLine: string;
}

export function buildPclintCommand(input: BuildPclintCommandInput): BuiltPclintCommand {
    const args = [
        input.rulesetPath,
        input.generatedLntPath,
        input.sourceFilePath
    ];

    return {
        executable: input.executable,
        args,
        commandLine: toShellCommand(input.executable, args)
    };
}

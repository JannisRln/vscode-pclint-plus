import * as vscode from "vscode";
import { resolveManualBuildInfo, RawBuildInfo } from "@src/lint/buildInfo";
import { PclintPchConfig, PclintSeverityMap, ResolvedPclintProfile } from "@src/config/profile";
import { resolveWorkspacePath } from "@src/util/path";

interface RawProfile {
    executable?: string;
    ruleset?: string;
    messageXmlPath?: string;
    buildInfo?: RawBuildInfo;
    pch?: Partial<PclintPchConfig>;
}

const defaultSeverityMap: PclintSeverityMap = {
    error: "error",
    warning: "warning",
    info: "information",
    note: "hint"
};

export function resolvePclintProfile(
    documentUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder
): ResolvedPclintProfile {
    const config = vscode.workspace.getConfiguration("pclintPlus", documentUri);
    const activeProfile = config.get<string>("activeProfile", "default");
    const profiles = config.get<Record<string, RawProfile>>("profiles", {});
    const selectedProfile = profiles[activeProfile] ?? {};

    const executable = selectedProfile.executable ?? config.get<string>("executable", "pclp");
    const rulesetRaw = selectedProfile.ruleset ?? config.get<string>("ruleset", "${workspaceFolder}/lint/project.lnt");
    const messageXmlRaw = selectedProfile.messageXmlPath ?? config.get<string>("diagnostics.messageXmlPath", "");

    const flatBuildInfo: RawBuildInfo = {
        includeDirs: config.get<string[]>("buildInfo.includeDirs", []),
        systemIncludeDirs: config.get<string[]>("buildInfo.systemIncludeDirs", []),
        defines: config.get<string[]>("buildInfo.defines", []),
        standard: config.get<string>("buildInfo.standard", "")
    };

    const rawPch = selectedProfile.pch ?? {
        enabled: config.get<boolean>("pch.enabled", false),
        header: config.get<string>("pch.header", ""),
        watch: config.get<boolean>("pch.watch", true)
    };

    return {
        name: selectedProfile === profiles[activeProfile] ? activeProfile : "default",
        executable,
        rulesetPath: resolveWorkspacePath(rulesetRaw, workspaceFolder),
        messageXmlPath: messageXmlRaw.trim().length > 0
            ? resolveWorkspacePath(messageXmlRaw, workspaceFolder)
            : "",
        buildInfo: resolveManualBuildInfo(selectedProfile.buildInfo ?? flatBuildInfo, workspaceFolder),
        pch: {
            enabled: rawPch.enabled ?? false,
            header: rawPch.header ?? "",
            watch: rawPch.watch ?? true
        },
        severityMap: {
            ...defaultSeverityMap,
            ...config.get<Partial<PclintSeverityMap>>("diagnostics.severityMap", {})
        },
        messageSeverityOverrides: config.get<Record<string, string>>("diagnostics.messageSeverityOverrides", {})
    };
}

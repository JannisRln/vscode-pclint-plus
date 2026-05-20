export interface PclintBuildInfo {
    includeDirs: string[];
    systemIncludeDirs: string[];
    defines: string[];
    standard: string;
}

export interface PclintPchConfig {
    enabled: boolean;
    header: string;
    watch: boolean;
}

export interface PclintSeverityMap {
    error: string;
    warning: string;
    info: string;
    note: string;
}

export interface ResolvedPclintProfile {
    name: string;
    executable: string;
    rulesetPath: string;
    messageXmlPath: string;
    buildInfo: PclintBuildInfo;
    pch: PclintPchConfig;
    severityMap: PclintSeverityMap;
    messageSeverityOverrides: Record<string, string>;
}

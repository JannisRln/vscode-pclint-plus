import * as vscode from "vscode";
import { PclintDiagnostic, PclintSeverity } from "@src/diagnostics/diagnosticModel";
import { PclintSeverityMap } from "@src/config/profile";

export function toVscodeDiagnostic(
    diagnostic: PclintDiagnostic,
    severityMap?: Partial<PclintSeverityMap>,
    messageSeverityOverrides?: Record<string, string>
): vscode.Diagnostic {
    const line = Math.max(0, diagnostic.line - 1);
    const column = Math.max(0, diagnostic.column - 1);

    const range = new vscode.Range(
        line,
        column,
        line,
        column + 1
    );

    const vscodeDiagnostic = new vscode.Diagnostic(
        range,
        diagnostic.message,
        toVscodeSeverity(diagnostic, severityMap, messageSeverityOverrides)
    );

    vscodeDiagnostic.source = "PC-lint Plus";
    vscodeDiagnostic.code = diagnostic.code;

    return vscodeDiagnostic;
}

export function toVscodeDiagnostics(
    diagnostics: PclintDiagnostic[],
    severityMap?: Partial<PclintSeverityMap>,
    messageSeverityOverrides?: Record<string, string>
): vscode.Diagnostic[] {
    return diagnostics.map(diagnostic => toVscodeDiagnostic(
        diagnostic,
        severityMap,
        messageSeverityOverrides
    ));
}

function toVscodeSeverity(
    diagnostic: PclintDiagnostic,
    severityMap?: Partial<PclintSeverityMap>,
    messageSeverityOverrides?: Record<string, string>
): vscode.DiagnosticSeverity {
    const mapped = messageSeverityOverrides?.[diagnostic.code] ?? severityMap?.[diagnostic.severity] ?? diagnostic.severity;

    switch (mapped.toLowerCase()) {
        case "error":
            return vscode.DiagnosticSeverity.Error;

        case "warning":
            return vscode.DiagnosticSeverity.Warning;

        case "information":
        case "info":
            return vscode.DiagnosticSeverity.Information;

        case "hint":
        case "note":
            return vscode.DiagnosticSeverity.Hint;

        default:
            return defaultSeverity(diagnostic.severity);
    }
}

function defaultSeverity(severity: PclintSeverity): vscode.DiagnosticSeverity {
    switch (severity) {
        case "error":
            return vscode.DiagnosticSeverity.Error;

        case "warning":
            return vscode.DiagnosticSeverity.Warning;

        case "info":
            return vscode.DiagnosticSeverity.Information;

        case "note":
            return vscode.DiagnosticSeverity.Hint;

        default:
            return vscode.DiagnosticSeverity.Warning;
    }
}

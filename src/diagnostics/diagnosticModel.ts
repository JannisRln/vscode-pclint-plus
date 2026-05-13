export type PclintSeverity = "error" | "warning" | "info" | "note";

export interface PclintDiagnostic {
    file: string;
    line: number;
    column: number;
    severity: PclintSeverity;
    code: string;
    message: string;
}
import { PclintDiagnostic, PclintSeverity } from "./diagnosticModel";
import { normalizeMessageCode } from "./messageXml";

export function parsePclintOutput(output: string): PclintDiagnostic[] {
    const diagnostics: PclintDiagnostic[] = [];

    for (const line of output.split(/\r?\n/)) {
        const parts = line.split("|");

        if (parts.length < 6) {
            continue;
        }

        const [file, lineText, columnText, severityText, code, ...messageParts] = parts;

        const parsedLine = Number.parseInt(lineText, 10);
        const parsedColumn = Number.parseInt(columnText, 10);

        if (!Number.isFinite(parsedLine) || !Number.isFinite(parsedColumn)) {
            continue;
        }

        if (!isPclintSeverity(severityText)) {
            continue;
        }

        diagnostics.push({
            file,
            line: parsedLine,
            column: parsedColumn,
            severity: severityText,
            code: normalizeMessageCode(code) || code,
            message: messageParts.join("|").trim()
        });
    }

    return diagnostics;
}

function isPclintSeverity(value: string): value is PclintSeverity {
    return value === "error" ||
        value === "warning" ||
        value === "info" ||
        value === "note";
}
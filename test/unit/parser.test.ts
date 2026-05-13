import { describe, expect, it } from "vitest";
import { parsePclintOutput } from "@src/diagnostics/parser";

describe("parsePclintOutput", () => {
    it("parses a single PC-lint Plus diagnostic line", () => {
        const output = "/project/src/main.cpp|42|17|warning|732|message text";

        const diagnostics = parsePclintOutput(output);

        expect(diagnostics).toEqual([
            {
                file: "/project/src/main.cpp",
                line: 42,
                column: 17,
                severity: "warning",
                code: "732",
                message: "message text"
            }
        ]);
    });

    it("ignores non-matching output lines", () => {
        const output = [
            "PC-lint Plus 2025 SP1",
            "/project/src/main.cpp|42|17|warning|732|message text",
            "random text"
        ].join("\n");

        const diagnostics = parsePclintOutput(output);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].code).toBe("732");
    });

    it("keeps pipe characters inside the message", () => {
        const output = "/project/src/main.cpp|42|17|info|900|message with | inside";

        const diagnostics = parsePclintOutput(output);

        expect(diagnostics[0].message).toBe("message with | inside");
    });
});
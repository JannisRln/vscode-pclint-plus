import { describe, expect, it } from "vitest";
import { generateCurrentFileLnt } from "@src/lint/lntGenerator";

describe("generateCurrentFileLnt", () => {
    it("generates stable parser output options", () => {
        const text = generateCurrentFileLnt({
            useUnitCheck: true,
            includeDirs: [],
            defines: [],
            standard: ""
        });

        expect(text).toContain("-width=0");
        expect(text).toContain("-h1");
        expect(text).toContain('-"format=%f|%l|%C|%t|%n|%m"');
        expect(text).toContain("+ffn");
    });

    it("adds unit_check when enabled", () => {
        const text = generateCurrentFileLnt({
            useUnitCheck: true,
            includeDirs: [],
            defines: [],
            standard: ""
        });

        expect(text).toContain("--unit_check");
    });

    it("omits unit_check when disabled", () => {
        const text = generateCurrentFileLnt({
            useUnitCheck: false,
            includeDirs: [],
            defines: [],
            standard: ""
        });

        expect(text).not.toContain("--unit_check");
    });

    it("adds include directories, defines, and standard", () => {
        const text = generateCurrentFileLnt({
            useUnitCheck: true,
            includeDirs: ["/project/include", "/project/src"],
            defines: ["_lint", "DEBUG", "TARGET_BOARD=1"],
            standard: "c++20"
        });

        expect(text).toContain("-i/project/include");
        expect(text).toContain("-i/project/src");
        expect(text).toContain("-d_lint");
        expect(text).toContain("-dDEBUG");
        expect(text).toContain("-dTARGET_BOARD=1");
        expect(text).toContain("-std=c++20");
    });
});
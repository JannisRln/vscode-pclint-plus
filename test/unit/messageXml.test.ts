import { describe, expect, it } from "vitest";
import { parseMessageCatalog } from "@src/diagnostics/messageXml";

describe("parseMessageCatalog", () => {
    it("parses PC-lint messages from element bodies", () => {
        const catalog = parseMessageCatalog(`
            <messages>
                <message id="732">loss of sign &amp; precision</message>
            </messages>
        `);

        expect(catalog.get("732")).toEqual({
            text: "loss of sign & precision",
            commentary: ""
        });
    });

    it("parses PC-lint messages from text-like attributes", () => {
        const catalog = parseMessageCatalog(`
            <messages>
                <msg code="900" text="successful compilation" />
            </messages>
        `);

        expect(catalog.get("900")).toEqual({
            text: "successful compilation",
            commentary: ""
        });
    });

    it("parses PC-lint Plus text and commentary child elements", () => {
        const catalog = parseMessageCatalog(`
            <messages>
                <message id="537">
                    <category>warning</category>
                    <text>repeated include file &apos;__file__&apos;</text>
                    <commentary>The file whose inclusion within a module is being requested has already been included in this compilation.</commentary>
                </message>
            </messages>
        `);

        expect(catalog.get("537")).toEqual({
            text: "repeated include file '__file__'",
            commentary: "The file whose inclusion within a module is being requested has already been included in this compilation."
        });
    });
});

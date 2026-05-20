import * as path from "path";
import * as fs from "fs/promises";

export interface PclintMessageInfo {
    text: string;
    commentary: string;
}

export type PclintMessageCatalog = Map<string, PclintMessageInfo>;

export async function loadMessageCatalog(messageXmlPath: string): Promise<PclintMessageCatalog> {
    if (messageXmlPath.trim().length === 0) {
        return new Map();
    }

    if (path.extname(messageXmlPath).toLowerCase() !== ".xml") {
        throw new Error(`PC-lint message XML path must include the XML file name, for example msg.xml: ${messageXmlPath}`);
    }

    const xml = await fs.readFile(messageXmlPath, "utf8");

    return parseMessageCatalog(xml);
}

export function parseMessageCatalog(xml: string): PclintMessageCatalog {
    const messages = new Map<string, PclintMessageInfo>();

    parseStructuredMessageElements(xml, messages);
    parseLegacyElementMessages(xml, messages);
    parseAttributeMessages(xml, messages);

    return messages;
}

function parseStructuredMessageElements(xml: string, messages: PclintMessageCatalog): void {
    const messagePattern = /<(?:msg|message)\b[^>]*(?:id|code|num|number)\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/(?:msg|message)>/gi;
    let match: RegExpExecArray | null;

    while ((match = messagePattern.exec(xml)) !== null) {
        const [, code, body] = match;
        const text = extractChildElementText(body, "text");
        const commentary = extractChildElementText(body, "commentary");
        const fallbackText = text.length > 0 ? text : decodeXmlEntities(stripXmlTags(body)).replace(/\s+/g, " ").trim();

        addMessage(messages, code, fallbackText, commentary);
    }
}

function parseLegacyElementMessages(xml: string, messages: PclintMessageCatalog): void {
    const elementPattern = /<[^>]*(?:msg|message|code|number|num|id)\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    let match: RegExpExecArray | null;

    while ((match = elementPattern.exec(xml)) !== null) {
        addMessage(messages, match[1], decodeXmlEntities(stripXmlTags(match[2])).replace(/\s+/g, " ").trim(), "");
    }
}

function parseAttributeMessages(xml: string, messages: PclintMessageCatalog): void {
    const selfClosingOrOpenElementPattern = /<[^>]*(?:msg|message|code|number|num|id)\s*=\s*["'](\d+)["'][^>]*(?:text|desc|description|message|format|title)\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = selfClosingOrOpenElementPattern.exec(xml)) !== null) {
        addMessage(messages, match[1], decodeXmlEntities(match[2]).replace(/\s+/g, " ").trim(), "");
    }
}

function extractChildElementText(body: string, elementName: string): string {
    const pattern = new RegExp(`<${elementName}\\b[^>]*>([\\s\\S]*?)<\\/${elementName}>`, "i");
    const match = pattern.exec(body);

    if (!match) {
        return "";
    }

    return decodeXmlEntities(stripXmlTags(match[1])).replace(/\s+/g, " ").trim();
}

function addMessage(messages: PclintMessageCatalog, code: string, text: string, commentary: string): void {
    const normalizedCode = normalizeMessageCode(code);

    if (normalizedCode.length === 0 || messages.has(normalizedCode)) {
        return;
    }

    const normalizedText = text.trim();
    const normalizedCommentary = commentary.trim();

    if (normalizedText.length > 0 || normalizedCommentary.length > 0) {
        messages.set(normalizedCode, {
            text: normalizedText,
            commentary: normalizedCommentary
        });
    }
}

export function normalizeMessageCode(code: string): string {
    const match = /\d+/.exec(code);
    return match?.[0] ?? "";
}

function stripXmlTags(value: string): string {
    return value.replace(/<[^>]+>/g, " ");
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

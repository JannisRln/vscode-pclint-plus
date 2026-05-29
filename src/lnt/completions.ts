import * as vscode from "vscode";

interface LntOptionCompletion {
    readonly label: string;
    readonly detail: string;
    readonly documentation: string;
    readonly insertText?: string;
}

const OPTION_COMPLETIONS: readonly LntOptionCompletion[] = [
    {
        label: "-e",
        detail: "Suppress message",
        documentation: "Suppress a PC-lint message by number.",
        insertText: "-e${1:message-number}"
    },
    {
        label: "+e",
        detail: "Enable message",
        documentation: "Re-enable a PC-lint message by number.",
        insertText: "+e${1:message-number}"
    },
    {
        label: "-w",
        detail: "Warning level",
        documentation: "Set the warning level.",
        insertText: "-w${1|0,1,2,3,4|}"
    },
    {
        label: "-wlib",
        detail: "Warning level for libs",
        documentation: "Set the warning level.",
        insertText: "-w${1|0,1,2,3,4|}"
    },
    {
        label: "-esym",
        detail: "Suppress message for symbol",
        documentation: "Suppress a message for one symbol or symbol pattern.",
        insertText: "-esym(${1:message-number},${2:symbol})"
    },
    {
        label: "-emacro",
        detail: "Suppress message for macro",
        documentation: "Suppress a message for one macro or macro pattern.",
        insertText: "-emacro(${1:message-number},${2:macro})"
    },
    {
        label: "-efile",
        detail: "Suppress message for file",
        documentation: "Suppress a message for one file or file pattern.",
        insertText: "-efile(${1:message-number},${2:file})"
    },
    {
        label: "-elib",
        detail: "Suppress library message",
        documentation: "Suppress a message for library code.",
        insertText: "-elib(${1:message-number})"
    },
    {
        label: "-elibsym",
        detail: "Suppress library symbol message",
        documentation: "Suppress a message for one library symbol or symbol pattern.",
        insertText: "-elibsym(${1:message-number},${2:symbol})"
    },
    {
        label: "-elibmacro",
        detail: "Suppress library macro message",
        documentation: "Suppress a message for one library macro or macro pattern.",
        insertText: "-elibmacro(${1:message-number},${2:macro})"
    },
    {
        label: "-sem",
        detail: "Function semantic",
        documentation: "Define additional semantic information for a function.",
        insertText: "-sem(${1:function},${2:semantic})"
    },
    {
        label: "-function",
        detail: "Function option",
        documentation: "Apply an option to a function or function pattern.",
        insertText: "-function(${1:function},${2:option})"
    },
    {
        label: "-append",
        detail: "Append to option",
        documentation: "Append text to an option value.",
        insertText: "-append(${1:option},${2:value})"
    },
    {
        label: "-passes",
        detail: "Analysis passes",
        documentation: "Set the number of analysis passes.",
        insertText: "-passes(${1:3})"
    },
    {
        label: "-i",
        detail: "Include directory",
        documentation: "Add an include directory.",
        insertText: "-i${1:path}"
    },
    {
        label: "+libdir",
        detail: "Library directory",
        documentation: "Add a library/header directory.",
        insertText: "+libdir(${1:path})"
    },
    {
        label: "-pch",
        detail: "Precompiled header file",
        documentation: "Use a precompiled header file.",
        insertText: "-pch(${1:path})"
    },
    {
        label: "-header",
        detail: "Header file",
        documentation: "Add a header file to the analysis configuration.",
        insertText: "-header(${1:path})"
    },
    {
        label: "-u",
        detail: "Undefine macro",
        documentation: "Undefine a macro.",
        insertText: "-u${1:MACRO}"
    },
    {
        label: "-d",
        detail: "Define macro",
        documentation: "Define a macro.",
        insertText: "-d${1:MACRO}${2:=value}"
    },
    {
        label: "-D",
        detail: "Define macro",
        documentation: "Define a macro using compiler-style syntax.",
        insertText: "-D${1:MACRO}${2:=value}"
    },
    {
        label: "-U",
        detail: "Undefine macro",
        documentation: "Undefine a macro using compiler-style syntax.",
        insertText: "-U${1:MACRO}"
    },
    {
        label: "-std",
        detail: "Language standard",
        documentation: "Set the language standard.",
        insertText: "-std(${1|c90,c99,c11,c17,c++03,c++11,c++14,c++17,c++20|})"
    },
    {
        label: "-format",
        detail: "Message format",
        documentation: "Set the diagnostic output format.",
        insertText: "-format=${1:format}"
    },
    {
        label: "-summary",
        detail: "Summary output",
        documentation: "Configure summary output.",
        insertText: "-summary(${1|0,1|})"
    },
    {
        label: "-os",
        detail: "Output stream/file",
        documentation: "Write output to a stream or file.",
        insertText: "-os(${1:path})"
    },
    {
        label: "-oo",
        detail: "Options output",
        documentation: "Write option/configuration output to a file.",
        insertText: "-oo(${1:path})"
    },
    {
        label: "+rw",
        detail: "Report warnings",
        documentation: "Enable warning reporting.",
        insertText: "+rw"
    },
    {
        label: "-rw",
        detail: "Disable warning reporting",
        documentation: "Disable warning reporting.",
        insertText: "-rw"
    },
    {
        label: "+linebuf",
        detail: "Line buffered output",
        documentation: "Enable line-buffered output.",
        insertText: "+linebuf"
    },
    {
        label: "+flb",
        detail: "Library flag",
        documentation: "Enable library-processing behavior for following files/options.",
        insertText: "+flb"
    },
    {
        label: "-flb",
        detail: "Library flag off",
        documentation: "Disable library-processing behavior for following files/options.",
        insertText: "-flb"
    },
    {
        label: "-zero",
        detail: "Zero initialization option",
        documentation: "Configure zero-initialization assumptions.",
        insertText: "-zero"
    },
    {
        label: "-width",
        detail: "Output width",
        documentation: "Set message output width.",
        insertText: "-width(${1:120})"
    }
];

export class LntCompletionItemProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const range = this.getReplacementRange(document, position);

        return OPTION_COMPLETIONS.map(option => {
            const item = new vscode.CompletionItem(option.label, vscode.CompletionItemKind.Keyword);
            item.detail = option.detail;
            item.documentation = new vscode.MarkdownString(option.documentation);
            item.insertText = new vscode.SnippetString(option.insertText ?? option.label);
            item.range = range;
            item.sortText = `0_${option.label}`;
            item.filterText = option.label;
            return item;
        });
    }

    private getReplacementRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range {
        const linePrefix = document.lineAt(position).text.slice(0, position.character);
        const match = /[+-]?[A-Za-z][A-Za-z0-9_+-]*$/.exec(linePrefix) ?? /[+-]$/.exec(linePrefix);
        if (!match) {
            return new vscode.Range(position, position);
        }

        const start = new vscode.Position(position.line, position.character - match[0].length);
        return new vscode.Range(start, position);
    }
}

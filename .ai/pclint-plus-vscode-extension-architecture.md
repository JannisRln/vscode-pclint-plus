# PC-lint Plus VS Code Extension — Target and Architecture Document

Version: 0.1  
Date: 2026-05-13  
Document language: English  
Target product: VS Code extension for fast PC-lint Plus diagnostics in C/C++ projects

---

## 1. Purpose

The purpose of this extension is to integrate PC-lint Plus into Visual Studio Code as a fast, interactive C/C++ linter.

The extension shall support:

- configurable linting on save;
- configurable linting after typing stops;
- current-file-only diagnostics for editor feedback;
- optional stronger/full analysis on save;
- temporary generated `.lnt` files;
- workspace-specific PC-lint Plus executable and ruleset configuration;
- support for multiple workspaces, build configurations, and target variants;
- PC-lint Plus precompiled header handling for performance;
- diagnostics in editor squiggles, Problems panel, and Output channel;
- user-configurable severity mapping and problem matching.

The first implementation should focus on reliable current-file linting. More advanced project-wide and target-aware behavior can be added later.

---

## 2. Source Material and PC-lint Plus Constraints

The extension design is based on the PC-lint Plus Reference Manual 2025 SP1.

Relevant manual areas:

- Visual Studio Code integration is described using VS Code tasks, `vscode.lnt`, output formatting, `-width=0`, `-h1`, and a compiler-like `-format` option.
- PC-lint Plus supports `.lnt` indirect option files.
- Diagnostic message output is configurable.
- Diagnostics are categorized as `error`, `warning`, `info`, and `note`.
- Precompiled headers can be configured using `-pch(header-name)`.
- PC-lint Plus precompiled headers are cached on disk and loaded later to reduce processing time.
- The PCH header name should be resolvable through the include path and should normally match the include spelling rather than an arbitrary absolute path.
- PC-lint Plus can generate different PCH cache files for C and C++ modules.

The extension shall use these capabilities directly instead of relying only on VS Code task problem matchers.

---

## 3. User Requirements Captured So Far

| Topic | Decision |
|---|---|
| Languages | C/C++ |
| Lint trigger | Configurable per workspace |
| Lint scope | Currently active file |
| PC-lint executable | Configurable per workspace |
| Ruleset | User-provided ruleset; extension provides basic integration settings |
| Compiler rules | User ruleset should include compiler rules |
| Temporary `.lnt` generation | Yes, automatic |
| `compile_commands.json` | Not available currently, but may be introduced |
| Build information fallback | Open design item |
| Save latency target | 3–4 seconds, possibly full analysis |
| Typing latency target | 2–3 seconds using `--unit_check` |
| Disable on large files | No |
| Cancel stale jobs | Recommended: yes |
| Existing PCH setup | No; workspace-dependent |
| PCH rebuild command | Yes: `PC-lint Plus: Rebuild PCH` |
| PCH rebuild trigger | Automatically when PCH header changes |
| Dynamic include/define generation | Recommended: yes, with layered providers |
| Diagnostics scope | Current file only; old diagnostics stay until that file changes |
| Header diagnostics | Optional, off by default |
| Diagnostic output locations | Editor squiggles, Problems panel, Output channel |
| Severity mapping | User-configurable |
| Raw command logging | Yes |
| Full output logging | Configurable |
| Copy last command | Optional debug command |
| Workspace support | Single-root and multi-root |
| Multiple `.lnt` files | Possibly |
| Multiple configurations | Yes |
| Document output | Markdown |
| Language | English |

---

## 4. Product Goals

### 4.1 Primary Goals

1. Provide fast PC-lint Plus diagnostics while editing C/C++ files.
2. Keep the extension usable in large embedded projects.
3. Avoid requiring a complete project-wide analysis for editor feedback.
4. Keep PC-lint Plus configuration under user control.
5. Support workspace-specific setup because PC-lint Plus configuration is project- and compiler-dependent.
6. Make generated command lines transparent and debuggable.

### 4.2 Non-Goals for the MVP

The first version shall not try to:

- replace project-wide CI linting;
- generate a complete PC-lint Plus compiler configuration automatically;
- deeply understand every build system;
- analyze all project files automatically;
- provide full MISRA/AUTOSAR/CERT rule configuration UI;
- edit the user's ruleset automatically.

---

## 5. Extension Modes

The extension shall support two execution modes.

### 5.1 Fast Mode

Fast Mode is used for interactive diagnostics after typing stops.

Recommended behavior:

```text
Trigger: after typing stops
Delay: configurable, default 2500 ms
Scope: active source file only
PC-lint mode: --unit_check
Diagnostics: current file only
Timeout: configurable
Stale job cancellation: enabled
```

Purpose:

- quick feedback while editing;
- avoid full-project overhead;
- reduce noise from unrelated files.

### 5.2 Save Mode

Save Mode is used when the active file is saved.

Recommended behavior:

```text
Trigger: file save
Scope: saved active file
Default mode: --unit_check
Optional mode: full/saved-file analysis profile
Timeout: configurable
Diagnostics: current file only by default
```

The user wants save linting to complete in roughly 3–4 seconds. A stronger on-save profile may be supported, but should remain configurable because full analysis may exceed that target depending on the project.

---

## 6. Architecture Overview

```text
VS Code Extension Host
│
├── Activation / Settings
│   ├── workspace configuration
│   ├── selected target profile
│   └── command registration
│
├── Event Layer
│   ├── onDidChangeTextDocument
│   ├── onDidSaveTextDocument
│   ├── onDidChangeActiveTextEditor
│   └── file watchers
│
├── Scheduler
│   ├── debounce on typing
│   ├── per-file cancellation
│   ├── stale result protection
│   └── concurrency control
│
├── Configuration Resolver
│   ├── workspace folder detection
│   ├── target/profile selection
│   ├── user ruleset resolution
│   ├── build info provider selection
│   └── generated .lnt creation
│
├── Build Info Providers
│   ├── compile_commands.json provider
│   ├── VS Code C/C++ configuration provider
│   ├── CMake Tools provider
│   ├── manual settings provider
│   └── fallback provider
│
├── PC-lint Plus Runner
│   ├── command construction
│   ├── process execution
│   ├── timeout handling
│   ├── cancellation
│   └── raw output capture
│
├── Output Parser
│   ├── PC-lint output parser
│   ├── severity mapper
│   ├── path normalizer
│   └── diagnostic filter
│
├── Diagnostic Store
│   ├── VS Code DiagnosticCollection
│   ├── current-file diagnostics
│   ├── persistent diagnostics for unchanged files
│   └── clear/update behavior
│
└── Debug/UX Layer
    ├── Output channel
    ├── copy last command
    ├── rebuild PCH command
    └── status indicator
```

---

## 7. Configuration Model

Configuration should be workspace-scoped. Multi-root workspaces must resolve settings from the workspace folder that owns the active file.

### 7.1 Example Settings

```json
{
  "pclintPlus.executable": "pclp",
  "pclintPlus.enabled": true,

  "pclintPlus.triggers.onSave": true,
  "pclintPlus.triggers.onType": true,
  "pclintPlus.triggers.onTypeDelayMs": 2500,

  "pclintPlus.activeProfile": "debug",

  "pclintPlus.ruleset" : "${workspaceFolder}/lint/project-debug.lnt",

  or 


  "pclintPlus.profiles": {
    "debug": {
      "ruleset": "${workspaceFolder}/lint/project-debug.lnt",
      "buildInfo": {
        "provider": "manual",
        "includeDirs": [
          "${workspaceFolder}/include",
          "${workspaceFolder}/src"
        ],
        "defines": [
          "DEBUG",
          "_lint"
        ],
        "standard": "c++20"
      },
      "pch": {
        "enabled": true,
        "header": "lint/pclint_pch.hpp",
        "watch": true
      }
    },
    "release": {
      "ruleset": "${workspaceFolder}/lint/project-release.lnt",
      "buildInfo": {
        "provider": "compileCommands",
        "path": "${workspaceFolder}/build/compile_commands.json"
      },
      "pch": {
        "enabled": true,
        "header": "lint/pclint_pch.hpp",
        "watch": true
      }
    }
  },

  "pclintPlus.analysis.fastMode": {
    "enabled": true,
    "useUnitCheck": true,
    "diagnosticsScope": "currentFile"
  },

  "pclintPlus.analysis.saveMode": {
    "enabled": true,
    "useUnitCheck": true,
    "diagnosticsScope": "currentFile"
  },

  "pclintPlus.diagnostics.severityMap": {
    "error": "error",
    "warning": "warning",
    "info": "information",
    "note": "hint"
  },

  "pclintPlus.logging.showCommand": true,
  "pclintPlus.logging.fullOutput": false
}
```

<!-- ### 7.2 Profile Concept (Optinal)

A profile represents one lint target.

Examples:

- `debug`
- `release`
- `board-a`
- `board-b`
- `gcc`
- `clang`
- `iar`
- `armclang`

Each profile can define:

- ruleset `.lnt`;
- build information source;
- extra include paths;
- extra defines;
- PCH header;
- on-save behavior;
- on-type behavior;
- severity mapping override.

This is important because the same workspace may contain multiple target boards or compiler variants.

--- -->

## 8. Ruleset Handling

The user ruleset shall remain the source of truth for PC-lint Plus rule configuration.

The user ruleset should include:

- compiler adaptation rules;
- project-specific rule suppressions;
- standard configuration such as MISRA/AUTOSAR/CERT settings;
- library/header classification;
- project-wide PC-lint options.

The extension-generated `.lnt` file should include only integration and current-file context:

- stable output format;
- no line wrapping;
- one-line diagnostics;
- current-file include paths;
- current-file defines;
- optional PCH option;
- temporary source file path if needed;
- fast-mode options such as `--unit_check`.

The extension should not modify the user ruleset.

---

## 9. Generated Temporary `.lnt` Files

For each lint run, the extension shall generate a temporary `.lnt` file.

Recommended generated structure:

```text
// Generated by VS Code PC-lint Plus extension.
// Do not edit.

// Output format for parser
-width=0
-h1
-"format=%f|%l|%C|%t|%n|%m"
+ffn

// Fast current-file mode, if enabled
--unit_check

// Optional PCH
-pch(pclint_pch.hpp)

// Dynamic include directories
-i/path/to/include
-i/path/to/module/include

// Dynamic defines
-dDEBUG
-d_lint
-dTARGET_BOARD=1

// Language standard, if known
-std=c++20
```

### 9.1 Temporary File Location

Use a workspace-local generated folder by default:

```text
${workspaceFolder}/.vscode/.pclint-plus/
```

Alternative:

```text
extension global storage
```

Workspace-local storage is better for debugging because the generated files are visible. Global extension storage avoids adding generated files to the project tree.

Recommended default:

```text
${workspaceFolder}/.vscode/.pclint-plus/generated/
```

Add this path to `.gitignore` if needed.

---

## 10. PC-lint Plus Command Construction

Recommended command shape for fast mode:

```text
<pclintPlus.executable>
  <user-ruleset.lnt>
  <generated-current-file.lnt>
  <source-file>
```

If `useUnitCheck` is enabled, include `--unit_check` in the generated `.lnt` file or command arguments.

Recommended command shape:

```text
pclp
  ${workspaceFolder}/lint/project.lnt
  ${workspaceFolder}/.vscode/.pclint-plus/generated/current-file.lnt
  ${file}
```

For logging, the extension should print both:

1. shell-escaped command line;
2. argument array form.

Argument array form is important for debugging quoting problems.

---

<!-- ## 11. Build Information Strategy

This is currently the main open design area.

The extension should implement a layered provider model.

### 11.1 Provider Priority

Recommended provider priority:

1. `compile_commands.json`
2. CMake Tools extension API, if available
3. VS Code C/C++ extension configuration, if available
4. manual settings in `settings.json`
5. fallback minimal mode

### 11.2 Recommended MVP Provider

For the MVP, implement:

```text
manual settings provider
```

Then add:

```text
compile_commands.json provider
```

Reason:

- the user currently does not have `compile_commands.json`;
- manual include/define settings are predictable and easy to test;
- later migration to `compile_commands.json` is straightforward.

### 11.3 Manual Build Info Example

```json
{
  "pclintPlus.profiles": {
    "debug": {
      "buildInfo": {
        "provider": "manual",
        "includeDirs": [
          "${workspaceFolder}/include",
          "${workspaceFolder}/src",
          "${workspaceFolder}/generated"
        ],
        "systemIncludeDirs": [],
        "defines": [
          "_lint",
          "DEBUG",
          "TARGET_BOARD=1"
        ],
        "standard": "c++20"
      }
    }
  }
}
``` -->

### 11.4 Dynamic Per-File Include Ideas

The extension can generate includes dynamically for the current file using these approaches:

#### Option A: Compile database

Best long-term option.

For each file:

- find the matching `compile_commands.json` entry;
- extract `-I`, `-isystem`, `-D`, and `-std`;
- cache the result.

#### Option B: Directory-based include discovery

Useful without a compile database.

For current file:

- include workspace-level configured include directories;
- include sibling `include` directories;
- include parent module include directories;
- optionally include generated directories.

Example heuristic:

```text
src/module/foo.cpp
→ include src/module
→ include src/module/include
→ include include
→ include generated
```

This should be optional because guessing include paths can hide configuration errors.

#### Option C: User-defined include profiles

The user explicitly defines include/define sets per target.

Best MVP fallback.

#### Recommendation

Use this order:

```text
manual profile first → compile_commands.json later → optional heuristic discovery later
```

Do not make heuristic include discovery the default.

---

## 12. Handling System Includes

Question 21 was open.

Recommendation:

- include system include directories if they are required for PC-lint Plus to parse the file;
- allow separate `systemIncludeDirs`;
- allow the user to disable system includes in fast mode if performance suffers.

Settings:

```json
{
  "pclintPlus.buildInfo.includeSystemDirs": true,
  "pclintPlus.buildInfo.systemIncludeDirs": []
}
```

PC-lint Plus must see enough compiler/library context to parse the current file reliably. If system includes are missing, diagnostics may become noisy or wrong.

---

## 13. Missing Include Diagnostics

Question 22 was open.

Recommendation:

- show missing include diagnostics by default on save;
- optionally suppress or downgrade them in on-type fast mode.

Reason:

- during typing, a file may be temporarily incomplete;
- missing include errors can dominate the Problems panel;
- on save, missing include errors are useful and should be visible.

Settings:

```json
{
  "pclintPlus.fastMode.missingIncludeSeverity": "hint",
  "pclintPlus.saveMode.missingIncludeSeverity": "error"
}
```

Alternative:

```json
{
  "pclintPlus.fastMode.suppressMessages": ["322", "..."]
}
```

Exact message numbers should be verified against actual PC-lint Plus output from the target project before hard-coding defaults.

---

## 14. Job Scheduling and Cancellation

Question 14 was open.

Recommendation: yes, cancel stale jobs.

Behavior:

- when the user types, mark the current diagnostics as potentially stale;
- after debounce, start a new job;
- if a previous job for the same file is still running, terminate it;
- if a previous job exits after a newer job started, ignore its result;
- keep old diagnostics visible until the new result is available;
- clear diagnostics only when the new run succeeds or when the file is no longer lintable.

This preserves useful old diagnostics without flashing the UI empty during typing.

### 14.1 Scheduler Rules

```text
One active lint process per file.
Optional global max concurrency: 1 or 2.
On type: debounce.
On save: run immediately and cancel pending on-type job.
On active editor switch: do not clear old diagnostics.
```

---

## 15. Diagnostics Behavior

### 15.1 Current-File Diagnostics

MVP behavior:

- publish diagnostics only for the current source file;
- retain diagnostics for files that are not currently active;
- clear diagnostics for a file when:
  - the file is closed and setting says to clear on close;
  - the file is deleted;
  - the workspace folder is closed;
  - the user runs "Clear PC-lint Plus Diagnostics".

The user requested that old diagnostics should remain when switching files if the file has not changed.

### 15.2 Header Diagnostics

Question 24 was open.

Recommendation:

```text
Header diagnostics: configurable, off by default.
```

Reason:

- header diagnostics can be useful;
- but they may produce noise from included libraries or shared headers;
- for fast current-file linting, current source diagnostics are more predictable.

Setting:

```json
{
  "pclintPlus.diagnostics.includeHeaders": false
}
```

Later enhancement:

```json
{
  "pclintPlus.diagnostics.headerPolicy": "none | projectOnly | all"
}
```

### 15.3 Severity Mapping

Severity mapping shall be user-configurable.

Default mapping:

```json
{
  "error": "error",
  "warning": "warning",
  "info": "information",
  "note": "hint"
}
```

The parser should also support message-number-specific overrides:

```json
{
  "pclintPlus.diagnostics.messageSeverityOverrides": {
    "970": "hint",
    "923": "warning"
  }
}
```

---

## 16. Output Channel and Debugging

The extension shall create an output channel:

```text
PC-lint Plus
```

The output channel should show:

- selected profile;
- resolved workspace folder;
- command line;
- generated `.lnt` path;
- start/end time;
- duration;
- exit code;
- timeout/cancellation status;
- raw output if enabled.

### 16.1 Copy Last Command


Purpose:

- reproduce the exact PC-lint Plus run in a terminal;
- debug quoting and include path problems;
- send command lines to colleagues or tool vendors;
- compare extension behavior with manual PC-lint Plus behavior.

Command:

```text
PC-lint Plus: Copy Last Command
```

This should copy either:

- shell command;
- JSON argument array;
- both.

Recommended: include it because it is low-cost and very useful for debugging.

---

## 17. Precompiled Header Strategy

### 17.1 Goals

Use PCH to reduce lint runtime for common heavy headers.

The use can define folders;
The Extention should have a experimalt feature with activtion flag in workspace settings to 
create the PCH for often include files;    

Examples:

Because PC-lint Plus expects the PCH header to be found via include lookup, the extension should add the PCH directory as an include path and pass the include-style header name to `-pch(...)`.

Generated `.lnt` example:

```text
-i${workspaceFolder}/lint
-pch(pclint_pch.hpp)
```

### 17.3 Rebuild Command

Command:

```text
PC-lint Plus: Rebuild PCH
```

Behavior:

- delete known generated PCH cache files if safe and configured;
- run PC-lint Plus once with the PCH configuration;
- log result in the output channel.

### 17.4 Automatic Rebuild

The extension shall watch:

- configured PCH header;
- optionally direct include dependencies if discoverable.

When the PCH header changes:

- mark PCH as stale;
- rebuild on next lint run or immediately if configured.

Recommended default:

```text
Mark stale immediately.
Rebuild on next lint run.
```

This avoids unexpected CPU spikes while editing.

---

## 18. Save Analysis Strategy

The user mentioned: "maybe on save full analyse".

Recommendation:

Support two save profiles:

### 18.1 Save Fast

```json
{
  "pclintPlus.analysis.saveMode.profile": "fast"
}
```

Uses `--unit_check`, same as on-type, but run immediately on save.

### 18.2 Save Strict

```json
{
  "pclintPlus.analysis.saveMode.profile": "strict"
}
```

Uses the same ruleset but may disable `--unit_check` or enable more output.

However, the MVP should implement `saveFast` first because the requested save latency is 3–4 seconds.

---

## 19. Multi-Root Workspace Support

The extension must resolve settings by active file.

Algorithm:

```text
1. Get active document URI.
2. Find owning workspace folder.
3. Load folder-specific settings.
4. Resolve selected profile.
5. Generate folder-specific temporary .lnt.
6. Run PC-lint Plus with folder-specific current working directory.
```

Generated storage should be per workspace folder:

```text
<workspaceFolder>/.vscode/.pclint-plus/<profile>/
```

---

## 20. Multiple Build Configurations

The extension shall support multiple named profiles.

Required commands:

```text
PC-lint Plus: Select Active Profile
PC-lint Plus: Lint Current File
PC-lint Plus: Rebuild PCH
PC-lint Plus: Show Output
PC-lint Plus: Copy Last Command
PC-lint Plus: Clear Diagnostics
```

Optional later commands:

```text
PC-lint Plus: Generate Starter Settings
PC-lint Plus: Validate Configuration
PC-lint Plus: Open Generated LNT
```

---

## 21. File Change Watchers

Watch:

- user ruleset `.lnt`;
- generated PCH header;
- `compile_commands.json`, if configured;
- extension settings;
- active source file.

Behavior:

| Change | Action |
|---|---|
| Source file changed | schedule on-type lint if enabled |
| Source file saved | run save lint if enabled |
| Ruleset changed | invalidate cache and rerun current file |
| PCH header changed | mark PCH stale |
| `compile_commands.json` changed | invalidate build info cache |
| Settings changed | invalidate profile cache |

---

## 22. State Model

The extension should maintain this internal state:

```ts
interface WorkspaceState {
    workspaceFolder: vscode.WorkspaceFolder;
    activeProfileName: string;
    profiles: Map<string, ResolvedProfile>;
    buildInfoCache: BuildInfoCache;
    lastCommands: Map<string, LastCommand>;
    runningJobs: Map<string, LintJob>;
    pchState: Map<string, PchState>;
}
```

```ts
interface LintJob {
    file: vscode.Uri;
    profile: string;
    trigger: "onType" | "onSave" | "manual" | "pchRebuild";
    startedAt: number;
    generation: number;
    process: ChildProcess;
}
```

```ts
interface PchState {
    header: string;
    stale: boolean;
    lastRebuild?: number;
    lastError?: string;
}
```

---

## 23. Diagnostic Parsing

Use a stable custom PC-lint Plus output format.

Recommended:

```text
-"format=%f|%l|%C|%t|%n|%m"
-width=0
-h1
+ffn
```

Expected parser input:

```text
/path/to/file.cpp|42|17|warning|732|message text
```

Parser behavior:

- split by `|`;
- normalize file paths;
- map line/column to zero-based VS Code ranges;
- map severity through user settings;
- attach message number as diagnostic code;
- set diagnostic source to `PC-lint Plus`.

---

## 24. Unsaved Buffer Handling

For on-type linting, the extension has two options.

### Option A: lint saved file only

Simpler, but diagnostics lag behind unsaved changes.

### Option B: create a temporary shadow source

Better editor feedback, but include resolution is harder.

Recommendation:

MVP:

```text
On-type: lint real saved file unless document is saved recently.
On-save: lint saved file.
```

Next version:

```text
On-type: lint temporary shadow source beside original file or in generated folder.
```

A shadow source should preserve:

- file extension;
- original directory context if possible;
- mapping diagnostics back to the original file.

Because shadow files can affect relative includes, this feature should be configurable.

---

## 25. User Experience

### 25.1 Status Bar

Show compact status:

```text
PC-lint: idle
PC-lint: running
PC-lint: 3 warnings
PC-lint: failed
PC-lint: timeout
```

### 25.2 Output Channel

Display:

```text
[PC-lint Plus] Profile: debug
[PC-lint Plus] Trigger: onSave
[PC-lint Plus] File: /project/src/main.cpp
[PC-lint Plus] Command: pclp ...
[PC-lint Plus] Duration: 1420 ms
[PC-lint Plus] Diagnostics: 4
```

### 25.3 Problems Panel

Diagnostics shall appear using VS Code `DiagnosticCollection`.

No task problem matcher is required for the extension, but the extension's output format should remain compatible with problem matching if needed later.

---

## 26. Recommended MVP

The MVP should include:

1. C/C++ activation.
2. Workspace settings.
3. Configurable executable path.
4. Configurable ruleset path.
5. Manual include/define settings.
6. Active profile setting.
7. On-save lint.
8. Debounced on-type lint.
9. Current-file-only diagnostics.
10. Generated temporary `.lnt`.
11. Stable PC-lint output format.
12. Output parser.
13. Diagnostic severity mapping.
14. Output channel.
15. Job cancellation.
16. Raw command logging.
17. `PC-lint Plus: Rebuild PCH`.
18. PCH header watcher.

Do not implement full build-system discovery in the first iteration.

---

## 27. Recommended Later Enhancements

1. `compile_commands.json` provider.
2. CMake Tools provider.
3. VS Code C/C++ provider.
4. Shadow-file linting for unsaved buffers.
5. Header diagnostic policy.
6. Message-number severity overrides.
7. Message-number suppression helper.
8. Configuration validation command.
9. Generated `.lnt` preview command.
10. Profile quick-pick.
11. Project-wide/manual lint command.
12. SARIF export support.
13. LSP-based architecture if diagnostics become complex.

---

## 27. For analysing includes consider a faster ananlysing programm with rust, c or something else to find include etc.

## 28. Open Questions Remaining

These questions should be resolved before coding beyond the MVP:

1. Which build system is used now?
   - CMake, Make, custom scripts, vendor IDE, other?
2. Which compiler family is used?
   - GCC, Clang, IAR, ArmClang, MSVC, Green Hills, other?
3. Should the extension initially assume manual include/define settings?
4. Should the generated temporary files be stored in `.vscode/.pclint-plus` or extension global storage?
5. Should on-type linting use saved files only for the MVP, or should it immediately support unsaved shadow files?
6. Which exact PC-lint Plus executable is expected on Windows/Linux/macOS?
7. Should save mode initially use `--unit_check`, or should it attempt a stricter mode?
8. Should old diagnostics persist after file close?
9. Should PCH rebuild happen immediately on header save or lazily on the next lint run?
10. Should the extension generate starter configuration files?

---

## 29. Initial Implementation Plan

### Phase 1: Skeleton

- create VS Code extension project;
- add configuration settings;
- add commands;
- create output channel;
- activate for C/C++.

### Phase 2: Runner

- resolve workspace/profile;
- generate `.lnt`;
- run PC-lint Plus;
- log command and output;
- implement timeout and cancellation.

### Phase 3: Diagnostics

- configure output format;
- parse PC-lint Plus messages;
- publish diagnostics;
- preserve diagnostics across file switches.

### Phase 4: Triggers

- implement on-save linting;
- implement debounced on-type linting;
- implement manual lint command.

### Phase 5: PCH

- add PCH settings;
- add `-pch(...)` to generated `.lnt`;
- implement rebuild command;
- add PCH file watcher.

### Phase 6: Build Info

- implement manual include/define provider;
- add `compile_commands.json` provider later.

---

## 30. Recommended Default Decisions for Unresolved Items

| Item | Recommended default |
|---|---|
| Build info for MVP | Manual settings |
| Dynamic includes | Explicit manual first; `compile_commands.json` later |
| Heuristic include discovery | Off by default |
| System includes | Configurable, enabled when provided |
| Missing include diagnostics | Show on save, downgrade/suppress optionally during on-type |
| Cancel running lint | Yes |
| Header diagnostics | Off by default |
| Copy last command | Include |
| Temporary files | Workspace-local `.vscode/.pclint-plus/generated` |
| PCH rebuild | Lazy automatic on next lint after PCH header changed |
| On-save mode | Start with `--unit_check`; add strict mode later |
| Unsaved buffer linting | Saved-file MVP; shadow-file later |

---

## 31. Draft Extension Name

Possible names:

- `pclint-plus-fast`
- `vscode-pclint-plus`
- `pc-lint-plus-tools`
- `pclint-plus-diagnostics`

Recommended:

```text
vscode-pclint-plus
```

---

## 32. Summary

The extension should be built as a lightweight VS Code diagnostics extension rather than a full language server at first.

The key design choice is to separate:

- user-owned PC-lint Plus rulesets;
- extension-owned temporary integration `.lnt` files;
- profile-specific build information;
- fast editor diagnostics;
- optional stricter save/manual analysis.

The MVP should use manual include/define settings and `--unit_check` for both on-type and on-save runs. Later versions can add `compile_commands.json`, shadow-file linting, better header diagnostics, and richer multi-target support.

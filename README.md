# vscode-pclint-plus

Fast PC-lint Plus diagnostics for C/C++ projects in Visual Studio Code.

The extension runs PC-lint Plus for the current C/C++ file, parses a stable one-line output format, and publishes diagnostics to editor squiggles and the Problems panel. It keeps the user-owned PC-lint Plus ruleset separate from the generated integration `.lnt` file.

## Features

- Lint current C/C++ file manually, on save, or after typing stops.
- Workspace-specific PC-lint Plus executable and ruleset configuration.
- Generated temporary `.lnt` files under `.vscode/.pclint-plus/<profile>/generated/`.
- Manual include path, system include path, define, and language standard settings.
- Named profile support through `pclintPlus.activeProfile` and `pclintPlus.profiles`.
- Current-file diagnostics by default, with optional header diagnostic inclusion.
- Configurable severity mapping and message-number severity overrides.
- Stale job cancellation and per-run timeout.
- Output channel logging with shell command and argument array.
- Copy-last-command and PCH rebuild commands.

## Requirements

Install PC-lint Plus separately and make sure the configured executable is available from VS Code. The ruleset `.lnt` remains project-owned and should include compiler adaptation rules, project suppressions, and coding-standard configuration.

## Basic Settings

```json
{
  "pclintPlus.enabled": true,
  "pclintPlus.executable": "pclp",
  "pclintPlus.ruleset": "${workspaceFolder}/lint/project.lnt",
  "pclintPlus.triggers.onSave": true,
  "pclintPlus.triggers.onType": true,
  "pclintPlus.triggers.onTypeDelayMs": 2500,
  "pclintPlus.analysis.useUnitCheck": true,
  "pclintPlus.buildInfo.includeDirs": [
    "${workspaceFolder}/include",
    "${workspaceFolder}/src"
  ],
  "pclintPlus.buildInfo.systemIncludeDirs": [],
  "pclintPlus.buildInfo.defines": [
    "DEBUG"
  ],
  "pclintPlus.buildInfo.standard": "c++20"
}
```

## Profile Settings

Profiles override the flat settings for a named target or configuration.

```json
{
  "pclintPlus.activeProfile": "debug",
  "pclintPlus.profiles": {
    "debug": {
      "executable": "pclp",
      "ruleset": "${workspaceFolder}/lint/project-debug.lnt",
      "buildInfo": {
        "includeDirs": [
          "${workspaceFolder}/include",
          "${workspaceFolder}/src"
        ],
        "systemIncludeDirs": [],
        "defines": [
          "DEBUG"
        ],
        "standard": "c++20"
      },
      "pch": {
        "enabled": true,
        "header": "lint/pclint_pch.hpp",
        "watch": true
      }
    }
  }
}
```

When PCH is enabled, the generated `.lnt` adds the PCH header directory to the include path and passes the basename to `-pch(...)`, for example `-pch(pclint_pch.hpp)`.

## Commands

- `PC-lint Plus: Lint Current File`
- `PC-lint Plus: Show Output`
- `PC-lint Plus: Copy Last Command`
- `PC-lint Plus: Clear Diagnostics`
- `PC-lint Plus: Rebuild PCH`

## Development

```bash
npm ci
npm run compile
npm run test:unit
```

The `compile` script runs TypeScript checks, ESLint, and bundles the extension to `dist/extension.js`.

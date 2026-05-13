export function toShellCommand(executable: string, args: string[]): string {
    return [executable, ...args].map(shellQuote).join(" ");
}

export function shellQuote(value: string): string {
    if (/^[A-Za-z0-9_./:=+\\-]+$/.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
}

/** Commands typed at the start of a message, like Slack's `/giphy love` or `/sticker wave`. */
export const COMMANDS = ["giphy", "sticker"] as const;
export type CommandName = (typeof COMMANDS)[number];

export type ParsedCommand =
  | { kind: "names"; names: CommandName[] }
  | { kind: "run"; name: CommandName; args: string };

/**
 * The command being typed: while its name is typed (`/gi`), the commands it could be; once a space
 * follows a known one (`/giphy love`), its name and what comes after. Null for a plain message.
 */
export function parseCommand(text: string): ParsedCommand | null {
  const m = /^\/(\w*)(\s[\s\S]*)?$/.exec(text);
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  if (m[2] === undefined) {
    const names = COMMANDS.filter((c) => c.startsWith(name));
    return names.length ? { kind: "names", names } : null;
  }
  const known = COMMANDS.find((c) => c === name);
  return known ? { kind: "run", name: known, args: m[2].trim() } : null;
}

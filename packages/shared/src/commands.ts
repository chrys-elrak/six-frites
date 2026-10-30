/** Commands typed at the start of a message, like Slack's `/giphy love` or `/sticker wave`. */
export const COMMANDS = [
  "giphy",
  "sticker",
  "silent",
  "effect",
  "emoji",
  "game",
  "location",
  "schedule",
  "destruct",
  "voice",
  "autodelete",
  "blur",
  "vanish",
  "search",
] as const;
export type CommandName = (typeof COMMANDS)[number];
/** Commands that open one of the composer's dialogs rather than taking what follows them. */
export type MenuCommand = "game" | "schedule";

export const isMenuCommand = (name: CommandName): name is MenuCommand => name === "game" || name === "schedule";

export type ParsedCommand =
  | { kind: "names"; names: CommandName[] }
  | { kind: "run"; name: CommandName; args: string };

/**
 * The command being typed: while its name is typed (`/gi`), the commands it could be; once a space
 * follows a known one (`/giphy love`), its name and what comes after. A menu command takes nothing
 * after it, so `/game tonight?` is a plain message. Null for a plain message, or a command not in `commands`.
 */
export function parseCommand(text: string, commands: readonly CommandName[] = COMMANDS): ParsedCommand | null {
  const m = /^\/(\w*)(\s[\s\S]*)?$/.exec(text);
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  if (m[2] === undefined) {
    const names = commands.filter((c) => c.startsWith(name));
    return names.length ? { kind: "names", names } : null;
  }
  const known = commands.find((c) => c === name);
  if (!known) return null;
  const args = m[2].trim();
  if (isMenuCommand(known)) return args ? null : { kind: "names", names: [known] };
  return { kind: "run", name: known, args };
}

/** The message typed after `/silent`, to send without a notification; null when the text isn't one. */
export function silentMessage(text: string) {
  const command = parseCommand(text);
  return command?.kind === "run" && command.name === "silent" ? command.args : null;
}

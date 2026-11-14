/** Commands typed at the start of a message, like Slack's `/giphy love` or `/sticker wave`. */
export const COMMANDS = [
  "giphy",
  "sticker",
  "silent",
  "lock",
  "emoji",
  "game",
  "play",
  "location",
  "schedule",
  "voice",
  "vanish",
] as const;
export type CommandName = (typeof COMMANDS)[number];
/** Commands that open one of the composer's dialogs rather than taking what follows them. */
export type MenuCommand = "game" | "schedule";

export const isMenuCommand = (name: CommandName): name is MenuCommand => name === "game" || name === "schedule";

const ONE_TO_ONE: readonly CommandName[] = ["game", "play", "vanish"];

/** The commands that still make sense in a group: no games, live games or vanish mode. */
export const groupCommands = (commands: readonly CommandName[]) => commands.filter((c) => !ONE_TO_ONE.includes(c));

const HAVE_BUTTONS: readonly CommandName[] = ["location", "game", "schedule", "giphy", "emoji", "lock"];

/** The commands to offer in the attach menu, leaving out the ones the attach menu or the emoji button already offer. */
export const attachCommands = (group: boolean) =>
  (group ? groupCommands(COMMANDS) : COMMANDS).filter((c) => !HAVE_BUTTONS.includes(c));

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

function typedAfter(text: string, name: CommandName) {
  const command = parseCommand(text);
  return command?.kind === "run" && command.name === name ? command.args : null;
}

/** The message typed after `/silent`, to send without a notification; null when the text isn't one. */
export const silentMessage = (text: string) => typedAfter(text, "silent");

/** The message typed after `/lock`, to send locked with each reader's app lock code; null when the text isn't one. */
export const lockedMessage = (text: string) => typedAfter(text, "lock");

/** The message after `/silent` or `/lock`, which the composer sends rather than treats as a command. */
export const typedMessage = (text: string) => silentMessage(text) ?? lockedMessage(text);

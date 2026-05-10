import i18n from "@/i18n";

export type SlashCommandName =
  | "help"
  | "new"
  | "reset"
  | "stop"
  | "clear"
  | "focus"
  | "export"
  | "agents"
  | "model"
  | "think"
  | "verbose"
  | "fast"
  | "compact";

export interface SlashCommandDefinition {
  name: SlashCommandName;
  descriptionKey: string;
  args?: string;
  executeLocal?: boolean;
  argOptions?: string[];
}

const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { name: "new", descriptionKey: "slash.commands.new", executeLocal: true },
  { name: "reset", descriptionKey: "slash.commands.reset", executeLocal: true },
  { name: "compact", descriptionKey: "slash.commands.compact", executeLocal: true },
  { name: "stop", descriptionKey: "slash.commands.stop", executeLocal: true },
  { name: "clear", descriptionKey: "slash.commands.clear", executeLocal: true },
  { name: "focus", descriptionKey: "slash.commands.focus", executeLocal: true },
  { name: "export", descriptionKey: "slash.commands.export", executeLocal: true },
  { name: "help", descriptionKey: "slash.commands.help", executeLocal: true },
  { name: "agents", descriptionKey: "slash.commands.agents", executeLocal: true },
  { name: "model", descriptionKey: "slash.commands.model", args: "<name>", executeLocal: true },
  {
    name: "think",
    descriptionKey: "slash.commands.think",
    args: "<off|low|medium|high>",
    executeLocal: true,
    argOptions: ["off", "low", "medium", "high"],
  },
  {
    name: "verbose",
    descriptionKey: "slash.commands.verbose",
    args: "<off|on|full>",
    executeLocal: true,
    argOptions: ["off", "on", "full"],
  },
  {
    name: "fast",
    descriptionKey: "slash.commands.fast",
    args: "<status|on|off>",
    executeLocal: true,
    argOptions: ["status", "on", "off"],
  },
];

export function getSlashCommands(): Array<SlashCommandDefinition & { description: string }> {
  return SLASH_COMMANDS.map((command) => ({
    ...command,
    description: i18n.t(`chat:${command.descriptionKey}`),
  }));
}

export interface ParsedSlashCommand {
  command: SlashCommandDefinition;
  args: string;
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const body = trimmed.slice(1);
  const firstSeparator = body.search(/[\s:]/u);
  const name = (firstSeparator === -1 ? body : body.slice(0, firstSeparator)).toLowerCase();
  let remainder = firstSeparator === -1 ? "" : body.slice(firstSeparator).trimStart();
  if (remainder.startsWith(":")) {
    remainder = remainder.slice(1).trimStart();
  }
  const command = SLASH_COMMANDS.find((item) => item.name === name);
  if (!command) {
    return null;
  }

  return {
    command,
    args: remainder.trim(),
  };
}

export function buildSlashHelpText(): string {
  return [
    `**${i18n.t("chat:slash.helpTitle")}**`,
    "",
    ...getSlashCommands().map((command) => {
      const args = command.args ? ` ${command.args}` : "";
      return `- \`/${command.name}${args}\` — ${command.description}`;
    }),
  ].join("\n");
}

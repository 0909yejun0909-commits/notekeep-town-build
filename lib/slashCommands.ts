// Notion-style "/" commands for the note editor. Notes are Markdown files, so every command
// writes Markdown: a block command turns the caret's line into that block, an insert command
// drops something in where the "/" was typed.

export type SlashCommand = {
  id: string;
  label: string;
  hint: string;
  aliases: string[];
} & ({ prefix: string } | { insert: (today: Date) => string; caretAt?: number });

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'text', label: 'Text', hint: 'Plain text', aliases: ['plain', 'paragraph', 'p'], prefix: '' },
  { id: 'h1', label: 'Heading 1', hint: '#', aliases: ['h1', 'title', 'heading'], prefix: '# ' },
  { id: 'h2', label: 'Heading 2', hint: '##', aliases: ['h2', 'heading', 'subheading'], prefix: '## ' },
  { id: 'h3', label: 'Heading 3', hint: '###', aliases: ['h3', 'heading'], prefix: '### ' },
  { id: 'bullet', label: 'Bulleted list', hint: '-', aliases: ['bullet', 'bullets', 'list', 'ul', 'dot'], prefix: '- ' },
  { id: 'number', label: 'Numbered list', hint: '1.', aliases: ['number', 'numbered', 'ol', 'num', 'list'], prefix: '1. ' },
  { id: 'todo', label: 'To-do list', hint: '[ ]', aliases: ['todo', 'checkbox', 'check', 'task'], prefix: '- [ ] ' },
  { id: 'quote', label: 'Quote', hint: '>', aliases: ['quote', 'blockquote'], prefix: '> ' },
  { id: 'callout', label: 'Callout', hint: '> 💡', aliases: ['callout', 'note', 'tip'], prefix: '> 💡 ' },
  { id: 'divider', label: 'Divider', hint: '---', aliases: ['divider', 'line', 'hr', 'rule'], insert: () => '---\n' },
  { id: 'code', label: 'Code block', hint: '```', aliases: ['code', 'snippet'], insert: () => '```\n\n```\n', caretAt: 4 },
  {
    id: 'table', label: 'Table', hint: '| |', aliases: ['table', 'grid'],
    insert: () => '| Column | Column |\n| --- | --- |\n|  |  |\n', caretAt: 2,
  },
  { id: 'date', label: 'Today', hint: 'date', aliases: ['date', 'today', 'now'], insert: (d) => d.toISOString().slice(0, 10) },
];

// The "/query" being typed at the caret: the slash starts a line or follows a space, and the
// query is letters and digits only, so a path like "a/b" or a URL never opens the menu.
export function slashAt(text: string, caret: number): { start: number; query: string } | null {
  let i = caret;
  while (i > 0 && /[\p{L}\p{N}-]/u.test(text[i - 1])) i--;
  if (i === 0 || text[i - 1] !== '/') return null;
  const start = i - 1;
  if (start > 0 && !/\s/.test(text[start - 1])) return null;
  const query = text.slice(i, caret);
  return query.length > 20 ? null : { start, query };
}

export function matchCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  if (!q) return SLASH_COMMANDS;
  const score = (c: SlashCommand) =>
    c.label.toLowerCase().startsWith(q) || c.aliases.some((a) => a.startsWith(q)) ? 0
    : c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.includes(q)) ? 1
    : 2;
  return SLASH_COMMANDS.filter((c) => score(c) < 2).sort((a, b) => score(a) - score(b));
}

// Any block marker a line already starts with, so a command replaces it instead of stacking.
const BLOCK_PREFIX = /^(#{1,6} |> 💡 |> |- \[[ xX]\] |[-*+] |\d+[.)] )/;

// The note after running `cmd` on the "/query" from `start` to `caret`, and where the caret goes.
export function applyCommand(
  text: string, start: number, caret: number, cmd: SlashCommand, today = new Date(),
): { text: string; caret: number } {
  const without = text.slice(0, start) + text.slice(caret);
  if ('prefix' in cmd) {
    const lineStart = without.lastIndexOf('\n', start - 1) + 1;
    const old = without.slice(lineStart).match(BLOCK_PREFIX)?.[0] ?? '';
    const next = without.slice(0, lineStart) + cmd.prefix + without.slice(lineStart + old.length);
    return { text: next, caret: start - old.length + cmd.prefix.length };
  }
  // A block that needs its own lines starts on a fresh one.
  let ins = cmd.insert(today);
  const lineStart = without.lastIndexOf('\n', start - 1) + 1;
  const block = ins.endsWith('\n');
  const lead = block && without.slice(lineStart, start).trim() ? '\n' : '';
  ins = lead + ins;
  const next = without.slice(0, start) + ins + without.slice(start);
  const at = start + lead.length + (cmd.caretAt ?? ins.length - lead.length);
  return { text: next, caret: at };
}

// Enter at the end of a list item starts the next item; Enter on an empty item ends the list.
// Null when Enter should just be a plain new line.
export function continueList(text: string, caret: number): { text: string; caret: number } | null {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  const lineEnd = text.indexOf('\n', caret);
  if (caret !== (lineEnd === -1 ? text.length : lineEnd)) return null;
  const line = text.slice(lineStart, caret);
  const m = line.match(/^(\s*)(- \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/);
  if (!m) return null;
  if (line.slice(m[0].length).trim() === '') {
    return { text: text.slice(0, lineStart) + text.slice(caret), caret: lineStart };
  }
  const marker = m[2].startsWith('- [') ? '- [ ] ' : m[3] ? `${Number(m[3]) + 1}${m[4]} ` : m[2];
  const ins = `\n${m[1]}${marker}`;
  return { text: text.slice(0, caret) + ins + text.slice(caret), caret: caret + ins.length };
}

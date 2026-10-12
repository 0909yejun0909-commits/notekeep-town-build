// To-do items, "- [ ] thing" and "- [x] thing": ticked and unticked in place, one character.

const TASK = /^([ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/;

// The note with the to-do on the line holding `offset` ticked or unticked; null if that line
// isn't a to-do.
export function toggleTaskAt(text: string, offset: number): string | null {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const m = TASK.exec(text.slice(lineStart));
  if (!m) return null;
  const at = lineStart + m[1].length + 1;
  return text.slice(0, at) + (m[2] === ' ' ? 'x' : ' ') + text.slice(at + 1);
}

'use client';

import { HIGHLIGHTS, type HighlightId } from '@/lib/noteMarks';

// The highlight swatches and Bold / Underline / Clear buttons, over a note being read or edited.
// Styled by the .note-tools rules in NoteReader's stylesheet, which is always on the page.
export default function MarkTools({
  onHighlight,
  onBold,
  onUnderline,
  onClear,
}: {
  onHighlight: (color: HighlightId) => void;
  onBold: () => void;
  onUnderline: () => void;
  onClear: () => void;
}) {
  return (
    // Buttons mustn't take focus or the selection they act on goes away.
    <div className="note-tools" onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
      {HIGHLIGHTS.map((h) => (
        <button
          key={h.id}
          className="note-swatch"
          style={{ background: h.hex }}
          title={`Highlight ${h.label.toLowerCase()}${h.id === 'yellow' ? ' (⌘⇧H)' : ''}`}
          aria-label={`Highlight ${h.label.toLowerCase()}`}
          onClick={() => onHighlight(h.id)}
        />
      ))}
      <span className="note-tools-sep" />
      <button className="note-tool" title="Bold (⌘B)" aria-label="Bold" onClick={onBold}>
        <span style={{ fontWeight: 700 }}>B</span>
      </button>
      <button className="note-tool" title="Underline (⌘U)" aria-label="Underline" onClick={onUnderline}>
        <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>U</span>
      </button>
      <button className="note-tool" title="Clear highlight and underline" aria-label="Clear formatting" onClick={onClear}>
        <span style={{ textDecoration: 'line-through' }}>T</span>
        <span style={{ fontSize: 10, marginLeft: 1 }}>x</span>
      </button>
    </div>
  );
}

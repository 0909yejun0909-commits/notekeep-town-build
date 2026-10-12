'use client';

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkMarks } from '@/lib/noteMarks';
import { safeUrl } from '@/lib/safeUrl';
import { matchCommands, type SlashCommand } from '@/lib/slashCommands';
import type { Toggle } from '@/lib/richNote/runs';
import { NoteEditor, type EditorState, type SlashState } from './editor';

export type RichNoteApi = {
  format: (mark: Toggle) => void;
  highlight: (color: string) => void;
  clearFormatting: () => void;
  tableOp: (op: 'row-below' | 'col-right' | 'del-row' | 'del-col') => void;
  insertTable: () => void;
  turnPage: (delta: number) => void;
  undo: (redo?: boolean) => void;
};

type Props = {
  markdown: string;
  title: string;
  canWrite: boolean;
  onChange: (md: string) => void;
  onSave: () => void;
  onState: (s: EditorState) => void;
  onSlashOpen: (open: boolean) => void;
  resolveImage: (target: string) => Promise<string | null>;
  pagesWidth: number;
  spineGap: number;
};

// The note on the book's pages, edited in place (components/richNote/editor.ts does the work).
const RichNoteEditor = forwardRef<RichNoteApi, Props>(function RichNoteEditor(props, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<NoteEditor | null>(null);
  const live = useRef(props);
  live.current = props;
  const [slash, setSlash] = useState<(SlashState & { index: number }) | null>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const matches = slash ? matchCommands(slash.query) : [];
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const menuRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    format: (m) => editorRef.current?.format(m),
    highlight: (c) => editorRef.current?.highlight(c),
    clearFormatting: () => editorRef.current?.clearFormatting(),
    tableOp: (op) => editorRef.current?.tableOp(op),
    insertTable: () => editorRef.current?.insertTable(),
    turnPage: (d) => editorRef.current?.turnPage(d),
    undo: (redo) => editorRef.current?.undo(redo),
  }));

  // Made once per note opened for editing; its text comes from the editor from then on.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const editor = new NoteEditor(root, live.current.markdown, live.current.title, {
      onChange: (md) => live.current.onChange(md),
      onState: (s) => live.current.onState(s),
      onSlash: (s) => {
        setSlash((prev) => (s ? { ...s, index: prev && prev.query === s.query ? prev.index : 0 } : null));
        live.current.onSlashOpen(!!s);
      },
      slashKey: (e) => {
        const open = slashRef.current;
        const list = matchesRef.current;
        if (!open || list.length === 0) return false;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const n = list.length;
          setSlash({ ...open, index: (open.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
          return true;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
          editor.applySlash(list[Math.min(open.index, list.length - 1)]);
          return true;
        }
        if (e.key === 'Escape') {
          editor.closeSlash();
          return true;
        }
        return false;
      },
      onSave: () => live.current.onSave(),
      resolveImage: (t) => live.current.resolveImage(t),
      renderRaw: (el, src) => {
        const r = createRoot(el);
        r.render(
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMarks]} urlTransform={safeUrl}>
            {src}
          </ReactMarkdown>,
        );
        // Unmounted after React is done rendering, never in the middle of it.
        return () => queueMicrotask(() => r.unmount());
      },
    });
    editorRef.current = editor;
    (root as HTMLDivElement & { __noteEditor?: NoteEditor }).__noteEditor = editor;
    if (live.current.canWrite) {
      root.focus({ preventScroll: true });
      editor.focusEnd();
    }
    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  // The highlighted command stays in view as the arrows move it.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const item = menu?.querySelector<HTMLElement>('.slash-item.on');
    if (!menu || !item) return;
    if (slash?.index === 0) menu.scrollTop = 0;
    else if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
  }, [slash]);

  useEffect(() => () => live.current.onSlashOpen(false), []);

  const pick = (cmd: SlashCommand) => editorRef.current?.applySlash(cmd);

  return (
    <>
      <div
        ref={rootRef}
        className="note-pages note-prose rn-root"
        data-tour="note-text"
        contentEditable={props.canWrite}
        suppressContentEditableWarning
        spellCheck
      />
      {slash && matches.length > 0 && (
        <div
          ref={menuRef}
          className="slash-menu"
          data-tour="slash-menu"
          style={{
            left: Math.max(0, Math.min(slash.x % (props.pagesWidth + props.spineGap), props.pagesWidth - 230)),
            ...(slash.y + 240 > 400 ? { bottom: 400 - slash.y + 24 } : { top: slash.y + 4 }),
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="slash-head">{slash.query ? `Commands for "${slash.query}"` : 'Turn this line into'}</div>
          {matches.map((c, i) => (
            <div
              key={c.id}
              className={`slash-item${i === slash.index ? ' on' : ''}`}
              onMouseEnter={() => setSlash({ ...slash, index: i })}
              onClick={() => pick(c)}
            >
              <span>{c.label}</span>
              <span className="slash-hint">{c.hint}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
});

export default RichNoteEditor;

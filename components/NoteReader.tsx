'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Element, ElementContent } from 'hast';
import { safeUrl } from '@/lib/safeUrl';
import type { NoteRef, VaultHandle } from '@/lib/types';
import { useVault } from '@/lib/vault/open';
import { bus } from '@/game/bus';
import { noteProgress, noteSaved } from '@/lib/walletStore';
import {
  HIGHLIGHTS,
  addMark,
  clearMarks,
  piecesInRange,
  remarkMarks,
  selectSegments,
  toggleBold,
  toggleUnderline,
  trackedReplace,
  type ExistingMark,
  type HighlightId,
  type MarkEdit,
  type Piece,
  type Range as SourceRange,
  type SelectedPiece,
  type SourceMap,
} from '@/lib/noteMarks';
import { BOOK_SRC, paperBookUrl } from '@/lib/paperBook';
import Coin from './Coin';
import { applyCommand, continueList, matchCommands, slashAt, type SlashCommand } from '@/lib/slashCommands';
import { editVisible, layoutOf, runsOf, toRaw, toVisible } from '@/lib/noteEditorText';

const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'mov'];

// Book art geometry. The panel is the 224x144 book rect scaled 4x; these are the
// text-safe areas inside the two pages' printed ornaments, in panel pixels.
const PANEL_W = 896;
const PANEL_H = 576;
const PAGES_LEFT = 68;
const PAGES_TOP = 76;
const PAGES_W = 754;
const PAGES_H = 400;
const SPINE_GAP = 140;
const PAGE_STRIDE = PAGES_W + SPINE_GAP; // one "turn" = two columns + one gap
const BAR_GAP = 10;
const BAR_H = 50;
const EDIT_LINE = 21; // .note-editor's line-height: edit pages turn by whole lines

// The panel is laid out at 4x and then scaled to the biggest whole multiple of the art that
// fits the window, so every art pixel stays square.
const ART_W = 224;
const ART_H = 144;
function bookZoom(): number {
  // The control plank hangs below the book, so it counts towards the height.
  const fit = Math.floor(Math.min((window.innerWidth - 32) / ART_W, (window.innerHeight - 32) / (ART_H + (BAR_GAP + BAR_H) / 4)));
  return Math.min(6, Math.max(4, fit)) / 4;
}

const INK = '#3b2a20';
const INK_SOFT = 'rgba(59, 42, 32, 0.6)';
const INK_LINE = 'rgba(59, 42, 32, 0.3)';
const INK_WASH = 'rgba(59, 42, 32, 0.08)';
const BODY_FONT = "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', serif";
const PIXEL_FONT = 'var(--pixel-font)';

function extOf(path: string): string {
  const clean = path.split('#')[0].split('?')[0];
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

function isRemote(path: string): boolean {
  return /^(https?:|data:|blob:)/i.test(path);
}

// [[Note]], [[Note#Heading]], [[Note|alias]] -> markdown links. Embeds (![[...]]) are left alone.
function linkWikilinks(md: string | SourceMap): SourceMap {
  return trackedReplace(
    md,
    /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
    (m) => `[${(m[2] ?? m[1]).trim()}](wikilink:${encodeURIComponent(m[1].trim())})`,
  );
}

async function resolveBinary(vault: VaultHandle, notePath: string, path: string): Promise<string | null> {
  const dir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/') + 1) : '';
  const candidates = dir ? [dir + path, path] : [path];
  for (const candidate of candidates) {
    try {
      const blob = await vault.readBinary(candidate);
      return URL.createObjectURL(blob);
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveEmbeds(
  raw: string,
  vault: VaultHandle,
  notePath: string,
): Promise<{ map: SourceMap; urls: string[] }> {
  const wikiRe = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const stdRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  const paths = [...raw.matchAll(wikiRe)].map((m) => m[1]);
  for (const m of raw.matchAll(stdRe)) if (!isRemote(m[2])) paths.push(m[2]);

  const cache = new Map<string, string | null>();
  const urls: string[] = [];

  for (const path of paths) {
    if (cache.has(path)) continue;
    const url = await resolveBinary(vault, notePath, path);
    cache.set(path, url);
    if (url) urls.push(url);
  }

  const embed = (match: string, path: string, alt: string) => {
    const url = cache.get(path);
    return url ? `![${alt}](${url} "${path}")` : match;
  };
  const wiki = trackedReplace(raw, wikiRe, (m) => embed(m[0], m[1], m[2] ?? m[1]));
  const map = trackedReplace(wiki, stdRe, (m) => (isRemote(m[2]) ? m[0] : embed(m[0], m[2], m[1] || m[2])));
  return { map, urls };
}

function hastText(node: Element | ElementContent | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(hastText).join('') : '';
}

// ---- Selections in the rendered note, as places in the note's source ----

function pieceOf(el: HTMLElement): Piece {
  return { s: Number(el.dataset.s), e: Number(el.dataset.e), lin: el.dataset.lin === '1' };
}

function pieces(root: HTMLElement, map: SourceMap): Piece[] {
  return [...root.querySelectorAll<HTMLElement>('[data-s]')].map((el) => map.toSourcePiece(pieceOf(el)));
}

function existingMarks(root: HTMLElement, map: SourceMap): ExistingMark[] {
  return [...root.querySelectorAll<HTMLElement>('[data-k]')].map((el) => ({
    kind: el.dataset.k as 'hl' | 'u',
    open: { start: map.toSource(Number(el.dataset.os), 'start'), end: map.toSource(Number(el.dataset.oe), 'end') },
    close: { start: map.toSource(Number(el.dataset.cs), 'start'), end: map.toSource(Number(el.dataset.ce), 'end') },
  }));
}

function boundary(container: Node, offset: number, el: HTMLElement, len: number, isStart: boolean): number {
  if (!el.contains(container)) return isStart ? 0 : len;
  if (container.nodeType === Node.TEXT_NODE) return offset;
  return offset === 0 ? 0 : len;
}

function selectedPieces(root: HTMLElement, range: globalThis.Range, map: SourceMap): SelectedPiece[] {
  const out: SelectedPiece[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-s]')) {
    if (!range.intersectsNode(el)) continue;
    const len = el.textContent?.length ?? 0;
    out.push({
      ...map.toSourcePiece(pieceOf(el)),
      from: boundary(range.startContainer, range.startOffset, el, len, true),
      to: boundary(range.endContainer, range.endOffset, el, len, false),
    });
  }
  return out;
}

// Bold runs in the rendered note (lib/noteMarks.ts tags each <strong>), as places in its source.
function strongRanges(root: HTMLElement, map: SourceMap): SourceRange[] {
  return [...root.querySelectorAll<HTMLElement>('[data-bs]')].map((el) => ({
    start: map.toSource(Number(el.dataset.bs), 'start'),
    end: map.toSource(Number(el.dataset.be), 'end'),
  }));
}

type MarkOp = (raw: string, segs: SourceRange[], existing: ExistingMark[], strong: SourceRange[]) => MarkEdit;
const boldOp: MarkOp = (raw, segs, _existing, strong) => toggleBold(raw, segs, strong);
const highlightOp =
  (color: HighlightId): MarkOp =>
  (raw, segs, existing) =>
    addMark(raw, segs, { kind: 'hl', color }, existing);

// Where character `pos` of a textarea sits, in its own unscrolled pixels: a hidden copy of
// the textarea with the text up to `pos` in it, measured.
function caretXY(t: HTMLTextAreaElement, pos: number): { x: number; y: number } {
  const cs = getComputedStyle(t);
  const div = document.createElement('div');
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'padding', 'border', 'boxSizing'] as const) {
    (div.style as any)[p] = cs[p];
  }
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${t.clientWidth}px` });
  div.textContent = t.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '.';
  div.appendChild(mark);
  document.body.appendChild(div);
  const at = { x: mark.offsetLeft, y: mark.offsetTop - t.scrollTop };
  div.remove();
  return at;
}

function MarkTools({
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

const READER_CSS = `
  @keyframes note-open {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
    to   { opacity: 1; transform: none; }
  }
  .note-book { animation: note-open 160ms ease-out; }

  .note-pages {
    column-count: 2; column-gap: ${SPINE_GAP}px; column-fill: auto;
    height: 100%; overflow: hidden;
  }
  .note-prose { font-family: ${BODY_FONT}; font-size: 16px; line-height: 25px; color: ${INK}; word-wrap: break-word; }
  .note-prose > :first-child { margin-top: 0; }
  .note-prose p { margin: 0 0 11px; }
  .note-prose h1, .note-prose h2, .note-prose h3, .note-prose h4 {
    font-family: ${BODY_FONT}; font-weight: 700; color: ${INK}; margin: 16px 0 8px; line-height: 1.25; break-after: avoid;
  }
  .note-prose h1 { font-size: 23px; border-bottom: 2px solid ${INK_LINE}; padding-bottom: 4px; }
  .note-prose h2 { font-size: 20px; border-bottom: 1px dashed ${INK_LINE}; padding-bottom: 3px; }
  .note-prose h3 { font-size: 18px; }
  .note-prose h4 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; }
  .note-prose strong { font-weight: 700; color: #2a1a12; }
  .note-prose ul, .note-prose ol { margin: 0 0 11px; padding-left: 24px; }
  .note-prose ul { list-style: disc; }
  .note-prose ol { list-style: decimal; }
  .note-prose li { margin: 2px 0; break-inside: avoid; }
  .note-prose li::marker { color: ${INK_SOFT}; }
  .note-prose ul.contains-task-list { list-style: none; padding-left: 2px; }
  .note-prose li.task-list-item { display: flex; align-items: baseline; gap: 8px; }
  .note-prose li.task-list-item input[type=checkbox] {
    appearance: none; width: 14px; height: 14px; flex: none; margin: 0; position: relative; top: 2px;
    border: 2px solid ${INK}; border-radius: 3px; background: transparent;
  }
  .note-prose li.task-list-item input[type=checkbox]:checked { background: ${INK}; box-shadow: inset 0 0 0 2px #fcf8ef; }
  .note-prose li.task-list-item:has(input:checked) { text-decoration: line-through; color: ${INK_SOFT}; }
  .note-prose a { color: #8a3b12; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
  .note-prose a[href^="wikilink:"]::before { content: '[['; opacity: 0.45; }
  .note-prose a[href^="wikilink:"]::after  { content: ']]'; opacity: 0.45; }
  .note-prose code {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13px;
    background: ${INK_WASH}; border-radius: 4px; padding: 1px 5px; color: #2a1a12;
  }
  .note-prose pre {
    margin: 4px 0 12px; padding: 8px 12px; overflow-x: auto; line-height: 1.5; break-inside: avoid;
    background: ${INK_WASH}; border: 1px dashed ${INK_LINE}; border-radius: 6px;
  }
  .note-prose pre code { background: none; padding: 0; border-radius: 0; }
  .note-prose blockquote {
    margin: 4px 0 12px; padding: 2px 12px; border-left: 3px solid ${INK_LINE}; color: ${INK_SOFT}; font-style: italic; break-inside: avoid;
  }
  .note-prose table { border-collapse: collapse; margin: 4px 0 12px; font-size: 14px; line-height: 1.4; break-inside: avoid; max-width: 100%; }
  .note-prose th, .note-prose td { border: 1px solid ${INK_LINE}; padding: 3px 8px; text-align: left; vertical-align: top; }
  .note-prose th { background: ${INK_WASH}; font-weight: 700; }
  .note-prose hr { border: 0; border-top: 2px dashed ${INK_LINE}; margin: 12px 0; }
  .note-prose img, .note-prose video {
    display: block; max-width: 100%; max-height: 240px; margin: 4px 0 12px; break-inside: avoid;
    border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.25); image-rendering: pixelated;
  }
  .note-prose mark.hl {
    background: var(--hl); color: inherit; border-radius: 3px; padding: 0 2px;
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
  }
  ${HIGHLIGHTS.map((h) => `.note-prose mark.hl-${h.id} { --hl: ${h.hex}; }`).join('\n  ')}
  .note-prose u { text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
  .note-title {
    font-family: ${PIXEL_FONT}; font-size: 28px; line-height: 36px; color: ${INK};
    margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid ${INK_LINE}; word-break: break-word;
  }

  .note-editor {
    width: 100%; height: 100%; resize: none; outline: none; border: 0; background: transparent;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13.5px; line-height: 21px; color: ${INK};
    caret-color: #8a3b12; padding: 0; margin: 0; overflow-y: scroll; tab-size: 2;
  }
  /* Same box, font and wrapping as the editor, so every letter lands under its twin; only the
     marks show. Both always keep room for the scrollbar, so both wrap at the same width. */
  .note-mirror {
    position: absolute; inset: 0; box-sizing: border-box; color: transparent; pointer-events: none; user-select: none;
    white-space: pre-wrap; overflow-wrap: break-word; word-wrap: break-word; scrollbar-color: transparent transparent;
  }
  .note-mirror .mhl { background: var(--hl); border-radius: 3px; }
  .note-mirror .mu { text-decoration: underline; text-decoration-color: ${INK}; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
  ${HIGHLIGHTS.map((h) => `.note-mirror .hl-${h.id} { --hl: ${h.hex}; }`).join('\n  ')}
  .note-editor::selection { background: rgba(138, 59, 18, 0.25); }
  .note-editor::placeholder { color: ${INK_SOFT}; font-style: italic; }
  /* The "/" command menu, a slip of paper under the caret. */
  .slash-menu {
    position: absolute; z-index: 5; width: 230px; max-height: 232px; overflow-y: auto; padding: 4px;
    background: #fffaf0; border: 2px solid ${INK}; box-shadow: 0 4px 0 rgba(59, 42, 32, 0.25);
    font-family: ${PIXEL_FONT}; font-size: 16px; line-height: 20px; color: ${INK};
  }
  .slash-head { padding: 2px 6px 4px; color: ${INK_SOFT}; font-size: 14px; }
  .slash-item { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; cursor: pointer; }
  .slash-item.on { background: rgba(138, 59, 18, 0.16); }
  .slash-hint { color: ${INK_SOFT}; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
  .note-scroll { height: 100%; overflow-y: auto; padding-right: 6px; }
  .note-scroll::-webkit-scrollbar, .note-editor::-webkit-scrollbar { width: 6px; }
  .note-scroll::-webkit-scrollbar-thumb, .note-editor::-webkit-scrollbar-thumb { background: ${INK_LINE}; border-radius: 3px; }
  .note-mirror::-webkit-scrollbar-thumb { background: transparent; }

  .note-btn {
    font-family: ${PIXEL_FONT}; font-size: 16px;
    color: ${INK}; background: rgba(255, 252, 245, 0.75); border: 2px solid ${INK_LINE}; border-radius: 4px;
    padding: 5px 9px; cursor: pointer; line-height: 1; white-space: nowrap; flex: none;
  }
  .note-btn:hover { background: #fffdf8; border-color: ${INK}; }
  .note-btn:disabled { opacity: 0.4; cursor: default; }
  /* The controls sit on a wood plank under the book, like the town's other bars, so they
     never cover the page edges and ornaments printed along the book's bottom. */
  .note-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 7px 10px; background: #3f2832; border: 3px solid #1f1418;
    box-shadow: inset 0 3px 0 #6d483b, 0 4px 0 rgba(24, 20, 37, 0.45);
  }
  .note-bar .note-hint { color: #e4a672; }
  .note-bar .note-btn {
    color: #3f2832; background: #f4e4c1; border: 3px solid #1f1418; border-radius: 0;
    box-shadow: inset 0 -3px 0 #e4a672; padding: 4px 10px 6px;
  }
  .note-bar .note-btn:hover:not(:disabled) { background: #fff7e6; border-color: #1f1418; }
  .note-bar .note-btn.primary { background: #f7c948; box-shadow: inset 0 -3px 0 #c8964f; }
  .note-bar .note-btn.primary:hover:not(:disabled) { background: #ffe066; }
  .note-btn.primary { background: ${INK}; color: #fcf8ef; border-color: ${INK}; }
  .note-btn.primary:hover { background: #2a1a12; }
  .note-hint { font-family: ${PIXEL_FONT}; font-size: 16px; color: ${INK_SOFT}; }

  .note-tools {
    display: inline-flex; align-items: center; gap: 5px; padding: 4px 6px;
    background: #fffdf8; border: 2px solid ${INK_LINE}; border-radius: 6px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
  }
  .note-swatch {
    width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(59, 42, 32, 0.25); cursor: pointer; padding: 0;
  }
  .note-swatch:hover { border-color: ${INK}; transform: scale(1.12); }
  .note-tools-sep { width: 1px; height: 18px; background: ${INK_LINE}; margin: 0 2px; }
  .note-tool {
    min-width: 24px; height: 24px; padding: 0 4px; border-radius: 4px; border: 0; background: transparent; cursor: pointer;
    font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: ${INK}; line-height: 1;
  }
  .note-tool:hover { background: ${INK_WASH}; }
  .note-float { position: absolute; z-index: 60; transform: translate(-50%, calc(-100% - 8px)); }
  .note-float.below { transform: translate(-50%, 8px); }
`;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type EditSnap = { raw: string; sel: [number, number] };

export default function NoteReader({ note }: { note: NoteRef | null }) {
  const { vault } = useVault();
  const [raw, setRaw] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const contentMapRef = useRef<SourceMap | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [draft, setDraft] = useState('');
  // The editor shows the draft without its mark tags (lib/noteEditorText.ts), so the browser's
  // own undo, which only knows the shown text, can't be used: the editor keeps its own.
  const draftRef = useRef('');
  const selRef = useRef<[number, number]>([0, 0]);
  // Where the caret is in the draft itself, among the tags the editor doesn't show; forgotten
  // when the caret is moved (lib/noteEditorText.ts editVisible()).
  const caretRef = useRef<number | null>(null);
  const pendingSel = useRef<[number, number] | null>(null);
  const history = useRef<{ past: EditSnap[]; future: EditSnap[]; typedAt: number; burstAt: number }>({ past: [], future: [], typedAt: 0, burstAt: 0 });
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The open "/" menu: where its slash is, what's typed after it, the highlighted command.
  const [slash, setSlash] = useState<{ start: number; query: string; index: number; x: number; y: number } | null>(null);
  const slashDismissed = useRef<number | null>(null);
  const slashOpen = useRef(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  // Editing pages: one page is one screenful of the editor, a whole number of lines.
  const previewRef = useRef<HTMLDivElement>(null);
  const [editPage, setEditPage] = useState(0);
  const [editPageCount, setEditPageCount] = useState(1);

  const [zoom, setZoom] = useState(1);
  const [bookUrl, setBookUrl] = useState(BOOK_SRC);
  const [floatAt, setFloatAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const lastColorRef = useRef<HighlightId>('yellow');

  const canWrite = !!vault?.writeNote;
  const previewMap = useMemo(() => linkWikilinks(draft), [draft]);
  const editorLayout = useMemo(() => layoutOf(draft), [draft]);
  const editorRuns = useMemo(() => runsOf(editorLayout), [editorLayout]);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  const beginDraft = useCallback((text: string) => {
    // The editor turns \r\n into \n as it shows the text; the draft does too, so they line up.
    const clean = text.replace(/\r\n?/g, '\n');
    draftRef.current = clean;
    selRef.current = [0, 0];
    caretRef.current = null;
    pendingSel.current = null;
    history.current = { past: [], future: [], typedAt: 0, burstAt: 0 };
    setDraft(clean);
  }, []);

  // One change to the draft: remembered for undo (a run of typing is one step, a few seconds
  // at most), with the editor's selection put back once it shows the new text.
  const commitDraft = useCallback((next: string, sel: [number, number], typing: boolean, caret: number | null = null) => {
    pendingSel.current = sel;
    caretRef.current = caret;
    if (next === draftRef.current) {
      selRef.current = sel;
      setDraft(next);
      return;
    }
    const h = history.current;
    const now = performance.now();
    const sameBurst = typing && h.past.length > 0 && now - h.typedAt < 1000 && now - h.burstAt < 4000;
    if (!sameBurst) {
      h.past.push({ raw: draftRef.current, sel: selRef.current });
      if (h.past.length > 200) h.past.shift();
      h.burstAt = now;
    }
    h.future = [];
    h.typedAt = typing ? now : 0;
    draftRef.current = next;
    selRef.current = sel;
    setDraft(next);
  }, []);

  const undo = useCallback((redo: boolean) => {
    const h = history.current;
    const snap = (redo ? h.future : h.past).pop();
    if (!snap) return;
    (redo ? h.past : h.future).push({ raw: draftRef.current, sel: selRef.current });
    h.typedAt = 0;
    caretRef.current = null;
    draftRef.current = snap.raw;
    selRef.current = snap.sel;
    pendingSel.current = snap.sel;
    setDraft(snap.raw);
  }, []);

  // The editor's selection, where the last change left it, and the colour behind it scrolled
  // with it.
  useLayoutEffect(() => {
    const t = textareaRef.current;
    const sel = pendingSel.current;
    if (t && sel) {
      pendingSel.current = null;
      if (t.selectionStart !== sel[0] || t.selectionEnd !== sel[1]) t.setSelectionRange(sel[0], sel[1]);
    }
    if (t && mirrorRef.current) mirrorRef.current.scrollTop = t.scrollTop;
  }, [draft, editing]);

  // Undo from the browser's menus goes to the editor's own history too.
  useEffect(() => {
    const t = textareaRef.current;
    if (!editing || !t) return;
    const onBefore = (e: InputEvent) => {
      if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') return;
      e.preventDefault();
      undo(e.inputType === 'historyRedo');
    };
    t.addEventListener('beforeinput', onBefore);
    return () => t.removeEventListener('beforeinput', onBefore);
  }, [editing, undo]);

  // The "/" menu scrolls to keep the highlighted command in sight as the arrow keys move it.
  useLayoutEffect(() => {
    const menu = slashMenuRef.current;
    const item = menu?.querySelector<HTMLElement>('.slash-item.on');
    if (!menu || !item) return;
    if (slash?.index === 0) menu.scrollTop = 0;
    else if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
    }
  }, [slash]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    let live = true;
    void paperBookUrl().then((url) => live && setBookUrl(url));
    const onResize = () => setZoom(bookZoom());
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      live = false;
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const display = useCallback(
    async (text: string, cancelled: () => boolean) => {
      if (!note || !vault) return;
      const { map, urls } = await resolveEmbeds(text, vault, note.id);
      if (cancelled()) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = urls;
      const linked = linkWikilinks(map);
      contentMapRef.current = linked;
      setContent(linked.text);
    },
    [note, vault],
  );

  useEffect(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setContent(null);
    setRaw(null);
    setEditing(false);
    editingRef.current = false;
    setSaveState('idle');
    setSaveError(null);
    setErrorText(null);
    setPage(0);
    setPageCount(1);
    setFloatAt(null);

    if (!note || !vault) return;

    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const text = await vault.readNote(note.id);
        if (cancelled) return;
        setRaw(text);
        await display(text, () => cancelled);
        if (cancelled) return;
        setStatus('idle');
        // A blank page (a note just added from the bookshelf) opens ready to write in.
        if (text.trim() === '' && vault.writeNote) {
          beginDraft(text);
          setEditing(true);
          editingRef.current = true;
          requestAnimationFrame(() => textareaRef.current?.focus());
        }
      } catch (err) {
        if (cancelled) return;
        setErrorText(err instanceof Error && err.cause === 'host' ? err.message : null);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [note, vault, display, beginDraft]);

  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el || editing) return;
    const count = Math.max(1, Math.ceil((el.scrollWidth - 1) / PAGE_STRIDE));
    setPageCount(count);
    const p = Math.min(page, count - 1);
    if (p !== page) setPage(p);
    el.scrollLeft = p * PAGE_STRIDE;
  }, [content, page, editing]);

  // ---- Highlight and underline while reading ----

  const readingSelection = useCallback((): globalThis.Range | null => {
    const sel = window.getSelection();
    const root = pagesRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) return null;
    const range = sel.getRangeAt(0);
    return root.contains(range.commonAncestorContainer) ? range : null;
  }, []);

  const placeFloat = useCallback(() => {
    const range = editingRef.current || !canWrite ? null : readingSelection();
    const overlay = overlayRef.current;
    if (!range || !overlay) return setFloatAt(null);
    const r = range.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    const below = r.top - o.top < 56;
    const x = Math.min(Math.max(r.left + r.width / 2 - o.left, 110), o.width - 110);
    setFloatAt({ x, y: below ? r.bottom - o.top : r.top - o.top, below });
  }, [canWrite, readingSelection]);

  useEffect(() => {
    if (!note) return;
    const onUp = () => requestAnimationFrame(placeFloat);
    const onChange = () => {
      if (!readingSelection()) setFloatAt(null);
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keyup', onUp);
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keyup', onUp);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [note, placeFloat, readingSelection]);

  // The float sits over the page, so it has to go when the page turns under it.
  useEffect(() => {
    setFloatAt(null);
    window.getSelection()?.removeAllRanges();
  }, [page]);

  const markWhileReading = useCallback(
    async (op: MarkOp) => {
      const range = readingSelection();
      const root = pagesRef.current;
      const map = contentMapRef.current;
      if (!range || !root || !map || raw === null || !note || !vault?.writeNote) return;
      const segs = selectSegments(raw, selectedPieces(root, range, map));
      window.getSelection()?.removeAllRanges();
      setFloatAt(null);
      if (segs.length === 0) return;
      const next = op(raw, segs, existingMarks(root, map), strongRanges(root, map)).text;
      if (next === raw) return;
      setRaw(next);
      await display(next, () => false);
      setSaveState('saving');
      setSaveError(null);
      try {
        await vault.writeNote(note.id, next);
        noteSaved(note.id, next, note.title);
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        setSaveError(err instanceof Error ? err.message : 'Could not save');
      }
    },
    [readingSelection, raw, note, vault, display],
  );

  // ---- Editing ----

  const startEdit = useCallback(() => {
    if (raw === null) return;
    beginDraft(raw);
    setSaveState('idle');
    setSaveError(null);
    setFloatAt(null);
    setEditing(true);
    editingRef.current = true;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [raw, beginDraft]);

  const editStep = (t: HTMLTextAreaElement) => Math.max(EDIT_LINE, Math.floor(t.clientHeight / EDIT_LINE) * EDIT_LINE);

  // Recount the editor's pages from where it's scrolled, and turn the preview to the same
  // place in the note. Runs on every scroll, which includes the editor following the caret.
  const syncEditPages = useCallback(() => {
    const t = textareaRef.current;
    if (!t) return;
    const step = editStep(t);
    const maxTop = Math.max(0, t.scrollHeight - t.clientHeight);
    const count = maxTop === 0 ? 1 : 1 + Math.ceil(maxTop / step);
    setEditPageCount(count);
    // Following the caret, the browser scrolls only far enough to show it: within a line of
    // the end is the last page.
    setEditPage(maxTop > 0 && t.scrollTop >= maxTop - EDIT_LINE ? count - 1 : Math.floor((t.scrollTop + 1) / step));
    const p = previewRef.current;
    if (p) p.scrollTop = maxTop > 0 ? (t.scrollTop / maxTop) * (p.scrollHeight - p.clientHeight) : 0;
    if (mirrorRef.current) mirrorRef.current.scrollTop = t.scrollTop;
  }, []);

  useLayoutEffect(() => {
    if (editing) syncEditPages();
  }, [editing, draft, syncEditPages]);

  const turnEditPage = (delta: number) => {
    const t = textareaRef.current;
    if (!t) return;
    t.scrollTop = Math.max(0, (editPage + delta) * editStep(t));
    syncEditPages();
    // Back to the text so typing carries on; the caret itself stays where it was.
    t.focus({ preventScroll: true });
  };

  // The selection is in the shown text (no tags); the marks go into the draft, and undo with
  // the editor's own history.
  const markWhileEditing = (op: MarkOp) => {
    const t = textareaRef.current;
    const preview = previewRef.current;
    if (!t || !preview || t.selectionStart === t.selectionEnd) return;
    const current = draftRef.current;
    const { start: a, end: b } = toRaw(layoutOf(current), t.selectionStart, t.selectionEnd);
    const segs = selectSegments(current, piecesInRange(pieces(preview, previewMap), a, b));
    if (segs.length === 0) return;
    const edit = op(current, segs, existingMarks(preview, previewMap), strongRanges(preview, previewMap));
    if (edit.text === current) return;
    const after = layoutOf(edit.text);
    t.focus({ preventScroll: true });
    commitDraft(edit.text, [toVisible(after, edit.map(a, 'start')), toVisible(after, edit.map(b, 'end'))], false);
  };

  const cancelEdit = useCallback(() => {
    setEditing(false);
    editingRef.current = false;
  }, []);

  const save = useCallback(async () => {
    if (!note || !vault?.writeNote) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      await vault.writeNote(note.id, draft);
      noteSaved(note.id, draft, note.title);
      setRaw(draft);
      await display(draft, () => false);
      setSaveState('saved');
      setEditing(false);
      editingRef.current = false;
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Could not save');
    }
  }, [note, vault, draft, display]);

  // Capture phase so Escape closes the book before anything else sees it (Track C's convention).
  useEffect(() => {
    if (!note) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // With the "/" menu open, Escape just closes the menu (the editor handles it).
        if (editingRef.current && slashOpen.current) return;
        e.stopPropagation();
        if (editingRef.current) cancelEdit();
        else bus.emit('close-note', undefined);
        return;
      }
      if (editingRef.current) return;
      if ((e.metaKey || e.ctrlKey) && readingSelection()) {
        const k = e.key.toLowerCase();
        if (k === 'u' || (k === 'h' && e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
          void markWhileReading(k === 'u' ? toggleUnderline : highlightOp(lastColorRef.current));
          return;
        }
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(p + 1, pageCount - 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(p - 1, 0));
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [note, pageCount, cancelEdit, readingSelection, markWhileReading]);

  const components = {
    h1: ({ node, children }: { node?: Element; children?: React.ReactNode }) =>
      note && hastText(node).trim() === note.title.trim() ? null : <h1>{children}</h1>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const wiki = href?.startsWith('wikilink:');
      return (
        <a
          href={href}
          title={wiki ? decodeURIComponent(href!.slice(9)) : href}
          target={wiki ? undefined : '_blank'}
          rel={wiki ? undefined : 'noreferrer'}
          onClick={(e) => {
            if (wiki) e.preventDefault();
          }}
        >
          {children}
        </a>
      );
    },
    img: (props: { src?: string | Blob; alt?: string; title?: string }) => {
      const { src, alt, title } = props;
      const url = typeof src === 'string' ? src : undefined;
      const ext = extOf(title || alt || '');
      if (VIDEO_EXT.includes(ext)) return <video controls src={url} />;
      return <img src={url} alt={alt} />;
    },
  };

  if (!note) return <style>{READER_CSS}</style>;

  const progress = editing && canWrite ? noteProgress(note.id, draft) : null;

  const stopKeys = (e: React.KeyboardEvent) => {
    // Keep Phaser's window-level key handlers (WASD, arrows, Space) from eating keystrokes.
    e.stopPropagation();
  };

  const slashMatches = slash ? matchCommands(slash.query) : [];
  slashOpen.current = slashMatches.length > 0;

  // Open, follow or close the "/" menu as the text and caret change.
  const updateSlash = (t: HTMLTextAreaElement) => {
    const at = t.selectionStart === t.selectionEnd ? slashAt(t.value, t.selectionStart) : null;
    if (!at || matchCommands(at.query).length === 0 || slashDismissed.current === at.start) {
      if (!at) slashDismissed.current = null;
      setSlash(null);
      return;
    }
    const { x, y } = caretXY(t, at.start);
    setSlash((prev) => ({ ...at, x, y, index: prev && prev.start === at.start && prev.query === at.query ? prev.index : 0 }));
  };

  // The shown text becomes `next` (a slash command, a list carried on), caret at `caret`.
  const replaceText = (next: string, caret: number) => {
    const r = editVisible(draftRef.current, next, caret, caret, caretRef.current);
    commitDraft(r.raw, r.sel, false, r.caret);
  };

  const runSlash = (cmd: SlashCommand) => {
    const t = textareaRef.current;
    if (!t || !slash) return;
    const r = applyCommand(t.value, slash.start, t.selectionStart, cmd);
    setSlash(null);
    t.focus({ preventScroll: true });
    replaceText(r.text, r.caret);
  };

  const pick = (color: HighlightId) => {
    lastColorRef.current = color;
    return highlightOp(color);
  };

  return (
    <>
      <style>{READER_CSS}</style>
      <div
        ref={overlayRef}
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
        onClick={() => {
          // A drag-select that ends off the book lands its click here; that isn't a close.
          if (window.getSelection()?.isCollapsed === false) return;
          if (!editingRef.current) bus.emit('close-note', undefined);
        }}
      >
        <div
          className="note-book relative"
          data-panel="note"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: PANEL_W,
            height: PANEL_H,
            flex: 'none',
            scale: zoom,
            // Room for the control plank hung below (scaled with the book), so the two centre together.
            marginBottom: (BAR_GAP + BAR_H) * zoom,
            backgroundImage: `url('${bookUrl}')`,
            backgroundPosition: '-32px 0px',
            backgroundSize: '6720px 1728px',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.45))',
          }}
        >
          {/* Text area spanning both pages */}
          <div style={{ position: 'absolute', left: PAGES_LEFT, top: PAGES_TOP, width: PAGES_W, height: PAGES_H }}>
            {!editing && (
              <div ref={pagesRef} className="note-pages note-prose">
                <h2 className="note-title">{note.title}</h2>
                {status === 'loading' && <p style={{ color: INK_SOFT }}>Opening…</p>}
                {status === 'error' && <p style={{ color: INK_SOFT }}>{errorText ?? 'Could not read this note.'}</p>}
                {content && (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMarks]} urlTransform={safeUrl} components={components}>
                    {content}
                  </ReactMarkdown>
                )}
              </div>
            )}

            {editing && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  columnGap: SPINE_GAP,
                  height: '100%',
                }}
              >
                <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
                {/* The highlights and underlines, drawn behind the editor's see-through text. */}
                <div ref={mirrorRef} className="note-editor note-mirror" aria-hidden="true">
                  {editorRuns.map((r, i) =>
                    r.hl || r.hex || r.u ? (
                      <span
                        key={i}
                        className={[r.hl || r.hex ? 'mhl' : '', r.hl ? `hl-${r.hl}` : '', r.u ? 'mu' : ''].join(' ')}
                        style={r.hex ? ({ '--hl': r.hex } as React.CSSProperties) : undefined}
                      >
                        {r.text}
                      </span>
                    ) : (
                      r.text
                    ),
                  )}
                  {'\u200b'}
                </div>
                <textarea
                  ref={textareaRef}
                  data-tour="note-text"
                  className="note-editor"
                  style={{ position: 'relative' }}
                  value={editorLayout.visible}
                  spellCheck={false}
                  placeholder="Type / for headings, lists, to-dos and more"
                  onChange={(e) => {
                    const t = e.target;
                    const r = editVisible(draftRef.current, t.value, t.selectionStart, t.selectionEnd, caretRef.current);
                    commitDraft(r.raw, r.sel, true, r.caret);
                    updateSlash(t);
                  }}
                  onSelect={(e) => {
                    const sel: [number, number] = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd];
                    if (sel[0] !== selRef.current[0] || sel[1] !== selRef.current[1]) caretRef.current = null;
                    selRef.current = sel;
                    updateSlash(e.currentTarget);
                  }}
                  onBlur={() => setSlash(null)}
                  onScroll={(e) => {
                    syncEditPages();
                    if (slash) updateSlash(e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    stopKeys(e);
                    const mod = e.metaKey || e.ctrlKey;
                    const k = e.key.toLowerCase();
                    if (slash && slashMatches.length > 0) {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const n = slashMatches.length;
                        setSlash({ ...slash, index: (slash.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
                        return;
                      }
                      if ((e.key === 'Enter' || e.key === 'Tab') && !mod && !e.shiftKey) {
                        e.preventDefault();
                        runSlash(slashMatches[Math.min(slash.index, slashMatches.length - 1)]);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        slashDismissed.current = slash.start;
                        setSlash(null);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
                      const t = e.currentTarget;
                      const next = t.selectionStart === t.selectionEnd ? continueList(t.value, t.selectionStart) : null;
                      if (next) {
                        e.preventDefault();
                        replaceText(next.text, next.caret);
                        return;
                      }
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    } else if (mod && k === 's') {
                      e.preventDefault();
                      void save();
                    } else if (mod && k === 'z') {
                      e.preventDefault();
                      undo(e.shiftKey);
                    } else if (mod && k === 'y') {
                      e.preventDefault();
                      undo(true);
                    } else if (mod && k === 'b') {
                      e.preventDefault();
                      markWhileEditing(boldOp);
                    } else if (mod && k === 'u') {
                      e.preventDefault();
                      markWhileEditing(toggleUnderline);
                    } else if (mod && e.shiftKey && k === 'h') {
                      e.preventDefault();
                      markWhileEditing(highlightOp(lastColorRef.current));
                    }
                  }}
                  onKeyUp={stopKeys}
                  onKeyPress={stopKeys}
                />
                {slash && slashMatches.length > 0 && (
                  <div
                    ref={slashMenuRef}
                    className="slash-menu"
                    data-tour="slash-menu"
                    style={{
                      left: Math.max(0, Math.min(slash.x, (PAGES_W - SPINE_GAP) / 2 - 230)),
                      // Under the caret, or just above it near the bottom of the page.
                      ...(slash.y + EDIT_LINE + 240 > PAGES_H
                        ? { bottom: PAGES_H - slash.y + 2 }
                        : { top: slash.y + EDIT_LINE + 2 }),
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className="slash-head">{slash.query ? `Commands for "${slash.query}"` : 'Turn this line into'}</div>
                    {slashMatches.map((c, i) => (
                      <div
                        key={c.id}
                        className={`slash-item${i === slash.index ? ' on' : ''}`}
                        onMouseEnter={() => setSlash({ ...slash, index: i })}
                        onClick={() => runSlash(c)}
                      >
                        <span>{c.label}</span>
                        <span className="slash-hint">{c.hint}</span>
                      </div>
                    ))}
                  </div>
                )}
                </div>
                <div ref={previewRef} className="note-scroll note-prose">
                  <h2 className="note-title">{note.title}</h2>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMarks]} urlTransform={safeUrl} components={components}>
                    {previewMap.text}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Formatting for the editor, in the left page's top margin */}
          {editing && (
            <div
              style={{
                position: 'absolute',
                left: PAGES_LEFT,
                width: (PAGES_W - SPINE_GAP) / 2,
                top: PAGES_TOP - 40,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <MarkTools
                onHighlight={(c) => markWhileEditing(pick(c))}
                onBold={() => markWhileEditing(boldOp)}
                onUnderline={() => markWhileEditing(toggleUnderline)}
                onClear={() => markWhileEditing(clearMarks)}
              />
            </div>
          )}

          {/* Controls: a plank under the book, off the art */}
          <div
            data-tour="note-controls"
            className="note-bar"
            style={{ position: 'absolute', left: 0, top: PANEL_H + BAR_GAP, width: PANEL_W, boxSizing: 'border-box' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {!editing ? (
                <button className="note-btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  ‹ Prev
                </button>
              ) : (
                <button className="note-btn" disabled={editPage === 0} onClick={() => turnEditPage(-1)}>
                  ‹ Prev
                </button>
              )}
              <span className="note-hint" style={{ flex: 'none' }}>
                {editing ? `${editPage + 1}/${editPageCount}` : `${page + 1}/${pageCount}`}
              </span>
              <span
                className="note-hint"
                title={saveError ?? undefined}
                style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {!editing ? (
                  saveState === 'saved' ? 'Saved' : null
                ) : saveState === 'saving' ? (
                  'Saving…'
                ) : saveState === 'error' ? (
                  `Could not save: ${saveError ?? ''}`
                ) : !canWrite ? (
                  'Read-only vault'
                ) : progress ? (
                  <span data-tour="note-progress" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f7c948' }}>
                    <Coin size={10} />
                    {progress.words >= progress.needed
                      ? `Save to earn +${progress.reward}`
                      : `${progress.words}/${progress.needed} words`}
                  </span>
                ) : null}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              {!editing ? (
                <>
                  <button className="note-btn" data-tour="note-close" onClick={() => bus.emit('close-note', undefined)} title="Close (Esc)">
                    Close
                  </button>
                  <button
                    className="note-btn"
                    disabled={raw === null}
                    onClick={startEdit}
                    title={canWrite ? 'Edit this note' : 'Edit (read-only vault, changes will not be saved)'}
                  >
                    Edit
                  </button>
                  <button
                    className="note-btn"
                    disabled={page >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    Next ›
                  </button>
                </>
              ) : (
                <>
                  <button className="note-btn" data-tour="note-cancel" onClick={cancelEdit} title="Stop editing (Esc)">
                    Cancel
                  </button>
                  <button
                    className="note-btn primary"
                    data-tour="note-save"
                    disabled={!canWrite || saveState === 'saving'}
                    onClick={() => void save()}
                    title="Save (Ctrl+S / ⌘S)"
                  >
                    Save
                  </button>
                  <button className="note-btn" disabled={editPage >= editPageCount - 1} onClick={() => turnEditPage(1)}>
                    Next ›
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {floatAt && !editing && (
          <div className={`note-float${floatAt.below ? ' below' : ''}`} style={{ left: floatAt.x, top: floatAt.y }}>
            <div style={{ zoom }}>
              <MarkTools
                onHighlight={(c) => void markWhileReading(pick(c))}
                onBold={() => void markWhileReading(boldOp)}
                onUnderline={() => void markWhileReading(toggleUnderline)}
                onClear={() => void markWhileReading(clearMarks)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { isAtom, normalize, parseInline, serializeInline, type AtomKind, type Marks, type Run } from '@/lib/richNote/inline';
import { newId, parseNote, serializeNote, type Block, type Note } from '@/lib/richNote/blocks';
import {
  clearMarks, deleteRange, equalRuns, highlight, inlineShortcut, insertRuns, marksAt, runsLength, sliceRuns, splitRuns, toggleMark, visibleText,
  type Toggle,
} from '@/lib/richNote/runs';
import type { Align } from '@/lib/markdownTable';
import type { SlashCommand } from '@/lib/slashCommands';

// The note editor: the note on the book's pages, edited in place. It owns the page's DOM (React
// only hosts it), keeps the note as blocks (lib/richNote/blocks.ts), and writes Markdown back on
// every change. Typing inside a block is left to the browser and read back; anything that
// changes blocks (Enter, Backspace at a block's start, pasting, deleting across blocks) is done
// here instead, so the page and the note never disagree.

export type EditorState = { kind: Block['kind'] | null; inTable: boolean; page: number; pages: number };
export type SlashState = { x: number; y: number; query: string };

export type EditorHooks = {
  onChange: (md: string) => void;
  onState: (s: EditorState) => void;
  onSlash: (s: SlashState | null) => void;
  // Keys while the "/" menu is open: true if the menu used it.
  slashKey: (e: KeyboardEvent) => boolean;
  onSave: () => void;
  // Shows a raw block (front matter, HTML, a callout...) the way the note view would.
  renderRaw: (el: HTMLElement, src: string) => () => void;
  resolveImage: (target: string) => Promise<string | null>;
  // False for one long page that scrolls (the notebook view) instead of the book's spreads.
  paged?: boolean;
};

type TextBlock = Extract<Block, { runs: Run[] }>;
type Pos = { id: number; cell?: [number, number]; offset: number };
type Snap = { blocks: Block[]; tail: string; caret: Pos | null };

const TEXT_KINDS = new Set(['p', 'h', 'li', 'quote']);
const isText = (b: Block | undefined): b is TextBlock => !!b && TEXT_KINDS.has(b.kind);
const PAGE_STRIDE_FALLBACK = 894;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

// ---- Runs on the page ----

function wrapRun(text: string, m: Marks): Node {
  let node: Node = document.createTextNode(text);
  const wrap = (tag: keyof HTMLElementTagNameMap, cls?: string) => {
    const w = el(tag, cls);
    w.appendChild(node);
    node = w;
    return w;
  };
  if (m.code) wrap('code');
  if (m.s) wrap('del');
  if (m.i) wrap('em');
  if (m.b) wrap('strong');
  if (m.u) wrap('u');
  if (m.hl) {
    const w = wrap('mark', m.hl.startsWith('#') ? 'hl' : `hl hl-${m.hl}`);
    w.dataset.hl = m.hl;
    if (m.hl.startsWith('#')) w.style.backgroundColor = m.hl;
  }
  if (m.link !== undefined) {
    const a = wrap('a', 'rn-link');
    a.dataset.href = m.link;
    a.title = m.link;
  }
  return node;
}

function atomNode(r: Extract<Run, { atom: string }>, resolve: EditorHooks['resolveImage']): HTMLElement {
  const span = el('span', `rn-atom rn-atom-${r.kind}`);
  span.contentEditable = 'false';
  span.dataset.atom = r.atom;
  span.dataset.kind = r.kind;
  span.dataset.text = r.text;
  const target = r.kind === 'embed' ? r.atom.slice(3, -2).split('|')[0] : r.kind === 'image' ? /\]\(([^)\s]+)/.exec(r.atom)?.[1] ?? '' : '';
  if ((r.kind === 'embed' || r.kind === 'image') && IMAGE.test(target.split('#')[0])) {
    const img = el('img');
    img.alt = r.text;
    span.appendChild(img);
    if (/^(https?:|data:|blob:)/.test(target)) img.src = target;
    else void resolve(target).then((url) => url && (img.src = url));
  } else span.textContent = r.text;
  return span;
}

function fillRuns(container: HTMLElement, runs: Run[], resolve: EditorHooks['resolveImage']) {
  container.textContent = '';
  for (const r of runs) {
    if (isAtom(r)) {
      const node = wrapRun('', r.m);
      const atom = atomNode(r, resolve);
      if (node.nodeType === Node.TEXT_NODE) container.appendChild(atom);
      else {
        let inner = node as HTMLElement;
        while (inner.firstChild && inner.firstChild.nodeType === Node.ELEMENT_NODE) inner = inner.firstChild as HTMLElement;
        inner.textContent = '';
        inner.appendChild(atom);
        container.appendChild(node);
      }
    } else container.appendChild(wrapRun(r.text, r.m));
  }
  // An empty block, or one ending in a line break, needs something to put the caret on.
  const text = runs.map((r) => r.text).join('');
  if (runs.length === 0 || (text.endsWith('\n') && !isAtom(runs[runs.length - 1]))) container.appendChild(el('br'));
}

// Nothing comes after `node` inside `container`: a <br> there only holds the line open.
function lastLeaf(node: Node, container: Node): boolean {
  for (let n: Node | null = node; n && n !== container; n = n.parentNode) if (n.nextSibling) return false;
  return true;
}

function readRuns(container: HTMLElement): Run[] {
  const out: Run[] = [];
  const walk = (node: Node, m: Marks) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push({ text: (child as Text).data.replace(/ /g, ' ').replace(/​/g, ''), m });
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const e = child as HTMLElement;
      if (e.classList.contains('rn-atom')) {
        out.push({ atom: e.dataset.atom!, text: e.dataset.text ?? '', kind: (e.dataset.kind ?? 'other') as AtomKind, m });
        return;
      }
      if (e.tagName === 'BR') {
        if (!lastLeaf(e, container)) out.push({ text: '\n', m });
        return;
      }
      const next: Marks = { ...m };
      switch (e.tagName) {
        case 'STRONG':
        case 'B':
          next.b = true;
          break;
        case 'EM':
        case 'I':
          next.i = true;
          break;
        case 'DEL':
        case 'S':
        case 'STRIKE':
          next.s = true;
          break;
        case 'U':
          next.u = true;
          break;
        case 'CODE':
          next.code = true;
          break;
        case 'MARK':
          next.hl = e.dataset.hl ?? 'yellow';
          break;
        case 'A':
          next.link = e.dataset.href ?? e.getAttribute('href') ?? '';
          break;
        case 'DIV':
        case 'P':
          // A line the browser made on its own: its text starts a new line.
          if (out.length) out.push({ text: '\n', m });
      }
      walk(e, next);
    });
  };
  walk(container, {});
  return normalize(out);
}

// How many characters (atoms one each) come before (node, offset) in `container`.
function lengthOfNode(n: Node, container: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return (n as Text).data.length;
  if (n.nodeType !== Node.ELEMENT_NODE) return 0;
  const e = n as HTMLElement;
  if (e.classList.contains('rn-atom')) return 1;
  if (e.tagName === 'BR') return lastLeaf(e, container) ? 0 : 1;
  let total = 0;
  e.childNodes.forEach((c) => (total += lengthOfNode(c, container)));
  return total;
}

function offsetIn(container: HTMLElement, node: Node, offset: number): number {
  const atom = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement)?.closest('.rn-atom');
  if (atom && container.contains(atom)) {
    node = atom.parentNode!;
    offset = Array.prototype.indexOf.call(node.childNodes, atom) + (offset > 0 ? 1 : 0);
  }
  let total = 0;
  if (node.nodeType === Node.TEXT_NODE) total += offset;
  else for (let i = 0; i < offset && i < node.childNodes.length; i++) total += lengthOfNode(node.childNodes[i], container);
  for (let cur: Node = node; cur !== container && cur.parentNode; cur = cur.parentNode) {
    for (let s = cur.previousSibling; s; s = s.previousSibling) total += lengthOfNode(s, container);
  }
  return total;
}

// The DOM point `offset` characters into `container`, inside the text before it when there's a
// choice (so typing there takes that text's formatting).
function pointAt(container: HTMLElement, offset: number): [Node, number] {
  let left = offset;
  const visit = (node: Node): [Node, number] | null => {
    const kids = Array.from(node.childNodes);
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c.nodeType === Node.TEXT_NODE) {
        const len = (c as Text).data.length;
        if (left <= len) return [c, left];
        left -= len;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const e = c as HTMLElement;
        if (e.classList.contains('rn-atom') || e.tagName === 'BR') {
          const len = lengthOfNode(e, container);
          if (left === 0) return [node, i];
          left -= len;
          if (left === 0 && len > 0 && i === kids.length - 1) return [node, i + 1];
        } else {
          const found = visit(e);
          if (found) return found;
        }
      }
    }
    return null;
  };
  const found = visit(container);
  if (found) return found;
  const kids = container.childNodes;
  const last = kids[kids.length - 1];
  return [container, last && last.nodeName === 'BR' ? kids.length - 1 : kids.length];
}

function cloneBlocks(blocks: Block[]): Block[] {
  return structuredClone(blocks);
}

// ---- The editor ----

export class NoteEditor {
  private note: Note;
  private els = new Map<number, HTMLElement>();
  private unrender = new Map<number, () => void>();
  private past: Snap[] = [];
  private future: Snap[] = [];
  private typedAt = 0;
  private burstAt = 0;
  // Formatting for the next text typed (after ⌘B with nothing selected, or a shortcut).
  private stored: Marks | null = null;
  private storedAt: Pos | null = null;
  private composing = false;
  private slash: { id: number; start: number } | null = null;
  private lastMd: string;
  private lastInput: InputEvent | null = null;
  private highlightColor = 'yellow';
  private page = 0;
  private titleEl: HTMLElement;
  private disposers: (() => void)[] = [];

  constructor(
    private root: HTMLElement,
    md: string,
    title: string,
    private hooks: EditorHooks,
  ) {
    this.note = parseNote(md);
    this.lastMd = md;
    if (!this.note.blocks.some(isText) || !isText(this.note.blocks[this.note.blocks.length - 1])) {
      this.note.blocks.push(this.newBlock({ kind: 'p', runs: [] }));
    }
    this.titleEl = el('h2', 'note-title');
    this.titleEl.contentEditable = 'false';
    this.titleEl.textContent = title;
    this.renderAll();
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      root.addEventListener(type, fn as EventListener);
      this.disposers.push(() => root.removeEventListener(type, fn as EventListener));
    };
    on('keydown', (e) => this.onKeyDown(e));
    on('keyup', (e) => e.stopPropagation());
    on('keypress', (e) => e.stopPropagation());
    on('beforeinput', (e) => this.onBeforeInput(e as InputEvent));
    on('input', (e) => this.onInput(e as InputEvent));
    on('compositionstart', () => {
      if (this.crossing()) this.deleteSelection();
      this.composing = true;
    });
    on('compositionend', () => {
      this.composing = false;
      this.sync();
    });
    on('mousedown', (e) => this.onMouseDown(e));
    on('click', (e) => this.onClick(e));
    on('dblclick', (e) => this.onDoubleClick(e));
    on('dragstart', (e) => e.preventDefault());
    on('copy', (e) => this.onCopy(e, false));
    on('cut', (e) => this.onCopy(e, true));
    on('drop', (e) => e.preventDefault());
    const onSelection = () => {
      if (!root.contains(document.getSelection()?.anchorNode ?? null)) return;
      const pos = this.caret();
      if (this.stored && (!pos || !this.storedAt || pos.id !== this.storedAt.id || pos.offset !== this.storedAt.offset)) this.stored = null;
      this.updateSlash();
      this.followCaret();
      this.report();
    };
    document.addEventListener('selectionchange', onSelection);
    this.disposers.push(() => document.removeEventListener('selectionchange', onSelection));
    requestAnimationFrame(() => this.report());
  }

  destroy() {
    this.disposers.forEach((d) => d());
    this.unrender.forEach((u) => u());
    this.unrender.clear();
  }

  markdown(): string {
    return serializeNote(this.note);
  }

  // ---- Blocks on the page ----

  private newBlock(b: Record<string, unknown> & { kind: Block['kind'] }): Block {
    return { src: '', gap: '', edited: true, was: null, id: newId(), ...b } as Block;
  }

  private renderAll() {
    this.unrender.forEach((u) => u());
    this.unrender.clear();
    this.els.clear();
    this.root.textContent = '';
    this.root.appendChild(this.titleEl);
    for (const b of this.note.blocks) this.root.appendChild(this.renderBlock(b));
    this.numberLists();
  }

  private renderBlock(b: Block): HTMLElement {
    this.unrender.get(b.id)?.();
    this.unrender.delete(b.id);
    let node: HTMLElement;
    const text = (e: HTMLElement, runs: Run[]) => {
      e.classList.add('rn-t');
      fillRuns(e, runs, this.hooks.resolveImage);
      return e;
    };
    switch (b.kind) {
      case 'p':
        node = text(el('p', 'rn-b'), b.runs);
        break;
      case 'h':
        node = text(el(`h${Math.min(6, Math.max(1, b.level))}` as 'h1', 'rn-b'), b.runs);
        break;
      case 'quote':
        node = text(el('blockquote', 'rn-b'), b.runs);
        break;
      case 'li': {
        node = el('div', `rn-b rn-li${b.task ? ' rn-done' : ''}`);
        const depth = b.indent.replace(/\t/g, '    ').length;
        node.style.paddingLeft = `${4 + Math.round(depth * 7)}px`;
        const mark = el('span', 'rn-mk');
        mark.contentEditable = 'false';
        if (b.task !== null) {
          const box = el('span', `rn-box${b.task ? ' on' : ''}`);
          box.title = b.task ? 'Untick (⌘Enter)' : 'Tick (⌘Enter)';
          mark.appendChild(box);
        } else mark.textContent = /^\d/.test(b.marker) ? b.marker : '•';
        node.appendChild(mark);
        node.appendChild(text(el('div'), b.runs));
        break;
      }
      case 'code': {
        node = el('div', 'rn-b rn-code');
        node.contentEditable = 'false';
        const pre = el('pre', 'rn-codetext');
        pre.contentEditable = 'plaintext-only';
        if (pre.contentEditable !== 'plaintext-only') pre.contentEditable = 'true';
        pre.spellcheck = false;
        pre.textContent = `${b.code}\n`;
        node.appendChild(pre);
        if (b.lang) {
          const lang = el('span', 'rn-lang');
          lang.textContent = b.lang;
          node.appendChild(lang);
        }
        break;
      }
      case 'table': {
        node = el('div', 'rn-b rn-table');
        node.contentEditable = 'false';
        const table = el('table');
        b.rows.forEach((row, r) => {
          const tr = el('tr');
          for (let c = 0; c < b.align.length; c++) {
            const cell = el(r === 0 ? 'th' : 'td', 'rn-cell');
            cell.contentEditable = 'true';
            cell.dataset.r = String(r);
            cell.dataset.c = String(c);
            const a = b.align[c];
            if (a) cell.style.textAlign = a;
            text(cell, row[c] ?? []);
            tr.appendChild(cell);
          }
          table.appendChild(tr);
        });
        node.appendChild(table);
        break;
      }
      case 'hr':
        node = el('div', 'rn-b rn-hr');
        node.contentEditable = 'false';
        node.appendChild(el('hr'));
        break;
      case 'raw': {
        node = el('div', 'rn-b rn-raw');
        node.contentEditable = 'false';
        node.title = 'Double-click to edit this part as Markdown';
        this.unrender.set(b.id, this.hooks.renderRaw(node, b.src));
        break;
      }
    }
    node.dataset.id = String(b.id);
    this.els.set(b.id, node);
    return node;
  }

  // Numbered lists show their numbers counted, as the note view does.
  private numberLists() {
    const counters: { indent: string; n: number }[] = [];
    for (const b of this.note.blocks) {
      if (b.kind !== 'li') {
        counters.length = 0;
        continue;
      }
      while (counters.length && counters[counters.length - 1].indent.length > b.indent.length) counters.pop();
      const top = counters[counters.length - 1];
      const ordered = /^\d/.test(b.marker);
      if (!ordered) {
        if (top && top.indent === b.indent) counters.pop();
        continue;
      }
      let n: number;
      if (top && top.indent === b.indent) n = ++top.n;
      else {
        n = parseInt(b.marker, 10);
        counters.push({ indent: b.indent, n });
      }
      const mk = this.els.get(b.id)?.querySelector('.rn-mk');
      if (mk && b.task === null) mk.textContent = `${n}${b.marker.slice(-1)}`;
    }
  }

  private index(id: number) {
    return this.note.blocks.findIndex((b) => b.id === id);
  }
  private block(id: number) {
    return this.note.blocks[this.index(id)];
  }

  private put(b: Block, { render = true } = {}) {
    const i = this.index(b.id);
    this.note.blocks[i] = b;
    if (render) {
      const old = this.els.get(b.id)!;
      old.replaceWith(this.renderBlock(b));
      this.numberLists();
    }
  }

  private insertAfter(after: Block | null, b: Block) {
    const i = after ? this.index(after.id) + 1 : 0;
    this.note.blocks.splice(i, 0, b);
    const node = this.renderBlock(b);
    const before = this.note.blocks[i + 1];
    if (before) this.els.get(before.id)!.before(node);
    else this.root.appendChild(node);
    this.numberLists();
  }

  private remove(b: Block) {
    this.note.blocks.splice(this.index(b.id), 1);
    this.unrender.get(b.id)?.();
    this.unrender.delete(b.id);
    this.els.get(b.id)?.remove();
    this.els.delete(b.id);
    if (!this.note.blocks.some(isText)) this.insertAfter(this.note.blocks[this.note.blocks.length - 1] ?? null, this.newBlock({ kind: 'p', runs: [] }));
    this.numberLists();
  }

  // ---- Where the caret is ----

  private containerOf(node: Node | null): HTMLElement | null {
    const e = node && (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement);
    const c = e?.closest<HTMLElement>('.rn-t, .rn-codetext');
    return c && this.root.contains(c) ? c : null;
  }

  private posOf(node: Node | null, offset: number): Pos | null {
    const c = this.containerOf(node);
    if (!c || !node) return null;
    const blockEl = c.closest<HTMLElement>('.rn-b');
    if (!blockEl) return null;
    const id = Number(blockEl.dataset.id);
    if (c.classList.contains('rn-codetext')) {
      const range = document.createRange();
      range.setStart(c, 0);
      range.setEnd(node, offset);
      return { id, offset: range.toString().length };
    }
    const cell = c.dataset.r !== undefined ? ([Number(c.dataset.r), Number(c.dataset.c)] as [number, number]) : undefined;
    return { id, cell, offset: offsetIn(c, node, offset) };
  }

  private caret(): Pos | null {
    const s = document.getSelection();
    return s && s.rangeCount ? this.posOf(s.focusNode, s.focusOffset) : null;
  }

  // The selection, start first; null outside the note. An end outside any text (on the title,
  // a divider, after ⌘A) moves in to the nearest text the selection covers.
  private selection(): { from: Pos; to: Pos; collapsed: boolean } | null {
    const s = document.getSelection();
    if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (!this.root.contains(r.commonAncestorContainer)) return null;
    const covered = () => this.note.blocks.filter((b) => isText(b) && r.intersectsNode(this.els.get(b.id)!)) as TextBlock[];
    let from = this.posOf(r.startContainer, r.startOffset);
    let to = this.posOf(r.endContainer, r.endOffset);
    if (!from && !r.collapsed) {
      const first = covered()[0];
      if (first) from = { id: first.id, offset: 0 };
    }
    if (!to && !r.collapsed) {
      const last = covered().at(-1);
      if (last) to = { id: last.id, offset: runsLength(last.runs) };
    }
    if (!from || !to) return null;
    return { from, to, collapsed: r.collapsed };
  }

  private sameContainer(a: Pos, b: Pos) {
    return a.id === b.id && (a.cell?.join() ?? '') === (b.cell?.join() ?? '');
  }

  private crossing(): boolean {
    const s = document.getSelection();
    if (!s || !s.rangeCount || s.isCollapsed) return false;
    const sel = this.selection();
    return !sel || !this.sameContainer(sel.from, sel.to);
  }

  private containerFor(pos: Pos): HTMLElement | null {
    const node = this.els.get(pos.id);
    if (!node) return null;
    if (pos.cell) return node.querySelector<HTMLElement>(`[data-r="${pos.cell[0]}"][data-c="${pos.cell[1]}"]`);
    return node.classList.contains('rn-t') ? node : node.querySelector<HTMLElement>('.rn-t, .rn-codetext');
  }

  private place(pos: Pos, end?: number) {
    // Formatting kept for the next text typed holds only where it was set.
    const at = this.storedAt;
    if (this.stored && (!at || at.id !== pos.id || at.offset !== pos.offset || (at.cell?.join() ?? '') !== (pos.cell?.join() ?? ''))) this.stored = null;
    const c = this.containerFor(pos);
    if (!c) return;
    const s = document.getSelection();
    if (!s) return;
    const range = document.createRange();
    if (c.classList.contains('rn-codetext')) {
      const t = c.firstChild ?? c;
      range.setStart(t, Math.min(pos.offset, t.textContent?.length ?? 0));
    } else {
      const [n, o] = pointAt(c, pos.offset);
      range.setStart(n, o);
      if (end !== undefined && end !== pos.offset) {
        const [n2, o2] = pointAt(c, end);
        range.setEnd(n2, o2);
      }
    }
    if (end === undefined || end === pos.offset) range.collapse(true);
    (c.closest<HTMLElement>('[contenteditable="true"], [contenteditable="plaintext-only"]') ?? this.root).focus({ preventScroll: true });
    s.removeAllRanges();
    s.addRange(range);
    this.followCaret();
  }

  private runsAt(pos: Pos): Run[] {
    const b = this.block(pos.id);
    if (b.kind === 'table' && pos.cell) return b.rows[pos.cell[0]]?.[pos.cell[1]] ?? [];
    return isText(b) ? b.runs : [];
  }

  private setRuns(pos: Pos, runs: Run[], render: boolean) {
    const b = this.block(pos.id);
    if (b.kind === 'table' && pos.cell) {
      const rows = b.rows.map((r) => [...r]);
      rows[pos.cell[0]][pos.cell[1]] = runs;
      this.put({ ...b, rows, edited: true }, { render: false });
    } else if (isText(b)) this.put({ ...b, runs, edited: true } as Block, { render: false });
    if (render) {
      const c = this.containerFor(pos);
      if (c) fillRuns(c, runs, this.hooks.resolveImage);
    }
  }

  // ---- History ----

  private snapshot(): Snap {
    return { blocks: cloneBlocks(this.note.blocks), tail: this.note.tail, caret: this.caret() };
  }

  // Before a change: what to go back to. A run of typing is one step (a few seconds at most).
  private remember(typing: boolean) {
    const now = performance.now();
    const same = typing && this.past.length > 0 && now - this.typedAt < 1000 && now - this.burstAt < 4000;
    if (!same) {
      this.past.push(this.pending ?? this.snapshot());
      if (this.past.length > 200) this.past.shift();
      this.burstAt = now;
    }
    this.pending = null;
    this.future = [];
    this.typedAt = typing ? now : 0;
  }
  // The state before the browser's own edit, taken as the edit starts.
  private pending: Snap | null = null;

  undo(redo = false) {
    const from = redo ? this.future : this.past;
    const snap = from.pop();
    if (!snap) return;
    (redo ? this.past : this.future).push(this.snapshot());
    this.typedAt = 0;
    this.note = { blocks: cloneBlocks(snap.blocks), tail: snap.tail };
    this.renderAll();
    if (snap.caret && this.note.blocks.some((b) => b.id === snap.caret!.id)) this.place(snap.caret);
    this.changed();
  }

  private changed() {
    const md = serializeNote(this.note);
    if (md !== this.lastMd) {
      this.lastMd = md;
      this.hooks.onChange(md);
    }
    this.report();
  }

  // ---- Paging: the caret's spread is the one showing ----

  // The page runs on to the right in columns, two to a spread; a spread is shown by sliding the
  // page along (its frame clips but doesn't scroll).
  private stride() {
    const gap = parseFloat(getComputedStyle(this.root).columnGap) || 0;
    return this.root.clientWidth + gap || PAGE_STRIDE_FALLBACK;
  }

  private pages() {
    if (this.hooks.paged === false) return 1;
    return Math.max(1, Math.ceil((this.root.scrollWidth - 1) / this.stride()));
  }

  private showPage(page: number) {
    if (this.hooks.paged === false) return;
    this.page = Math.min(this.pages() - 1, Math.max(0, page));
    this.root.style.transform = `translateX(${-this.page * this.stride()}px)`;
  }

  // Where `rect` is across the page as laid out, unslid and unscaled.
  private across(rect: DOMRect): number {
    const box = this.root.getBoundingClientRect();
    const scale = box.width / (this.root.offsetWidth || 1);
    return (rect.left - box.left) / scale;
  }

  private followCaret() {
    const s = document.getSelection();
    if (!s || !s.rangeCount || !this.root.contains(s.focusNode)) return;
    const range = s.getRangeAt(0).cloneRange();
    range.collapse(false);
    let rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.left === 0)) {
      const c = this.containerOf(s.focusNode);
      if (!c) return;
      rect = c.getBoundingClientRect();
    }
    if (this.hooks.paged === false) {
      const view = this.root.closest<HTMLElement>('[data-scroll]');
      if (!view) return;
      const v = view.getBoundingClientRect();
      if (rect.bottom > v.bottom - 24) view.scrollTop += rect.bottom - v.bottom + 48;
      else if (rect.top < v.top + 8) view.scrollTop -= v.top - rect.top + 48;
      return;
    }
    const page = Math.floor((this.across(rect) + 1) / this.stride());
    if (page !== this.page) this.showPage(page);
  }

  turnPage(delta: number) {
    this.showPage(this.page + delta);
    // The caret goes to the top of the page turned to, so typing carries on where you look.
    const stride = this.stride();
    for (const b of this.note.blocks) {
      if (!isText(b)) continue;
      const page = Math.floor((this.across(this.els.get(b.id)!.getBoundingClientRect()) + 1) / stride);
      if (page === this.page) {
        this.place({ id: b.id, offset: 0 });
        break;
      }
    }
    this.report();
  }

  private report() {
    const pos = this.caret();
    const b = pos ? this.block(pos.id) : undefined;
    const pages = this.pages();
    if (this.page > pages - 1) this.showPage(pages - 1);
    this.hooks.onState({ kind: b?.kind ?? null, inTable: !!pos?.cell, page: this.page, pages });
  }

  // ---- Typing ----

  private onBeforeInput(e: InputEvent) {
    const t = e.inputType;
    if (t === 'historyUndo' || t === 'historyRedo') {
      e.preventDefault();
      this.undo(t === 'historyRedo');
      return;
    }
    if (t.startsWith('format')) {
      e.preventDefault();
      const map: Record<string, Toggle> = { formatBold: 'b', formatItalic: 'i', formatUnderline: 'u', formatStrikeThrough: 's' };
      if (map[t]) this.format(map[t]);
      return;
    }
    if (t === 'insertFromDrop' || t === 'deleteByDrag') {
      e.preventDefault();
      return;
    }
    const sel = this.selection();
    if (!sel) {
      e.preventDefault();
      return;
    }
    const b = this.block(sel.from.id);
    if (t === 'insertParagraph' || t === 'insertLineBreak') {
      e.preventDefault();
      this.enter(t === 'insertLineBreak');
      return;
    }
    if (t === 'insertFromPaste' || t === 'insertFromPasteAsQuotation' || t === 'insertFromYank') {
      e.preventDefault();
      this.paste(e.dataTransfer?.getData('text/plain') ?? '');
      return;
    }
    if (!sel.collapsed && !this.sameContainer(sel.from, sel.to)) {
      e.preventDefault();
      const text = t.startsWith('insert') ? e.data ?? e.dataTransfer?.getData('text/plain') ?? '' : '';
      this.deleteSelection();
      if (text) this.insertText(text);
      return;
    }
    if (b.kind !== 'code' && sel.collapsed) {
      const len = runsLength(this.runsAt(sel.from));
      if (t.startsWith('deleteContentBackward') || t.startsWith('deleteWordBackward') || t.startsWith('deleteSoftLineBackward') || t.startsWith('deleteHardLineBackward')) {
        if (sel.from.offset === 0) {
          e.preventDefault();
          this.backspaceAtStart(sel.from);
          return;
        }
      }
      if (t.startsWith('deleteContentForward') || t.startsWith('deleteWordForward')) {
        if (sel.from.offset >= len) {
          e.preventDefault();
          this.deleteAtEnd(sel.from);
          return;
        }
      }
    }
    if ((t === 'insertText' || t === 'insertReplacementText') && this.stored && sel.collapsed && b.kind !== 'code') {
      e.preventDefault();
      this.insertText(e.data ?? e.dataTransfer?.getData('text/plain') ?? '');
      return;
    }
    this.pending = this.snapshot();
    this.lastInput = e;
  }

  private onInput(e: InputEvent) {
    this.lastInput = e;
    if (this.composing || e.isComposing) return;
    this.sync();
  }

  // The browser changed the text of one block (or cell, or code): read it back.
  private sync() {
    if (!this.intact()) {
      // Something reshaped the blocks behind our back: put the note back as it was.
      const pos = this.caret();
      this.renderAll();
      if (pos && this.note.blocks.some((b) => b.id === pos.id)) this.place(pos);
      return;
    }
    const pos = this.caret();
    if (!pos) return;
    const b = this.block(pos.id);
    const typed = this.lastInput?.inputType === 'insertText' ? this.lastInput.data ?? '' : '';
    if (b.kind === 'code') {
      const pre = this.containerFor(pos)!;
      const code = (pre.textContent ?? '').replace(/\n$/, '');
      if (code === b.code) return;
      this.remember(true);
      this.put({ ...b, code, edited: true }, { render: false });
      if (!(pre.textContent ?? '').endsWith('\n')) {
        pre.textContent = `${code}\n`;
        this.place(pos);
      }
      this.changed();
      return;
    }
    const container = this.containerFor(pos)!;
    let runs = readRuns(container);
    const before = this.runsAt(pos);
    if (equalRuns(runs, before)) return;
    this.remember(true);
    let caret = pos.offset;
    let rerender = false;
    // Notion-style shortcuts, as the character that completes them is typed.
    if (typed.length === 1 && !pos.cell) {
      const block = this.blockShortcut(b as TextBlock, runs, caret, typed);
      if (block) return;
    }
    if (typed.length === 1) {
      const short = inlineShortcut(runs, caret);
      if (short) {
        runs = short.runs;
        caret = short.caret;
        rerender = true;
        // Typing on after the closing delimiter is plain again.
        this.stored = { ...marksAt(runs, caret) };
        for (const k of ['b', 'i', 's', 'code', 'hl'] as const) delete this.stored[k];
        this.storedAt = { ...pos, offset: caret };
      }
    }
    this.setRuns(pos, runs, false);
    const canonical = el('div');
    fillRuns(canonical, runs, this.hooks.resolveImage);
    if (rerender || canonical.innerHTML !== container.innerHTML) {
      fillRuns(container, runs, this.hooks.resolveImage);
      this.place({ ...pos, offset: caret });
    }
    if (typed === '/') this.openSlash(pos.id, caret);
    this.changed();
  }

  // The page still holds exactly the blocks of the note, in order.
  private intact(): boolean {
    const kids = Array.from(this.root.children);
    if (kids[0] !== this.titleEl || kids.length !== this.note.blocks.length + 1) return false;
    return this.note.blocks.every((b, i) => kids[i + 1] === this.els.get(b.id));
  }

  // "# ", "- ", "1. ", "[] ", "> ", "```" and "---" at the start of a line turn it into that block.
  private blockShortcut(b: TextBlock, runs: Run[], caret: number, typed: string): boolean {
    const text = visibleText(runs);
    const head = text.slice(0, caret);
    const rest = splitRuns(runs, caret)[1];
    let next: Block | null = null;
    // In a list item, "- " or "1. " only re-marks it; "# " or "> " turns it into that block.
    const asText = b.kind === 'li' && b.task === null && !/^\[[ xX]?\] $/.test(head);
    if ((b.kind === 'p' || asText) && typed === ' ') {
      let m: RegExpExecArray | null;
      if ((m = /^(#{1,6}) $/.exec(head))) next = { ...b, kind: 'h', level: m[1].length, runs: rest } as Block;
      else if (/^[-*+] $/.test(head)) next = { ...b, kind: 'li', indent: '', marker: '-', task: null, runs: rest } as Block;
      else if ((m = /^(\d{1,9})([.)]) $/.exec(head))) next = { ...b, kind: 'li', indent: '', marker: `${m[1]}${m[2]}`, task: null, runs: rest } as Block;
      else if (/^\[[ xX]?\] $/.test(head)) next = { ...b, kind: 'li', indent: '', marker: '-', task: /x/i.test(head), runs: rest } as Block;
      else if (/^> $/.test(head)) next = { ...b, kind: 'quote', runs: rest } as Block;
      // A list item keeps its place in the list.
      if (next && next.kind === 'li' && b.kind === 'li') next = { ...next, indent: b.indent } as Block;
    } else if (b.kind === 'li' && b.task === null && typed === ' ' && /^\[[ xX]?\] $/.test(head)) {
      next = { ...b, task: /x/i.test(head), runs: rest } as Block;
    } else if (b.kind === 'p' && typed === '`' && head === '```') {
      next = { ...b, kind: 'code', lang: visibleText(rest).trim(), code: '' } as Block;
    } else if (b.kind === 'p' && typed === '-' && text === '---') {
      const hr = { ...b, kind: 'hr', edited: true } as Block;
      this.put(hr);
      const p = this.newBlock({ kind: 'p', runs: [] });
      this.insertAfter(hr, p);
      this.place({ id: p.id, offset: 0 });
      this.changed();
      return true;
    }
    if (!next) return false;
    next = { ...next, edited: true } as Block;
    this.put(next);
    this.place({ id: next.id, offset: 0 });
    this.changed();
    return true;
  }

  // Text typed or pasted at the caret, in the formatting it's due (stored, or what's before it).
  insertText(text: string) {
    const pos = this.caret();
    if (!pos) return;
    const b = this.block(pos.id);
    if (b.kind === 'code') {
      document.execCommand('insertText', false, text);
      return;
    }
    if (text.includes('\n') && !pos.cell) {
      this.paste(text);
      return;
    }
    this.remember(text.length === 1);
    const runs = this.runsAt(pos);
    const marks = this.stored ?? marksAt(runs, pos.offset);
    const clean = pos.cell ? text.replace(/\n/g, ' ') : text;
    let next = insertRuns(runs, pos.offset, [{ text: clean, m: marks }]);
    let caret = pos.offset + clean.length;
    const short = clean.length === 1 ? inlineShortcut(next, caret) : null;
    if (short) {
      next = short.runs;
      caret = short.caret;
    }
    this.setRuns(pos, next, true);
    if (this.stored) this.storedAt = { ...pos, offset: caret };
    this.place({ ...pos, offset: caret });
    this.changed();
  }

  // ---- Structure ----

  private enter(soft: boolean) {
    if (this.crossing() || !document.getSelection()?.isCollapsed) this.deleteSelection();
    const pos = this.caret();
    if (!pos) return;
    const b = this.block(pos.id);
    if (b.kind === 'table' && pos.cell) return this.tableEnter(pos);
    if (b.kind === 'code') {
      document.execCommand('insertText', false, '\n');
      return;
    }
    if (!isText(b)) return;
    if (soft) {
      if (b.kind !== 'h') this.insertText('\n');
      return;
    }
    this.remember(false);
    const len = runsLength(b.runs);
    if (len === 0 && b.kind !== 'p') {
      if (b.kind === 'li' && b.indent) this.shiftItem(b, -1);
      else this.convert(b, 'p');
      return;
    }
    if (pos.offset === 0 && len > 0) {
      const above = b.kind === 'li' ? this.newBlock({ kind: 'li', indent: b.indent, marker: b.marker, task: b.task === null ? null : false, runs: [] }) : this.newBlock({ kind: 'p', runs: [] });
      this.insertAfter(this.note.blocks[this.index(b.id) - 1] ?? null, above);
      this.place({ id: b.id, offset: 0 });
      this.changed();
      return;
    }
    const [left, right] = splitRuns(b.runs, pos.offset);
    const kept = { ...b, runs: left, edited: true } as Block;
    this.put(kept);
    const next =
      b.kind === 'li'
        ? this.newBlock({ kind: 'li', indent: b.indent, marker: nextMarker(b.marker), task: b.task === null ? null : false, runs: right })
        : this.newBlock({ kind: 'p', runs: right });
    this.insertAfter(kept, next);
    this.place({ id: next.id, offset: 0 });
    this.changed();
  }

  private convert(b: TextBlock, kind: 'p' | 'h' | 'li' | 'quote', extra: Record<string, unknown> = {}) {
    const base = { id: b.id, src: b.src, gap: b.gap, was: b.was, edited: true, runs: b.runs };
    const next = (kind === 'li'
      ? { ...base, kind, indent: '', marker: '-', task: null, ...extra }
      : kind === 'h'
        ? { ...base, kind, level: 1, ...extra }
        : { ...base, kind, ...extra }) as Block;
    const pos = this.caret();
    this.put(next);
    this.place({ id: b.id, offset: pos?.id === b.id ? pos.offset : 0 });
    this.changed();
  }

  private backspaceAtStart(pos: Pos) {
    const b = this.block(pos.id);
    if (pos.cell) return;
    if (b.kind === 'code') {
      if (b.code === '') {
        this.remember(false);
        const p = { ...this.newBlock({ kind: 'p', runs: [] }), id: b.id, gap: b.gap, was: b.was } as Block;
        this.put(p);
        this.place({ id: b.id, offset: 0 });
        this.changed();
      }
      return;
    }
    if (!isText(b)) return;
    this.remember(false);
    if (b.kind === 'li') {
      if (b.indent) this.shiftItem(b, -1);
      else this.convert(b, 'p');
      return;
    }
    if (b.kind !== 'p') {
      this.convert(b, 'p');
      return;
    }
    const prev = this.note.blocks[this.index(b.id) - 1];
    if (!prev) return;
    if (isText(prev)) {
      const at = runsLength(prev.runs);
      this.put({ ...prev, runs: normalize([...prev.runs, ...b.runs]), edited: true } as Block);
      this.remove(b);
      this.place({ id: prev.id, offset: at });
    } else if (prev.kind === 'hr') {
      this.remove(prev);
      this.place({ id: b.id, offset: 0 });
    } else if (runsLength(b.runs) === 0) {
      this.remove(b);
      const back = [...this.note.blocks.slice(0, this.index(prev.id) + 1)].reverse().find(isText);
      if (back) this.place({ id: back.id, offset: runsLength(back.runs) });
    } else return;
    this.changed();
  }

  private deleteAtEnd(pos: Pos) {
    const b = this.block(pos.id);
    if (pos.cell || !isText(b)) return;
    const next = this.note.blocks[this.index(b.id) + 1];
    if (!next) return;
    this.remember(false);
    if (isText(next)) {
      this.put({ ...b, runs: normalize([...b.runs, ...next.runs]), edited: true } as Block);
      this.remove(next);
    } else if (next.kind === 'hr') this.remove(next);
    else return;
    this.place(pos);
    this.changed();
  }

  // Deletes the selection; across blocks, the first and last are joined and those between go.
  deleteSelection() {
    const sel = this.selection();
    const s = document.getSelection();
    if (!s || !s.rangeCount) return;
    if (!sel) {
      // Ends outside any text (the title, a divider): back to the caret, nothing deleted.
      s.collapseToStart();
      return;
    }
    if (sel.collapsed) return;
    this.remember(false);
    const { from, to } = sel;
    if (this.sameContainer(from, to)) {
      const b = this.block(from.id);
      if (b.kind === 'code') {
        document.execCommand('delete');
        return;
      }
      this.setRuns(from, deleteRange(this.runsAt(from), from.offset, to.offset), true);
      this.place(from);
      this.changed();
      return;
    }
    const first = this.block(from.id);
    const last = this.block(to.id);
    const i = this.index(first.id);
    const j = this.index(last.id);
    for (const b of this.note.blocks.slice(i + 1, j)) this.remove(b);
    if (from.cell || to.cell || !isText(first) || !isText(last)) {
      // A table or code block at an end keeps itself; the text on the other side is trimmed.
      if (isText(first) && !from.cell) this.setRuns(from, splitRuns(first.runs, from.offset)[0], true);
      if (isText(last) && !to.cell) this.setRuns(to, splitRuns(last.runs, to.offset)[1], true);
      this.place(isText(first) && !from.cell ? from : { id: last.id, offset: 0 });
    } else {
      const joined = normalize([...splitRuns(first.runs, from.offset)[0], ...splitRuns(last.runs, to.offset)[1]]);
      this.put({ ...first, runs: joined, edited: true } as Block);
      this.remove(last);
      this.place(from);
    }
    this.changed();
  }

  private paste(text: string) {
    text = text.replace(/\r\n?/g, '\n');
    if (!text) return;
    if (this.crossing() || !document.getSelection()?.isCollapsed) this.deleteSelection();
    const pos = this.caret();
    if (!pos) return;
    const b = this.block(pos.id);
    if (b.kind === 'code') {
      document.execCommand('insertText', false, text);
      return;
    }
    const inline = text.includes('\n') ? null : parseInline(text);
    if (pos.cell || inline) {
      this.remember(false);
      const ins = inline ?? [{ text: text.replace(/\n/g, ' '), m: {} }];
      const runs = insertRuns(this.runsAt(pos), pos.offset, ins);
      this.setRuns(pos, runs, true);
      this.place({ ...pos, offset: pos.offset + runsLength(ins) });
      this.changed();
      return;
    }
    if (!isText(b)) return;
    this.remember(false);
    const pasted = parseNote(text).blocks.map((x) => ({ ...x, was: null }) as Block);
    const [left, right] = splitRuns(b.runs, pos.offset);
    let after: Block = { ...b, runs: left, edited: true } as Block;
    this.put(after);
    for (const x of pasted) {
      this.insertAfter(after, x);
      after = x;
    }
    if (runsLength(left) === 0) this.remove(this.block(b.id));
    let end: Pos | null = isText(after) ? { id: after.id, offset: runsLength(after.runs) } : null;
    if (runsLength(right) > 0 || !end) {
      const tailBlock = this.newBlock({ kind: 'p', runs: right });
      this.insertAfter(after, tailBlock);
      end = end ?? { id: tailBlock.id, offset: 0 };
    }
    this.place(end);
    this.changed();
  }

  // A list item one level in (under the item above) or out; the items under it come along.
  private shiftItem(b: Extract<Block, { kind: 'li' }>, dir: 1 | -1) {
    const i = this.index(b.id);
    const items = this.note.blocks;
    let indent: string;
    if (dir > 0) {
      const prev = items[i - 1];
      if (!prev || prev.kind !== 'li' || prev.indent.length < b.indent.length) return;
      indent = prev.indent + ' '.repeat(prev.marker.length + 1);
      if (indent.length <= b.indent.length) return;
    } else {
      if (!b.indent) return;
      const parent = items.slice(0, i).reverse().find((x) => x.kind === 'li' && x.indent.length < b.indent.length) as Extract<Block, { kind: 'li' }> | undefined;
      indent = parent?.indent ?? '';
    }
    const delta = indent.length - b.indent.length;
    const pos = this.caret();
    this.put({ ...b, indent, edited: true });
    for (let k = i + 1; k < items.length; k++) {
      const c = items[k];
      if (c.kind !== 'li' || c.indent.length <= b.indent.length) break;
      const moved = delta > 0 ? ' '.repeat(delta) + c.indent : c.indent.slice(Math.min(-delta, c.indent.length));
      this.put({ ...c, indent: moved, edited: true });
    }
    if (pos) this.place(pos);
    this.changed();
  }

  // ---- Keys ----

  private onKeyDown(e: KeyboardEvent) {
    // Keep the game's own keys (WASD, arrows, Space) from walking about behind the book.
    e.stopPropagation();
    if (this.slash && this.hooks.slashKey(e)) {
      e.preventDefault();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const pos = this.caret();
    const b = pos ? this.block(pos.id) : undefined;
    if (mod && !e.altKey) {
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (k === 'a' && !pos?.cell && b?.kind !== 'code') return run(() => this.selectAll());
      if (k === 'z') return run(() => this.undo(e.shiftKey));
      if (k === 'y') return run(() => this.undo(true));
      if (k === 's' && !e.shiftKey) return run(() => this.hooks.onSave());
      if (k === 'b') return run(() => this.format('b'));
      if (k === 'i') return run(() => this.format('i'));
      if (k === 'u') return run(() => this.format('u'));
      if (k === 'e') return run(() => this.format('code'));
      if (k === 's' && e.shiftKey) return run(() => this.format('s'));
      if (k === 'h' && e.shiftKey) return run(() => this.highlight(this.highlightColor));
      if (e.key === 'Enter') return run(() => this.toggleTask());
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.enter(e.shiftKey);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!pos || !b) return;
      if (b.kind === 'table' && pos.cell) this.tableTab(pos, e.shiftKey);
      else if (b.kind === 'li') {
        this.remember(false);
        this.shiftItem(b, e.shiftKey ? -1 : 1);
      } else if (b.kind === 'code' && !e.shiftKey) document.execCommand('insertText', false, '  ');
      return;
    }
    if (e.key === 'ArrowDown' && b?.kind === 'code' && pos && pos.offset >= b.code.length) {
      // Out of a code block at its end: to the block after, made if there isn't one.
      e.preventDefault();
      this.leaveBlock(b);
    }
  }

  private leaveBlock(b: Block) {
    const next = this.note.blocks[this.index(b.id) + 1];
    if (isText(next)) this.place({ id: next.id, offset: 0 });
    else {
      this.remember(false);
      const p = this.newBlock({ kind: 'p', runs: [] });
      this.insertAfter(b, p);
      this.place({ id: p.id, offset: 0 });
      this.changed();
    }
  }

  private onMouseDown(e: MouseEvent) {
    // Ticking a box keeps the caret where it is.
    if ((e.target as HTMLElement).closest('.rn-box')) e.preventDefault();
  }

  private onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const box = target.closest('.rn-box');
    if (box) {
      const id = Number(box.closest<HTMLElement>('.rn-b')!.dataset.id);
      this.toggleTask(id);
      return;
    }
    const link = target.closest<HTMLElement>('a.rn-link');
    if (link && (e.metaKey || e.ctrlKey)) window.open(link.dataset.href, '_blank', 'noreferrer');
  }

  // A raw block edited as Markdown, in place: Enter with ⌘ or leaving it puts it back.
  private onDoubleClick(e: MouseEvent) {
    const node = (e.target as HTMLElement).closest<HTMLElement>('.rn-raw');
    if (!node) return;
    const b = this.block(Number(node.dataset.id));
    if (!b || b.kind !== 'raw') return;
    const area = el('textarea', 'rn-rawedit');
    area.value = b.src;
    area.rows = Math.min(16, b.src.split('\n').length + 1);
    node.textContent = '';
    this.unrender.get(b.id)?.();
    this.unrender.delete(b.id);
    node.appendChild(area);
    area.focus();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      if (!keep || area.value === b.src) {
        this.put(b);
        return;
      }
      this.remember(false);
      const fresh = parseNote(area.value.replace(/\r\n?/g, '\n')).blocks.map((x) => ({ ...x, was: null }) as Block);
      let after: Block = b;
      for (const x of fresh) {
        this.insertAfter(after, x);
        after = x;
      }
      this.remove(b);
      this.changed();
    };
    area.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        finish(true);
      }
    });
    area.addEventListener('blur', () => finish(true));
  }

  // ⌘A: the whole note, first line to last (not the title over it).
  selectAll() {
    const texts = this.note.blocks.filter(isText);
    const first = texts[0];
    const last = texts[texts.length - 1];
    if (!first || !last) return;
    const a = this.containerFor({ id: first.id, offset: 0 });
    const z = this.containerFor({ id: last.id, offset: 0 });
    if (!a || !z) return;
    const range = document.createRange();
    range.setStart(...pointAt(a, 0));
    range.setEnd(...pointAt(z, runsLength(last.runs)));
    const s = document.getSelection()!;
    s.removeAllRanges();
    s.addRange(range);
  }

  // ---- Formatting ----

  // The text ranges the selection covers, block by block (or cell by cell).
  private ranges(): { pos: Pos; from: number; to: number }[] {
    const sel = this.selection();
    if (!sel || sel.collapsed) return [];
    const { from, to } = sel;
    if (this.sameContainer(from, to)) return [{ pos: from, from: from.offset, to: to.offset }];
    const out: { pos: Pos; from: number; to: number }[] = [];
    const i = this.index(from.id);
    const j = this.index(to.id);
    for (let k = i; k <= j; k++) {
      const b = this.note.blocks[k];
      if (!isText(b)) continue;
      const len = runsLength(b.runs);
      out.push({ pos: { id: b.id, offset: 0 }, from: k === i && !from.cell ? from.offset : 0, to: k === j && !to.cell ? to.offset : len });
    }
    return out.filter((r) => r.to > r.from);
  }

  private restyle(change: (runs: Run[], a: number, b: number) => Run[], toggle?: (m: Marks) => Marks) {
    const ranges = this.ranges();
    if (ranges.length === 0) {
      // Nothing selected: it's for what's typed next.
      const pos = this.caret();
      if (!pos || !toggle) return;
      this.stored = toggle(this.stored ?? marksAt(this.runsAt(pos), pos.offset));
      this.storedAt = pos;
      this.report();
      return;
    }
    this.remember(false);
    const sel = this.selection()!;
    for (const r of ranges) this.setRuns(r.pos, change(this.runsAt(r.pos), r.from, r.to), true);
    // The same text stays selected.
    const s = document.getSelection()!;
    const first = ranges[0];
    const last = ranges[ranges.length - 1];
    const a = this.containerFor(first.pos.cell ? first.pos : sel.from.cell ? sel.from : { id: first.pos.id, offset: 0 });
    const z = this.containerFor(last.pos.cell ? last.pos : sel.to.cell ? sel.to : { id: last.pos.id, offset: 0 });
    if (a && z) {
      const range = document.createRange();
      range.setStart(...pointAt(a, first.from));
      range.setEnd(...pointAt(z, last.to));
      s.removeAllRanges();
      s.addRange(range);
    }
    this.changed();
  }

  format(mark: Toggle) {
    this.restyle(
      (runs, a, b) => toggleMark(runs, a, b, mark),
      (m) => {
        const next = { ...m };
        if (next[mark]) delete next[mark];
        else next[mark] = true;
        return next;
      },
    );
  }

  highlight(color: string) {
    this.highlightColor = color;
    this.restyle(
      (runs, a, b) => highlight(runs, a, b, color),
      (m) => {
        const next = { ...m };
        if (next.hl === color) delete next.hl;
        else next.hl = color;
        return next;
      },
    );
  }

  clearFormatting() {
    this.restyle((runs, a, b) => clearMarks(runs, a, b));
  }

  toggleTask(id?: number) {
    const target = id ?? this.caret()?.id;
    const b = target !== undefined ? this.block(target) : undefined;
    if (!b || b.kind !== 'li' || b.task === null) return;
    this.remember(false);
    const pos = this.caret();
    this.put({ ...b, task: !b.task, edited: true });
    if (pos && pos.id === b.id) this.place(pos);
    this.changed();
  }

  // ---- The "/" menu ----

  private openSlash(id: number, caret: number) {
    const runs = this.block(id) && this.runsAt({ id, offset: 0 });
    const text = visibleText(runs ?? []);
    const before = text[caret - 2];
    if (caret === 1 || before === undefined || /\s/.test(before)) this.slash = { id, start: caret - 1 };
    this.updateSlash();
  }

  private updateSlash() {
    if (!this.slash) return;
    const pos = this.caret();
    const text = pos && pos.id === this.slash.id && !pos.cell ? visibleText(this.runsAt(pos)) : '';
    const query = pos ? text.slice(this.slash.start + 1, pos.offset) : '';
    if (!pos || pos.id !== this.slash.id || pos.offset <= this.slash.start || text[this.slash.start] !== '/' || !/^[\p{L}\p{N}-]{0,20}$/u.test(query)) {
      this.closeSlash();
      return;
    }
    const s = document.getSelection()!;
    const rect = s.getRangeAt(0).getClientRects()[0] ?? this.containerFor(pos)!.getBoundingClientRect();
    const box = this.root.getBoundingClientRect();
    const scale = box.width / (this.root.offsetWidth || 1);
    this.hooks.onSlash({ x: (rect.left - box.left) / scale, y: (rect.bottom - box.top) / scale, query });
  }

  closeSlash() {
    if (!this.slash) return;
    this.slash = null;
    this.hooks.onSlash(null);
  }

  applySlash(cmd: SlashCommand, today = new Date()) {
    const slash = this.slash;
    const pos = this.caret();
    this.closeSlash();
    if (!slash || !pos || pos.id !== slash.id) return;
    const b = this.block(pos.id);
    if (!isText(b)) return;
    this.remember(false);
    const runs = deleteRange(b.runs, slash.start, pos.offset);
    const at = slash.start;
    const empty = runsLength(runs) === 0;
    const base = { ...b, runs, edited: true } as TextBlock;
    const toKind = (next: Block) => {
      this.put(next);
      this.place({ id: next.id, offset: Math.min(at, isText(next) ? runsLength(next.runs) : 0) });
    };
    switch (cmd.id) {
      case 'text':
        toKind({ ...base, kind: 'p' } as Block);
        break;
      case 'h1':
      case 'h2':
      case 'h3':
        toKind({ ...base, kind: 'h', level: Number(cmd.id[1]) } as Block);
        break;
      case 'bullet':
        toKind({ ...base, kind: 'li', indent: base.kind === 'li' ? base.indent : '', marker: '-', task: null } as Block);
        break;
      case 'number':
        toKind({ ...base, kind: 'li', indent: base.kind === 'li' ? base.indent : '', marker: '1.', task: null } as Block);
        break;
      case 'todo':
        toKind({ ...base, kind: 'li', indent: base.kind === 'li' ? base.indent : '', marker: '-', task: false } as Block);
        break;
      case 'quote':
        toKind({ ...base, kind: 'quote' } as Block);
        break;
      case 'callout':
        toKind({ ...base, kind: 'quote', runs: insertRuns(runs, 0, [{ text: '💡 ', m: {} }]) } as Block);
        break;
      case 'date':
        this.put(base);
        this.place({ id: b.id, offset: at });
        this.changed();
        this.insertText(today.toISOString().slice(0, 10));
        return;
      default: {
        // Blocks of their own: in place of an empty line, else after this one.
        const made =
          cmd.id === 'divider'
            ? this.newBlock({ kind: 'hr' })
            : cmd.id === 'code'
              ? this.newBlock({ kind: 'code', lang: '', code: '' })
              : this.newBlock({
                  kind: 'table',
                  align: [null, null] as Align[],
                  rows: [[[{ text: 'Column 1', m: {} }], [{ text: 'Column 2', m: {} }]], [[], []]],
                });
        if (empty) {
          this.put({ ...made, id: b.id, gap: b.gap, was: b.was } as Block);
        } else {
          this.put(base);
          this.insertAfter(base, made);
        }
        const placed = empty ? this.block(b.id) : made;
        if (placed.kind === 'hr') {
          const p = this.newBlock({ kind: 'p', runs: [] });
          this.insertAfter(placed, p);
          this.place({ id: p.id, offset: 0 });
        } else if (placed.kind === 'code') this.place({ id: placed.id, offset: 0 });
        else this.place({ id: placed.id, cell: [0, 0], offset: 0 }, 'Column 1'.length);
      }
    }
    this.changed();
  }

  // ---- Tables ----

  private tableTab(pos: Pos, back: boolean) {
    const b = this.block(pos.id) as Extract<Block, { kind: 'table' }>;
    let [r, c] = pos.cell!;
    const cols = b.align.length;
    if (back) {
      if (c > 0) c--;
      else if (r > 0) [r, c] = [r - 1, cols - 1];
    } else if (c < cols - 1) c++;
    else {
      r++;
      c = 0;
      if (r >= b.rows.length) {
        this.remember(false);
        this.put({ ...b, rows: [...b.rows, Array.from({ length: cols }, () => [])], edited: true });
        this.changed();
      }
    }
    this.selectCell(b.id, r, c);
  }

  private selectCell(id: number, r: number, c: number) {
    const b = this.block(id) as Extract<Block, { kind: 'table' }>;
    this.place({ id, cell: [r, c], offset: 0 }, runsLength(b.rows[r]?.[c] ?? []));
  }

  private tableEnter(pos: Pos) {
    const b = this.block(pos.id) as Extract<Block, { kind: 'table' }>;
    const [r] = pos.cell!;
    const cols = b.align.length;
    this.remember(false);
    if (r === b.rows.length - 1 && r > 0 && b.rows[r].every((cell) => runsLength(cell) === 0)) {
      // Enter on an empty last row: the row goes and the caret leaves the table.
      this.put({ ...b, rows: b.rows.slice(0, -1), edited: true });
      this.leaveBlock(this.block(b.id));
      this.changed();
      return;
    }
    if (r === b.rows.length - 1) this.put({ ...b, rows: [...b.rows, Array.from({ length: cols }, () => [])], edited: true });
    this.selectCell(b.id, r + 1, 0);
    this.changed();
  }

  tableOp(op: 'row-below' | 'col-right' | 'del-row' | 'del-col') {
    const pos = this.caret();
    if (!pos?.cell) return;
    const b = this.block(pos.id) as Extract<Block, { kind: 'table' }>;
    let [r, c] = pos.cell;
    const cols = b.align.length;
    let rows = b.rows.map((row) => Array.from({ length: cols }, (_, i) => row[i] ?? []));
    let align = [...b.align];
    if (op === 'row-below') {
      rows.splice(r + 1, 0, Array.from({ length: cols }, () => []));
      r++;
      c = 0;
    } else if (op === 'col-right') {
      rows = rows.map((row) => [...row.slice(0, c + 1), [], ...row.slice(c + 1)]);
      align.splice(c + 1, 0, null);
      c++;
    } else if (op === 'del-row') {
      if (rows.length === 1) return;
      rows.splice(r, 1);
      r = Math.min(r, rows.length - 1);
    } else {
      if (cols === 1) return;
      rows = rows.map((row) => row.filter((_, i) => i !== c));
      align = align.filter((_, i) => i !== c);
      c = Math.min(c, cols - 2);
    }
    this.remember(false);
    this.put({ ...b, rows, align, edited: true });
    this.selectCell(b.id, r, c);
    this.changed();
  }

  insertTable() {
    const pos = this.caret();
    const b = pos ? this.block(pos.id) : this.note.blocks[this.note.blocks.length - 1];
    this.remember(false);
    const table = this.newBlock({
      kind: 'table',
      align: [null, null] as Align[],
      rows: [[[{ text: 'Column 1', m: {} }], [{ text: 'Column 2', m: {} }]], [[], []]],
    });
    if (isText(b) && runsLength(b.runs) === 0) this.put({ ...table, id: b.id, gap: b.gap, was: b.was } as Block);
    else this.insertAfter(b, table);
    const placed = isText(b) && runsLength(b.runs) === 0 ? b.id : table.id;
    this.selectCell(placed, 0, 0);
    this.changed();
  }

  // ---- Copying: the selection as Markdown, so pasting it keeps its formatting ----

  private onCopy(e: ClipboardEvent, cut: boolean) {
    const sel = this.selection();
    if (!sel || sel.collapsed || !e.clipboardData) return;
    let md: string;
    if (this.sameContainer(sel.from, sel.to)) {
      const b = this.block(sel.from.id);
      if (b.kind === 'code') return;
      md = serializeInline(sliceRuns(this.runsAt(sel.from), sel.from.offset, sel.to.offset)).md;
    } else {
      const i = this.index(sel.from.id);
      const j = this.index(sel.to.id);
      const blocks = this.note.blocks.slice(i, j + 1).map((b, k, all) => {
        if (!isText(b)) return { ...b, was: null } as Block;
        const len = runsLength(b.runs);
        const a = k === 0 && !sel.from.cell ? sel.from.offset : 0;
        const z = k === all.length - 1 && !sel.to.cell ? sel.to.offset : len;
        return { ...b, runs: sliceRuns(b.runs, a, z), edited: true, was: null } as Block;
      });
      md = serializeNote({ blocks: blocks.map((b, k) => ({ ...b, gap: k ? b.gap : '' }) as Block), tail: '' });
    }
    e.preventDefault();
    e.clipboardData.setData('text/plain', md);
    if (cut) this.deleteSelection();
  }

  // ---- For the tutorial ----

  focusEnd() {
    const last = [...this.note.blocks].reverse().find(isText);
    if (last) this.place({ id: last.id, offset: runsLength(last.runs) });
  }

  typeAtEnd(text: string) {
    this.focusEnd();
    if (text) this.insertText(text);
  }
}

const nextMarker = (marker: string) => {
  const m = /^(\d+)([.)])$/.exec(marker);
  return m ? `${Number(m[1]) + 1}${m[2]}` : marker;
};

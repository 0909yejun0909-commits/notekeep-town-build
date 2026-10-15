// A note's title, renamed by clicking it: a text box opens over it, Enter or clicking away
// renames the note and Escape leaves it as it was. The box is its own, outside any editor on the
// page, so its keys never reach the editor or the game. `rename` resolves false (or throws) when
// the note couldn't be renamed.
export function makeTitleEditable(el: HTMLElement, title: string, rename: (title: string) => Promise<boolean>): () => void {
  let committed = title;
  let box: HTMLInputElement | null = null;
  el.textContent = title;
  el.title = 'Click to rename this note';
  el.classList.add('note-title-edit');

  const open = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (box) return;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const scale = rect.width / (el.offsetWidth || rect.width || 1);
    const input = document.createElement('input');
    box = input;
    input.className = 'note-title-edit note-title-box';
    input.value = committed;
    input.maxLength = 120;
    input.spellcheck = false;
    Object.assign(input.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${parseFloat(style.lineHeight) * scale || rect.height}px`,
      fontFamily: style.fontFamily,
      fontSize: `${parseFloat(style.fontSize) * scale}px`,
      fontWeight: style.fontWeight,
      color: style.color,
      zIndex: '10000',
    });
    let done = false;
    const close = async (keep: boolean) => {
      if (done) return;
      done = true;
      const next = input.value.replace(/\s+/g, ' ').trim();
      if (keep && next && next !== committed) {
        input.disabled = true;
        let ok = false;
        try {
          ok = await rename(next);
        } catch {
          ok = false;
        }
        if (ok) {
          committed = next;
          el.textContent = next;
        }
      }
      input.remove();
      el.style.visibility = '';
      box = null;
    };
    const stop = (ev: Event) => ev.stopPropagation();
    for (const t of ['keyup', 'keypress', 'beforeinput', 'input', 'paste', 'copy', 'cut', 'mousedown', 'click']) input.addEventListener(t, stop);
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        void close(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        void close(false);
      }
    });
    input.addEventListener('blur', () => void close(true));
    document.body.appendChild(input);
    el.style.visibility = 'hidden';
    input.focus();
    input.select();
  };
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  el.addEventListener('click', open);
  el.addEventListener('mousedown', swallow);
  return () => {
    el.removeEventListener('click', open);
    el.removeEventListener('mousedown', swallow);
    box?.remove();
  };
}

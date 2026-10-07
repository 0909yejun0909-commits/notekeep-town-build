'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sceneLabels, type SceneLabel } from '@/game/sceneLabels';

// Sizes in game pixels; the scene says how many CSS px one game pixel is.
const FONT = 14;
const PAD_X = 2;
const PAD_Y = 1;

function signature(labels: SceneLabel[]) {
  return labels
    .map((l) => [l.id, l.text, l.suffix, l.color, l.bare, l.action?.text, l.px, l.font, Math.round(l.maxWidth ?? 0)].join('|'))
    .join('\n');
}

export default function SceneLabels() {
  const [labels, setLabels] = useState<SceneLabel[]>([]);
  const [fontsReady, setFontsReady] = useState(0);
  const live = useRef<SceneLabel[]>([]);
  const boxes = useRef(new Map<string, HTMLDivElement>());
  const names = useRef(new Map<string, HTMLSpanElement>());

  useEffect(() => {
    let raf = 0;
    let last = '';
    const place = () => {
      const next = sceneLabels();
      live.current = next;
      const sig = signature(next);
      if (sig !== last) {
        last = sig;
        setLabels(next);
      }
      for (const l of next) {
        const el = boxes.current.get(l.id);
        if (el) el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(${-l.ox * 100}%, ${-l.oy * 100}%)`;
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    document.fonts?.ready.then(() => setFontsReady((n) => n + 1));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Cut long names until their label fits; measured here because only the page knows the
  // font's real widths.
  useLayoutEffect(() => {
    for (const l of labels) {
      const box = boxes.current.get(l.id);
      const name = names.current.get(l.id);
      if (!box || !name || l.maxWidth === undefined) continue;
      name.textContent = l.text;
      for (let n = l.text.length - 1; n > 0 && box.offsetWidth > l.maxWidth; n--) {
        name.textContent = `${l.text.slice(0, n).trimEnd()}..`;
      }
      if (box.offsetWidth > l.maxWidth) name.textContent = '';
    }
  }, [labels, fontsReady]);

  if (labels.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {labels.map((l) => (
        <div
          key={l.id}
          ref={(el) => {
            if (el) boxes.current.set(l.id, el);
            else boxes.current.delete(l.id);
          }}
          className="absolute left-0 top-0 flex items-center whitespace-nowrap"
          style={{
            fontFamily: "'ArcadeClassic', 'CuteFantasy', monospace",
            fontSize: (l.font ?? FONT) * l.px,
            lineHeight: 1,
            wordSpacing: '0.4em',
            color: l.color ?? '#f4e4c1',
            gap: 2 * l.px,
            transform: `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(${-l.ox * 100}%, ${-l.oy * 100}%)`,
          }}
        >
          <span
            style={l.bare ? undefined : { background: '#3f2832', padding: `${PAD_Y * l.px}px ${PAD_X * l.px}px` }}
          >
            <span
              ref={(el) => {
                if (el) names.current.set(l.id, el);
                else names.current.delete(l.id);
              }}
            >
              {l.text}
            </span>
            {l.suffix}
          </span>
          {l.action && (
            <span
              role="button"
              className="pointer-events-auto cursor-pointer"
              style={{ background: '#3f2832', padding: `${PAD_Y * l.px}px ${PAD_X * l.px}px`, color: l.action.color }}
              onPointerDown={(e) => {
                e.preventDefault();
                live.current.find((x) => x.id === l.id)?.action?.onClick();
              }}
            >
              {l.action.text}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { bus } from '@/game/bus';
import Coin from './Coin';
import styles from './TownEditor.module.css';
import { useWallet } from '@/lib/walletStore';
import {
  BRUSH, GROUND_KINDS, TOWN_PROPS, TREE_CUT_PRICE, type TownPropId, type TownPropSpec, type TownTool,
} from '@/lib/townEdits';

type Tab = 'decorate' | 'ground' | 'trees' | 'remove';
const TABS: Array<[Tab, string]> = [
  ['decorate', 'Decorate'],
  ['ground', 'Ground'],
  ['trees', 'Trees'],
  ['remove', 'Pick up'],
];

const GROUND_SWATCH: Record<string, string> = { path: '#e4a672', tall: '#265c42', grass: '#3e8948' };

const sameTool = (a: TownTool | null, b: TownTool) => JSON.stringify(a) === JSON.stringify(b);

// 9x9 pixel icons for the axe and the bag, drawn 4x.
const ICONS = {
  axe: {
    rows: ['..WWW....', '.WWWWW...', '.WWWWD...', '..WWD....', '....D....', '....D....', '....D....', '....D....', '....D....'],
    palette: { W: '#c2cbd6', D: '#91533b' } as Record<string, string>,
  },
  bag: {
    rows: ['...OOO...', '..O...O..', '.OOOOOOO.', '.OYYYYYO.', '.OYYYYYO.', '.OYYYYYO.', '.OYYYYYO.', '..OOOOO..', '.........'],
    palette: { O: '#1f1418', Y: '#c8964f' } as Record<string, string>,
  },
};

function PixelIcon({ name }: { name: keyof typeof ICONS }) {
  const { rows, palette } = ICONS[name];
  return (
    <svg width={36} height={36} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (palette[c] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={palette[c]} /> : null)),
      )}
    </svg>
  );
}

// A decoration's picture, cut from the game's own loaded texture.
function Thumb({ spec }: { spec: TownPropSpec }) {
  const [src, setSrc] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => {
    const textures = (window as any).__game?.textures;
    if (!textures?.exists(spec.art.key)) return;
    const frame = textures.getFrame(spec.art.key, spec.art.frame);
    const url = frame ? textures.getBase64(spec.art.key, spec.art.frame) : '';
    if (url) setSrc({ url, w: frame.width, h: frame.height });
  }, [spec]);
  if (!src) return <span className={styles.thumbMissing} />;
  // Whole-number scaling only, so the pixels stay square.
  const scale = Math.max(1, Math.floor(40 / Math.max(src.w, src.h)));
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.thumb} src={src.url} alt="" width={src.w * scale} height={src.h * scale} />;
}

// The building bar: pick a decoration, a ground to paint, the axe or pick-up, then click the
// town (OverworldScene does the placing and charges the coins). Opened from the biome plank.
export default function TownEditor() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('decorate');
  const [tool, setTool] = useState<TownTool | null>(null);
  const [bag, setBag] = useState<Partial<Record<TownPropId, number>>>({});
  const [note, setNote] = useState<string | null>(null);
  const wallet = useWallet();

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setTab('decorate');
      setTool(null);
      setNote(null);
    };
    const onEdited = ({ bag: next }: { bag: Partial<Record<TownPropId, number>> }) => setBag({ ...next });
    const onMessage = ({ text }: { text: string }) => setNote(text);
    bus.on('open-town-editor', onOpen);
    bus.on('town-edited', onEdited);
    bus.on('town-message', onMessage);
    return () => {
      bus.off('open-town-editor', onOpen);
      bus.off('town-edited', onEdited);
      bus.off('town-message', onMessage);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(t);
  }, [note]);

  // Esc finishes, like the other editors.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      done();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  function pick(next: TownTool) {
    const t = sameTool(tool, next) ? null : next;
    setTool(t);
    setNote(null);
    bus.emit('town-tool', { tool: t });
  }

  function done() {
    setOpen(false);
    setTool(null);
    bus.emit('town-tool', { tool: null });
    bus.emit('close-town-editor', undefined);
  }

  const keep = (e: React.MouseEvent) => e.preventDefault();
  const hint =
    !tool ? 'Pick something below, then click the town. Walk with the arrow keys to reach other spots.'
    : tool.kind === 'prop' ? 'Click the town to place it. Green tiles are free.'
    : tool.kind === 'ground' ? `Click or drag to paint ${BRUSH}x${BRUSH} tiles at a time.`
    : tool.kind === 'cut' ? 'Click a tree to cut it down. Trees in the forest edge open up more room.'
    : 'Click a decoration you placed to put it back in your bag. Placing it again is free.';

  return (
    <div className={styles.bar} data-panel="town-editor">
      <div className={styles.head}>
        <span className={styles.title}>Build</span>
        {wallet.active && (
          <span className={styles.coins} title="Your coins">
            <Coin size={18} />
            {wallet.balance}
          </span>
        )}
        <span className={note ? `${styles.hint} ${styles.note}` : styles.hint}>{note ?? hint}</span>
        <button className={`${styles.btn} ${styles.done}`} onMouseDown={keep} onClick={done}>
          Done
        </button>
      </div>

      <div className={styles.tabs}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={`${styles.btn} ${tab === id ? styles.on : ''}`}
            onMouseDown={keep}
            onClick={() => {
              setTab(id);
              if (id === 'trees') pick({ kind: 'cut' });
              else if (id === 'remove') pick({ kind: 'remove' });
              else if (tool && (tool.kind === 'cut' || tool.kind === 'remove')) pick(tool);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.items}>
        {tab === 'decorate' &&
          TOWN_PROPS.map((spec) => {
            const owned = bag[spec.id] ?? 0;
            const t: TownTool = { kind: 'prop', item: spec.id };
            return (
              <button
                key={spec.id}
                className={`${styles.item} ${sameTool(tool, t) ? styles.picked : ''}`}
                title={`${spec.name}: ${owned ? `${owned} in your bag` : `${spec.price} coins`}`}
                onMouseDown={keep}
                onClick={() => pick(t)}
              >
                <span className={styles.art}>
                  <Thumb spec={spec} />
                </span>
                <span className={styles.name}>{spec.name}</span>
                <span className={styles.price}>
                  {owned ? `x${owned}` : (<><Coin size={12} />{spec.price}</>)}
                </span>
              </button>
            );
          })}

        {tab === 'ground' &&
          GROUND_KINDS.map((g) => {
            const t: TownTool = { kind: 'ground', paint: g.id };
            return (
              <button
                key={g.id}
                className={`${styles.item} ${sameTool(tool, t) ? styles.picked : ''}`}
                onMouseDown={keep}
                onClick={() => pick(t)}
              >
                <span className={styles.art}>
                  <span className={styles.swatch} style={{ background: GROUND_SWATCH[g.id] }} />
                </span>
                <span className={styles.name}>{g.name}</span>
                <span className={styles.price}>
                  {g.price ? (<><Coin size={12} />{g.price} a tile</>) : 'Free'}
                </span>
              </button>
            );
          })}

        {tab === 'trees' && (
          <button
            className={`${styles.item} ${tool?.kind === 'cut' ? styles.picked : ''}`}
            onMouseDown={keep}
            onClick={() => pick({ kind: 'cut' })}
          >
            <span className={styles.art}>
              <PixelIcon name="axe" />
            </span>
            <span className={styles.name}>Cut down</span>
            <span className={styles.price}>
              <Coin size={12} />
              {TREE_CUT_PRICE} a tree
            </span>
          </button>
        )}

        {tab === 'remove' && (
          <button
            className={`${styles.item} ${tool?.kind === 'remove' ? styles.picked : ''}`}
            onMouseDown={keep}
            onClick={() => pick({ kind: 'remove' })}
          >
            <span className={styles.art}>
              <PixelIcon name="bag" />
            </span>
            <span className={styles.name}>Pick up</span>
            <span className={styles.price}>Free</span>
          </button>
        )}
      </div>
    </div>
  );
}

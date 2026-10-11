'use client';

import { useEffect, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import Coin from './Coin';
import styles from './TownEditor.module.css';
import { useWallet } from '@/lib/walletStore';
import { replaceWorld, useVault } from '@/lib/vault/open';
import {
  BRUSH, GROUND_KINDS, TOWN_PROPS, type TownPropId, type TownPropSpec, type TownTool,
} from '@/lib/townEdits';

type Tab = 'decorate' | 'ground' | 'houses' | 'remove';
const TABS: Array<[Tab, string]> = [
  ['decorate', 'Decorate'],
  ['ground', 'Ground'],
  ['houses', 'Houses'],
  ['remove', 'Pick up'],
];


const GROUND_SWATCH: Record<string, string> = { path: '#e4a672', tall: '#265c42', water: '#0095e9', grass: '#3e8948' };

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
  house: {
    rows: ['....R....', '...RRR...', '..RRRRR..', '.RRRRRRR.', 'RRRRRRRRR', '.WWWWWWW.', '.WDDWWNW.', '.WDDWWWW.', '.WDDWWWW.'],
    palette: { R: '#b13e53', W: '#c8964f', D: '#6d483b', N: '#73eff7' } as Record<string, string>,
  },
  folder: {
    rows: ['.........', 'OOOO.....', 'OYYYOOOOO', 'OYYYYYYYO', 'OYYYYYYYO', 'OYYYYYYYO', 'OYYYYYYYO', 'OOOOOOOOO', '.........'],
    palette: { O: '#1f1418', Y: '#f7c948' } as Record<string, string>,
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
  const { vault } = useVault();
  const [houseName, setHouseName] = useState('');
  const [adding, setAdding] = useState(false);
  // A new house being placed in town: its name, and the folder's files if it brings notes in.
  const [placing, setPlacing] = useState<{ name: string; files: File[] | null } | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const folderInput = useRef<HTMLInputElement>(null);

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

  // Once the house has a spot in town, it's built there: the town is rebuilt around it, which
  // ends building.
  useEffect(() => {
    const onSpot = async ({ gx, gy, regionId }: { gx: number; gy: number; regionId: string }) => {
      const p = placingRef.current;
      if (!p || !vault?.createHouse) return;
      setAdding(true);
      try {
        const { world, houseId } = p.files && vault.importHouse
          ? await vault.importHouse(regionId, p.name, p.files.map((f) => ({ path: f.webkitRelativePath.split('/').slice(1).join('/'), file: f })))
          : await vault.createHouse(regionId, p.name);
        bus.emit('pin-houses', { houseId, gx, gy });
        setPlacing(null);
        setHouseName('');
        replaceWorld(world);
        done();
      } catch (err) {
        setNote(err instanceof Error ? err.message : "Couldn't build that house.");
        cancelPlacing();
      } finally {
        setAdding(false);
      }
    };
    bus.on('house-spot', onSpot);
    return () => bus.off('house-spot', onSpot);
  }, [vault]);

  // Esc puts down a house being placed, or else finishes, like the other editors.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (placingRef.current) cancelPlacing();
      else done();
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

  function cancelPlacing() {
    if (!placingRef.current) return;
    setPlacing(null);
    bus.emit('cancel-place-house', undefined);
  }

  function done() {
    cancelPlacing();
    setOpen(false);
    setTool(null);
    bus.emit('town-tool', { tool: null });
    bus.emit('close-town-editor', undefined);
  }

  const keep = (e: React.MouseEvent) => e.preventDefault();
  const hint =
    placing ? `Click the town where "${placing.name}" should go. It turns red where something's in the way. Esc to cancel.`
    : tab === 'houses' ? 'Houses are free. Start an empty one to write in, or bring in a folder of notes from your computer.'
    : !tool ? 'Pick something below, then click the town. Walk with the arrow keys to reach other spots.'
    : tool.kind === 'prop' ? 'Click the town to place it. Green tiles are free.'
    : tool.kind === 'ground' ? `Click or drag to paint ${BRUSH}x${BRUSH} tiles at a time.`
    : 'Click a decoration you placed to put it back in your bag. Placing it again is free.';

  // A new house is a new folder. First it's placed: the town shows it under the pointer.
  function startHouse(files?: FileList | null) {
    if (!vault?.createHouse || adding) return;
    const picked = files ? [...files] : null;
    const folderName = picked?.[0]?.webkitRelativePath.split('/')[0] ?? '';
    const name = houseName.trim() || folderName;
    if (!name) return setNote('Give the house a name first.');
    setNote(null);
    setPlacing({ name, files: picked });
    bus.emit('place-house', { name });
  }
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
        {placing && (
          <button className={styles.btn} onMouseDown={keep} onClick={cancelPlacing}>
            Cancel
          </button>
        )}
        <button className={`${styles.btn} ${styles.done}`} data-tour="build-done" onMouseDown={keep} onClick={done}>
          Done
        </button>
      </div>

      <div className={styles.tabs}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            data-tour={`build-tab-${id}`}
            className={`${styles.btn} ${tab === id ? styles.on : ''}`}
            onMouseDown={keep}
            onClick={() => {
              cancelPlacing();
              setTab(id);
              if (id === 'remove') pick({ kind: 'remove' });
              // Houses aren't painted or placed like decorations: put the tool down.
              else if (id === 'houses') {
                if (tool) pick(tool);
              } else if (tool && tool.kind === 'remove') pick(tool);
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

        {tab === 'houses' && (
          <div className={styles.houses}>
            {vault?.createHouse ? (
              <>
                <input
                  className={styles.field}
                  value={houseName}
                  maxLength={60}
                  placeholder="House name"
                  spellCheck={false}
                  data-tour="house-name"
                  onChange={(e) => setHouseName(e.target.value)}
                  // Typed letters must not walk the player.
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') startHouse();
                  }}
                  onKeyUp={(e) => e.stopPropagation()}
                />
                <button className={styles.item} data-tour="new-house" disabled={adding} onMouseDown={keep} onClick={() => startHouse()}>
                  <span className={styles.art}>
                    <PixelIcon name="house" />
                  </span>
                  <span className={styles.name}>Empty house</span>
                  <span className={styles.price}>Free</span>
                </button>
                {vault.importHouse && (
                  <button
                    className={styles.item}
                    data-tour="house-from-folder"
                    disabled={adding}
                    onMouseDown={keep}
                    onClick={() => folderInput.current?.click()}
                  >
                    <span className={styles.art}>
                      <PixelIcon name="folder" />
                    </span>
                    <span className={styles.name}>From a folder</span>
                    <span className={styles.price}>Free</span>
                  </button>
                )}
                <input
                  ref={folderInput}
                  type="file"
                  hidden
                  multiple
                  {...{ webkitdirectory: '', directory: '' }}
                  onChange={(e) => {
                    startHouse(e.target.files);
                    e.target.value = '';
                  }}
                />
              </>
            ) : (
              <span className={styles.hint}>Houses can't be added in this town.</span>
            )}
          </div>
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

const ROWS = [
  '..OOOO..',
  '.OYYYYO.',
  'OYHYYYSO',
  'OHYYYYSO',
  'OYYYYYSO',
  'OYYYYSSO',
  '.OSSSSO.',
  '..OOOO..',
];
const COLOR: Record<string, string> = { O: '#7a3e10', Y: '#f7c948', H: '#fff4b3', S: '#d08a1c' };

export default function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden style={{ flex: 'none' }}>
      {ROWS.flatMap((row, y) =>
        [...row].map((c, x) => (COLOR[c] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={COLOR[c]} /> : null)),
      )}
    </svg>
  );
}

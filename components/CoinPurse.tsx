'use client';

import { useEffect, useState } from 'react';
import { MIN_WORDS, NOTE_REWARD } from '@/lib/wallet';
import { useWallet, type Notice } from '@/lib/walletStore';
import Coin from './Coin';
import styles from './CoinPurse.module.css';
import { endTutorial } from '@/lib/tutorial';

// 9x9 pixel house for the Home button, drawn like the biome picker's icons.
const HOME_ICON = ['....O....', '...ORO...', '..ORRRO..', '.ORRRRRO.', 'OOOOOOOOO', '.OWWWWWO.', '.OWWDWWO.', '.OWWDWWO.', '.OOOOOOO.'];
const HOME_COLOR: Record<string, string> = { O: '#3f2832', R: '#c0392b', W: '#f4e4c1', D: '#91533b' };

// Back to the title screen. A reload, like the study session's "Back to title": every
// scene, overlay and wallet starts clean, and everything worth keeping is already saved.
function goHome() {
  endTutorial();
  window.location.assign(window.location.pathname);
}

export default function CoinPurse() {
  const wallet = useWallet();
  const [shown, setShown] = useState<Notice | null>(null);

  useEffect(() => {
    if (!wallet.notice) return;
    setShown(wallet.notice);
    const t = setTimeout(() => setShown(null), 5000);
    return () => clearTimeout(t);
  }, [wallet.notice]);

  if (!wallet.active) return null;

  return (
    <div className={styles.corner} data-hud>
      <div className={styles.bar}>
        <button className={styles.home} data-tour="home" title="Back to the title screen" onClick={goHome}>
          <svg width={27} height={27} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden>
            {HOME_ICON.flatMap((row, y) =>
              [...row].map((c, x) => (HOME_COLOR[c] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={HOME_COLOR[c]} /> : null)),
            )}
          </svg>
          Home
        </button>
        <div
          className={styles.purse}
          data-tour="coins"
          title={`Every new note of ${MIN_WORDS}+ words earns ${NOTE_REWARD} coins. Spend them on furniture, house upgrades, outfits and town biomes.`}
        >
          <Coin size={24} />
          <span key={wallet.balance} className={styles.amount}>{wallet.balance}</span>
        </div>
      </div>
      {shown && (
        <div key={shown.id} className={styles.toast} onClick={() => setShown(null)}>
          <span className={styles.gain}>
            <Coin size={18} />+{shown.amount}
          </span>
          <span className={styles.text}>{shown.text}</span>
        </div>
      )}
    </div>
  );
}

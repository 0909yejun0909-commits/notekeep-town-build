'use client';

import { useEffect, useState } from 'react';
import { MIN_WORDS, NOTE_REWARD } from '@/lib/wallet';
import { useWallet, type Notice } from '@/lib/walletStore';
import Coin from './Coin';
import styles from './CoinPurse.module.css';

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
    <div className={styles.corner}>
      <div
        className={styles.purse}
        title={`Every new note of ${MIN_WORDS}+ words earns ${NOTE_REWARD} coins. Spend them on furniture: open CUSTOMIZE inside any house.`}
      >
        <Coin size={24} />
        <span key={wallet.balance} className={styles.amount}>{wallet.balance}</span>
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

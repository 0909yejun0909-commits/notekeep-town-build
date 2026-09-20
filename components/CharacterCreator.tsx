'use client';

import styles from './CharacterCreator.module.css';

export default function CharacterCreator({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.preview}>
        <div className={`${styles.layer} ${styles.hair}`} />
        <div className={`${styles.layer} ${styles.shirt}`} />
        <div className={`${styles.layer} ${styles.pants}`} />
        <div className={`${styles.layer} ${styles.shoes}`} />
      </div>
    </div>
  );
}

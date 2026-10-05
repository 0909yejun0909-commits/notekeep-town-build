import type { ReactNode } from 'react';
import styles from './TitleFrame.module.css';
import pixel from './pixelUi.module.css';

// The ribbon title and vignette shared by every pre-vault screen (TitleMenu, JoinScreen).
export default function TitleFrame({ subtitle, hint, children }: {
  subtitle: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={pixel.ribbon}>Notekeep Town</h1>
        <p className={`${pixel.outlined} ${styles.subtitle}`}>{subtitle}</p>
      </header>

      <div className={styles.stage}>
        {children}
        {hint && <p className={`${pixel.outlined} ${styles.hint}`}>{hint}</p>}
      </div>
    </div>
  );
}

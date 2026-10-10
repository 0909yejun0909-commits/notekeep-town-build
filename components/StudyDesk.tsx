'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bus } from '@/game/bus';
import { sfx } from '@/game/audio/sfx';
import { useVault } from '@/lib/vault/open';
import { loadHouseCards } from '@/lib/houseCards';
import { MIN_CARDS, buildQuiz, isRight, passed, shuffle, type Question } from '@/lib/quiz';
import { studyPassed } from '@/lib/walletStore';
import type { Card } from '@/lib/flashcards';
import type { House } from '@/lib/types';
import styles from './StudyDesk.module.css';

type Mode = 'flashcards' | 'quiz';
const ALL = '';

// Keep Phaser's window-level key handlers (WASD, arrows, Space) from eating keystrokes.
const stopKeys = (e: React.KeyboardEvent) => e.stopPropagation();

// Keys the desk handles itself, before Phaser or the page see them.
function useKeys(handler: (e: KeyboardEvent) => boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!handler(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
}

// Opened from a desk (InteriorScene): flashcards or a quiz made from every note in the house.
export default function StudyDesk() {
  const { vault } = useVault();
  const [open, setOpen] = useState<{ houseId: string; mode: Mode } | null>(null);
  const [data, setData] = useState<{ house: House | null; cards: Card[] } | null>(null);
  const [room, setRoom] = useState(ALL);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const onOpen = (o: { houseId: string; mode: Mode }) => {
      setOpen(o);
      setData(null);
      setRoom(ALL);
      setRound((r) => r + 1);
      sfx('pageOpen');
    };
    const onTravel = () => setOpen(null);
    bus.on('open-study', onOpen);
    bus.on('fast-travel', onTravel);
    return () => {
      bus.off('open-study', onOpen);
      bus.off('fast-travel', onTravel);
    };
  }, []);

  useEffect(() => {
    if (!open || !vault) return;
    let live = true;
    loadHouseCards(vault, open.houseId).then((d) => {
      if (live) setData(d ?? { house: null, cards: [] });
    });
    return () => {
      live = false;
    };
  }, [open, vault]);

  const close = () => {
    setOpen(null);
    sfx('pageClose');
    bus.emit('close-study', undefined);
  };

  useKeys((e) => {
    if (!open || e.key !== 'Escape') return false;
    close();
    return true;
  });

  const cards = useMemo(() => (data ? data.cards.filter((c) => room === ALL || c.roomId === room) : []), [data, room]);
  const rooms = useMemo(() => (data?.house ? data.house.rooms.filter((r) => data.cards.some((c) => c.roomId === r.id)) : []), [data]);

  if (!open) return null;

  return (
    <div className={styles.screen} onClick={close}>
      <div className={styles.desk} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span className={styles.title}>
            {open.mode === 'quiz' ? 'Quiz' : 'Flashcards'}
            {data?.house ? ` · ${data.house.name}` : ''}
          </span>
          {rooms.length > 1 && (
            <select
              className={styles.select}
              value={room}
              onChange={(e) => {
                setRoom(e.target.value);
                setRound((r) => r + 1);
                e.target.blur();
              }}
              onKeyDown={stopKeys}
            >
              <option value={ALL}>Whole house</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
          <button className={styles.close} onClick={close} aria-label="Close">×</button>
        </header>
        {!data ? (
          <p className={styles.hint}>Gathering your notes…</p>
        ) : cards.length < MIN_CARDS ? (
          <NeedCards count={cards.length} />
        ) : open.mode === 'flashcards' ? (
          <Flashcards key={round} cards={cards} houseId={open.houseId} onDone={close} />
        ) : (
          <Quiz key={round} cards={cards} houseId={open.houseId} onDone={close} />
        )}
      </div>
    </div>
  );
}

function NeedCards({ count }: { count: number }) {
  return (
    <div className={styles.help}>
      <p>
        {count === 0
          ? 'No study cards in this house yet.'
          : `Only ${count} study card${count === 1 ? '' : 's'} here. A desk needs ${MIN_CARDS}.`}
      </p>
      <p>Write lines like these in any note in this house:</p>
      <pre className={styles.example}>
        {'Mitosis :: cell division\n- Osmosis: water crossing a membrane\nQ: What makes ATP?\nA: The mitochondria\nThe ==nucleus== holds the DNA.'}
      </pre>
    </div>
  );
}

function SourceLink({ card, houseId }: { card: Card; houseId: string }) {
  return (
    <button
      className={styles.link}
      onClick={() => {
        bus.emit('close-study', undefined);
        bus.emit('fast-travel', { houseId, roomId: card.roomId, noteId: card.noteId });
      }}
    >
      {card.noteTitle}
    </button>
  );
}

function Flashcards({ cards, houseId, onDone }: { cards: Card[]; houseId: string; onDone: () => void }) {
  const [deck, setDeck] = useState(() => shuffle(cards));
  const [flipped, setFlipped] = useState(false);
  const [agains, setAgains] = useState(0);
  const card = deck[0];

  const flip = () => {
    setFlipped((f) => !f);
    sfx('open');
  };
  const again = () => {
    setDeck(([c, ...rest]) => [...rest, c]);
    setAgains((n) => n + 1);
    setFlipped(false);
    sfx('close');
  };
  const gotIt = () => {
    setDeck(([, ...rest]) => rest);
    setFlipped(false);
    sfx('select');
  };

  useKeys((e) => {
    if (!card) {
      if (e.key !== 'Enter' && e.key !== ' ') return false;
      onDone();
      return true;
    }
    if (e.key === ' ' || e.key === 'Enter') flip();
    else if (e.key === 'ArrowLeft' && flipped) again();
    else if (e.key === 'ArrowRight' && flipped) gotIt();
    else return false;
    return true;
  });

  if (!card) {
    return (
      <div className={styles.result}>
        <p className={styles.score}>Deck done!</p>
        <p>
          {cards.length} cards, {agains === 0 ? 'every one first try' : `${agains} again${agains === 1 ? '' : 's'}`}.
        </p>
        <button className={styles.button} onClick={onDone}>Close</button>
      </div>
    );
  }

  return (
    <div className={styles.flashcards}>
      <p className={styles.count}>{deck.length} left</p>
      <button className={`${styles.card} ${flipped ? styles.flipped : ''}`} onClick={flip}>
        <span className={styles.side}>{flipped ? 'answer' : card.kind === 'cloze' ? 'fill the blank' : 'question'}</span>
        <span className={styles.face}>{flipped ? card.back : card.front}</span>
      </button>
      <p className={styles.source}>from <SourceLink card={card} houseId={houseId} /></p>
      {flipped ? (
        <div className={styles.row}>
          <button className={styles.button} onClick={again}>← Again</button>
          <button className={styles.button} onClick={gotIt}>Got it →</button>
        </div>
      ) : (
        <p className={styles.hint}>Space flips the card</p>
      )}
    </div>
  );
}

function Quiz({ cards, houseId, onDone }: { cards: Card[]; houseId: string; onDone: () => void }) {
  const [questions] = useState<Question[]>(() => buildQuiz(cards));
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<{ given: number | string; right: boolean } | null>(null);
  const [typed, setTyped] = useState('');
  const [reward, setReward] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = questions[i];

  useEffect(() => {
    if (q?.kind === 'type' && !picked) inputRef.current?.focus();
  }, [q, picked]);

  const answer = (given: number | string) => {
    if (picked || !q) return;
    const right = isRight(q, given);
    setPicked({ given, right });
    if (right) setCorrect((n) => n + 1);
    sfx(right ? 'select' : 'error');
  };

  const next = () => {
    setPicked(null);
    setTyped('');
    setI(i + 1);
    if (i + 1 === questions.length && passed(correct, questions.length)) setReward(studyPassed());
  };

  useKeys((e) => {
    if (!q) {
      if (e.key !== 'Enter' && e.key !== ' ') return false;
      onDone();
      return true;
    }
    if (picked && (e.key === 'Enter' || e.key === ' ')) next();
    else if (!picked && q.kind === 'choice' && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) - 1);
    else return false;
    return true;
  });

  if (!q) {
    const ok = passed(correct, questions.length);
    return (
      <div className={styles.result}>
        <p className={styles.score}>{correct} / {questions.length}</p>
        <p>
          {!ok
            ? 'Not quite: 70% passes. Try again?'
            : reward > 0
              ? `Passed! +${reward} coins for studying today.`
              : 'Passed! Today’s study reward is already yours.'}
        </p>
        <button className={styles.button} onClick={onDone}>Close</button>
      </div>
    );
  }

  return (
    <div className={styles.quiz}>
      <p className={styles.count}>Question {i + 1} of {questions.length}</p>
      {q.kind === 'type' && (
        <p className={styles.side}>{q.card.kind === 'cloze' ? 'Fill in the blank' : 'Which term is this?'}</p>
      )}
      <p className={styles.prompt}>{q.prompt}</p>
      {q.kind === 'choice' ? (
        <ol className={styles.options}>
          {q.options.map((o, n) => (
            <li key={n}>
              <button
                className={[
                  styles.option,
                  picked && n === q.answer ? styles.right : '',
                  picked && n === picked.given && !picked.right ? styles.wrong : '',
                ].join(' ')}
                disabled={!!picked}
                onClick={() => answer(n)}
              >
                <kbd className={styles.kbd}>{n + 1}</kbd>
                <span>{o}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!picked && typed.trim()) answer(typed);
          }}
        >
          <input
            ref={inputRef}
            className={`${styles.input} ${picked ? (picked.right ? styles.right : styles.wrong) : ''}`}
            value={typed}
            disabled={!!picked}
            placeholder="Type your answer, then Enter"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
          />
        </form>
      )}
      {picked && (
        <div className={styles.feedback}>
          <p className={picked.right ? styles.good : styles.bad}>
            {picked.right ? 'Right!' : `Answer: ${q.kind === 'choice' ? q.options[q.answer] : q.answer}`}
          </p>
          <p className={styles.source}>from <SourceLink card={q.card} houseId={houseId} /></p>
          <button className={styles.button} onClick={next}>
            {i + 1 < questions.length ? 'Next' : 'Finish'} ↵
          </button>
        </div>
      )}
    </div>
  );
}

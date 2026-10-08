# Furniture functions: study desk, computer, games console

**Date:** 2026-10-08
**Branch:** `furniture-functions`, off `stardew-catalog` (ab3bc55); worktree `~/Projects/notekeep-town-furniture-functions`

## Intent

Furniture today either holds a note or does something for feel (sit, lie, change outfit). Jason
wants pieces that *do* something useful or fun when you walk up and press Space:

- a **desk** quizzes you and shows flashcards made from your notes;
- a **computer** is a productivity tool: it searches your vault and the web, and refuses to open
  distracting sites;
- a **games console** plays small games built from your notes.

Success: on the demo vault, a player can walk to each of these pieces, press Space, and get a
working overlay; passing a quiz pays coins and grows a daily streak.

### Decisions Jason made

| Question | Answer |
|---|---|
| Quiz/flashcard source | Parsed from notes, **no AI** |
| Which notes | **Whole house** (with an in-overlay room filter) |
| Rewards | Small **daily** reward **with a Duolingo-style streak** |
| Computer | In-game browser screen, **productivity-focused, blocks sites** |
| Blocking | Default blocklist the player **can edit** |
| Console | **Note-powered** arcade games |
| Study tables | **Desks + writing desks** only |
| Art | **Drawn in-house** with a Pillow script |
| Architecture | Extend `FURNITURE_ACTIONS`, one self-contained overlay per function |

## Architecture

`FurnitureAction` (lib/catalog.ts) gains `'study' | 'computer' | 'arcade'`. `InteriorScene`
already stores one action per approach tile and runs it on Space; each new action emits a bus
event that a self-contained React overlay listens for, exactly like `Wardrobe` and `Bookshelf`.

```
InteriorScene (Space at piece)
  ├─ 'study'    → choice menu [Flashcards, Quiz] → bus 'open-study' {houseId, mode}   → StudyDesk.tsx
  ├─ 'computer' → bus 'open-computer' {houseId}                                      → Computer.tsx
  └─ 'arcade'   → bus 'open-arcade'   {houseId}                                      → Arcade.tsx
each overlay closes with 'close-study' / 'close-computer' / 'close-arcade'
```

`InteriorScene.overlayOpen()` counts the three new overlays as open, and closing any of them
calls `input.keyboard.resetKeys()` (the existing JustDown fix).

### Approach-tile conflicts

One approach tile can now carry several things (a note, a desk, a computer standing on the
desk). Rules:

1. A **tabletop** piece's action beats the action of the surface it stands on (a computer on a
   desk is a computer, not a study desk).
2. If more than one option applies, Space opens the existing `ChoiceMenu` listing them, in this
   order: *Read note*, then the tabletop piece's action (*Use computer* / *Play games*), then
   the surface's action (*Study*). The bed's existing *Read note / Lie down* menu becomes a case
   of this rule.
3. A study desk on its own still opens the *Flashcards / Quiz* menu (plus *Read note* if it
   holds one).

To support rule 2, `InteriorScene.actions` stores a list of actions per approach tile instead of
one.

## Unit 1: `lib/flashcards.ts` (pure, tested)

```ts
type Card = {
  id: string;            // `${noteId}#${index}`, stable across reloads
  noteId: string; noteTitle: string; roomId: string;
  kind: 'pair' | 'cloze';
  front: string;         // pair: the term / question; cloze: the sentence with ____ in place of the answer
  back: string;          // the definition / answer / missing words
};
extractCards(note: { id; title; roomId }, md: string): Card[]
```

Formats recognised, in priority order on each line (a line yields at most one card):

| Source | Example | Card |
|---|---|---|
| Inline double colon | `Mitosis :: cell division` | pair |
| Q/A pair | `Q: …` line then `A: …` line | pair |
| Bullet with separator | `- Mitosis: cell division` / `- Mitosis - cell division` / `– ` / `— ` | pair |
| Highlight | `The ==mitochondria== makes ATP.` | cloze (one card per sentence; all highlights in it blanked) |
| Heading + first paragraph | `## Mitosis` then a paragraph | pair (front = heading, back = first sentence of the paragraph, trimmed to 160 chars) |

Ignored: YAML frontmatter, fenced code blocks, `%%comments%%`, HTML. Markdown links,
wikilinks, emphasis and inline code are stripped to plain text in `front`/`back` (reuse
`plainPreview`'s stripping where it fits). Pair cards need a non-empty front of at most 80
chars and a non-empty back. A heading card is skipped if any other card came from that
heading's section. Cards are de-duplicated on lowercased `front`, keeping the first one.

`lib/houseCards.ts` (client side) reads every note in a house through the vault handle,
runs `extractCards`, and caches the result per house. The cache is invalidated on
`world-updated`.

## Unit 2: Study desk (`components/StudyDesk.tsx`)

Header: house name and a room filter (`Whole house` by default, then each room with cards).
Uses the cream paper look of the note reader.

**Too few cards.** With fewer than 4 cards in scope, the overlay says so and shows the formats
above as an example ("write `term :: definition` lines in your notes").

**Flashcards.** Shuffled deck. Space or a click flips the card; ← = *again* (moves the card to
the back of the deck), → = *got it* (removes it). The session ends when the deck is empty, with
a "N cards, M agains" summary. Each card shows "from *Note title*"; clicking it opens that note
(`open-note`). No long-term scheduling.

**Quiz.** `buildQuiz(cards, n = 10, rng)` in `lib/quiz.ts` (pure, tested):
- pair card → multiple choice with 4 options: the right `back` plus 3 distractors drawn from
  other pair cards' `back`s in scope. Distractors are unique, never equal to the answer (after
  case-folding), and prefer the same room. If fewer than 3 distractors exist, the card becomes
  a type-the-answer question instead;
- cloze card → type the missing words. Answers are checked case-insensitively, ignoring
  punctuation and extra whitespace.

There is immediate right/wrong feedback (existing menu sounds) and a results screen at the end.
A quiz passes at **≥ 70%**.

## Unit 3: Study reward and streak (`lib/wallet.ts`, `lib/walletStore.ts`)

`WalletData` gains `streak: { days: number; lastDay: string | null }`, where `lastDay` is a local
`YYYY-MM-DD`. Saves without `streak` load as `{ days: 0, lastDay: null }`.

Pure functions (tested):

```ts
STUDY_REWARD = 5; STREAK_BONUS_CAP = 10;
currentStreak(streak, today): number      // days if lastDay is today or yesterday, else 0
settleStudy(data, today): { data, earned } // called when a quiz passes
```

`settleStudy`: if `lastDay === today`, nothing changes (one reward per day, town-wide). Otherwise
`days` becomes `days + 1` if `lastDay` was yesterday and `1` otherwise. The player earns
`STUDY_REWARD + min(days - 1, STREAK_BONUS_CAP)`, and `lastDay` becomes today. So the first day
pays 5, each further day in a row pays 1 more, and day 11 onward pays 15.

`walletStore` exposes `studyPassed()`, which publishes a coin notice ("Study streak: 4 days! +9").
The demo town (key null) keeps the streak in memory only, like its wallet.

**UI.** A 🔥 *N* badge next to the coin purse shows `currentStreak`. It is grey when you haven't
studied today and orange once you have. With a streak of 0 the badge reads "Study at a desk to
start a streak".

## Unit 4: Computer (`components/Computer.tsx`)

A retro CRT desktop overlay: pixel bezel, faint scanlines, a "NoteNet" browser window with one
search bar, a bookmarks strip (Google, Wikipedia, Google Scholar) and a Settings icon.

- **Vault results** appear live as you type, ranked by the same function as Cmd/Ctrl+K.
  `FastTravel.tsx`'s ranking moves to `lib/noteSearch.ts` and both use it; FastTravel's
  behaviour doesn't change. Picking a result closes the computer and emits `fast-travel` with
  the note.
- **Web.** Enter with no vault hits, or the "Search Google for '…'" button, opens
  `https://www.google.com/search?q=…` in a new tab. Input that looks like a URL or domain
  (`wikipedia.org`, `https://…`) opens that site. Bookmarks open their search with the current
  query, or their home page if the query is empty. Everything goes through `lib/safeUrl.ts`
  and opens with `noopener`.
- **Blocking.** Every outgoing URL and query goes through `isBlocked(input, list)` in
  `lib/blocklist.ts` (pure, tested) first. A URL is blocked if its host equals a listed domain or
  is a subdomain of one. A query is blocked if any word of it matches a listed site's name
  (`youtube`, `tiktok`, …; the name is the domain minus its TLD, plus aliases such as `x.com` →
  `twitter`). A blocked request shows a full-screen pixel **"Back to work!"** card naming the
  site, with a button back to the desktop; nothing opens.
- **Default list:** youtube.com, tiktok.com, instagram.com, x.com (alias twitter.com), reddit.com,
  facebook.com, twitch.tv, netflix.com, discord.com, snapchat.com, pinterest.com.
- **Settings** lists the blocked sites with a remove button each, an add field (normalised to a
  bare domain) and *Reset to defaults*. The list is saved per vault in localStorage under the
  wallet's key scheme with a `:blocklist` suffix; the demo town keeps it in memory.
- **Stated limit:** the blocking applies only to what the computer opens. The settings screen
  says so in one line.

Keys: Esc closes; typing is not captured by Phaser while the overlay is open.

## Unit 5: Games console (`components/Arcade.tsx`)

A TV-screen overlay with a cartridge menu. Cartridges are an array of `{ id, name, minCards,
Component }`, so adding a game later is one entry. Both games use the house's pair cards and show
a per-house high score (localStorage, `:arcade` suffix; in memory for the demo town).
Cartridges needing more cards than the house has are greyed out ("needs 8 cards"). Games pay
**no coins** and **don't count toward the streak**.

1. **Word Rain** (`minCards: 4`). A definition shows at the bottom; four terms fall from the
   top (the right one and three others). Type the right term and press Enter before it lands.
   Right: +1 score, next round falls 8% faster. A wrong answer or a landing costs a life, and
   three lives are lost means game over. It uses `requestAnimationFrame`, paused while the tab is
   hidden.
2. **Match** (`minCards: 8`). A 4×4 grid of face-down tiles holds 8 terms and their 8
   definitions. Flip two at a time; a term with its own definition stays face up. The score is
   moves and time, and lower is better.

## Unit 6: Art and catalogue

`scripts/draw-tech.py` (Pillow) draws `public/art/tech.png`, a 16 px sheet using colours sampled
from the Kenmi furniture sheets. Unlike Kenmi art, **this file is committed**: `/public/assets` is
gitignored, so it lives at `public/art/`. `furnitureSheetUrl` maps the `tech` sheet there, so the
pieces work without re-running `install-assets.sh`.

| id | name | category | layer | footprint | sprite | tier | action |
|---|---|---|---|---|---|---|---|
| `computer_crt` | Desktop computer | `computer` | tabletop | 1×1 | 16×16 | uncommon | computer |
| `laptop` | Laptop | `laptop` | tabletop | 1×1 | 16×16 | uncommon | computer |
| `computer_desk` | Computer desk | `computer_desk` | floor | 2×1 | 32×32 (overhangs) | rare | computer |
| `tv_console` | TV and games console | `tv_console` | floor | 2×1 | 32×32 (overhangs) | rare | arcade |
| `arcade_cabinet` | Arcade cabinet | `arcade` | floor | 1×1 | 16×32 (overhangs) | treasure | arcade |

A new catalogue group **Tech** holds these five categories. `FURNITURE_ACTIONS` adds `desk` and
`writing_desk` → `study`, `computer`, `laptop` and `computer_desk` → `computer`, and `tv_console`
and `arcade` → `arcade`.

**Demo vault.** `lib/vault/demo.ts` notes get a few `term :: definition` lines, Q/A pairs and
highlights, so that at least one demo house has ≥ 8 pair cards. One demo room also gets a desk
with a computer on it and a TV console, so every feature can be demoed without a real vault.

## Testing

Unit tests (`*.test.mts`, `npm test`):
- `flashcards.test.mts`: each format; frontmatter, code fences and comments are ignored; link and
  emphasis stripping; heading-card suppression; de-duplication; stable ids.
- `quiz.test.mts`: distractors are unique, never the answer, and fall back to typing; cloze
  answer checking; the pass threshold.
- `blocklist.test.mts`: domain, subdomain, `https://m.youtube.com/watch`, query words, aliases,
  whole-word matching only (`youtube cats` is blocked; `redditch weather` is not), normalising
  added entries.
- `wallet.test.mts` additions: first study, same day twice, next day, a gap of two days, the
  bonus cap, and loading an old save without `streak`.
- `catalog.test.mts` existing invariants cover the new pieces (unique ids, overhang rules).

Headless browser check on the demo vault (Playwright flow used before, with
`fps.forceSetTimeOut`): walk to the desk → Flashcards and Quiz both open, a passed quiz raises
the balance and turns the 🔥 badge orange; the computer on the desk shows the *Use computer /
Study* menu; searching `youtube` shows *Back to work!* and opens no tab; searching a vault note
fast-travels; removing youtube in Settings then lets it through; the TV console opens the
cartridge menu, and both games start and end.

## Out of scope

AI-generated questions, long-term spaced repetition, streak freezes, coins from games,
browser-wide site blocking (would need an extension), embedding web pages in the game.

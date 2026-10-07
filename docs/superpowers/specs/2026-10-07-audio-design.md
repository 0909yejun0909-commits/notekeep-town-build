# Music and sound effects — design

**Goal:** give the town a soundtrack played on real instruments, and give actions a voice.

## Decisions (agreed with Jason, 2026-10-07)

- **Recorded instruments, not chiptune.** First built as pure synthesis; Jason wanted "less
  8-bit, more of an actual instrumental", so the music plays recorded notes from the FluidR3 GM
  soundfont (CC BY 3.0), one note every three semitones, pitched to the rest. A generated
  reverb sits on the music. ~1.7 MB in `public/audio/`, fetched by `npm run fetch-samples`.
- **Recorded foley** from Kenney's RPG Audio pack (CC0), ~300 KB of WAVs in `public/sfx/`:
  doors, book and pages, cloth, creaks, coins, indoor footsteps.
- **Five looping tracks**, one per place. Each scene's `create()` names its place; a new place's
  recordings load first, then it crossfades in over about a second. The same place again (a
  restart on resize, the next room of a house) leaves the music playing.
- **The desert should feel Arabic:** maqam Hijaz on D, ney (shakuhachi) and mizmar (shanai)
  melodies with turns and slides, an oud-like nylon guitar ostinato, a cello drone, and the
  maqsum rhythm on darbuka (taiko doum, synthesized tek) and riq.
- **Mute only, no sliders.** HUD speaker button above Travel and the `M` key, remembered in
  localStorage (`notekeep-town:muted`).
- **Local only.** Study-session guests each hear their own game.

## Places

| Place | Melody | Accompaniment | Low end | Percussion | Footsteps |
|---|---|---|---|---|---|
| title (waltz, D) | piano | piano chords, strings | acoustic bass | — | — |
| forest (G) | flute | nylon guitar arpeggios | acoustic bass | shaker | synth grass |
| snow (F) | celesta | harp, strings | cello | — | synth crunch |
| desert (D Hijaz) | ney, then mizmar | oud ostinato | cello drone | darbuka, riq | synth sand |
| indoors (C) | music box | harp Alberti | piano | — | recorded wood |

## Sound effects

| Sound | Source |
|---|---|
| door open / close | recorded: entering/leaving a house, moving between rooms, fast travel |
| book open + page, book close | recorded: notes and bookshelf |
| page flip | recorded: editors and bed menu opening/closing |
| cloth | recorded: wardrobe, lying down |
| creak + cushion | recorded + synth: sitting |
| coin | celesta + recorded coins |
| buy, error, menu move/select | marimba phrases (buy adds coins) |
| NPC talk | kalimba phrase |
| place furniture | synth wood knock |

## Layout

| File | Job |
|---|---|
| `lib/music.ts` | Pure: note names, the pattern mini-language, step timing. |
| `lib/tracks.ts` | Pure data: the five tracks. |
| `lib/samples.ts` | Instruments, which recordings exist, melodic SFX phrases, the foley list. |
| `lib/music.test.mts` | Parser, timing, bar alignment, and that every needed recording is on disk. |
| `scripts/fetch-samples.mts` | Downloads exactly the soundfont notes `requiredSamples()` lists. |
| `game/audio/engine.ts` | AudioContext, buses, reverb, sample loading, unlock, mute, tab hide. |
| `game/audio/voices.ts` | Sample playback with pitch/slide, and the synthesized percussion. |
| `game/audio/music.ts` | Look-ahead sequencer, preloading and crossfading `setPlace(place)`. |
| `game/audio/sfx.ts` | Named effects and `footstep()`. |
| `game/audio/events.ts` | Bus listeners; a burst of events plays only its most important sound. |
| `components/SoundToggle.tsx` | The HUD mute button. |

## Pattern mini-language

One string per part, whitespace-separated tokens, one token per step (`|` is ignored). `E5` a
note, `C4+E4+G4` a chord, `x` a drum hit, `.` a rest; `*n` makes a token last n steps. Each part
loops on its own length, so a one-bar drum loop runs under a 24-bar tune.

## Browser rules

The `AudioContext` is only created on the first pointer or key press, so there is no autoplay
warning. Recordings start downloading as soon as a place is named and decode once audio is
unlocked. Phaser's own sound manager is disabled (`audio.noAudio`). Audio is suspended while the
tab is hidden or muted; effects asked for then are dropped rather than queued.

## Testing

`npm test` covers the parser, timing, track shape and that every recording exists. A headless
Chrome run taps the output with an AnalyserNode to confirm each place is audible without
clipping and that no audio file 404s. How it sounds is checked by ear.

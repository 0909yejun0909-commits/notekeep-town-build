# Music and sound effects — design

**Goal:** give the town a soundtrack and give actions a voice, without adding a single audio
file: everything is synthesized in the browser with the Web Audio API, so the Vercel deploy and
every open-source clone sound the same, with nothing to license or install.

## Decisions (agreed with Jason, 2026-10-07)

- **Synthesized, not sampled.** Chiptune instruments (pulse lead, triangle bass, noise
  percussion, bell, pluck, pad) built from oscillators and a noise buffer. No dependencies.
- **Five looping tracks**, one per place: title, Forest, Snow, Desert, indoors. Each scene's
  `create()` names its place; changing place crossfades over about a second, and re-entering the
  same place (a scene restart on resize, a room change) leaves the music playing.
- **Mute only, no sliders.** A small speaker button in the HUD and the `M` key toggle all sound;
  the choice is remembered in localStorage (`notekeep-town:muted`).
- **Local only.** Study-session guests each hear their own game; nothing goes over the relay.

## Layout

| File | Job |
|---|---|
| `lib/music.ts` | Pure: note names to frequencies, the pattern mini-language, step timing. |
| `lib/tracks.ts` | Pure data: the five tracks, written in that mini-language. |
| `lib/music.test.mts` | Parser and timing tests, and a check that every track's parts line up on bar lines. |
| `game/audio/engine.ts` | The one `AudioContext`, master/music/SFX buses, unlock on first gesture, mute, tab hide. |
| `game/audio/voices.ts` | The instruments: `(ctx, dest, time, freq, dur, gain)` one-shots. |
| `game/audio/music.ts` | Look-ahead sequencer and crossfading `setPlace(place)`. |
| `game/audio/sfx.ts` | Named one-shot effects, plus `footstep()` keyed to the current surface. |
| `game/audio/events.ts` | Bus listeners that play effects for doors, notes, menus, NPCs, edits. |
| `components/SoundToggle.tsx` | The HUD mute button. |

## Pattern mini-language

One string per part, whitespace-separated tokens, one token per step (`|` is ignored, for
reading bars). `E5` a note, `C4+E4+G4` a chord, `x` a drum hit, `.` a rest; `*n` makes a token
last n steps. Each part loops on its own length, so a one-bar drum loop runs under a 32-bar tune.

## Places, music and footsteps

| Place | Track | Footstep |
|---|---|---|
| `title` | gentle D-major waltz | — |
| `forest` | bright G-major pastoral, light kick and hat | grass |
| `snow` | slow F-major bells over a pad | crunch |
| `desert` | plucky A Phrygian-dominant, hand-drum tresillo | sand |
| `indoors` | C-major music box over Alberti pluck | wood |

## Sound effects

Doors (enter/exit house, fast travel), page open/close (notes, bookshelf), NPC talk blips, coin
chime (wallet notice), buy and can't-afford (furniture shop), place (editor commits), panel
open/close (wardrobe, editors, bed menu), sit, lie, title-menu move/select, footsteps.

## Browser rules

The `AudioContext` is only created on the first pointer or key press (the title menu already
needs one), so there is no autoplay warning; the place requested before that starts then.
Audio is suspended while the tab is hidden or muted, and resumed when neither holds.

## Testing

`npm test` covers the parser, timing and track shape. Everything audible is checked by ear.

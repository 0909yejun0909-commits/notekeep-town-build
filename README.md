# Notekeep Town

Point this app at your real Obsidian vault, and your folders become a walkable pixel town.
Regions, houses, rooms — and every note is a piece of furniture you walk up to and read.

Built live in a 90-minute build event by four people working in parallel Claude sessions on
one type contract. No database, no auth, no backend — your vault is read straight off disk in
the browser via the File System Access API.

| Your vault | Becomes |
| --- | --- |
| Top-level folder | A **region** with its own biome |
| Second-level folder | A **house** you can walk into |
| Third-level folder | A **room** inside that house |
| A `.md` note | A piece of **furniture** you walk up to and open |

## Stack

Next.js (App Router) + TypeScript + Tailwind + Phaser 3 (`^3.90.0` — `npm install phaser`
installs v4, which breaks every v3 scene API this project uses).

## Running it

```bash
npm install
```

**Art:** this project uses [Kenmi's Cute Fantasy](https://kenmi-art.itch.io/) 16×16 packs.
Kenmi's licence permits commercial use and modification but forbids redistribution, so the
asset files are gitignored and not part of this repo. To run the game with real art:

1. Buy the packs from Kenmi's itch.io page and unzip them somewhere, e.g. `~/kenmi-art`.
2. Run `scripts/install-assets.sh public/assets` (set `KENMI=/path/to/packs` if your packs
   live somewhere other than `~/kenmi-art`). This copies the ~100 specific files the game
   uses into `public/assets/`, which is gitignored.
3. `npm run dev` and open `http://localhost:3000`.

Without the art installed, the game will still run but textures will be missing.

Click **"Try the demo town"** to explore a sample vault with no setup, or **"Open your
vault"** to pick your own Obsidian vault folder (Chrome/Edge only — the File System Access
API isn't supported in Firefox/Safari).

## Studying together

A host can invite friends into their town: everyone walks around as their own character
and chats, and guests can open the host's notes. It needs one small relay server, which
never sees note or chat contents — everything is end-to-end encrypted, and the key only
exists in the invite link's `#fragment`, which browsers never send to any server.

```bash
npm run relay                                          # ws://localhost:8787
echo 'NEXT_PUBLIC_RELAY_URL=ws://localhost:8787' > .env.local
npm run dev
```

Open your vault, click **Invite friends**, and send the link. Guests can join from any
modern browser. If they have the same vault synced locally they can pick their copy, and
notes load from their own disk. Press **T** to chat.

- **Hosting the relay:** `relay/server.mts` is a single file with one dependency (`ws`)
  and no database. Run it anywhere with Node 22.18+ (`PORT` sets the port). Put it behind
  TLS and use a `wss://` URL when the app itself is served over HTTPS. Behind a proxy, set
  `CLIENT_IP_HEADER` to the header carrying the real client address so the
  20-connections-per-address cap works. For Fly.io: set a unique `app` name in
  `relay/fly.toml`, then `fly launch --no-deploy --copy-config relay` once and
  `fly deploy relay --ha=false`. Rooms live in memory, so run exactly one instance.
- **What guests can see:** your folder names and note titles, always. Note contents and
  images only while you share "Town + notes" (the default); switch to "Town only" at any
  time. Guests can't edit anything.
- **Limits:** 16 people per session; images and notes up to 4 MB each. The session ends
  when the host leaves.
- Without `NEXT_PUBLIC_RELAY_URL` the app is exactly the solo game — no invite button,
  no network traffic.
- `npm test` runs the relay, encryption, protocol and session tests (Node's built-in
  runner, no extra dependencies).

## How it's built

- `lib/vault/` — walks the picked directory, parses folders/notes into the `WorldModel`
  (`lib/types.ts`) shared by every scene.
- `game/scenes/OverworldScene.ts` — the outdoor town: tilemap, biomes, roads, collision.
- `game/scenes/InteriorScene.ts` — house interiors, furniture placement, the note reader.
- `game/scenes/TitleScene.ts` — title screen, character customization, NPCs.
- `components/` — React UI overlaid on the Phaser canvas (note reader, vault picker, HUD).
  All player-facing UI is React; nothing is drawn as UI inside Phaser itself.
- `lib/multiplayer/` and `relay/` — optional study sessions (see below).

`docs/` and `CLAUDE.md` are kept as-is from the original four-person build: they document the
type contract, file ownership, and the constraints (locked Phaser version, integer pixel
zoom, etc.) that made the parallel build possible, and are still useful context for anyone
extending the game.

## Credits

- Art: [Kenmi — Cute Fantasy](https://kenmi-art.itch.io/) (not redistributed, see above).
- Built by the Notekeep Town team.

## License

MIT — see [LICENSE](LICENSE). The MIT license covers the code in this repository only; it
does not grant any rights to the Kenmi art assets, which are not included in this repo.

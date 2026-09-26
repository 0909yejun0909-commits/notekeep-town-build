# Credit economy — design

**Goal:** make note-taking feel rewarding. Writing notes earns coins; coins buy furniture for
your houses.

## Decisions (agreed with Jason, 2026-09-26)

- **Two ways to earn, one ledger.** Notes written in Obsidian pay out the next time the vault
  is opened in town. Notes written in town (a new "+ New note" book on the bookshelf) pay out
  the moment they're saved. Both go through the same counter, so a note can never pay twice.
- **Flat payout with a minimum.** A note pays **10 coins** once it has **30+ words**
  (frontmatter excluded). A stub doesn't pay yet — it pays later, when it grows past 30.
- **Starter grant, no back-pay.** The first time a vault is opened, every note already in it
  counts as seen and the player gets **50 coins**. Only notes written after that earn.
- **Buying puts one piece in your inventory.** Placing a piece takes it out of the
  inventory; removing a piece puts it back. Nothing is ever lost.

## Earning: the "record" counter

The wallet doesn't remember note paths. It remembers `record`, which is the highest number of
qualifying notes (30+ words) it has ever paid for. Whenever the current count of qualifying
notes goes above `record`, the difference pays out and `record` moves up to match.

- Renaming or moving a note in Obsidian changes its path but not the count, so it doesn't pay
  again. (A per-path ledger would pay out on every rename.)
- Deleting notes lowers the count. New notes then refill up to `record` before they start
  paying again. This is the cost of making renames safe.
- An old stub that grows past 30 words raises the count and pays. That's intended, because
  fleshing out a stub is real writing.

At vault open, the count comes from the first 2 KB of every note that `parseVault` already
reads. On an in-town save, the saved note is re-counted.

## State

`localStorage["wallet:<vault name>"] = { balance, record, inventory: { [catalogItemId]: n } }`

Keyed on the vault's name, not `vaultFingerprint`. The fingerprint changes whenever a house is
added, and a wallet must survive that. The demo town's notes reset on reload, so its wallet
does too: the demo wallet lives only in memory.

Multiplayer guests have no wallet, because they are visiting someone else's vault.

## Prices

Every catalog piece has a **tier**, and `TIER_PRICE` in `lib/wallet.ts` prices the tiers:
common 15, uncommon 30, rare 60, treasure 150. A piece added to `lib/catalog.ts` is priced
by the tier it is given there. The 50-coin starter grant buys three common pieces, and a
treasure chest takes fifteen notes.

## Pieces

- `lib/wallet.ts`: the pure rules. It covers word count, prices, `settle()`, `available()` and
  `applyLayoutChange()`, and is tested in `lib/wallet.test.mts`.
- `lib/walletStore.ts`: the session for the open vault, localStorage, and the `useWallet()`
  hook (`startWallet`, `stopWallet`, `noteSaved`, `noteProgress`, `buy`,
  `commitLayoutChange`).
- `lib/vault/open.ts`: starts the wallet after parsing, and adds `createNote(folder, title)`
  to both vault kinds. `createNote` creates an empty `.md` file and re-parses the world from
  cached note heads, so no file is re-read.
- `components/Bookshelf.tsx`: a "+ New note" book that asks for a title, creates the note in
  the folder being browsed, publishes the new world and opens the note.
- `components/NoteReader.tsx`: an empty note opens straight into the editor. The editor
  footer shows "12/30 words for +10". A save calls `noteSaved`.
- `components/InteriorEditor.tsx`: the "Place:" list becomes a shop, in the catalog's room
  tabs (see `2026-09-26-more-furniture-design.md`). Each item shows how many you own, or its
  price. Clicking an item you own places it; clicking one you don't own
  buys it and places it. Swapping to a colour variant works the same way. What you can place
  is `inventory + pieces in the saved layout - pieces in the draft`, so Cancel leaves the
  inventory unchanged. Save applies the difference.
- `components/CoinPurse.tsx`: the coin balance at the top-left, plus a toast when coins
  come in.

## Known limits

- Notes created in town during a multiplayer session aren't shareable with guests until the
  next session, because the host's shareable-note list is fixed when hosting starts.
- Furniture that came with a house is yours: removing it puts it in your inventory.

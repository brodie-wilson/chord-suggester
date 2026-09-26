# Chord Suggester

**Play a note on your guitar → see every chord you can build from it → send any
chord straight into an Audiotool project.**

### ▶ https://chord-suggester.vercel.app

No install, no token, nothing to set up. Sign in with your own Audiotool
account and chords land in your own projects.

---

## Try it in 60 seconds

**Without signing in** — click **🎸** in panel 01 to switch to the on-screen
guitar, click any fret, and the chord grid fills with everything built on that
note. Or hit **🎯 Practice** in the header for the timed game.

**With Audiotool** — click **Log in with Audiotool**, pick a project (or
**New project**), then **Send to Audiotool** on any chord card. Keep the DAW
open in a second tab via the **Open in Audiotool ↗** link: chords appear
**live**, while you click, with no reload.

## What it does

**1 · Find chords from one note.** Play a note into the mic (YIN pitch
detection) or click the on-screen neck. Every chord containing that note
appears as a card with a real fingering, the notes it contains, and a plain-English
note on what it sounds like. Tabs split them into Standard, Jazz and Technical.

**2 · Show every way to play it.** *All positions* opens the same chord
everywhere it lives on the neck, using the CAGED system — the five movable
shapes a guitarist actually learns. Each position sends its own voicing, so an
open C and a C barred at the 8th fret arrive in Audiotool in the octaves you'd
really play them.

**3 · Beat the Clock.** A chord name flashes and you have five seconds to pick
its fingering out of four diagrams. Filter by chord type (standard / jazz /
technical), shape (open / barre) and neck position.

The decoys are the interesting part. The prompt is a chord name alone, so *any*
fingering of that chord is correct — every decoy has to be a different chord.
Chosen at random they'd be obvious, so they're drawn from near-misses first:
the same root with a different quality, or the same quality rooted a fret or
two away. Every round is guaranteed exactly one correct answer and four
visually distinct diagrams.

## How it uses Audiotool

Built on **`@audiotool/nexus`**, browser-side:

- **Auth** — `audiotool()` runs the OAuth2 PKCE flow in the browser. Each user
  signs in as themselves; there is **no server and no shared token anywhere in
  this repo**. The access token never leaves the visitor's browser.
- **Live document** — the project is opened once and the session is kept
  syncing, so chords appear in the DAW as they're clicked rather than after a
  flush. `doc.connected` drives the status dot, and the session is stopped on
  `pagehide` to guarantee the final sync.
- **Each chord** becomes a **Pulverisateur** (polyphonic, so the tones actually
  ring together — a monophonic device like Bassline can only sound one note)
  plus a note track, collection and one-bar region, with every note at
  `positionTicks: 0`.
- Writes are verified before success is reported: the entity count is checked
  after the transaction, and a lost backend connection fails loudly instead of
  silently dropping the change.

## How it's built

Vanilla TypeScript and Vite. **Zero runtime dependencies other than the
Audiotool SDK** — the fretboard, chord diagrams, pitch detection, audio preview
and game are all hand-rolled. Deployed as a **static site**: no backend, no
database, no secrets to manage.

| | |
|---|---|
| `src/chord-library.ts` | 21 chord types with intervals and teaching notes |
| `src/chord-shapes.ts` | Curated CAGED fingerings — the music theory core |
| `src/chord-diagram.ts` | SVG diagram renderer, incl. barre detection |
| `src/pitch-detector.ts` | YIN pitch detection (de Cheveigné & Kawahara, 2002) |
| `src/chord-game.ts` | Beat the Clock — pool, decoys, round lifecycle |
| `src/audiotool.ts` | All Audiotool auth and sync, isolated from the UI |

### The chord data is audited, not vibed

```bash
node --experimental-strip-types scripts/verify-chords.ts
```

> Checked 720 shapes across 21 chord types x 12 roots.
> ERRORS: 0   WARNINGS: 206

Every shape is checked against its chord's interval definition and for
playability. The warnings are deliberate and musically correct — six strings
can't hold every tone of a 13th chord, and dropping the 5th is standard
practice in jazz voicings. `scripts/compare-reference.ts` additionally diffs
the shapes against canonical wall-chart fingerings.

### A bug we found in the Nexus SDK

Sending a chord worked in dev and hung in production. The cause is in the SDK,
which identifies its `Pointer` type by comparing constructor names:

```js
if (t.T.name === Pointer.name) {
  return new Pointer({ fieldIndex: value.fieldIndex.slice(), … })
```

Minifiers mangle class names, so the comparison misfires, takes the pointer
branch for an ordinary message, and throws `Cannot read properties of undefined
(reading 'slice')`. The dev server never minifies, which is why it only
appeared once deployed.

Fixed here by building with Terser and `keep_classnames` (see
[vite.config.ts](vite.config.ts)). **This will affect any hosted app built on
`@audiotool/nexus`**, with a symptom that only shows up after deploying — worth
a look upstream.

## Running it locally

```bash
npm install
```

Register an application at https://developer.audiotool.com/applications with:

- **Redirect URIs** — `http://127.0.0.1:5173/` and your deployed URL. The app
  derives its redirect from `window.location.origin`, so one build works in
  both places once both are registered.
- **Scope** — `project:write`

```bash
cp .env.example .env.local   # paste the client ID
npm run dev
```

Open **http://127.0.0.1:5173/** — the IP, not `localhost`, which Audiotool
rejects as a redirect URI host.

The client ID is a public value that ships in the frontend bundle; it is not a
secret.

## Deploying

```bash
npm run build     # static output in dist/
```

Set `VITE_AUDIOTOOL_CLIENT_ID` in the host's environment and add the deployed
URL to the application's redirect URIs. Two traps worth knowing:

- **No restrictive Content-Security-Policy.** The SDK's WASM loader
  dynamically imports `wasm_exec.js` and fetches `document_validator.wasm.gz`
  from `cdn.audiotool.com`; a strict `script-src`/`connect-src` blocks login.
- **Use a stable production URL.** Preview deployments get unique URLs that
  aren't registered redirect URIs, so login fails on them.

If `VITE_AUDIOTOOL_CLIENT_ID` is missing the build still *succeeds*, but
dead-code elimination strips the SDK out entirely and login can never work. The
build prints a warning when this happens.

## Known limits

- The mic hears one audio channel, so it can detect **which note** you played
  but not **which string** — the suggested fret position is a best guess. The
  chord shapes themselves are curated, not generated.
- Only `beta.audiotool.com` projects sync; `www.audiotool.com` URLs are
  auto-corrected.
- Microphone input needs HTTPS (or localhost), which any normal host provides.

# Chord Suggester

Play a note on your guitar, see every chord you can build from it, and send
any chord straight into an Audiotool project.

## Setup

```bash
npm install
```

Get a Personal Access Token from
https://developer.audiotool.com/personal-access-tokens

## Running — you need TWO terminals

**Terminal 1 — the Audiotool bridge server:**

```bash
AUDIOTOOL_PAT=at_pat_your_token_here npm run server
```

**Terminal 2 — the app:**

```bash
npm run dev
```

Then open http://127.0.0.1:5173/

The header shows a green dot when the bridge server is connected.

## Using it

1. Paste a **beta.audiotool.com** project URL, click **Open**
2. Click **Start listening**, play a note
3. Click **Send to Audiotool** on any chord card

## Why the bridge server?

The Audiotool browser SDK's OAuth login needs `eval`/`new Function()` for its
WASM loader. Some locked-down environments (managed school/work devices)
block that outright, which makes browser login impossible.

Node.js has no Content-Security-Policy and loads WASM from disk via native
APIs, so the same SDK works fine there. The bridge server does all Audiotool
work in Node; the browser just makes plain `fetch` calls to it.

Your PAT lives only in the server process — it is never sent to the browser.
The server binds to `127.0.0.1` only.

## Notes

- The PAT env var lasts only for that terminal session; set it again next time
- Only `beta.audiotool.com` URLs work (`www.audiotool.com` is auto-corrected)
- Chord diagrams and fret positions are algorithmic suggestions, not curated
  fingerings — a single audio channel can't tell which string you played

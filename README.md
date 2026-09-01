# Chord Suggester

Play a note on your guitar, see every chord you can build from it, and send
any chord straight into an Audiotool project.

## Using it

1. Open the app and click **Log in with Audiotool** — you sign in with your own
   account, and chords go into your own projects
2. Pick a project from the dropdown (or click **New project**), then **Open**
3. Click **Start listening** and play a note — or switch to the on-screen
   guitar and click a fret
4. Click **Send to Audiotool** on any chord card

Chords appear in the DAW live while the project is open, so it's worth keeping
the Audiotool tab open next to the app — use the **Open in Audiotool ↗** link.

The chord explorer works without signing in. Only sending needs an account.

## Setup

```bash
npm install
```

### Register an OAuth application

The app authenticates with OAuth2 PKCE in the browser, so it needs a client ID.
At https://developer.audiotool.com/applications, create an application with:

- **Redirect URIs** — `http://127.0.0.1:5173/` for local development, plus your
  deployed URL (e.g. `https://your-app.vercel.app/`). Both need to be
  registered for one build to work in both places.
- **Scope** — `project:write`

Then copy `.env.example` to `.env.local` and fill in the client ID:

```bash
cp .env.example .env.local
```

The client ID is a public value — it ships in the frontend bundle and is not a
secret.

### Run it

```bash
npm run dev
```

Open **http://127.0.0.1:5173/**. Use the IP, not `localhost` — Audiotool
rejects `localhost` as a redirect URI host, so logging in from
`http://localhost:5173/` will fail.

## Deploying

It's a static site — there is no server and no secret to manage.

```bash
npm run build
```

Deploy `dist/`, set `VITE_AUDIOTOOL_CLIENT_ID` in the host's environment
variables, and add the deployed URL to the application's redirect URIs.

Two things to watch:

- **Don't set a restrictive Content-Security-Policy.** The SDK's WASM loader
  dynamically imports `wasm_exec.js` and fetches `document_validator.wasm.gz`
  from `cdn.audiotool.com`. A strict `script-src`/`connect-src` blocks login.
- **Use a stable production URL.** Preview deployments get unique URLs that
  aren't registered as redirect URIs, so login won't work on them.

If `VITE_AUDIOTOOL_CLIENT_ID` is missing, the build still succeeds but strips
the SDK out and can never log in. The build prints a warning when this happens.

## Notes

- Only `beta.audiotool.com` projects work; `www.audiotool.com` URLs are
  auto-corrected
- Microphone input requires HTTPS (or localhost) — any normal host provides it
- Chord diagrams and fret positions are algorithmic suggestions, not curated
  fingerings — a single audio channel can't tell which string you played

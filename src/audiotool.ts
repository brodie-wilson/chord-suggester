// All Audiotool state and API work lives here, so main.ts stays UI-only.
//
// Auth is OAuth2 PKCE in the browser: the user logs in with their own
// Audiotool account and chords go into THEIR projects. There is no server and
// no token in this repo — the client ID below is a public value, and the
// access token lives only in the user's browser.

import { audiotool, type AuthenticatedClient, type SyncedDocument } from "@audiotool/nexus"
import type { EntityQuery } from "@audiotool/nexus/document"
import { Ticks } from "@audiotool/nexus/utils"

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

const CLIENT_ID = import.meta.env.VITE_AUDIOTOOL_CLIENT_ID as string | undefined
const SCOPE = "project:write"

export type Project = { name: string; displayName: string }

export class MissingClientIdError extends Error {
  constructor() {
    super(
      "No Audiotool client ID configured. Set VITE_AUDIOTOOL_CLIENT_ID in .env.local " +
        "(get one at https://developer.audiotool.com/applications).",
    )
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────
let client: AuthenticatedClient | null = null

export type AuthState =
  | { status: "authenticated"; userName: string }
  | { status: "unauthenticated"; login: () => void; error?: Error }

/**
 * Resolve the OAuth flow. Called once on page load — the SDK also uses this
 * call to consume the `?code=` it was redirected back with.
 *
 * The redirect URL is derived from the current origin so that one build works
 * both on 127.0.0.1:5173 and on the deployed domain, as long as both are
 * registered on the application.
 */
export async function initAuth(): Promise<AuthState> {
  if (!CLIENT_ID) throw new MissingClientIdError()

  const at = await audiotool({
    clientId: CLIENT_ID,
    redirectUrl: `${window.location.origin}/`,
    scope: SCOPE,
  })

  if (at.status === "authenticated") {
    client = at
    return { status: "authenticated", userName: at.userName }
  }
  return { status: "unauthenticated", login: at.login, error: at.error }
}

export function logout() {
  client?.logout()
}

function requireClient(): AuthenticatedClient {
  if (!client) throw new Error("Not signed in to Audiotool.")
  return client
}

// ── Projects ──────────────────────────────────────────────────────────────

// The generated RPC clients never throw — they resolve with an Error instead,
// so every call has to be unwrapped before use.
function unwrap<T>(result: T | Error): T {
  if (result instanceof Error) throw result
  return result
}

export async function listProjects(): Promise<Project[]> {
  const result = unwrap(await requireClient().projects.listProjects({ filter: "" }))
  return result.projects.map(p => ({
    name: p.name,
    displayName: p.displayName || "(untitled)",
  }))
}

export async function createProject(displayName: string): Promise<Project> {
  const result = unwrap(
    await requireClient().projects.createProject({ project: { displayName } }),
  )
  const created = result.project
  if (!created) throw new Error("Audiotool did not return the created project.")
  return { name: created.name, displayName: created.displayName || displayName }
}

// ── Open project session ──────────────────────────────────────────────────
let doc: SyncedDocument | null = null
let openProjectRef: string | null = null
let connectionSubscription: { terminate: () => void } | null = null

// The sync protocol only works against beta.audiotool.com. Pasted links are
// usually www., which fails in a way that looks like a bug rather than a typo.
function normalizeProjectRef(ref: string): string {
  return ref.trim().replace("www.audiotool.com", "beta.audiotool.com")
}

export function isProjectOpen(): boolean {
  return doc !== null
}

/**
 * Open a project and keep the session live. `open()` accepts a project name,
 * UUID or URL, so the picker and the paste-a-URL fallback share this path.
 *
 * Returns the DAW URL so the UI can offer a link straight into the project.
 */
export async function openProject(
  ref: string,
  onConnectionChange?: (connected: boolean) => void,
): Promise<{ dawUrl: string }> {
  const normalized = normalizeProjectRef(ref)
  if (doc && openProjectRef === normalized) return { dawUrl: doc.dawUrl }

  await closeProject()

  const opened = await requireClient().open(normalized)
  await opened.start()
  doc = opened
  openProjectRef = normalized

  if (onConnectionChange) {
    connectionSubscription = opened.connected.subscribe(onConnectionChange, true)
  }
  return { dawUrl: opened.dawUrl }
}

/**
 * Stop syncing. This is the only call that guarantees pending modifications
 * have reached the backend, so it doubles as the flush.
 */
export async function closeProject(): Promise<void> {
  connectionSubscription?.terminate()
  connectionSubscription = null
  const open = doc
  doc = null
  openProjectRef = null
  if (open) await open.stop()
}

// ── Chord sending ─────────────────────────────────────────────────────────

// Stacks each chord tone strictly upward from the previous one (wrapping up
// an octave whenever the raw pitch class would collide with or sit below the
// last note), producing a close voicing starting near middle C — e.g.
// C-E-G -> 60, 64, 67, not three notes competing for the same octave.
function chordNotesToMidiPitches(notes: string[]): number[] {
  let previousPitch = -Infinity
  return notes.map(n => {
    const idx = NOTE_NAMES.indexOf(n) >= 0 ? NOTE_NAMES.indexOf(n) : NOTE_NAMES_FLAT.indexOf(n)
    if (idx < 0) throw new Error(`Unrecognized note name: "${n}"`)
    let pitch = 60 + idx
    while (pitch <= previousPitch) pitch += 12
    previousPitch = pitch
    return pitch
  })
}

// orderAmongTracks must be unique across every note/automation/pattern/audio
// track in the project, so a fresh track always needs one past the current max.
function nextTrackOrder(query: EntityQuery): number {
  const orders = query
    .ofTypes("noteTrack", "automationTrack", "patternTrack", "audioTrack")
    .get()
    .map(e => e.fields.orderAmongTracks.value)
  return orders.length ? Math.max(...orders) + 1 : 0
}

/**
 * Add a chord to the open project as a polyphonic synth with a one-bar note
 * region. The session stays open afterwards, so the notes appear in the DAW
 * live rather than only after a flush.
 */
export async function sendChord(
  chordName: string,
  notes: string[],
  explicitPitches?: number[],
): Promise<void> {
  if (!doc) throw new Error("No project is open.")

  // A specific fingering sends its own pitches so the voicing survives — an
  // open C and a C barred at the 8th fret are the same chord but sit in
  // different octaves with the notes stacked differently.
  const pitches = explicitPitches ?? chordNotesToMidiPitches(notes)

  // If we've lost the backend connection, changes made now would be silently
  // lost on reload. Fail loudly rather than report a success that isn't real.
  if (doc.connected.getValue() === false) {
    throw new Error("Not currently connected to Audiotool — try again in a moment.")
  }

  const countBefore = doc.queryEntities.ofTypes("noteTrack").get().length

  await doc.modify(t => {
    // A polyphonic synth (default playModeIndex=2) so all chord tones ring
    // out together, instead of a monophonic device like Bassline that can
    // only ever play one note at a time.
    const synth = t.create("pulverisateur", {
      displayName: chordName,
      positionX: Math.round(Math.random() * 400),
      positionY: Math.round(Math.random() * 200),
    })

    const noteTrack = t.create("noteTrack", {
      player: synth.location,
      orderAmongTracks: nextTrackOrder(t.entities),
    })

    const collection = t.create("noteCollection", {})

    t.create("noteRegion", {
      collection: collection.location,
      track: noteTrack.location,
      region: {
        displayName: chordName,
        positionTicks: 0,
        durationTicks: Ticks.SemiBreve,
        loopDurationTicks: Ticks.SemiBreve,
      },
    })

    // All notes share positionTicks: 0 so they sound simultaneously — a
    // chord — rather than one after another.
    pitches.forEach(pitch => {
      t.create("note", {
        collection: collection.location,
        positionTicks: 0,
        durationTicks: Ticks.SemiBreve,
        pitch,
        velocity: 0.8,
      })
    })
  })

  // Confirm the entity actually landed in the local document before we claim
  // success. modify() resolving only means the transaction was built.
  const countAfter = doc.queryEntities.ofTypes("noteTrack").get().length
  if (countAfter <= countBefore) {
    throw new Error("The chord wasn't created — the transaction may have been rejected.")
  }
}

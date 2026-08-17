#!/usr/bin/env node
// Local bridge server.
//
// WHY THIS EXISTS: the browser SDK's OAuth login needs `eval`/`new Function()`
// for its WASM loader, which some locked-down environments block outright.
// Node.js has no Content-Security-Policy and loads WASM from disk via native
// APIs, so the same SDK works fine there (proven by scripts/send-chord.mjs).
//
// This server bridges the two: the browser UI POSTs a chord here, and this
// process does the actual Audiotool work using a Personal Access Token. The
// browser never touches the blocked code path, but you still get a working
// "Send to Audiotool" button instead of copy-pasting CLI commands.
//
// SECURITY: the PAT grants full access to your whole Audiotool account. It
// lives only in this process, read from an env var — it is never sent to the
// browser. This server binds to 127.0.0.1 only, so nothing off your machine
// can reach it.
//
// Usage:
//   AUDIOTOOL_PAT=at_pat_xxxx npm run server
// Get a PAT from https://developer.audiotool.com/personal-access-tokens

import { createServer } from "node:http"
import { createAudiotoolClient } from "@audiotool/nexus"
import { createNodeTransport, createDiskWasmLoader } from "@audiotool/nexus/node"
import { Ticks } from "@audiotool/nexus/utils"

const PORT = 5174
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

const pat = process.env.AUDIOTOOL_PAT
if (!pat) {
  console.error("\n  Error: AUDIOTOOL_PAT environment variable is not set.\n")
  console.error("  Get a token from https://developer.audiotool.com/personal-access-tokens")
  console.error("  then run:\n")
  console.error("    AUDIOTOOL_PAT=at_pat_xxxx npm run server\n")
  process.exit(1)
}

// ── Audiotool connection state ───────────────────────────────────────────
let client = null
let nexus = null
let openProjectUrl = null

function normalizeProjectUrl(url) {
  // The sync protocol only works against beta.audiotool.com.
  return url.trim().replace("www.audiotool.com", "beta.audiotool.com")
}

async function getClient() {
  if (!client) {
    console.log("  Authenticating with Audiotool…")
    client = await createAudiotoolClient({
      auth: pat,
      transport: createNodeTransport(),
      wasm: createDiskWasmLoader(),
    })
    console.log("  Authenticated.")
  }
  return client
}

async function ensureProjectOpen(projectUrl) {
  const url = normalizeProjectUrl(projectUrl)
  if (nexus && openProjectUrl === url) return nexus

  if (nexus) {
    console.log("  Switching project — closing previous session…")
    await nexus.stop()
    nexus = null
    openProjectUrl = null
  }

  const c = await getClient()
  console.log(`  Opening project: ${url}`)
  nexus = await c.open(url)
  await nexus.start()
  openProjectUrl = url

  // Diagnostics: confirm WHICH document we actually opened, and what's
  // already in it. If this shows devices you recognise from your project,
  // we're in the right place. If it's empty but your project isn't, we're
  // connected to a different document than the one you're looking at.
  console.log(`  Document URL reported by Audiotool: ${nexus.dawUrl}`)
  const allEntities = nexus.queryEntities.get()
  console.log(`  Document contains ${allEntities.length} entities.`)

  const typeCounts = {}
  for (const e of allEntities) {
    typeCounts[e.entityType] = (typeCounts[e.entityType] ?? 0) + 1
  }
  const summary = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([type, n]) => `${type}×${n}`)
    .join(", ")
  console.log(`  Contents: ${summary || "(empty document)"}`)
  console.log("  Project open and syncing.")
  return nexus
}

// Stacks each chord tone strictly upward from the previous one (wrapping up
// an octave whenever the raw pitch class would collide with or sit below the
// last note), producing a close voicing starting near middle C — e.g.
// C-E-G -> 60, 64, 67, not three notes competing for the same octave.
function chordNotesToMidiPitches(notes) {
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
function nextTrackOrder(query) {
  const orders = query
    .ofTypes("noteTrack", "automationTrack", "patternTrack", "audioTrack")
    .get()
    .map(e => e.fields.orderAmongTracks.value)
  return orders.length ? Math.max(...orders) + 1 : 0
}

async function sendChord(projectUrl, chordName, notes, explicitPitches) {
  const doc = await ensureProjectOpen(projectUrl)
  // A specific fingering sends its own pitches so the voicing survives —
  // an open C and a C barred at the 8th fret are the same chord but sit in
  // different octaves with the notes stacked differently.
  const pitches = explicitPitches ?? chordNotesToMidiPitches(notes)

  // If we've lost the backend connection, changes made now would be silently
  // lost on reload. Fail loudly rather than report a success that isn't real.
  if (doc.connected && doc.connected.getValue() === false) {
    throw new Error("Not currently connected to the Audiotool backend — try again in a moment.")
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
    throw new Error("The device wasn't created in the project — the transaction may have been rejected.")
  }

  // CRITICAL: modify() does NOT guarantee the change reached the backend —
  // only stop() does ("modifications ... have been synced with the backend").
  // Without this, changes can sit unflushed and never appear in the DAW,
  // which looks exactly like a silent failure. There's no lighter-weight
  // flush API, so we stop the session to force the sync, and reopen on the
  // next request. Costs a couple of seconds per chord; guarantees delivery.
  console.log("  Flushing to backend…")
  await doc.stop()
  nexus = null
  openProjectUrl = null

  console.log(`  Sent "${chordName}" (${notes.join(", ")}) as MIDI notes [${pitches.join(", ")}] — confirmed synced.`)
}

// ── HTTP plumbing ────────────────────────────────────────────────────────
function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", chunk => {
      data += chunk
      if (data.length > 1e6) reject(new Error("Body too large"))
    })
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        reject(new Error("Invalid JSON body"))
      }
    })
    req.on("error", reject)
  })
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {})

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (url.pathname === "/api/status") {
    return json(res, 200, {
      ready: true,
      projectOpen: Boolean(nexus),
      project: openProjectUrl,
    })
  }

  if (url.pathname === "/api/projects") {
    try {
      const c = await getClient()
      const result = await c.projects.listProjects({})
      const projects = (result.projects ?? []).map(p => ({
        name: p.name,
        displayName: p.displayName ?? p.title ?? "(untitled)",
      }))
      console.log(`  Your account has ${projects.length} project(s):`)
      projects.forEach(p => console.log(`    - ${p.displayName}  [${p.name}]`))
      return json(res, 200, { projects })
    } catch (err) {
      console.error("  Failed to list projects:", err.message ?? err)
      return json(res, 500, { error: String(err.message ?? err) })
    }
  }

  if (url.pathname === "/api/open-project" && req.method === "POST") {
    try {
      const { projectUrl } = await readBody(req)
      if (!projectUrl) return json(res, 400, { error: "Missing projectUrl" })
      await ensureProjectOpen(projectUrl)
      return json(res, 200, { ok: true, project: openProjectUrl })
    } catch (err) {
      console.error("  Failed to open project:", err.message ?? err)
      return json(res, 500, { error: String(err.message ?? err) })
    }
  }

  if (url.pathname === "/api/send-chord" && req.method === "POST") {
    try {
      const { projectUrl, chordName, notes, pitches } = await readBody(req)
      if (!projectUrl || !chordName || !Array.isArray(notes) || notes.length === 0) {
        return json(res, 400, { error: "Need projectUrl, chordName and a non-empty notes array" })
      }
      const validPitches =
        Array.isArray(pitches) && pitches.length > 0 && pitches.every(p => Number.isInteger(p) && p >= 0 && p <= 127)
          ? pitches
          : undefined
      await sendChord(projectUrl, chordName, notes, validPitches)
      return json(res, 200, { ok: true, chordName })
    } catch (err) {
      console.error("  Failed to send chord:", err.message ?? err)
      return json(res, 500, { error: String(err.message ?? err) })
    }
  }

  json(res, 404, { error: "Not found" })
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Chord bridge server running at http://127.0.0.1:${PORT}`)
  console.log("  Leave this running, then use the app at http://127.0.0.1:5173/\n")
})

async function shutdown() {
  console.log("\n  Shutting down…")
  try {
    if (nexus) await nexus.stop()
  } catch { /* ignore errors during shutdown */ }
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

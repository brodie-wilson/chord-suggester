// Regenerates the README walkthrough screenshots from a running build.
//
// Drives headless Chrome over the DevTools Protocol with no npm dependencies —
// Node's global WebSocket speaks CDP to the Chrome already on the machine.
//
//   node scripts/capture-walkthrough.mjs [url] [outDir]
//
// Defaults to the live site and docs/walkthrough/. Images are captured at 2x
// and downscaled afterwards:
//   ffmpeg -i in.png -vf "scale='min(1200,iw)':-2:flags=lanczos" out.png

import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"

const URL_TO_CAPTURE = process.argv[2] ?? "https://chord-suggester.vercel.app"
const OUT_DIR = process.argv[3] ?? "docs/walkthrough"
const PORT = 9333
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const PROFILE = "/tmp/chrome-capture-profile"

const WIDTH = 1280
const HEIGHT = 900
const SCALE = 2

mkdirSync(OUT_DIR, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  "--hide-scrollbars",
  "--no-first-run",
  "--disable-extensions",
  URL_TO_CAPTURE,
], { stdio: "ignore" })

// ── minimal CDP client ────────────────────────────────────────────────────
let ws, nextId = 1
const pending = new Map()

function send(method, params = {}) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json())
      const page = list.find(t => t.type === "page" && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch { /* chrome still booting */ }
    await sleep(250)
  }
  throw new Error("Chrome never exposed a page target")
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? "evaluate failed")
  }
  return res.result?.value
}

/** Screenshot a single element, tight to its bounds with a little padding. */
/** Screenshot just the visible viewport — reads like a real screenshot. */
async function shootViewport(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
  const file = `${OUT_DIR}/${name}.png`
  writeFileSync(file, Buffer.from(data, "base64"))
  console.log(`  ${file}  viewport @${SCALE}x`)
}

async function shoot(name, selector, pad = 0) {
  const rect = await evaluate(`
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  `)
  if (!rect) throw new Error(`no element for ${name}: ${selector}`)

  const clip = {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    scale: SCALE,
  }
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    clip,
    captureBeyondViewport: true,
    fromSurface: true,
  })
  const file = `${OUT_DIR}/${name}.png`
  writeFileSync(file, Buffer.from(data, "base64"))
  console.log(`  ${file}  ${Math.round(clip.width)}x${Math.round(clip.height)} @${SCALE}x`)
}

// ── run ───────────────────────────────────────────────────────────────────
const wsUrl = await connect()
ws = new WebSocket(wsUrl)
await new Promise(r => (ws.onopen = r))
ws.onmessage = e => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  }
}

await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false,
})

await send("Page.navigate", { url: URL_TO_CAPTURE })
await sleep(3000)
await evaluate(`await document.fonts.ready; await new Promise(r => setTimeout(r, 400));`)

console.log("capturing…")

// 1 — the explorer, with a note picked on the on-screen neck
await evaluate(`
  document.querySelector('#input-source-toggle').click();
  await new Promise(r => setTimeout(r, 250));
  document.querySelectorAll('#guitar-widget .guitar__fret-btn')[20].click();
  await new Promise(r => setTimeout(r, 700));
  scrollTo(0, 0);
`)
await shootViewport("01-explore")

// 2 — every position for one chord
await evaluate(`
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'All positions');
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 700));
`)
await shoot("02-positions", ".panel--positions", 0)

// NOTE: 03-audiotool-daw.png is a frame pulled from docs/demo.mp4, not
// captured here — it needs a signed-in Audiotool session.

// 4 — the game's filter setup
await evaluate(`
  scrollTo(0, 0);
  document.querySelector('#practice-btn').click();
  await new Promise(r => setTimeout(r, 500));
`)
await shoot("04-game-setup", "#game-setup", 0)

// 5 — a live round, caught mid-timer. The prompt and shapes are random, so
// this frame differs run to run; that's fine, any round illustrates it.
await evaluate(`
  document.querySelector('#game-start').click();
  await new Promise(r => setTimeout(r, 900));
`)
await shoot("05-game-round", "#game-play", 0)

console.log("done")
ws.close()
chrome.kill()
// Chrome may still be flushing its profile; cleanup is cosmetic either way.
try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* ignore */ }
process.exit(0)

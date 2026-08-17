// A clickable cartoon guitar neck for people without a physical guitar handy.
// Clicking a fret plays the same role the pitch detector does for mic input:
// it resolves to a root note plus an exact fretboard position, and hands
// both to the caller — no guessing needed since the position is known.

import { OPEN_STRING_MIDI, STRING_NAMES, type FretPosition } from "./fretboard.ts"
import { NOTE_NAMES } from "./chord-library.ts"
import { noteColor } from "./note-colors.ts"

const FRET_COUNT = 12
const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 9])
const DOUBLE_INLAY_FRET = 12

export type FretClickHandler = (position: FretPosition, chroma: number) => void

export function renderGuitarWidget(container: HTMLElement, onFretClick: FretClickHandler): void {
  container.innerHTML = ""
  container.classList.add("guitar")

  const headstock = document.createElement("div")
  headstock.className = "guitar__headstock"
  for (let i = 0; i < 6; i++) {
    const peg = document.createElement("span")
    peg.className = "guitar__peg"
    headstock.appendChild(peg)
  }
  container.appendChild(headstock)

  container.appendChild(Object.assign(document.createElement("div"), { className: "guitar__nut" }))

  const neck = document.createElement("div")
  neck.className = "guitar__neck"
  container.appendChild(neck)

  // String lines run the full length of the neck, laid down first so the
  // fret buttons stack visually on top of them.
  for (let s = 0; s < 6; s++) {
    const stringLine = document.createElement("div")
    stringLine.className = "guitar__string"
    stringLine.style.gridColumn = String(s + 1)
    stringLine.style.gridRow = "1 / -1"
    stringLine.style.setProperty("--string-thickness", `${1.5 + (5 - s) * 0.35}px`)
    neck.appendChild(stringLine)
  }

  for (let fret = 0; fret <= FRET_COUNT; fret++) {
    const row = fret + 1

    if (fret > 0) {
      const fretWire = document.createElement("div")
      fretWire.className = "guitar__fret-wire"
      fretWire.style.gridRow = String(row)
      neck.appendChild(fretWire)
    }

    if (SINGLE_INLAY_FRETS.has(fret) || fret === DOUBLE_INLAY_FRET) {
      const inlay = document.createElement("div")
      inlay.className = "guitar__inlay"
      inlay.style.gridRow = String(row)
      if (fret === DOUBLE_INLAY_FRET) inlay.classList.add("guitar__inlay--double")
      neck.appendChild(inlay)
    }

    const label = document.createElement("span")
    label.className = "guitar__fret-label"
    label.style.gridRow = String(row)
    label.textContent = fret === 0 ? "open" : String(fret)
    neck.appendChild(label)

    for (let s = 0; s < 6; s++) {
      const midiNote = OPEN_STRING_MIDI[s] + fret
      const chroma = ((midiNote % 12) + 12) % 12
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "guitar__fret-btn"
      btn.style.gridColumn = String(s + 1)
      btn.style.gridRow = String(row)
      btn.style.setProperty("--dot-color", noteColor(chroma))
      const label2 = `${STRING_NAMES[s]} — ${fret === 0 ? "open" : `fret ${fret}`} — ${NOTE_NAMES[chroma]}`
      btn.title = label2
      btn.setAttribute("aria-label", label2)
      btn.addEventListener("click", () => {
        neck
          .querySelectorAll(".guitar__fret-btn.is-active")
          .forEach(el => el.classList.remove("is-active"))
        btn.classList.add("is-active")
        onFretClick({ stringIndex: s, fret }, chroma)
      })
      neck.appendChild(btn)
    }
  }

}

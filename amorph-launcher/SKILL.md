---
name: amorph-launcher-look
description: Visual style of the theRealla Amorph MIDI Launcher (near-black surfaces, lime action colour, purple/blue/red signal colours, spaced-out uppercase micro-labels, hairline borders). Use when building or restyling a UI to match that look.
---

# Amorph Launcher look

Source: `amorph-midi-launcher.html` (theRealla, Amorph Ghost Engine). This file describes what that page does, then says how to carry it into Juncture without breaking Juncture's own rules.

## Palette (from the page's `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#050505` | page |
| `--s1` | `#0d0d0d` | cards, panels |
| `--s2` | `#141414` | hovered or selected card |
| `--b` | `rgba(255,255,255,.07)` | default hairline |
| `--bb` | `rgba(255,255,255,.14)` | hover hairline |
| `--acc` | `#c8f542` | lime: the one action colour, "live", selected, progress |
| `--red` | `#f5421a` | stop, drive, alerts |
| `--blu` | `#42b4f5` | CC data, export |
| `--pur` | `#b042f5` | MIDI notes, MIDI buttons |
| `--txt` | `#f0ede6` | text (warm off-white, not pure white) |
| `--mut` | `#555` | muted text (see the contrast warning below) |

## Type

- Display and numbers: **Unbounded**, weights 700 to 900, tight line height. Page title is `clamp(28px, 6vw, 52px)`, 900, with one word coloured lime.
- Everything else: **Space Mono**. Body 9 to 11px, labels 7 to 9px, uppercase, letter-spacing 0.08 to 0.2em.
- Both are OFL fonts. The launcher loads them from Google Fonts; Juncture is offline, so bundle them as `woff2` (with their licence files) or keep Juncture's Archivo.

## Shape and motion

- Borders are 0.5px hairlines, never heavy. Radius 2px on buttons and badges, 3 to 5px on cards.
- Cards: `--s1` fill, hairline border, border brightens on hover, turns lime when selected or playing.
- Buttons are outline-only in their signal colour (purple for MIDI, blue for export) and fill solid with black text on hover.
- Status dot: 7px circle, lime with a soft glow and a 1.2s opacity pulse when live, flashes purple on MIDI activity.
- Scope and piano roll draw on `#030303` with a glowing lime line (a wide 30%-alpha stroke under a thin solid one).

## Rules that make it look right

1. One action colour (lime). Purple, blue and red are signals with a fixed meaning, not decoration.
2. Text on a lime fill is always near-black.
3. Surfaces step up in brightness by one notch per layer: `#050505` then `#0d0d0d` then `#141414`.
4. Micro-labels are uppercase and spaced out; real content stays sentence case.

## Contrast warning (do not copy as-is into Juncture)

- `#555` on `#050505` is about 2.7:1. Juncture requires 4.5:1 for text, so use `#a9a9a2` for muted text (7:1 on `#0d0d0d`).
- The launcher uses 7 to 9px text in many places. Juncture's smallest text is 11.5px; keep it there.
- `--pur` `#b042f5` on `#030303` passes for large or bold text; do not use it for small body text.

## Using it in Juncture

`theme-amorph.css` in this folder maps these colours onto Juncture's existing variables (`--putty`, `--panel`, `--ink`, `--teal`, `--glass`, `--amber` ...) and fixes the places where the default theme hard-codes light fills. It only takes effect when `<body class="theme-amorph">` is set, so removing the class returns the default look.

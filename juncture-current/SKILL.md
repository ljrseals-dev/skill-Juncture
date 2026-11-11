---
name: juncture-studio-look
description: The current Juncture Studio look: putty-grey rail and page, one teal action colour, dark "glass" signal windows with amber signal, Archivo type. Use to restore or extend the default Juncture styling.
---

# Juncture Studio look (default theme)

No design skill existed for the Studio. I worked from `atrium/ui/style.css` and kept its look through every change, so this file is **reconstructed from that stylesheet**. The exact, authoritative copy is `style.css.default` beside this file; to go back to the default look, restore that file or remove `class="theme-amorph"` from `<body>`.

## Tokens (`:root`)

| Token | Value | Use |
|---|---|---|
| `--putty` | `#d3d6c7` | side rail, page |
| `--panel` | `#e4e5da` | working surface |
| `--ink` | `#17201d` | text |
| `--ink-2` | `#4a554e` | secondary text (6:1 on panel) |
| `--line` | `#aeb3a2` | hairlines |
| `--teal` / `--teal-hi` | `#0e5a57` / `#0a4543` | the one action colour |
| `--glass` / `--glass-2` | `#0e1513` / `#18221f` | dark signal windows (player, meters) |
| `--glass-ink` / `--glass-dim` | `#e9efe6` / `#93a499` | text on glass |
| `--amber` | `#f0a81c` | signal colour, only on glass |
| `--alert` | `#a8261b` | errors |
| `--r` | `2px` | corner radius |

Hard-coded fills: input fields `#f1f2e9`; score paper `#fbfbf6` (notation stays dark on light in every theme).

## Type

Archivo (variable, bundled in `atrium/ui/vendor/fonts`), 14px body, 800 weight at condensed width (`font-stretch: 78%`) for the brand name, tabular numerals. Monospace for code and logs.

## Rules

1. Light working surface, dark glass windows for anything that shows a signal.
2. One action colour (teal); amber appears only on glass.
3. All text meets 4.5:1; the UI sweep (`scripts/ui_sweep.py`) enforces it on both desktop and phone widths.
4. Focus ring: 2px teal, amber on glass.

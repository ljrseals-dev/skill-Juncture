# Amorph look for Juncture: read me

What is in this folder:

| File | What it is |
|---|---|
| `amorph-launcher/SKILL.md` | The Amorph Launcher's colour scheme and type, written up as a style guide |
| `amorph-launcher/theme-amorph.css` | An opt-in Juncture theme built from it |
| `juncture-current/SKILL.md` | The current Juncture look, written up (reconstructed from the stylesheet; no earlier skill file existed) |
| `juncture-current/style.css.default` | The unchanged stylesheet from the Studio build you have: your way back |

## Try it

1. Copy `theme-amorph.css` to `atrium/ui/`.
2. In `atrium/ui/index.html` add `<link rel="stylesheet" href="theme-amorph.css">` after the existing stylesheet link, and change `<body>` to `<body class="theme-amorph">`.
3. Start the Studio as usual.

## Go back

Change `<body class="theme-amorph">` back to `<body>`. If you edited `style.css` itself, put `style.css.default` back in its place.

## What was checked

On a copy of the Studio with the theme on, the existing UI sweep found no low-contrast text or sideways overflow on desktop and phone widths, and I looked at screenshots of the Score and Master tabs. Not checked: the other tabs by eye, the Visualizer colours, and the desktop app window. The Studio itself is unchanged; nothing is turned on until you do the steps above.

## Why the colours differ slightly from the launcher

Muted text, red and the field borders are lighter than the launcher's, so they pass the Studio's 4.5:1 contrast rule. The launcher's `#555` muted text is 2.7:1. Fonts: the launcher's Space Mono and Unbounded are not bundled (they load from Google Fonts there and Juncture is offline), so the theme keeps Archivo.

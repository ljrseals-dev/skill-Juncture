"""Visual regression sweep: every tab at desktop and phone width.

Checks (disabled controls skipped, as WCAG 1.4.3 allows): no page errors, no horizontal page scroll, bundled font actually loaded,
every tab's primary text readable (contrast >= 4.5), screenshots written to --out.
Usage (system Python with playwright):  python scripts/ui_sweep.py --out /tmp/sweep
"""
import argparse, functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "atrium" / "ui"

def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = c
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

JS_TEXT = """() => {
  const out = [];
  const bgOf = (e) => { for (; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor;
      const m = c.match(/[\\d.]+/g).map(Number); if (m.length < 4 || m[3] > 0.5) return m.slice(0,3); } return [255,255,255]; };
  document.querySelectorAll('.tabpane.active *, header *, nav *').forEach((e) => {
    if (!e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    if (e.closest(':disabled')) return;  // disabled controls are exempt from WCAG 1.4.3
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const fg = cs.color.match(/[\\d.]+/g).map(Number).slice(0,3);
    out.push({t: e.textContent.trim().slice(0,30), fg, bg: bgOf(e), size: parseFloat(cs.fontSize)});
  });
  return out;
}"""

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default="sweep"); a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    problems, rows = [], []
    with sync_playwright() as p:
        br = p.chromium.launch()
        for label, vp in (("desktop", {"width": 1280, "height": 860}), ("phone", {"width": 390, "height": 800})):
            pg = br.new_page(viewport=vp); errs = []
            pg.add_init_script("try{localStorage.setItem('juncture.look','theme-amorph')}catch(e){}")  # contrast is enforced on the readable-grey look
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(url); pg.wait_for_timeout(300)
            tabs = pg.eval_on_selector_all("[data-tab]", "e => e.map(x => x.dataset.tab)")
            for t in tabs:
                pg.click(f'[data-tab="{t}"]'); pg.wait_for_timeout(120)
                over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                font = pg.evaluate("document.fonts.check('16px \"Space Mono\"') && document.fonts.check('16px Unbounded')")
                low = [(x["t"], round(ratio(x["fg"], x["bg"]), 2)) for x in pg.evaluate(JS_TEXT)
                       if ratio(x["fg"], x["bg"]) < (3.0 if x["size"] >= 18.66 else 4.5)]
                pg.screenshot(path=str(out / f"{label}-{t}.png"))
                rows.append({"vp": label, "tab": t, "h_overflow_px": over, "archivo": font, "low_contrast": low[:4]})
                if over > 0: problems.append(f"{label}/{t}: page scrolls sideways by {over}px")
                if low: problems.append(f"{label}/{t}: low contrast {low[:3]}")
            if errs: problems.append(f"{label}: page errors {errs}")
            if not all(r["archivo"] for r in rows if r["vp"] == label): problems.append(f"{label}: Amorph fonts (Space Mono, Unbounded) not loaded")
            pg.close()
        br.close()
    print(json.dumps(rows, indent=1)); print("PROBLEMS:", problems or "none")
    raise SystemExit(1 if problems else 0)

if __name__ == "__main__":
    main()

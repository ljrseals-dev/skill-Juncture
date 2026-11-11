/* ─────────────────────────────────────────────────────────────────────
   Juncture-Studio — atrium/ui/app.js
   ATR-VIEW-r3

   Three hardening fixes for multi-track sessions:
     1. Persistent <audio> element (survives WaveSurfer.destroy)
     2. WeakMap guard on createMediaElementSource (survives reload)
     3. Visualizer taps pre-EQ source (EQ tail never goes stale)
   ───────────────────────────────────────────────────────────────────── */

import WaveSurfer from './vendor/wavesurfer.esm.js';
import { JunctureVisualizer } from './visualizer.js';


/* ═══════════════════════════════════════════════════════════════════
   MODULE STATE
   ═══════════════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

let wavesurfer          = null;
let currentWavUrl       = null;
let currentWavPath      = null;
let currentAbcPath      = null;

// Shared audio graph — one context, one media element, one source node.
let audioCtx            = null;
let eqFilters           = [];
let eqSource            = null;
let eqTail              = null;

// ═══ FIX 1 ═══ Persistent media element, created once for the session.
let sharedMediaEl       = null;

// ═══ FIX 2 ═══ WeakMap guard: one MediaElementSource per element, forever.
const __sourceForElement = new WeakMap();

// Visualizer
let visualizer          = null;
let abcEditor           = null;


/* ═══════════════════════════════════════════════════════════════════
   SHARED AUDIO GRAPH
   ═══════════════════════════════════════════════════════════════════ */

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// ═══ FIX 1 ═══
function ensureMediaElement() {
  if (!sharedMediaEl) {
    sharedMediaEl = document.createElement('audio');
    sharedMediaEl.crossOrigin = 'anonymous';
    sharedMediaEl.preload = 'auto';
    sharedMediaEl.style.display = 'none';
    document.body.appendChild(sharedMediaEl);
  }
  return sharedMediaEl;
}


/* ═══════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════ */

window.addEventListener('pywebviewready', async () => {
  ensureAudioContext();
  ensureMediaElement();

  renderPresets();
  renderEq();
  wireEvents();

  await refreshStatus();
  await refreshHistory();
  await refreshMasterInfo();
  await loadComposeOptions();

  initAbcEditor('');
  initVisualizer();
});

// Fallback when not in pywebview
document.addEventListener('DOMContentLoaded', () => {
  if (!window.pywebview) {
    ensureAudioContext();
    ensureMediaElement();
    renderPresets();
    renderEq();
    wireEvents();
    initAbcEditor('');
    try { initVisualizer(); } catch (e) { console.warn(e); }
  }
  const play = $('play');
  if (play) play.onclick = () => { if (wavesurfer) wavesurfer.playPause(); };
});


/* ═══════════════════════════════════════════════════════════════════
   PRESETS
   ═══════════════════════════════════════════════════════════════════ */

const PRESETS = [
  { name: "Synthwave",  style: "synthwave, female vocal, 110 BPM, minor, retro" },
  { name: "Lo-fi",      style: "lo-fi hip hop, male vocal, 85 BPM, jazzy chords" },
  { name: "Orchestral", style: "cinematic orchestral, epic, 90 BPM, strings" },
  { name: "Pop",        style: "pop, female vocal, 120 BPM, uplifting" },
  { name: "Metal",      style: "heavy metal, male vocal, 160 BPM, drop tuning" },
  { name: "Ambient",    style: "ambient, no vocals, 60 BPM, drone" },
];

function renderPresets() {
  const root = $('presets');
  if (!root) return;
  root.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.name;
    b.onclick = () => { $('style').value = p.style; };
    root.appendChild(b);
  }
}


/* ═══════════════════════════════════════════════════════════════════
   EQ  — 10 bands, Web Audio BiquadFilter chain
   ═══════════════════════════════════════════════════════════════════ */

const EQ_FREQS = [31, 62, 125, 250, 500, 1e3, 2e3, 4e3, 8e3, 16e3];

function renderEq() {
  const root = $('eq');
  if (!root) return;
  root.innerHTML = '';
  for (const f of EQ_FREQS) {
    const band = document.createElement('div');
    band.className = 'eq-band';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = -12; slider.max = 12; slider.step = 0.5; slider.value = 0;
    slider.dataset.freq = f;
    slider.addEventListener('input', applyEq);

    const freq = document.createElement('div');
    freq.className = 'freq';
    freq.textContent = f >= 1000 ? `${f / 1000}k` : f;

    const gain = document.createElement('div');
    gain.className = 'gain';
    gain.textContent = '0';
    slider.addEventListener('input', () => {
      gain.textContent = slider.value > 0 ? `+${slider.value}` : slider.value;
    });

    band.append(slider, freq, gain);
    root.appendChild(band);
  }

  const btn = $('eq-reset');
  if (btn) btn.onclick = () => {
    document.querySelectorAll('.eq-band input').forEach((s) => {
      s.value = 0;
      s.dispatchEvent(new Event('input'));
    });
  };
  const chk = $('eq-enabled');
  if (chk) chk.onchange = applyEq;
}

function buildEqChain(source) {
  const ctx = ensureAudioContext();
  eqFilters = EQ_FREQS.map((f) => {
    const flt = ctx.createBiquadFilter();
    flt.type = (f === EQ_FREQS[0]) ? 'lowshelf'
             : (f === EQ_FREQS[EQ_FREQS.length - 1]) ? 'highshelf'
             : 'peaking';
    flt.frequency.value = f;
    flt.Q.value = 1.0;
    flt.gain.value = 0;
    return flt;
  });

  let node = source;
  for (const flt of eqFilters) {
    node.connect(flt);
    node = flt;
  }
  node.connect(ctx.destination);
  eqTail = node;
}

function applyEq() {
  if (!eqFilters.length) return;
  const enabled = $('eq-enabled') ? $('eq-enabled').checked : true;
  const sliders = [...document.querySelectorAll('.eq-band input')];
  sliders.forEach((s, i) => {
    if (eqFilters[i]) eqFilters[i].gain.value = enabled ? parseFloat(s.value) : 0;
  });
}


/* ═══════════════════════════════════════════════════════════════════
   VISUALIZER  — Butterchurn (MilkDrop)
   ═══════════════════════════════════════════════════════════════════ */

function initVisualizer() {
  const canvas = $('vis-canvas');
  if (!canvas) return;

  const ctx = ensureAudioContext();
  visualizer = new JunctureVisualizer(canvas, ctx);

  try {
    visualizer.init();
  } catch (e) {
    canvas.outerHTML =
      `<div class="empty">Visualizer unavailable: ${e.message}</div>`;
    visualizer = null;
    return;
  }

  const sel = $('vis-preset');
  if (sel) {
    sel.innerHTML = '';
    for (const name of visualizer.names) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    }
    sel.value = visualizer.names[visualizer.current];
    sel.onchange = () => visualizer.load(visualizer.names.indexOf(sel.value));
  }

  const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  bind('vis-prev', () => { const n = visualizer.prev(); if (sel) sel.value = n; });
  bind('vis-next', () => { const n = visualizer.next(); if (sel) sel.value = n; });
  bind('vis-random', () => { const n = visualizer.random(); if (sel) sel.value = n; });

  const en = $('vis-enabled');
  if (en) en.onchange = (e) => visualizer.setEnabled(e.target.checked);
  const au = $('vis-auto');
  if (au) au.onchange = (e) =>
    e.target.checked
      ? visualizer.startAutoAdvance(30)
      : visualizer.stopAutoAdvance();

  bind('vis-fullscreen', () => canvas.requestFullscreen && canvas.requestFullscreen());
  document.addEventListener('fullscreenchange', () => visualizer && visualizer.resize());

  visualizer.startAutoAdvance(30);
}

// ═══ FIX 2 + FIX 3 ═══
function connectVisualizerAudio() {
  if (!visualizer || !wavesurfer) return;

  const media = wavesurfer.getMediaElement();
  if (!media) return;

  const ctx = ensureAudioContext();

  let source = __sourceForElement.get(media);
  if (!source) {
    // HMR fallback: element may already have a bound source
    source = media.__jncSource || ctx.createMediaElementSource(media);
    media.__jncSource = source;
    if (!eqFilters.length) buildEqChain(source);
    __sourceForElement.set(media, source);
  }

  // FIX 3: pre-EQ source — invariant for the life of the element
  visualizer.connect(source);

  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}


/* ═══════════════════════════════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════════════════════════════ */

function wireEvents() {
  const gen = $('generate');
  if (gen) gen.onclick = doGenerate;
  const dice = $('dice');
  if (dice) dice.onclick = () => {
    $('seed').value = Math.floor(Math.random() * 1e6);
  };
  const stems = $('stems');
  if (stems) stems.onclick = doStems;
  const reveal = $('reveal');
  if (reveal) reveal.onclick = () => {
    if (!currentWavPath) return;
    if (window.pywebview && window.pywebview.api)
      window.pywebview.api.open_in_folder(currentWavPath);
  };
  const rh = $('refresh-history');
  if (rh) rh.onclick = refreshHistory;
  const ea = $('export-abc');
  if (ea) ea.onclick = doExportAbc;
  const rfe = $('render-from-editor');
  if (rfe) rfe.onclick = doRenderFromEditor;
  const mr = $('master-run');
  if (mr) mr.onclick = doMaster;
  const vr = $('vocal-run');
  if (vr) vr.onclick = doVocal;
  const vp = $('vocal-preset');
  if (vp) ['neutral','soul_tenor','gospel_belt','rap_flow','female_soul'].forEach((k) => {
    const o = document.createElement('option'); o.value = k; o.textContent = k.replace('_', ' '); vp.appendChild(o);
  });
  const ck = $('chain-key');
  if (ck) {
    ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'].forEach((k) => {
      const o = document.createElement('option'); o.value = o.textContent = k; ck.appendChild(o);
    });
  }
  const cg = $('chain-genre');
  if (cg) {
    [['melody','Melody only'],['trap','Trap beat'],['lofi','Lo-fi beat'],['house','House beat']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; cg.appendChild(o);
    });
  }
  document.querySelectorAll('[data-map]').forEach((b) => {
    b.onclick = () => {
      $('map-img').src = 'diagrams/' + b.dataset.map + '.svg';
      $('map-img').alt = b.textContent + ' diagram';
      document.querySelectorAll('[data-map]').forEach((x) => x.classList.toggle('btn-primary', x === b));
    };
  });
  const mk = $('markov-run');
  if (mk) mk.onclick = doMarkov;
  const nmr = $('nm-run'); if (nmr) nmr.onclick = doNeuralMidi;
  const sgr = $('sg-run'); if (sgr) sgr.onclick = doSigillum;
  const sgp = $('sg-planet'); if (sgp) sgp.onchange = () => { const d = sgDefaults[sgp.value]; if (d) $('sg-mode').value = d; };
  const mh = $('master-harmonia');
  if (mh) mh.onchange = () => {
    $('master-harmonia-mode').disabled = !mh.checked;
  };

  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => switchTab(t.dataset.tab);
  });
  document.querySelectorAll('.score-modes .mode').forEach((b) => {
    b.onclick = () => setScoreMode(b.id.replace('mode-', ''));
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((p) =>
    p.classList.toggle('active', p.id === `tab-${name}`));
}

function setScoreMode(mode) {
  document.querySelectorAll('.score-modes .mode').forEach((b) =>
    b.classList.toggle('active', b.id === `mode-${mode}`));
  const view = $('score-view');
  const edit = $('score-edit');
  if (view) view.hidden = mode !== 'view';
  if (edit) edit.hidden = mode !== 'edit';
}


/* ═══════════════════════════════════════════════════════════════════
   STATUS
   ═══════════════════════════════════════════════════════════════════ */

/* A theme can set --wave, --wave-progress and --wave-cursor on <body>; without them the colours below are used. */
function themeVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

async function refreshStatus() {
  if (!window.pywebview || !window.pywebview.api) return;
  const s = await window.pywebview.api.status();

  const sel = $('backend');
  if (!sel) return;
  sel.innerHTML = '';

  const engines = s.engines || [];
  for (const e of engines) {
    const o = document.createElement('option');
    o.value = e.code;
    o.textContent = e.label;
    sel.appendChild(o);
  }

  const vram = s.hardware && s.hardware.total_mb
    ? `${s.hardware.used_mb}/${s.hardware.total_mb} MB`
    : 'n/a';
  log(`Studio · ${engines.length} engine(s) · VRAM ${vram}`);
}


/* ═══════════════════════════════════════════════════════════════════
   GENERATE
   ═══════════════════════════════════════════════════════════════════ */

async function doGenerate() {
  const style  = ($('style').value || '').trim();
  const lyrics = ($('lyrics').value || '').trim();
  if (!style)  return toast('Enter a style', true);
  if (!lyrics) return toast('Enter lyrics', true);
  if (!window.pywebview || !window.pywebview.api) return toast('Desktop bridge offline', true);

  $('generate').disabled = true;
  $('generate').textContent = 'Generating…';
  switchTab('log');
  log('--- generate ---');

  await window.pywebview.api.generate(
    style, lyrics,
    parseInt($('duration').value),
    parseInt($('seed').value),
    $('backend').value || null,
  );
}


/* ═══════════════════════════════════════════════════════════════════
   STEMS
   ═══════════════════════════════════════════════════════════════════ */

async function doStems() {
  if (!currentWavPath) return toast('Generate a song first', true);
  if (!window.pywebview || !window.pywebview.api) return;
  $('stems').disabled = true;
  $('stems').textContent = 'Splitting…';
  switchTab('stems-panel');
  await window.pywebview.api.separate_stems(currentWavPath);
}


async function doMarkov() {
  if (!window.pywebview || !window.pywebview.api) return toast('Desktop bridge offline', true);
  const btn = $('markov-run');
  btn.disabled = true;
  btn.textContent = 'Composing…';
  const r = await window.pywebview.api.markov(
    $('chain-seed').value.trim() || '1',
    $('chain-key').value,
    parseInt($('chain-bars').value, 10) || 8,
    $('chain-genre').value,
  );
  if (!r.ok) toast(r.error || 'Compose failed', true);
  // compose_done / compose_error re-enable the button below
}

/* ═══════════════════════════════════════════════════════════════════
   MASTER  (Hush DAW processor)
   ═══════════════════════════════════════════════════════════════════ */

function setReadout(report) {
  const l = $('readout-lufs'), t = $('readout-tp');
  if (!l || !t) return;
  const st = report && (report.stages || []).find((x) => x.name === 'littlesqrt' && x.ran);
  if (!st) { l.textContent = 'not mastered'; t.textContent = '–'; return; }
  l.textContent = st.metrics.lufs_out.toFixed(1) + ' LUFS';
  t.textContent = st.metrics.true_peak_dbtp.toFixed(1) + ' dBTP';
}

async function refreshMasterInfo() {
  if (!window.pywebview || !window.pywebview.api) return;
  try {
    const info = await window.pywebview.api.master_info();
    const sel = $('master-harmonia-mode');
    const chk = $('master-harmonia');
    if (sel) {
      sel.innerHTML = '';
      for (const m of info.harmonia_modes || []) {
        const o = document.createElement('option');
        o.value = o.textContent = m;
        if (m === 'good') o.selected = true;
        sel.appendChild(o);
      }
    }
    if (chk && !(info.harmonia_modes || []).length) {
      chk.disabled = true;
      chk.parentElement.title = info.harmonia_error || 'HarmoniaCodec unavailable';
    }
    if (!info.littlesqrt) {
      const n = $('master-note');
      if (n) n.textContent = 'Little sQrt unavailable: ' + (info.littlesqrt_error || 'unknown');
    }
  } catch (e) { console.warn('master_info failed', e); }
}

async function doMaster() {
  if (!currentWavPath) return toast('Generate a song first', true);
  if (!window.pywebview || !window.pywebview.api) return toast('Desktop bridge offline', true);
  const btn = $('master-run');
  btn.disabled = true;
  btn.textContent = 'Mastering…';
  const useH = $('master-harmonia').checked;
  const r = await window.pywebview.api.master(
    currentWavPath,
    parseFloat($('master-lufs').value),
    parseFloat($('master-tp').value),
    useH ? $('master-harmonia-mode').value : null,
  );
  if (!r.ok) {
    btn.disabled = false;
    btn.textContent = 'Master';
    toast(r.error || 'Master failed', true);
  }
}

async function doVocal() {
  if (!currentWavPath) return toast('Generate a song first', true);
  if (!window.pywebview || !window.pywebview.api) return toast('Desktop bridge offline', true);
  const btn = $('vocal-run');
  btn.disabled = true;
  btn.textContent = 'Calibrating…';
  const r = await window.pywebview.api.vocal(currentWavPath, $('vocal-preset').value);
  if (!r.ok) {
    btn.disabled = false;
    btn.textContent = 'Calibrate vocal';
    toast(r.error || 'Vocal calibration failed', true);
  }
}


/* ═══════════════════════════════════════════════════════════════════
   COMPOSE TAB — NeuralMidi, Sigillum Composer (MidiNote is an iframe)
   ═══════════════════════════════════════════════════════════════════ */
let sgDefaults = {};

async function loadComposeOptions() {
  if (!window.pywebview || !window.pywebview.api) return;
  const o = await window.pywebview.api.sigillum_options();
  if (o.ok) {
    sgDefaults = o.default_mode || {};
    const pl = $('sg-planet'), md = $('sg-mode');
    pl.innerHTML = md.innerHTML = '';
    o.planets.forEach((p) => { const e = document.createElement('option'); e.value = e.textContent = p; pl.appendChild(e); });
    o.modes.forEach((m) => { const e = document.createElement('option'); e.value = e.textContent = m; md.appendChild(e); });
    pl.value = 'Venus';
    md.value = sgDefaults.Venus || o.modes[0];
    $('sg-run').disabled = false;
  }
  $('nm-run').disabled = false;
}

function showComposeResult(rootId, r, lines) {
  const root = $(rootId);
  root.innerHTML = '';
  if (!r.ok) {
    const p = document.createElement('p');
    p.className = 'compose-line';
    p.textContent = r.error || 'Failed';
    root.appendChild(p);
    return;
  }
  lines.forEach((t) => { const p = document.createElement('p'); p.className = 'compose-line'; p.textContent = t; root.appendChild(p); });
  if (r.wav_url) { const a = document.createElement('audio'); a.controls = true; a.src = r.wav_url; root.appendChild(a); }
  const dl = document.createElement('a');
  dl.href = r.mid_url; dl.download = ''; dl.textContent = 'Download .mid'; dl.className = 'compose-line';
  root.appendChild(dl);
  const of = document.createElement('button');
  of.className = 'btn-ghost'; of.textContent = 'Show in folder';
  of.onclick = () => window.pywebview.api.open_in_folder(r.path);
  root.appendChild(of);
}

/* MidiNote runs in an iframe and posts the finished .mid to us. Blob links do not work in the desktop webview,
   so the bridge writes the file to outputs/midi and we show the usual download / show-in-folder controls. */
window.addEventListener('message', async (e) => {
  const fr = $('mn-frame');
  if (!fr || e.source !== fr.contentWindow || !e.data || e.data.type !== 'midinote:midi') return;
  if (!window.pywebview || !window.pywebview.api) return;
  const r = await window.pywebview.api.save_midinote(e.data.name, e.data.data);
  showComposeResult('mn-result', r, r.ok ? ['Saved ' + r.path.split(/[\\/]/).pop()] : []);
  if (!r.ok) toast('MidiNote save failed: ' + r.error, true); else log('midinote → ' + r.path);
});

async function doNeuralMidi() {
  if (!window.pywebview || !window.pywebview.api) return toast('Desktop bridge offline', true);
  const btn = $('nm-run');
  btn.disabled = true; btn.textContent = 'Generating…';
  const r = await window.pywebview.api.neuralmidi($('nm-prompt').value, parseInt($('nm-seed').value || '1', 10),
    parseFloat($('nm-tempo').value || '100'), $('nm-register').value);
  btn.disabled = false; btn.textContent = 'Generate';
  showComposeResult('nm-result', r, r.ok ? [`${r.notes} notes · ${r.duration_s} s · seed ${r.seed} · stopped: ${r.stop}`] : []);
  if (!r.ok && r.refused) toast('Prompt refused by the safety layer', true);
  else if (!r.ok) toast('NeuralMidi failed: ' + r.error, true);
  else log('neuralmidi → ' + r.path);
}

async function doSigillum() {
  if (!window.pywebview || !window.pywebview.api) return toast('Desktop bridge offline', true);
  const btn = $('sg-run');
  btn.disabled = true; btn.textContent = 'Composing…';
  const r = await window.pywebview.api.sigillum($('sg-planet').value, $('sg-text').value, $('sg-mode').value,
    parseInt($('sg-tonic').value || '60', 10), parseFloat($('sg-tempo').value || '72'));
  btn.disabled = false; btn.textContent = 'Compose';
  showComposeResult('sg-result', r, r.ok ? [`${r.title}`, `${r.planet} · ${r.mode} · ${r.form} · ${r.notes} notes · ${r.duration_s} s`] : []);
  if (!r.ok) toast('Sigillum failed: ' + r.error, true);
  else log('sigillum → ' + r.path);
}

function renderMasterResult(p) {
  const root = $('master-result');
  if (!root) return;
  root.innerHTML = '';
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.src = p.wav_url;
  root.appendChild(audio);
  const table = document.createElement('table');
  for (const st of (p.report && p.report.stages) || []) {
    const tr = document.createElement('tr');
    tr.className = st.ran ? '' : 'skip';
    const m = st.metrics || {};
    const bits = [];
    for (const k of ['lufs_in', 'lufs_out', 'gain_db', 'tp_trim_db', 'true_peak_dbtp']) {
      if (typeof m[k] === 'number') bits.push(`${k} ${m[k].toFixed(2)}`);
    }
    tr.innerHTML = `<td>${escapeHtml(st.name)}</td><td>${st.ran ? 'ran' : 'skipped'}</td>` +
      `<td>${escapeHtml(st.reason || '')}</td><td>${escapeHtml(bits.join(' · '))}</td>`;
    table.appendChild(tr);
  }
  root.appendChild(table);
}


/* ═══════════════════════════════════════════════════════════════════
   SCORE
   ═══════════════════════════════════════════════════════════════════ */

function renderAbc(abc) {
  const view = $('score-view');
  if (!view) return;
  view.innerHTML = '';
  try {
    if (typeof ABCJS !== 'undefined') {
      ABCJS.renderAbc(view, abc, { responsive: 'resize', staffwidth: 740 });
    } else {
      view.innerHTML = `<pre class="empty">${escapeHtml(abc)}</pre>`;
    }
  } catch (e) {
    view.innerHTML =
      `<div class="empty">Render error: ${escapeHtml(String(e))}</div>`;
  }
}

function initAbcEditor(initialAbc) {
  const input = $('abc-input');
  if (!input) return;
  input.value = initialAbc || '';

  if (typeof ABCJS === 'undefined' || !ABCJS.Editor) return;
  try {
    abcEditor = new ABCJS.Editor('abc-input', {
      canvas_id: 'abc-paper',
      warnings_id: 'abc-warnings',
      generate_warnings: true,
      indicate_changed: true,
      abcjsParams: {
        responsive: 'resize',
        staffwidth: 740,
        add_classes: true,
      },
      onchange: () => {
        const btn = $('render-from-editor');
        if (btn) btn.disabled = false;
      },
    });
  } catch (e) {
    console.warn('ABC editor init failed', e);
  }
}

async function doRenderFromEditor() {
  const newAbc = $('abc-input').value;
  if (!newAbc.trim()) return toast('Score is empty', true);
  if (!window.pywebview || !window.pywebview.api) return;

  $('render-from-editor').disabled = true;
  $('render-from-editor').textContent = 'Rendering…';

  const r = await window.pywebview.api.render_from_abc(currentAbcPath, newAbc);

  $('render-from-editor').textContent = 'Re-render audio';
  if (!r.ok) return toast('Render failed: ' + r.error, true);

  currentWavUrl  = r.result.wav_url;
  currentWavPath = r.result.wav_path;
  if ($('master-run')) $('master-run').disabled = false;
  if ($('vocal-run')) $('vocal-run').disabled = false;
  loadWaveform(currentWavUrl);
  $('score-view').dataset.abc = newAbc;
  renderAbc(newAbc);
  setScoreMode('view');
  toast('Re-rendered');
}

async function doExportAbc() {
  const text = $('score-edit') && !$('score-edit').hidden
    ? $('abc-input').value
    : ($('score-view').dataset.abc || '');
  if (!text || !currentAbcPath) return toast('Nothing to export', true);
  if (!window.pywebview || !window.pywebview.api) return;
  const r = await window.pywebview.api.export_abc(currentAbcPath, text);
  r.ok ? toast('ABC saved') : toast('Export failed: ' + r.error, true);
}


/* ═══════════════════════════════════════════════════════════════════
   HISTORY
   ═══════════════════════════════════════════════════════════════════ */

async function refreshHistory() {
  if (!window.pywebview || !window.pywebview.api) return;
  const items = await window.pywebview.api.history(50);
  const root = $('history');
  if (!root) return;
  root.innerHTML = '';
  if (!items.length) {
    root.innerHTML = '<div class="empty">No history yet.</div>';
    return;
  }
  for (const it of items) {
    const d = document.createElement('div');
    d.className = 'history-item';
    const seed  = it.seed ?? '?';
    const style = it.style || it.backend || '';
    d.innerHTML =
      `<span class="hi-seed">seed ${seed}</span>` +
      `<span class="hi-style">${escapeHtml(style)}</span>`;
    d.onclick = () => loadHistoryEntry(it);
    root.appendChild(d);
  }
}

function loadHistoryEntry(it) {
  const url = it.wav_url;
  if (!url) return;
  currentWavUrl  = url;
  currentWavPath = it.wav_path || it.wav;
  if ($('master-run')) $('master-run').disabled = false;
  if ($('vocal-run')) $('vocal-run').disabled = false;
  loadWaveform(url);
  if (it.abc_text) {
    currentAbcPath = it.abc_path || it.abc;
    $('score-view').dataset.abc = it.abc_text;
    renderAbc(it.abc_text);
    const rfe = $('render-from-editor');
    if (rfe) rfe.disabled = false;
    const ea = $('export-abc');
    if (ea) ea.disabled = false;
  }
  switchTab('score');
}


/* ═══════════════════════════════════════════════════════════════════
   WAVEFORM  — uses the persistent media element
   ═══════════════════════════════════════════════════════════════════ */

function loadWaveform(url) {
  if (wavesurfer) { wavesurfer.destroy(); wavesurfer = null; }

  // ═══ FIX 1 ═══
  const media = ensureMediaElement();

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    media,
    waveColor: themeVar('--wave', '#4f6258'),
    progressColor: themeVar('--wave-progress', '#f0a81c'),
    cursorColor: themeVar('--wave-cursor', '#ffd36e'),
    height: 64,
    normalize: true,
    barWidth: 2,
    barRadius: 2,
    barGap: 1,
  });

  wavesurfer.load(url);

  wavesurfer.on('ready', () => {
    const play = $('play');
    if (play) play.disabled = false;
    updateTime(0, wavesurfer.getDuration());
    connectVisualizerAudio();
  });
  wavesurfer.on('audioprocess', () =>
    updateTime(wavesurfer.getCurrentTime(), wavesurfer.getDuration()));
  wavesurfer.on('play',  () => { const p = $('play'); if (p) p.textContent = '⏸'; });
  wavesurfer.on('pause', () => { const p = $('play'); if (p) p.textContent = '▶'; });
  wavesurfer.on('error', (e) => log('waveform error: ' + e));
}

function updateTime(cur, total) {
  const el = $('time');
  if (el) el.textContent = `${fmt(cur)} / ${fmt(total)}`;
}
function fmt(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}


/* ═══════════════════════════════════════════════════════════════════
   JNC EVENT BUS  — Python → JS
   ═══════════════════════════════════════════════════════════════════ */

window.__jnc_emit = function (channel, payload) {
  switch (channel) {
    case 'progress': {
      const wrap = $('progress-wrap');
      if (!wrap) break;
      wrap.hidden = false;
      const pct = payload.pct || 0;
      const fill = $('progress-fill');
      if (fill) fill.style.width = pct + '%';
      const label = $('progress-label');
      if (label) label.textContent =
        `${payload.stage || ''}${payload.engine ? ' · ' + payload.engine : ''} ${pct}%`;
      if (pct >= 100) {
        setTimeout(() => {
          wrap.hidden = true;
          if (fill) fill.style.width = '0%';
        }, 600);
      }
      break;
    }

    case 'master_done':
      if ($('master-run')) { $('master-run').disabled = false; $('master-run').textContent = 'Master'; }
      renderMasterResult(payload);
      setReadout(payload.report);
      log('master → ' + payload.wav_path);
      toast('Mastered');
      break;

    case 'vocal_done': {
      if ($('vocal-run')) { $('vocal-run').disabled = false; $('vocal-run').textContent = 'Calibrate vocal'; }
      const root = $('master-result');
      if (root) {
        root.innerHTML = '';
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = payload.wav_url;
        root.appendChild(audio);
      }
      log('vocal → ' + payload.wav_path);
      toast('Vocal calibrated');
      break;
    }

    case 'vocal_error':
      if ($('vocal-run')) { $('vocal-run').disabled = false; $('vocal-run').textContent = 'Calibrate vocal'; }
      toast('Vocal calibration failed: ' + payload.error, true);
      break;

    case 'master_error':
      if ($('master-run')) { $('master-run').disabled = false; $('master-run').textContent = 'Master'; }
      toast('Master failed: ' + payload.error, true);
      log('master error: ' + payload.error);
      break;

    case 'compose_done':
      if ($('markov-run')) { $('markov-run').disabled = false; $('markov-run').textContent = 'Compose'; }
      if ($('generate')) {
        $('generate').disabled = false;
        $('generate').textContent = 'Generate';
      }
      currentWavUrl  = payload.wav_url;
      currentWavPath = payload.wav_path;
      currentAbcPath = payload.abc_path;
      setReadout(null);
      if (payload.receipt) {
        const m = payload.metrics || {};
        log('seed receipt ' + payload.receipt.scaffold + ' ' + payload.receipt.hash.slice(0, 16) +
            ' | entropy ' + m.entropy_bits + ' | repetition ' + m.repetition_index +
            ' | constraint rejection ' + JSON.stringify(m.violation_rate));
      }
      loadWaveform(currentWavUrl);
      if (payload.abc_text) {
        if ($('score-view')) $('score-view').dataset.abc = payload.abc_text;
        renderAbc(payload.abc_text);
        if ($('abc-input')) $('abc-input').value = payload.abc_text;
        initAbcEditor(payload.abc_text);
        if ($('render-from-editor')) $('render-from-editor').disabled = true;
        if ($('export-abc')) $('export-abc').disabled = false;
      }
      if ($('stems')) $('stems').disabled = false;
      if ($('reveal')) $('reveal').disabled = false;
      if ($('master-run')) $('master-run').disabled = false;
  if ($('vocal-run')) $('vocal-run').disabled = false;
      switchTab('score');
      toast('Done');
      refreshHistory();
      break;

    case 'compose_error':
      if ($('markov-run')) { $('markov-run').disabled = false; $('markov-run').textContent = 'Compose'; }
      if ($('generate')) {
        $('generate').disabled = false;
        $('generate').textContent = 'Generate';
      }
      toast('Error: ' + payload.error, true);
      log('[error] ' + payload.error);
      break;

    case 'stems_progress':
      log(`[stems] ${payload.stage}`);
      break;

    case 'stems_done':
      if ($('stems')) {
        $('stems').disabled = false;
        $('stems').textContent = 'Split stems';
      }
      renderStems(payload);
      toast('Stems ready');
      break;

    case 'stems_error':
      if ($('stems')) {
        $('stems').disabled = false;
        $('stems').textContent = 'Split stems';
      }
      toast('Stems error: ' + payload.error, true);
      break;
  }
};

function renderStems(stems) {
  const root = $('stems-grid') || $('stems');
  if (!root) return;
  root.innerHTML = '';
  for (const [code, info] of Object.entries(stems)) {
    const c = document.createElement('div');
    c.className = 'stem-card';
    c.innerHTML = `<h4>${code}</h4>`;
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = (info && info.url) ? info.url : info;
    audio.preload = 'none';
    c.appendChild(audio);
    root.appendChild(c);
  }
}


/* ═══════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════ */

function log(line) {
  const pre = $('log');
  if (!pre) return;
  pre.textContent += line + '\n';
  pre.scrollTop = pre.scrollHeight;
}

let toastTimer = null;
function toast(msg, isErr = false) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ==========================================================================
   2012 TOYOTA CAMRY iDRIVE SIMULATOR
   js/main.js — Complete Interactive Engine (Milestones 2–5)
   Zero external dependencies, runs from file:///
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     STATE
     ====================================================================== */
  const STATE = {
    theme: 'cic',       // 'cic' | 'mmi' | 'pano'
    palette: 'optitron',// 'optitron' | 'champagne' | 'amber'
    mode: 'night',      // 'night' | 'day'
    view: 'home',       // 'home' | 'nav' | 'media' | 'perf'
    ledState: 'bootup', // 'bootup' | 'pairing' | 'tablet' | 'phone'
    volume: 72,
    muted: false,
    isPlaying: true,
    currentTrack: 0,
    carouselIndex: 0,
    mmiIndex: 0,
    rpm: 850,
    coolant: 195,
    voltage: 14.2,
    trip: { mpg: 28.4, fuel: 1.3, miles: 36.8, time: 4440 },
    tripRunning: false,
    diagWarn: false,
    tirePsi: [33, 33, 32, 33],
    mediaProgress: 0.38,
    voltageCharging: true,
  };

  /* ======================================================================
     TRACKS
     ====================================================================== */
  const TRACKS = [
    { title: 'Midnight Drive', artist: 'Tycho', album: 'Epoch', dur: '4:22', gradient: 'linear-gradient(135deg, #1a1a3e 0%, #00d2ff 50%, #0a0a1e 100%)' },
    { title: 'Sundial', artist: 'Com Truise', album: 'Wave 1', dur: '5:01', gradient: 'linear-gradient(135deg, #2d0030 0%, #9b00ff 50%, #120010 100%)' },
    { title: 'Neon Highway', artist: 'Perturbator', album: 'I Am the Night', dur: '6:14', gradient: 'linear-gradient(135deg, #1a0000 0%, #ff2200 50%, #0a0000 100%)' },
    { title: 'Still Waiting', artist: 'Bonobo', album: 'Black Sands', dur: '3:48', gradient: 'linear-gradient(135deg, #001a0a 0%, #00ff88 50%, #000a05 100%)' },
    { title: 'Crystal Method', artist: 'Hammock', album: 'Oblivion Hymns', dur: '5:33', gradient: 'linear-gradient(135deg, #0d0d20 0%, #5588ff 50%, #050510 100%)' },
  ];

  const CAROUSEL_ITEMS = [
    { icon: '🗺️', label: 'Navigation', sub: 'GPS Active', view: 'nav' },
    { icon: '🎵', label: 'Media', sub: 'Bluetooth Audio', view: 'media' },
    { icon: '📊', label: 'Performance', sub: 'Gauges & Trip', view: 'perf' },
    { icon: '📱', label: 'Android Auto', sub: 'Wireless AA', view: null },
    { icon: '⚙️', label: 'Settings', sub: 'System Config', view: null },
  ];

  const MMI_ITEMS = [
    { icon: '🗺️', title: 'Navigation', desc: 'Turn-by-turn guidance', view: 'nav' },
    { icon: '🎵', title: 'Audio / Media', desc: 'Bluetooth · Spotify', view: 'media' },
    { icon: '📊', title: 'Performance', desc: 'OBD2 live data', view: 'perf' },
    { icon: '📱', title: 'Android Auto', desc: 'Wireless projection', view: null },
    { icon: '⚙️', title: 'Vehicle Setup', desc: 'System settings', view: null },
    { icon: 'ℹ️', title: 'Trip Info', desc: 'Route summary', view: null },
  ];

  /* ======================================================================
     AUDIO ENGINE (Web Audio API — Click Synthesizer)
     ====================================================================== */
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return audioCtx;
  }

  function playClick() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.012, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3200;
    filter.Q.value = 1.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.012);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  function playButton() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  /* ======================================================================
     DOM HELPERS
     ====================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function setData(key, val, el = document.documentElement) { el.dataset[key] = val; }

  /* ======================================================================
     TOAST
     ====================================================================== */
  function toast(msg, dur = 1600) {
    let c = $('#toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      $('#head-unit-display').appendChild(c);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.classList.add('fade-out');
      t.addEventListener('animationend', () => t.remove());
    }, dur);
  }

  /* ======================================================================
     VIEW NAVIGATION
     ====================================================================== */
  function setView(viewId) {
    if (STATE.view === viewId) return;
    const prev = $(`#view-${STATE.view}`);
    const next = $(`#view-${viewId}`);
    if (!next) return;
    STATE.view = viewId;
    if (prev) { prev.style.opacity = '0'; setTimeout(() => { prev.classList.remove('active'); prev.style.opacity = ''; }, 280); }
    next.classList.add('active');
    requestAnimationFrame(() => { next.style.opacity = '1'; });
    // Sync active hotkey
    $$('.hotkey-btn').forEach(b => {
      b.classList.toggle('active-route', b.dataset.hotkey && b.dataset.hotkey.toLowerCase() === viewId);
    });
    // Sync carousel/pano/mmi active
    if (viewId === 'home') renderHome();
  }

  /* ======================================================================
     THEME / PALETTE / MODE TOGGLES
     ====================================================================== */
  const THEMES = ['cic', 'mmi', 'pano'];
  const PALETTES = ['optitron', 'champagne', 'amber'];
  const THEME_LABELS = { cic: 'CIC', mmi: 'MMI', pano: 'PANO' };
  const PALETTE_LABELS = { optitron: 'OPTITRON', champagne: 'CHAMPAGNE', amber: 'AMBER' };

  function applyTheme() {
    const hud = $('#head-unit-display');
    if (!hud) return;
    hud.dataset.theme = STATE.theme;
    hud.dataset.palette = STATE.palette;
    hud.dataset.mode = STATE.mode;
    document.documentElement.dataset.palette = STATE.palette;
    document.documentElement.dataset.mode = STATE.mode;
    const badgeTheme = $('#badge-val-theme');
    const badgePalette = $('#badge-val-palette');
    const badgeMode = $('#badge-val-mode');
    const badgeModeIcon = $('#badge-icon-mode');
    if (badgeTheme) badgeTheme.textContent = THEME_LABELS[STATE.theme];
    if (badgePalette) badgePalette.textContent = PALETTE_LABELS[STATE.palette];
    if (badgeMode) badgeMode.textContent = STATE.mode.toUpperCase();
    if (badgeModeIcon) badgeModeIcon.textContent = STATE.mode === 'night' ? '🌙' : '☀️';
    renderHome();
  }

  function cycleTheme() {
    STATE.theme = THEMES[(THEMES.indexOf(STATE.theme) + 1) % THEMES.length];
    applyTheme();
    toast(`THEME: ${THEME_LABELS[STATE.theme]}`);
    playButton();
  }

  function cyclePalette() {
    STATE.palette = PALETTES[(PALETTES.indexOf(STATE.palette) + 1) % PALETTES.length];
    applyTheme();
    toast(`PALETTE: ${PALETTE_LABELS[STATE.palette]}`);
    playButton();
  }

  function toggleMode() {
    STATE.mode = STATE.mode === 'night' ? 'day' : 'night';
    applyTheme();
    toast(`${STATE.mode.toUpperCase()} MODE`);
    playButton();
  }

  /* ======================================================================
     HOME VIEW RENDERING
     ====================================================================== */
  function renderHome() {
    const homeView = $('#view-home');
    if (!homeView) return;
    homeView.innerHTML = '';

    if (STATE.theme === 'cic') renderCIC(homeView);
    else if (STATE.theme === 'mmi') renderMMI(homeView);
    else renderPano(homeView);
  }

  /* --- CIC --- */
  function renderCIC(container) {
    container.style.display = 'flex';
    container.style.flexDirection = 'row';

    const left = document.createElement('div');
    left.className = 'cic-left';

    // CIC header bar
    const cicHeader = document.createElement('div');
    cicHeader.style.cssText = 'width:100%;text-align:center;font-size:10px;font-weight:700;letter-spacing:3px;color:var(--text-muted,#536279);text-transform:uppercase;margin-bottom:12px;';
    cicHeader.textContent = 'MAIN MENU';
    left.appendChild(cicHeader);

    const track = document.createElement('div');
    track.className = 'carousel-track';
    track.id = 'carousel-track';

    const ci = STATE.carouselIndex;
    // Only render visible cards: prev-2, prev-1, active, next-1, next-2
    for (let i = 0; i < CAROUSEL_ITEMS.length; i++) {
      const item = CAROUSEL_ITEMS[i];
      const offset = i - ci;
      if (Math.abs(offset) > 2) continue; // Skip far cards entirely

      const card = document.createElement('div');
      card.className = 'carousel-card';
      if (offset === 0) card.classList.add('active');
      else if (offset === -1) card.classList.add('prev-1');
      else if (offset === 1) card.classList.add('next-1');
      else {
        // Far adjacent — very faded
        card.style.opacity = '0.2';
        card.style.filter = 'brightness(0.3)';
        card.style.transform = `scale(0.7) perspective(600px) rotateY(${offset > 0 ? -18 : 18}deg)`;
        card.style.flex = '0 0 140px';
      }

      card.innerHTML = `
        <div class="card-icon">${item.icon}</div>
        <div class="card-label">${item.label}</div>
        <div class="card-sub">${item.sub}</div>`;
      card.addEventListener('click', () => {
        STATE.carouselIndex = i;
        renderHome();
        playButton();
        if (item.view) setView(item.view);
      });
      track.appendChild(card);
    }
    left.appendChild(track);

    // Selection indicator dots
    const dots = document.createElement('div');
    dots.className = 'carousel-dots';
    dots.style.marginTop = '8px';
    CAROUSEL_ITEMS.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'carousel-dot' + (i === ci ? ' active' : '');
      dots.appendChild(d);
    });
    left.appendChild(dots);

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:14px;font-size:9px;letter-spacing:1.5px;color:var(--text-muted,#536279);text-transform:uppercase;';
    hint.textContent = '← Scroll Dial or Arrow Keys →  •  Enter to Open';
    left.appendChild(hint);

    // Right panel widgets
    const right = document.createElement('div');
    right.className = 'cic-right';

    const now = TRACKS[STATE.currentTrack];
    right.innerHTML = `
      <div class="cic-widget">
        <div class="widget-title">Now Playing</div>
        <div class="widget-val" style="font-size:14px;line-height:1.2">${now.title}</div>
        <div class="widget-sub">${now.artist} · ${now.album}</div>
        <div class="widget-bar"><div class="widget-bar-fill" style="width:${Math.round(STATE.mediaProgress * 100)}%"></div></div>
      </div>
      <div class="cic-widget">
        <div class="widget-title">Engine</div>
        <div class="widget-val">${STATE.rpm.toLocaleString()} <span style="font-size:11px;font-weight:400">RPM</span></div>
        <div class="widget-sub">Idle · Engine ON</div>
      </div>
      <div class="cic-widget">
        <div class="widget-title">Coolant Temp</div>
        <div class="widget-val" style="color:${STATE.coolant > 220 ? '#ff4400' : STATE.coolant < 160 ? '#44aaff' : '#00ff88'}">${STATE.coolant}°F</div>
        <div class="widget-sub">${STATE.coolant > 220 ? '⚠ OVERHEATING' : STATE.coolant < 160 ? '❄ WARMING UP' : '✓ Normal'}</div>
        <div class="widget-bar"><div class="widget-bar-fill" style="width:${Math.round((STATE.coolant-120)/(240-120)*100)}%;background:${STATE.coolant > 220 ? '#ff4400' : STATE.coolant < 160 ? '#44aaff' : '#00ff88'}"></div></div>
      </div>
      <div class="cic-widget">
        <div class="widget-title">Battery</div>
        <div class="widget-val">${STATE.voltage.toFixed(1)}V</div>
        <div class="widget-sub">${STATE.voltageCharging ? '⚡ Charging' : '· Resting'}</div>
      </div>`;

    container.appendChild(left);
    container.appendChild(right);
  }

  /* --- MMI --- */
  function renderMMI(container) {
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.innerHTML = `
      <div class="mmi-header">TOYOTA CAMRY  •  MMI NAVIGATION PLUS</div>
      <div class="mmi-body">
        <div class="mmi-sidebar" id="mmi-sidebar"></div>
        <div class="mmi-list" id="mmi-list"></div>
      </div>
      <div class="mmi-softkeys">
        <div class="mmi-softkey" data-view="nav">🗺️ NAV</div>
        <div class="mmi-softkey" data-view="media">🎵 MEDIA</div>
        <div class="mmi-softkey" data-view="perf">📊 PERF</div>
        <div class="mmi-softkey">⚙️ SETUP</div>
      </div>`;

    const cats = [
      { icon: '🗺️', label: 'NAV' }, { icon: '🎵', label: 'AUD' },
      { icon: '📊', label: 'CAR' }, { icon: '📱', label: 'TEL' },
      { icon: '⚙️', label: 'SYS' },
    ];

    const sidebar = $('#mmi-sidebar', container);
    cats.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'mmi-cat' + (i === 0 ? ' active' : '');
      el.innerHTML = `<span style="font-size:22px">${c.icon}</span><span class="mmi-cat-label">${c.label}</span>`;
      sidebar.appendChild(el);
    });

    const list = $('#mmi-list', container);
    MMI_ITEMS.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'mmi-item' + (i === STATE.mmiIndex ? ' active' : '');
      el.innerHTML = `
        <div class="mmi-item-icon">${item.icon}</div>
        <div class="mmi-item-text">
          <div class="mmi-item-title">${item.title}</div>
          <div class="mmi-item-desc">${item.desc}</div>
        </div>
        <div class="mmi-item-arrow">›</div>`;
      el.addEventListener('click', () => {
        STATE.mmiIndex = i; renderHome(); playButton();
        if (item.view) setView(item.view);
      });
      list.appendChild(el);
    });

    $$('.mmi-softkey', container).forEach(sk => {
      sk.addEventListener('click', () => { if (sk.dataset.view) { setView(sk.dataset.view); playButton(); } });
    });
  }

  /* --- PANO --- */
  function renderPano(container) {
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(3, 1fr)';
    container.style.gridTemplateRows = 'repeat(2, 1fr)';
    container.style.gap = '16px';
    container.style.padding = '24px';

    const tiles = [
      { icon: '🗺️', label: 'Navigation', view: 'nav' },
      { icon: '🎵', label: 'Media', view: 'media' },
      { icon: '📊', label: 'Performance', view: 'perf' },
      { icon: '📱', label: 'Android Auto', view: null },
      { icon: '📶', label: 'Connections', view: null },
      { icon: '⚙️', label: 'Settings', view: null },
    ];

    tiles.forEach(tile => {
      const el = document.createElement('div');
      el.className = 'pano-tile';
      el.innerHTML = `<div class="pano-icon">${tile.icon}</div><div class="pano-label">${tile.label}</div>`;
      el.addEventListener('click', () => { playButton(); if (tile.view) setView(tile.view); });
      container.appendChild(el);
    });
  }

  /* ======================================================================
     MEDIA VIEW
     ====================================================================== */
  function buildMediaView() {
    const view = $('#view-media');
    if (!view || view.dataset.built) return;
    view.dataset.built = '1';
    view.style.display = 'flex';
    view.style.flexDirection = 'row';

    view.innerHTML = `
      <div class="media-left">
        <div class="album-art">
          <div class="album-art-gradient" id="album-art-gradient"></div>
          <div class="album-spinning-label">
            <div class="album-disc"></div>
          </div>
        </div>
        <div class="media-track-info">
          <div class="media-track-name" id="media-track-name"></div>
          <div class="media-artist" id="media-artist"></div>
          <div class="media-album" id="media-album"></div>
        </div>
        <div class="media-progress-wrap">
          <div class="media-time-row">
            <span id="media-elapsed">0:00</span>
            <span id="media-total">0:00</span>
          </div>
          <div class="media-progress-track">
            <div class="media-progress-fill" id="media-progress-fill"></div>
          </div>
        </div>
        <div class="media-controls">
          <button class="media-btn" id="btn-prev">⏮</button>
          <button class="media-btn play-pause" id="btn-playpause">⏸</button>
          <button class="media-btn" id="btn-next">⏭</button>
        </div>
        <div class="media-source-row">
          <div class="source-chip active">BT Audio</div>
          <div class="source-chip">Spotify</div>
          <div class="source-chip">Radio</div>
        </div>
      </div>
      <div class="media-right">
        <div class="visualizer-wrap">
          <div class="visualizer-label">Audio Spectrum</div>
          <div id="audio-visualizer"></div>
        </div>
        <div class="queue-wrap">
          <div class="queue-label">Up Next</div>
          <div id="track-queue"></div>
        </div>
      </div>`;

    // Volume toast
    const vt = document.createElement('div');
    vt.id = 'volume-toast';
    vt.innerHTML = `
      <div class="vol-toast-label">Volume</div>
      <div class="vol-toast-row">
        <div class="vol-toast-num" id="vol-num">${STATE.volume}</div>
        <div class="vol-toast-bar"><div class="vol-toast-fill" id="vol-fill" style="width:${STATE.volume}%"></div></div>
      </div>
      <div class="vol-mute-badge">MUTED</div>`;
    $('#head-unit-display').appendChild(vt);

    buildVisualizer();
    updateMediaTrack();

    $('#btn-playpause', view).addEventListener('click', () => togglePlay());
    $('#btn-next', view).addEventListener('click', () => nextTrack());
    $('#btn-prev', view).addEventListener('click', () => prevTrack());
    $$('.source-chip', view).forEach(c => c.addEventListener('click', () => { $$('.source-chip', view).forEach(x => x.classList.remove('active')); c.classList.add('active'); playButton(); }));
  }

  function updateMediaTrack() {
    const t = TRACKS[STATE.currentTrack];
    const tname = $('#media-track-name'); if (tname) tname.textContent = t.title;
    const tart = $('#media-artist'); if (tart) tart.textContent = t.artist;
    const talb = $('#media-album'); if (talb) talb.textContent = t.album;
    const tgrad = $('#album-art-gradient'); if (tgrad) tgrad.style.background = t.gradient;
    const ttot = $('#media-total'); if (ttot) ttot.textContent = t.dur;
    const telap = $('#media-elapsed'); if (telap) telap.textContent = '0:00';
    const pfill = $('#media-progress-fill'); if (pfill) pfill.style.width = '0%';
    STATE.mediaProgress = 0;
    buildQueue();
  }

  function buildQueue() {
    const q = $('#track-queue'); if (!q) return;
    q.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'queue-item' + (i === STATE.currentTrack ? ' now-playing' : '');
      const isNow = i === STATE.currentTrack;
      el.innerHTML = `
        <div class="q-num">${isNow ? '' : (i + 1)}</div>
        ${isNow ? '<div class="q-art-dot"></div>' : '<div style="width:8px"></div>'}
        <div class="q-info">
          <div class="q-title">${t.title}</div>
          <div class="q-artist">${t.artist}</div>
        </div>
        <div class="q-dur">${t.dur}</div>`;
      el.addEventListener('click', () => { STATE.currentTrack = i; updateMediaTrack(); playButton(); });
      q.appendChild(el);
    });
  }

  function togglePlay() {
    STATE.isPlaying = !STATE.isPlaying;
    const btn = $('#btn-playpause');
    if (btn) btn.textContent = STATE.isPlaying ? '⏸' : '▶';
    playButton();
  }

  function nextTrack() {
    STATE.currentTrack = (STATE.currentTrack + 1) % TRACKS.length;
    updateMediaTrack(); playButton();
  }

  function prevTrack() {
    STATE.currentTrack = (STATE.currentTrack - 1 + TRACKS.length) % TRACKS.length;
    updateMediaTrack(); playButton();
  }

  /* Visualizer */
  let vizBars = [];
  let vizPhase = 0;

  function buildVisualizer() {
    const viz = $('#audio-visualizer'); if (!viz) return;
    viz.innerHTML = '';
    vizBars = [];
    for (let i = 0; i < 28; i++) {
      const bar = document.createElement('div');
      bar.className = 'viz-bar';
      bar.style.height = '4px';
      viz.appendChild(bar);
      vizBars.push(bar);
    }
  }

  function tickVisualizer() {
    if (!vizBars.length || !STATE.isPlaying) return;
    vizPhase += 0.06;
    const baseAmp = STATE.isPlaying ? 68 : 4;
    vizBars.forEach((bar, i) => {
      const freq = 0.35 + i * 0.08;
      const val = baseAmp * (0.3 + 0.7 * Math.abs(Math.sin(vizPhase * freq + i * 0.5))) * (1 - 0.4 * (Math.abs(i - 14) / 14));
      const h = Math.max(4, Math.min(80, val + Math.random() * 8));
      bar.style.height = h + 'px';
      const opacity = 0.5 + (h / 80) * 0.5;
      bar.style.opacity = opacity.toString();
    });
  }

  /* Progress tick */
  let lastProgressTick = 0;
  function tickMediaProgress(ts) {
    if (!STATE.isPlaying || STATE.view !== 'media') return;
    if (ts - lastProgressTick > 1000) {
      lastProgressTick = ts;
      STATE.mediaProgress = Math.min(1, STATE.mediaProgress + 0.004);
      const fill = $('#media-progress-fill'); if (fill) fill.style.width = (STATE.mediaProgress * 100) + '%';
      const track = TRACKS[STATE.currentTrack];
      const parts = track.dur.split(':');
      const total = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      const elapsed = Math.round(STATE.mediaProgress * total);
      const em = Math.floor(elapsed / 60), es = elapsed % 60;
      const telap = $('#media-elapsed'); if (telap) telap.textContent = `${em}:${es.toString().padStart(2,'0')}`;
      if (STATE.mediaProgress >= 1) { nextTrack(); STATE.mediaProgress = 0; }
    }
  }

  /* ======================================================================
     NAV VIEW
     ====================================================================== */
  function buildNavView() {
    const view = $('#view-nav');
    if (!view || view.dataset.built) return;
    view.dataset.built = '1';

    view.innerHTML = `
      <div class="nav-map-bg" id="nav-map-bg"></div>
      <div class="nav-route-card">
        <div class="nav-turn-icon">↰</div>
        <div>
          <div class="nav-instruction-text">Turn left in 0.3 mi</div>
          <div class="nav-street-name">Highland Ave → State Route 9</div>
        </div>
        <div class="nav-dist">
          <div class="nav-dist-val">0.3</div>
          <div class="nav-dist-unit">MILES</div>
        </div>
      </div>
      <div class="nav-gps-cursor">
        <svg viewBox="0 0 24 24" fill="var(--accent-primary,#00d2ff)">
          <path d="M12 2L4 20l8-4 8 4L12 2z"/>
        </svg>
      </div>
      <div class="nav-bottom-bar">
        <div class="nav-stat"><div class="nav-stat-val">12 MIN</div><div class="nav-stat-lbl">ETA</div></div>
        <div class="nav-stat"><div class="nav-stat-val">4.2 MI</div><div class="nav-stat-lbl">Remaining</div></div>
        <div class="nav-stat"><div class="nav-stat-val">35 MPH</div><div class="nav-stat-lbl">Speed Limit</div></div>
        <div class="nav-stat" style="margin-left:auto"><div class="nav-stat-val" id="nav-clock"></div><div class="nav-stat-lbl">Arrival</div></div>
      </div>`;

    // Draw SVG road map
    buildNavMap();
  }

  function buildNavMap() {
    const bg = $('#nav-map-bg'); if (!bg) return;
    bg.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 1280 752" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <rect width="1280" height="752" fill="#0c1118"/>
        <!-- City grid -->
        <g stroke="#162230" stroke-width="1" fill="none">
          ${Array.from({length:20}, (_,i) => `<line x1="${i*68}" y1="0" x2="${i*68}" y2="752"/>`).join('')}
          ${Array.from({length:12}, (_,i) => `<line x1="0" y1="${i*68}" x2="1280" y2="${i*68}"/>`).join('')}
        </g>
        <!-- City blocks -->
        <g fill="#111f2d" stroke="#162230" stroke-width="0.5">
          <rect x="80" y="80" width="120" height="80" rx="4"/>
          <rect x="240" y="80" width="160" height="80" rx="4"/>
          <rect x="80" y="200" width="80" height="120" rx="4"/>
          <rect x="240" y="200" width="200" height="60" rx="4"/>
          <rect x="480" y="80" width="140" height="160" rx="4"/>
          <rect x="680" y="80" width="100" height="80" rx="4"/>
          <rect x="820" y="80" width="180" height="80" rx="4"/>
          <rect x="680" y="200" width="320" height="100" rx="4"/>
          <rect x="900" y="320" width="200" height="140" rx="4"/>
          <rect x="80" y="400" width="180" height="100" rx="4"/>
          <rect x="300" y="380" width="140" height="120" rx="4"/>
          <rect x="80" y="550" width="300" height="80" rx="4"/>
          <rect x="450" y="450" width="200" height="180" rx="4"/>
          <rect x="700" y="450" width="300" height="120" rx="4"/>
        </g>
        <!-- Main roads -->
        <g stroke="#1e3a54" stroke-width="14" fill="none" stroke-linecap="round">
          <path d="M 0 380 Q 200 370 400 380 Q 640 395 800 380 Q 1000 360 1280 375"/>
          <path d="M 640 0 Q 635 200 640 380 Q 642 550 638 752"/>
          <path d="M 0 160 Q 300 155 640 160 Q 900 165 1280 160"/>
          <path d="M 200 0 Q 195 200 200 752"/>
          <path d="M 950 0 Q 955 200 950 752"/>
        </g>
        <!-- Route highlight -->
        <g stroke="#00d2ff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.85">
          <path d="M 640 752 Q 640 560 640 380 Q 640 260 500 250 Q 380 245 320 200 Q 280 160 200 160"/>
        </g>
        <g stroke="#00d2ff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.4">
          <path d="M 640 752 Q 640 560 640 380 Q 640 260 500 250 Q 380 245 320 200 Q 280 160 200 160"/>
        </g>
        <!-- Turn indicator -->
        <circle cx="200" cy="160" r="14" fill="none" stroke="#00d2ff" stroke-width="3" opacity="0.8"/>
        <circle cx="200" cy="160" r="7" fill="#00d2ff" opacity="0.8"/>
      </svg>`;
  }

  /* ======================================================================
     PERFORMANCE VIEW
     ====================================================================== */
  function buildPerfView() {
    const view = $('#view-perf');
    if (!view || view.dataset.built) return;
    view.dataset.built = '1';
    view.style.display = 'grid';

    view.innerHTML = `
      <!-- Tachometer Card -->
      <div class="perf-card tacho-card">
        <div class="perf-card-title">Engine RPM</div>
        <div class="tacho-svg-wrap" id="tacho-wrap"></div>
        <div class="tacho-controls">
          <input type="range" class="tacho-slider" id="rpm-slider" min="0" max="7500" value="${STATE.rpm}" step="50">
          <div class="tacho-rpm-label" id="rpm-label">${STATE.rpm.toLocaleString()} RPM</div>
        </div>
      </div>

      <!-- Coolant + Voltage Stack -->
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="perf-card gauge-card">
          <div class="perf-card-title">Coolant Temperature</div>
          <div class="arc-gauge-wrap" id="coolant-wrap"></div>
        </div>
        <div class="perf-card gauge-card">
          <div class="perf-card-title">Battery Voltage</div>
          <div class="volt-display" id="volt-val">${STATE.voltage.toFixed(1)}V</div>
          <div class="volt-label" id="volt-lbl">${STATE.voltageCharging ? 'CHARGING · ENGINE ON' : 'RESTING · ENGINE OFF'}</div>
          <div class="volt-bar"><div class="volt-bar-fill" id="volt-fill" style="width:${STATE.voltageCharging ? 85 : 40}%"></div></div>
          <button class="volt-state-btn" id="volt-toggle">Toggle Engine State</button>
        </div>
      </div>

      <!-- TPMS -->
      <div class="perf-card tpms-card" style="grid-row:1/3;grid-column:3/4;">
        <div class="perf-card-title">Tire Pressure · TPMS</div>
        <div class="tpms-silhouette">
          <div class="tpms-axle">
            <div class="tpms-tire">
              <div class="tire-glyph" id="tire-fl">${STATE.tirePsi[0]}</div>
              <div class="tire-label">FL</div>
            </div>
            <div class="tpms-car-body">
              <svg class="tpms-car-svg" width="80" height="120" viewBox="0 0 80 120">
                <rect x="10" y="20" width="60" height="80" rx="12" fill="#1e2638" stroke="#00d2ff" stroke-width="1.5"/>
                <rect x="18" y="10" width="44" height="30" rx="8" fill="#162030"/>
                <rect x="14" y="55" width="52" height="2" fill="#00d2ff" opacity="0.4"/>
              </svg>
            </div>
            <div class="tpms-tire">
              <div class="tire-glyph" id="tire-fr">${STATE.tirePsi[1]}</div>
              <div class="tire-label">FR</div>
            </div>
          </div>
          <div class="tpms-axle" style="margin-top:8px">
            <div class="tpms-tire">
              <div class="tire-glyph" id="tire-rl">${STATE.tirePsi[2]}</div>
              <div class="tire-label">RL</div>
            </div>
            <div class="tpms-car-body"></div>
            <div class="tpms-tire">
              <div class="tire-glyph" id="tire-rr">${STATE.tirePsi[3]}</div>
              <div class="tire-label">RR</div>
            </div>
          </div>
        </div>
        <div class="tpms-sliders">
          ${['FL','FR','RL','RR'].map((l,i) => `
            <div class="tpms-slider-row">
              <label>${l}</label>
              <input type="range" min="20" max="40" value="${STATE.tirePsi[i]}" data-tire="${i}" class="tpms-slider-input">
              <span>${STATE.tirePsi[i]} PSI</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Trip Computer -->
      <div class="perf-card trip-card">
        <div class="perf-card-title">Trip Computer</div>
        <div class="trip-grid">
          <div class="trip-stat"><div class="trip-stat-val" id="trip-mpg">${STATE.trip.mpg.toFixed(1)}</div><div class="trip-stat-lbl">MPG</div></div>
          <div class="trip-stat"><div class="trip-stat-val" id="trip-fuel">${STATE.trip.fuel.toFixed(2)}</div><div class="trip-stat-lbl">Gal Used</div></div>
          <div class="trip-stat"><div class="trip-stat-val" id="trip-miles">${STATE.trip.miles.toFixed(1)}</div><div class="trip-stat-lbl">Trip Miles</div></div>
          <div class="trip-stat"><div class="trip-stat-val" id="trip-time">${fmtTime(STATE.trip.time)}</div><div class="trip-stat-lbl">Drive Time</div></div>
        </div>
        <button class="trip-sim-btn" id="trip-sim-btn">▶ SIMULATE DRIVE</button>
      </div>

      <!-- Diagnostics -->
      <div class="perf-card diag-card">
        <div class="perf-card-title">Vehicle Diagnostics</div>
        <div class="diag-badge" id="diag-badge">
          <div class="diag-icon">✓</div>
          <div>ALL SYSTEMS OK</div>
        </div>
        <button class="diag-trigger-btn" id="diag-trigger">⚠ Trigger DTC Warning</button>
      </div>`;

    buildTacho();
    buildCoolantGauge();
    bindPerfEvents();
  }

  function fmtTime(secs) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  /* --- Tachometer SVG --- */
  function buildTacho() {
    const wrap = $('#tacho-wrap'); if (!wrap) return;
    const size = 180, cx = 90, cy = 95, r = 78;
    const startAngle = 135, endAngle = 405;

    function makeArcPath(startDeg, endDeg, inset = 0) {
      const s = (startDeg - 90) * Math.PI / 180;
      const e = (endDeg - 90) * Math.PI / 180;
      const ri = r - inset;
      const x1 = cx + ri * Math.cos(s), y1 = cy + ri * Math.sin(s);
      const x2 = cx + ri * Math.cos(e), y2 = cy + ri * Math.sin(e);
      const la = (endDeg - startDeg) > 180 ? 1 : 0;
      return `M ${x1} ${y1} A ${ri} ${ri} 0 ${la} 1 ${x2} ${y2}`;
    }

    const rpmToAngle = rpm => startAngle + (rpm / 8000) * 270;
    const needleAngle = rpmToAngle(STATE.rpm);

    wrap.innerHTML = `
      <svg id="tacho-svg" width="${size}" height="${size + 10}" viewBox="0 0 ${size} ${size + 10}">
        <!-- Background arc -->
        <path d="${makeArcPath(135, 405, 10)}" stroke="#1e2638" stroke-width="14" fill="none" stroke-linecap="round"/>
        <!-- Powerband (blue 2500-5000) -->
        <path d="${makeArcPath(135 + (2500/8000)*270, 135 + (5000/8000)*270, 10)}" stroke="#00d2ff" stroke-width="14" fill="none" stroke-linecap="round" opacity="0.35"/>
        <!-- Redline (6500+) -->
        <path d="${makeArcPath(135 + (6500/8000)*270, 405, 10)}" stroke="#ff2200" stroke-width="14" fill="none" stroke-linecap="round" opacity="0.7"/>
        <!-- Progress arc -->
        <path id="tacho-progress" d="${makeArcPath(135, needleAngle, 10)}" stroke="var(--accent-primary,#00d2ff)" stroke-width="14" fill="none" stroke-linecap="round"/>
        <!-- Ticks -->
        ${Array.from({length:17}, (_,i) => {
          const a = (135 + i*(270/16) - 90) * Math.PI / 180;
          const isMajor = i % 2 === 0;
          const r1 = r - 24, r2 = r - (isMajor ? 14 : 18);
          const x1 = cx + r1 * Math.cos(a), y1 = cy + r1 * Math.sin(a);
          const x2 = cx + r2 * Math.cos(a), y2 = cy + r2 * Math.sin(a);
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i >= 13 ? '#ff4400' : 'rgba(139,162,196,0.5)'}" stroke-width="${isMajor ? 2 : 1}" stroke-linecap="round"/>`;
        }).join('')}
        <!-- RPM labels -->
        ${[0,1,2,3,4,5,6,7,8].map((v,i) => {
          const a = (135 + i*(270/8) - 90) * Math.PI / 180;
          const rr = r - 38;
          const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
          return `<text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="middle" fill="${v >= 7 ? '#ff4400' : 'rgba(139,162,196,0.7)'}" font-size="9" font-weight="700">${v}</text>`;
        }).join('')}
        <!-- Needle -->
        <g id="tacho-needle-g" transform="rotate(${needleAngle - 90}, ${cx}, ${cy})">
          <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 20}" stroke="white" stroke-width="2.5" stroke-linecap="round" filter="url(#needleGlow)"/>
          <circle cx="${cx}" cy="${cy}" r="7" fill="#1a2234"/>
          <circle cx="${cx}" cy="${cy}" r="3.5" fill="var(--accent-primary,#00d2ff)"/>
        </g>
        <!-- Center value -->
        <text id="tacho-center-val" x="${cx}" y="${cy + 28}" text-anchor="middle" fill="var(--accent-primary,#00d2ff)" font-size="16" font-weight="700">${STATE.rpm.toLocaleString()}</text>
        <text x="${cx}" y="${cy + 42}" text-anchor="middle" fill="rgba(139,162,196,0.6)" font-size="9" font-weight="700" letter-spacing="2">RPM</text>
        <defs>
          <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      </svg>`;
  }

  function updateTacho(rpm) {
    STATE.rpm = Math.max(0, Math.min(7800, rpm));
    const needle = $('#tacho-needle-g');
    const progress = $('#tacho-progress');
    const valEl = $('#tacho-center-val');
    const label = $('#rpm-label');
    if (!needle) return;
    const startAngle = 135, endAngle = 405;
    const angle = startAngle + (STATE.rpm / 8000) * 270;
    needle.setAttribute('transform', `rotate(${angle - 90}, 90, 95)`);
    if (valEl) valEl.textContent = STATE.rpm.toLocaleString();
    if (label) label.textContent = `${STATE.rpm.toLocaleString()} RPM`;

    if (progress) {
      const size = 180, cx = 90, cy = 95, r = 78;
      function makeArcPath(startDeg, endDeg) {
        const s = (startDeg - 90) * Math.PI / 180;
        const e = (endDeg - 90) * Math.PI / 180;
        const ri = r - 10;
        const x1 = cx + ri * Math.cos(s), y1 = cy + ri * Math.sin(s);
        const x2 = cx + ri * Math.cos(e), y2 = cy + ri * Math.sin(e);
        const la = (endDeg - startDeg) > 180 ? 1 : 0;
        return `M ${x1} ${y1} A ${ri} ${ri} 0 ${la} 1 ${x2} ${y2}`;
      }
      if (angle > 135.5) progress.setAttribute('d', makeArcPath(135, angle));
    }
    if (label) label.style.color = STATE.rpm > 6500 ? '#ff4400' : 'var(--accent-primary,#00d2ff)';
  }

  /* --- Coolant Gauge --- */
  function buildCoolantGauge() {
    const wrap = $('#coolant-wrap'); if (!wrap) return;
    const size = 120, cx = 60, cy = 65, r = 50;
    const tempToAngle = t => 135 + ((t - 120) / (240 - 120)) * 270;

    function arcPath(startDeg, endDeg) {
      const s = (startDeg - 90) * Math.PI / 180;
      const e = (endDeg - 90) * Math.PI / 180;
      const ri = r - 8;
      const x1 = cx + ri * Math.cos(s), y1 = cy + ri * Math.sin(s);
      const x2 = cx + ri * Math.cos(e), y2 = cy + ri * Math.sin(e);
      return `M ${x1} ${y1} A ${ri} ${ri} 0 ${(endDeg - startDeg) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
    }

    const angle = tempToAngle(STATE.coolant);
    const color = STATE.coolant > 220 ? '#ff2200' : STATE.coolant < 160 ? '#4499ff' : '#00ff88';

    wrap.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path d="${arcPath(135, 405)}" stroke="#1e2638" stroke-width="10" fill="none"/>
        <path d="${arcPath(135, 185)}" stroke="#4499ff" stroke-width="10" fill="none" opacity="0.5"/>
        <path d="${arcPath(185, 350)}" stroke="#00ff88" stroke-width="10" fill="none" opacity="0.35"/>
        <path d="${arcPath(350, 405)}" stroke="#ff2200" stroke-width="10" fill="none" opacity="0.5"/>
        <path id="coolant-arc" d="${arcPath(135, angle)}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"/>
        <g id="coolant-needle" transform="rotate(${angle - 90}, ${cx}, ${cy})">
          <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 14}" stroke="white" stroke-width="2" stroke-linecap="round"/>
          <circle cx="${cx}" cy="${cy}" r="4" fill="#1a2234"/>
          <circle cx="${cx}" cy="${cy}" r="2" fill="${color}"/>
        </g>
        <text id="coolant-val" x="${cx}" y="${cy + 14}" text-anchor="middle" fill="${color}" font-size="14" font-weight="700">${STATE.coolant}°F</text>
        <text x="${cx}" y="${cy + 25}" text-anchor="middle" fill="rgba(139,162,196,0.5)" font-size="7" letter-spacing="1.5">COOLANT</text>
      </svg>
      <div class="arc-gauge-val" style="position:static;margin-top:4px;text-align:center">
        <div class="gauge-unit" style="font-size:9px;color:${color === '#00ff88' ? '#00ff88' : color === '#4499ff' ? '#4499ff' : '#ff4400'}">${STATE.coolant < 160 ? '❄ WARMING' : STATE.coolant > 220 ? '⚠ OVERHEAT' : '✓ NORMAL'}</div>
      </div>`;
  }

  function updateCoolant(temp) {
    STATE.coolant = Math.max(120, Math.min(240, temp));
    buildCoolantGauge(); // Rebuild for simplicity
  }

  /* --- Bind Perf Events --- */
  function bindPerfEvents() {
    // RPM Slider
    const rpmSlider = $('#rpm-slider');
    if (rpmSlider) rpmSlider.addEventListener('input', e => updateTacho(parseInt(e.target.value)));

    // Voltage toggle
    const voltToggle = $('#volt-toggle');
    if (voltToggle) voltToggle.addEventListener('click', () => {
      STATE.voltageCharging = !STATE.voltageCharging;
      STATE.voltage = STATE.voltageCharging ? 14.2 : 12.4;
      const vv = $('#volt-val'); if (vv) vv.textContent = STATE.voltage.toFixed(1) + 'V';
      const vl = $('#volt-lbl'); if (vl) vl.textContent = STATE.voltageCharging ? 'CHARGING · ENGINE ON' : 'RESTING · ENGINE OFF';
      const vf = $('#volt-fill'); if (vf) vf.style.width = (STATE.voltageCharging ? 85 : 40) + '%';
      playButton();
    });

    // TPMS sliders
    $$('.tpms-slider-input').forEach(sl => {
      sl.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.tire);
        STATE.tirePsi[i] = parseInt(e.target.value);
        e.target.nextElementSibling.textContent = STATE.tirePsi[i] + ' PSI';
        const ids = ['tire-fl','tire-fr','tire-rl','tire-rr'];
        const el = $(`#${ids[i]}`);
        if (el) {
          el.textContent = STATE.tirePsi[i];
          el.className = 'tire-glyph' + (STATE.tirePsi[i] < 28 ? ' warn' : '');
        }
      });
    });

    // Diagnostics
    const diagBtn = $('#diag-trigger');
    if (diagBtn) diagBtn.addEventListener('click', () => {
      STATE.diagWarn = !STATE.diagWarn;
      const badge = $('#diag-badge');
      if (badge) {
        badge.className = 'diag-badge' + (STATE.diagWarn ? ' warn' : '');
        badge.innerHTML = STATE.diagWarn
          ? '<div class="diag-icon">⚠</div><div>P0420 · CAT EFFICIENCY</div>'
          : '<div class="diag-icon">✓</div><div>ALL SYSTEMS OK</div>';
      }
      diagBtn.textContent = STATE.diagWarn ? '✓ Clear Warning' : '⚠ Trigger DTC Warning';
      playButton();
    });

    // Trip sim
    const tripBtn = $('#trip-sim-btn');
    if (tripBtn) tripBtn.addEventListener('click', () => {
      STATE.tripRunning = !STATE.tripRunning;
      tripBtn.classList.toggle('active', STATE.tripRunning);
      tripBtn.textContent = STATE.tripRunning ? '⏹ STOP SIMULATION' : '▶ SIMULATE DRIVE';
    });
  }

  /* Trip computer tick */
  let lastTripTick = 0;
  function tickTrip(ts) {
    if (!STATE.tripRunning || ts - lastTripTick < 1000) return;
    lastTripTick = ts;
    STATE.trip.time += 1;
    STATE.trip.miles += 0.012;
    STATE.trip.fuel += 0.0005;
    STATE.trip.mpg = STATE.trip.miles / STATE.trip.fuel;
    const tripMpg = $('#trip-mpg'); if (tripMpg) tripMpg.textContent = STATE.trip.mpg.toFixed(1);
    const tripFuel = $('#trip-fuel'); if (tripFuel) tripFuel.textContent = STATE.trip.fuel.toFixed(2);
    const tripMiles = $('#trip-miles'); if (tripMiles) tripMiles.textContent = STATE.trip.miles.toFixed(1);
    const tripTime = $('#trip-time'); if (tripTime) tripTime.textContent = fmtTime(STATE.trip.time);
  }

  /* ======================================================================
     CONSOLE CONTROLLER
     ====================================================================== */

  /* --- LED State Machine --- */
  const LED_STATES = ['bootup', 'pairing', 'tablet', 'phone'];
  const LED_LABELS = { bootup: 'BOOTING...', pairing: 'PAIRING', tablet: 'TABLET CONNECTED', phone: 'PHONE CONNECTED' };

  function cycleLED() {
    const idx = LED_STATES.indexOf(STATE.ledState);
    STATE.ledState = LED_STATES[(idx + 1) % LED_STATES.length];
    updateLEDs();
    toast(LED_LABELS[STATE.ledState]);
    playButton();
  }

  function updateLEDs() {
    const cls = `led-state-${STATE.ledState}`;
    $$('.led-dome').forEach(d => {
      d.className = 'led-dome';
      d.classList.add(cls);
    });
  }

  /* --- Rotary Dial --- */
  let dialRotation = 0;
  let dragActive = false;
  let dragStartY = 0;
  let dragStartAngle = 0;

  function setupDial() {
    const knurl = $('.dial-knurl-cylinder');
    const center = $('#dial-center-socket');
    if (!knurl || !center) return;

    // Mouse drag
    knurl.addEventListener('mousedown', e => {
      dragActive = true;
      dragStartY = e.clientY;
      dragStartAngle = dialRotation;
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragActive) return;
      const delta = (e.clientY - dragStartY);
      const newRotation = dragStartAngle + delta * 1.2;
      const detents = Math.round(newRotation / 15);
      const prevDetents = Math.round(dragStartAngle / 15);
      if (detents !== prevDetents) {
        const diff = detents - prevDetents;
        dialRotation = detents * 15;
        applyDialRotation();
        for (let i = 0; i < Math.abs(diff); i++) {
          dialStep(diff > 0 ? 1 : -1);
        }
      }
    });

    document.addEventListener('mouseup', () => { dragActive = false; });

    // Scroll wheel
    knurl.addEventListener('wheel', e => {
      e.preventDefault();
      dialStep(e.deltaY > 0 ? 1 : -1);
      dialRotation += e.deltaY > 0 ? 15 : -15;
      applyDialRotation();
    }, { passive: false });

    // Center push
    center.addEventListener('click', () => {
      center.classList.add('pressed');
      setTimeout(() => center.classList.remove('pressed'), 200);
      dialSelect();
      playButton();
    });
  }

  function applyDialRotation() {
    const face = $('.dial-brushed-face');
    if (face) face.style.transform = `rotate(${dialRotation}deg)`;
  }

  function dialStep(dir) {
    playClick();
    if (STATE.view === 'home') {
      if (STATE.theme === 'cic') {
        STATE.carouselIndex = Math.max(0, Math.min(CAROUSEL_ITEMS.length - 1, STATE.carouselIndex + dir));
        renderHome();
      } else if (STATE.theme === 'mmi') {
        STATE.mmiIndex = Math.max(0, Math.min(MMI_ITEMS.length - 1, STATE.mmiIndex + dir));
        renderHome();
      }
    }
  }

  function dialSelect() {
    if (STATE.view === 'home') {
      if (STATE.theme === 'cic') {
        const item = CAROUSEL_ITEMS[STATE.carouselIndex];
        if (item && item.view) setView(item.view);
      } else if (STATE.theme === 'mmi') {
        const item = MMI_ITEMS[STATE.mmiIndex];
        if (item && item.view) setView(item.view);
      }
    }
  }

  /* --- Volume Rocker --- */
  function setupVolume() {
    const up = $('#rocker-vol-up');
    const down = $('#rocker-vol-down');
    const mute = $('#rocker-mute-indicator');
    if (up) up.addEventListener('click', () => adjustVolume(5));
    if (down) down.addEventListener('click', () => adjustVolume(-5));
    if (mute) mute.addEventListener('click', () => toggleMute());
  }

  function adjustVolume(delta) {
    if (STATE.muted) toggleMute();
    STATE.volume = Math.max(0, Math.min(100, STATE.volume + delta));
    playButton();
    showVolumeToast();
  }

  function toggleMute() {
    STATE.muted = !STATE.muted;
    const dot = $('#rocker-mute-indicator');
    if (dot) dot.classList.toggle('muted', STATE.muted);
    showVolumeToast();
    playButton();
  }

  let volToastTimer = null;
  function showVolumeToast() {
    const vt = $('#volume-toast');
    if (!vt) {
      // Make sure media view is built first
      if ($('#view-media')) { buildMediaView(); showVolumeToast(); }
      return;
    }
    const vn = $('#vol-num'); if (vn) vn.textContent = STATE.muted ? '—' : STATE.volume;
    const vf = $('#vol-fill'); if (vf) vf.style.width = (STATE.muted ? 0 : STATE.volume) + '%';
    vt.classList.toggle('muted', STATE.muted);
    vt.classList.add('visible');
    clearTimeout(volToastTimer);
    volToastTimer = setTimeout(() => vt.classList.remove('visible'), 2000);
  }

  /* --- Hotkeys --- */
  function setupHotkeys() {
    const map = { HOME: 'home', BACK: 'home', NAV: 'nav', MEDIA: 'media', PERF: 'perf' };
    $$('.hotkey-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playButton();
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 180);
        const key = btn.dataset.hotkey;
        if (map[key]) { setView(map[key]); buildViewIfNeeded(map[key]); }
      });
    });

    // Connect button (LED cycle)
    const connectBtn = $('#btn-socket-connect');
    if (connectBtn) connectBtn.addEventListener('click', cycleLED);
  }

  function buildViewIfNeeded(view) {
    if (view === 'media') buildMediaView();
    else if (view === 'nav') buildNavView();
    else if (view === 'perf') buildPerfView();
  }

  /* --- Keyboard Shortcuts --- */
  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); dialStep(-1); dialRotation -= 15; applyDialRotation(); break;
        case 'ArrowRight': e.preventDefault(); dialStep(1); dialRotation += 15; applyDialRotation(); break;
        case 'Enter':      e.preventDefault(); dialSelect(); playButton(); break;
        case 'ArrowUp':    e.preventDefault(); adjustVolume(5); break;
        case 'ArrowDown':  e.preventDefault(); adjustVolume(-5); break;
        case 'h': case 'H': setView('home'); buildViewIfNeeded('home'); playButton(); break;
        case 'b': case 'B': setView('home'); playButton(); break;
        case 'n': case 'N': setView('nav'); buildNavView(); playButton(); break;
        case ' ':           e.preventDefault(); setView('media'); buildMediaView(); playButton(); break;
        case 'p': case 'P': setView('perf'); buildPerfView(); playButton(); break;
        case 'l': case 'L': cycleLED(); break;
        case 't': case 'T': cycleTheme(); break;
      }
    });
  }

  /* ======================================================================
     STATUS BAR — REAL-TIME CLOCK
     ====================================================================== */
  function updateClock() {
    const el = $('#digital-clock'); if (!el) return;
    const now = new Date();
    let h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    el.textContent = `${h}:${m.toString().padStart(2,'0')} ${ampm}`;
    // Nav arrival time
    const nc = $('#nav-clock');
    if (nc) {
      const arr = new Date(now.getTime() + 12 * 60000);
      let ah = arr.getHours(), am2 = arr.getMinutes(), ap = ah >= 12 ? 'PM' : 'AM';
      ah = ah % 12 || 12;
      nc.textContent = `${ah}:${am2.toString().padStart(2,'0')} ${ap}`;
    }
  }

  /* ======================================================================
     HEADER TOGGLE BUTTONS
     ====================================================================== */
  function setupHeaderToggles() {
    const btnTheme = $('#btn-toggle-theme');
    const btnPalette = $('#btn-toggle-palette');
    const btnMode = $('#btn-toggle-mode');
    if (btnTheme) btnTheme.addEventListener('click', cycleTheme);
    if (btnPalette) btnPalette.addEventListener('click', cyclePalette);
    if (btnMode) btnMode.addEventListener('click', toggleMode);
  }

  /* ======================================================================
     VIEWPORT AUTO-SCALE
     ====================================================================== */
  function autoScale() {
    const nativeW = 1696, nativeH = 828;
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / nativeW, vh / nativeH, 1);
    const stage = $('#cockpit-stage');
    if (stage) stage.style.transform = `scale(${scale})`;
  }

  /* ======================================================================
     MAIN ANIMATION LOOP
     ====================================================================== */
  let lastFrame = 0;
  function animLoop(ts) {
    if (ts - lastFrame > 50) { // ~20fps for viz
      lastFrame = ts;
      tickVisualizer();
    }
    tickMediaProgress(ts);
    tickTrip(ts);
    requestAnimationFrame(animLoop);
  }

  /* ======================================================================
     INIT
     ====================================================================== */
  function init() {
    applyTheme();
    renderHome();
    buildMediaView();
    buildNavView();
    buildPerfView();

    setupDial();
    setupVolume();
    setupHotkeys();
    setupKeyboard();
    setupHeaderToggles();

    // Boot LED sequence
    updateLEDs();
    setTimeout(() => { STATE.ledState = 'pairing'; updateLEDs(); }, 2500);

    // Clock
    updateClock();
    setInterval(updateClock, 1000);

    // Auto-scale
    autoScale();
    window.addEventListener('resize', autoScale);

    requestAnimationFrame(animLoop);
    console.log('✅ Camry iDrive Simulator initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

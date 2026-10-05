# Original User Request

## 2026-09-16T04:34:41Z

Build a high-polish, interactive side-by-side web-based simulator and dashboard UI for a golden cream 2012 Toyota Camry with cool blue Optitron lighting accents. The system features a 1280x800 OEM+ head unit display with 2012–2016 luxury styling, a real-time glanceable performance page, and a fully interactive 3D center console controller simulator with mechanical audio feedback.

Working directory: C:\Users\MNZ\Desktop\Camry_iDrive_Demo
Integrity mode: demo

## Requirements

### R1. 1280x800 Automotive Display with Multi-Theme Engine
A responsive, pixel-perfect 1280x800 automotive screen frame featuring:
- Theme & Layout Switcher:
  - BMW CIC: Horizontal 3D perspective carousel cards with right-hand live split-widget.
  - Audi MMI: Central rotary menu with 4 corner softkeys mapped to console buttons.
  - Toyota/Lexus Panoramic: Wide multi-tile modern grid.
- Color Palette Engine:
  - Camry Optitron Cool Blue: Crisp ice blue and white glowing needles on deep obsidian black.
  - Champagne Gold & Cool Blue: Subtle metallic champagne trim reflecting the golden cream exterior, paired with Toyota blue accents.
  - Amber Night Shift: High-contrast warm amber glow for night driving.
  - Day / Night mode toggle.
- Functional Core Views:
  - Home / Navigation view.
  - Media Player with album art, live simulated audio visualizer, track title, and on-screen skip controls.
  - Performance & Telemetry Page.

### R2. Interactive Center Console Controller Simulator
A side-by-side virtual 3D-styled Camry center console tray controller featuring:
- Rotating Aluminum Dial: Drag-to-spin, mouse wheel scroll, and click-to-select, with synthesized mechanical audio clicks (Web Audio API).
- BMW-Style Sport Volume Toggle: 3-way spring-loaded rocker switch (Up = Vol+, Down = Vol-, Center Push = Mute) with tactile animation.
- Dual Multi-Color LED State Machine:
  - Bootup: Rainbow color cycle sweep animation.
  - Pairing: Pulsing/blinking green.
  - Connected to Tablet: Solid Ice Blue.
  - Connected to Phone: Solid Crimson Red.
- 5 Tactile Hotkey Buttons: `[HOME]`, `[BACK]`, `[NAV/AA]`, `[PERF]`, `[MEDIA]`.
- Full physical keyboard controls: Left/Right arrows (dial rotate), Enter (dial click), Up/Down arrows (volume rocker), H (Home), B (Back), P (Performance), N (Nav), Space (Play/Pause).

### R3. Glanceable Performance & Telemetry Dashboard
A clean, driver-focused telemetry page designed for instant readability without visual clutter:
- Smooth sweeping Tachometer with clear powerband indicators and redline alert.
- Engine Coolant Temperature gauge with cold/optimal/hot color zones.
- Real-time Battery Voltage indicator (simulating 14.2V charging vs 12.4V resting).
- Trip Computer: Live calculated MPG, fuel consumed (gallons burned), trip odometer (miles driven), and elapsed driving time.
- 4-Tire TPMS graphic displaying individual tire PSI on a 2012 Camry silhouette with green/amber pressure warnings.
- System Diagnostics badge ("ALL SYSTEMS OK" with toggleable warning alerts).
- Interactive simulation control panel (sliders/buttons to rev RPM, trigger warnings, or adjust tire pressure in real-time).

### R4. Standalone Deliverable & Verification
- Self-contained single-page web application (`index.html` with modular CSS and JS) in `C:\Users\MNZ\Desktop\Camry_iDrive_Demo`.
- Zero external build steps or server dependencies required; runs directly when opened in Chrome, Edge, or mobile browsers.
- Automated verification script to confirm zero console errors, correct DOM state transitions on controller inputs, and theme switches.

## Acceptance Criteria

### Visual & Layout Fidelity
- [ ] Display viewport maintains an exact 1280x800 aspect ratio container with automotive bezel styling and no overflow or awkward clipping.
- [ ] Switching between BMW CIC, Audi MMI, and Toyota Panoramic updates the UI seamlessly without page reload.
- [ ] Color palette toggles between Optitron Cool Blue, Champagne Gold, and Amber Night Shift.
- [ ] Day/Night mode toggles between daytime clarity and high-contrast night glow.

### Controller Interaction & Audio Feedback
- [ ] Rotating the virtual dial updates menu/card selection on the display and plays mechanical click sounds.
- [ ] Clicking the dial selects/activates the highlighted card.
- [ ] Flicking the sport toggle adjusts master volume up/down with spring animation and mute state.
- [ ] LED status button cycles through Rainbow Boot, Blinking Green, Solid Blue, and Solid Red states.
- [ ] Pressing `[PERF]` immediately switches the display to the Performance Page; `[NAV]` switches to Navigation/AA; `[HOME]` returns to the main menu.
- [ ] Physical keyboard shortcuts (Arrow keys, Enter, H, B, P, N, Space) trigger the corresponding console actions.

### Telemetry & Simulation Controls
- [ ] Performance page accurately displays RPM, coolant temp, battery voltage, trip miles, fuel burned, and 4-wheel TPMS PSI.
- [ ] Adjusting the simulation controls dynamically animates the gauges, needle sweeps, and tire status warnings.
- [ ] No layout shift, overlapping text, or console errors during theme or view transitions.

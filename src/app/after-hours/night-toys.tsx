"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./night-toys.module.css";

const LEDGER_KEY = "night-dispatch-ledger-v1";
type Ledger = { started: number; counts: Record<string, number> };
function readLedger(): Ledger {
  try { const data = JSON.parse(sessionStorage.getItem(LEDGER_KEY) || "null"); if (typeof data?.started === "number" && data.counts && typeof data.counts === "object") return data; } catch { /* Storage can be unavailable in private browsing. */ }
  return { started: Date.now(), counts: {} };
}
let fallbackLedger: Ledger | null = null;
export function beginNightSession() {
  fallbackLedger ??= readLedger();
  try { sessionStorage.setItem(LEDGER_KEY, JSON.stringify(fallbackLedger)); } catch { /* In-memory session remains available. */ }
}
export function logNightActivity(action: string, amount = 1) {
  const ledger = fallbackLedger || readLedger();
  ledger.counts = { ...ledger.counts, [action]: (ledger.counts[action] || 0) + amount };
  fallbackLedger = ledger;
  try { sessionStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); } catch { /* Keep the in-memory receipt. */ }
  window.dispatchEvent(new Event("night-ledger"));
}

// Each instrument owns its audio graph. No samples, media requests or music extraction.
function useInstrument() {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => () => { void audio.current?.close(); audio.current = null; }, []);
  const sound = (kind: number) => {
    try {
      const context = audio.current ??= new AudioContext();
      void context.resume();
      const gain = context.createGain();
      gain.gain.setValueAtTime(.09, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .32);
      gain.connect(context.destination);
      if (kind === 1 || kind === 2) {
        const buffer = context.createBuffer(1, context.sampleRate * .2, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = context.createBufferSource(); noise.buffer = buffer;
        const filter = context.createBiquadFilter(); filter.type = "highpass"; filter.frequency.value = kind === 1 ? 900 : 6500;
        noise.connect(filter); filter.connect(gain); noise.start(); noise.stop(context.currentTime + .2);
      } else {
        const tone = context.createOscillator(); tone.type = kind === 3 ? "triangle" : "sine";
        tone.frequency.setValueAtTime(kind === 0 ? 150 : 660, context.currentTime);
        tone.frequency.exponentialRampToValueAtTime(kind === 0 ? 45 : 330, context.currentTime + .25);
        tone.connect(gain); tone.start(); tone.stop(context.currentTime + .32);
      }
    } catch { /* Visual interaction still works without browser audio support. */ }
  };
  return sound;
}

const W = 96, H = 64;
const MATERIALS = ["Sand", "Water", "Sparks", "Wall"];
const COLORS = ["#101b19", "#dbb770", "#719fbd", "#f9914f", "#e2dac1", "#b2c5be", "#e7ad68"];
export function PocketFurnace() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const grid = useRef(new Uint8Array(W * H));
  const life = useRef(new Uint8Array(W * H));
  const tool = useRef(1);
  const drawing = useRef(false);
  const [material, setMaterial] = useState(1);
  const [paused, setPaused] = useState(false);
  const paint = (x: number, y: number) => {
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const px = x + ox, py = y + oy;
      if (px > 0 && px < W - 1 && py > 0 && py < H - 1 && Math.random() > .2) {
        const index = py * W + px; grid.current[index] = tool.current; life.current[index] = 80;
      }
    }
  };
  useEffect(() => {
    const context = canvas.current?.getContext("2d"); if (!context) return;
    let frame = 0, last = 0;
    const tick = (time: number) => {
      if (time - last > 32) {
        last = time;
        const cells = grid.current, ages = life.current;
        if (!paused) {
          const moved = new Uint8Array(W * H);
          for (let y = H - 2; y > 0; y--) for (let n = 1; n < W - 1; n++) {
            const x = (y % 2) ? n : W - 1 - n, i = y * W + x, value = cells[i];
            if (!value || value === 4 || value === 6 || moved[i]) continue;
            if (value === 3 || value === 5) {
              if (--ages[i] === 0) { cells[i] = 0; continue; }
              for (const j of [i - 1, i + 1, i - W, i + W]) {
                if (value === 3 && cells[j] === 2) { cells[j] = 5; ages[j] = 45; cells[i] = 0; }
                if (value === 3 && cells[j] === 1) cells[j] = 6;
              }
            }
            const direction = Math.random() < .5 ? -1 : 1;
            const destinations = value === 5 || value === 3 ? [i - W, i - W + direction] : value === 2 ? [i + W, i + W + direction, i + direction] : [i + W, i + W + direction];
            for (const j of destinations) if (j >= W && j < W * (H - 1) && j % W > 0 && j % W < W - 1 && !cells[j]) {
              cells[j] = cells[i]; ages[j] = ages[i]; cells[i] = 0; moved[j] = 1; break;
            }
          }
        }
        context.fillStyle = COLORS[0]; context.fillRect(0, 0, W, H);
        for (let i = 0; i < cells.length; i++) if (cells[i]) { context.fillStyle = COLORS[cells[i]]; context.fillRect(i % W, Math.floor(i / W), 1, 1); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); paint(Math.floor((event.clientX - rect.left) / rect.width * W), Math.floor((event.clientY - rect.top) / rect.height * H)); };
  return <>
    <div className={styles.materials}>{MATERIALS.map((name, index) => <button type="button" key={name} aria-pressed={material === index + 1} onClick={() => { setMaterial(index + 1); tool.current = index + 1; }}>{name}</button>)}</div>
    <canvas ref={canvas} width={W} height={H} className={styles.furnace} tabIndex={0} aria-label="Pocket furnace. Draw materials with pointer or finger. Press Enter to pour at the centre." onKeyDown={(e) => { if (e.key === "Enter") { paint(48, 15); logNightActivity("material pours"); } }} onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); point(e); logNightActivity("material pours"); }} onPointerMove={(e) => { if (drawing.current) point(e); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
    <div className={styles.controls}><button type="button" onClick={() => setPaused(!paused)}>{paused ? "Resume furnace" : "Freeze furnace"}</button><button type="button" onClick={() => { grid.current.fill(0); life.current.fill(0); }}>Empty vessel</button></div>
    <p className={styles.hint}>Draw something. Sand falls. Water flows. Sparks turn sand into glass and water into steam. Absolutely no safety certification.</p>
  </>;
}

const TRANSMISSIONS = [
  { frequency: 88.4, name: "THE LOST PLATFORM", text: "The last train has gone. Someone left the station lights on for you.", code: "STATION / 004" },
  { frequency: 94.7, name: "LOST & FOUND", text: "One abandoned idea. Two unfinished tabs. A perfectly good Tuesday. Please collect before sunrise.", code: "PROPERTY / 017" },
  { frequency: 101.3, name: "NIGHT SHIFT", text: "Nothing urgent. The machines are sleeping. You are allowed to just be here.", code: "FACTORY / 023" },
  { frequency: 107.6, name: "END OF THE DIAL", text: "If you can hear this, you took the long way round. Good. The long way has better stories.", code: "UNKNOWN / 099" },
];
export function PirateRadio() {
  const [frequency, setFrequency] = useState(90);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [foundCount, setFoundCount] = useState(0);
  const context = useRef<AudioContext | null>(null);
  const noiseGain = useRef<GainNode | null>(null);
  const toneGain = useRef<GainNode | null>(null);
  const found = useRef(new Set<string>());
  const station = TRANSMISSIONS.find((item) => Math.abs(item.frequency - frequency) < .35);
  useEffect(() => {
    if (station && !found.current.has(station.code)) { found.current.add(station.code); setFoundCount(found.current.size); logNightActivity("transmissions found"); }
    const now = context.current?.currentTime || 0;
    noiseGain.current?.gain.setTargetAtTime(station ? .004 : .035, now, .08);
    toneGain.current?.gain.setTargetAtTime(station ? .025 : 0, now, .08);
  }, [station]);
  useEffect(() => () => { void context.current?.close(); }, []);
  const listen = async () => {
    try {
      if (listening) { await context.current?.suspend(); setListening(false); return; }
      if (!context.current) {
        const audio = context.current = new AudioContext();
        const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
        const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = audio.createBufferSource(); source.buffer = buffer; source.loop = true;
        const filter = audio.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1600;
        const noise = noiseGain.current = audio.createGain(); noise.gain.value = station ? .004 : .035;
        source.connect(filter); filter.connect(noise); noise.connect(audio.destination); source.start();
        const tone = audio.createOscillator(); tone.frequency.value = 220;
        const gain = toneGain.current = audio.createGain(); gain.gain.value = station ? .025 : 0;
        tone.connect(gain); gain.connect(audio.destination); tone.start();
      }
      await context.current.resume(); setListening(true); setStatus("");
    } catch { setStatus("Audio unavailable. You can still explore the dial."); }
  };
  return <>
    <div className={styles.radio}><span>UNLICENSED IMAGINATION / FM</span><output>{frequency.toFixed(1)}<small>MHz</small></output><div className={styles.scale} aria-hidden="true">88 · · 92 · · 96 · · 100 · · 104 · · 108</div><input type="range" min="88" max="108" step=".1" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} aria-label="Radio frequency" /><p>{station ? "SIGNAL LOCKED" : "SEARCHING THE NIGHT…"}</p></div>
    <div className={styles.transmission} aria-live="polite"><small>{station?.code || "BETWEEN STATIONS"}</small><h3>{station?.name || "Keep turning."}</h3><p>{station?.text || "There are four messages somewhere in the static. Slow down when the signal clears."}</p></div>
    <div className={styles.controls}><button type="button" onClick={() => void listen()}>{listening ? "Silence radio" : "Listen to static"}</button><span>{foundCount} / 4 found</span></div><p className={styles.hint}>{status || "Fictional broadcasts, original synthesized sound. Your music stereo stays separate."}</p>
  </>;
}

const PADS = ["Piston", "Valve", "Relay", "Signal"];
export function FactoryPercussion() {
  const sound = useInstrument();
  const [active, setActive] = useState(-1);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [notes, setNotes] = useState<{ time: number; pad: number }[]>([]);
  const recordStart = useRef<number | null>(null);
  const recordingNotes = useRef<{ time: number; pad: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { clearTimers(); if (pulseTimer.current) clearTimeout(pulseTimer.current); }, []);
  const hit = (pad: number, replay = false) => {
    sound(pad); setActive(pad);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setActive(-1), 220);
    if (!replay) {
      logNightActivity("machine taps");
      if (recordStart.current !== null) recordingNotes.current.push({ time: Math.min(4000, performance.now() - recordStart.current), pad });
    }
  };
  const record = () => {
    clearTimers(); setPlaying(false); setNotes([]); recordingNotes.current = []; recordStart.current = performance.now(); setRecording(true);
    timers.current.push(setTimeout(() => { recordStart.current = null; setRecording(false); setNotes([...recordingNotes.current]); logNightActivity("loops recorded"); }, 4000));
  };
  const replay = () => {
    if (playing) { clearTimers(); setPlaying(false); return; }
    clearTimers(); setPlaying(true);
    const cycle = () => { notes.forEach((note) => timers.current.push(setTimeout(() => hit(note.pad, true), note.time))); timers.current.push(setTimeout(cycle, 4000)); };
    cycle();
  };
  return <>
    <div className={styles.pulseStage} data-active={active >= 0} aria-hidden="true"><div className={styles.pulse} key={active}>{active >= 0 ? ["◉", "╳", "✳", "◎"][active] : "·"}</div><span>{active >= 0 ? PADS[active].toUpperCase() : "THE FACTORY IS YOUR INSTRUMENT"}</span></div>
    <div className={styles.pads}>{PADS.map((pad, index) => <button type="button" key={pad} data-active={active === index} onClick={() => hit(index)}><b>0{index + 1}</b>{pad}</button>)}</div>
    <div className={styles.controls}><button type="button" disabled={recording} onClick={record}>{recording ? "Recording · 4 seconds" : "Record 4 seconds"}</button><button type="button" disabled={recording || !notes.length} onClick={replay}>{playing ? "Stop playback" : "Replay loop"}</button></div>
    <p className={styles.hint}>{recording ? "Go on. Tap the machinery. The tape is rolling." : `${notes.length} hits on tape. Tap with your fingers, or focus a pad and press Space. Original synthesized sounds, no samples.`}</p>
  </>;
}

const STOPS = [{ x: 45, y: 45, name: "PRINT ROOM" }, { x: 275, y: 45, name: "RADIO TOWER" }, { x: 275, y: 185, name: "FURNACE" }, { x: 45, y: 185, name: "NIGHT DESK" }];
const CARGO = ["a box of unfinished ideas", "one very important sandwich", "three suspicious cassette tapes", "a spare hour of sleep"];
export function NightDelivery() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const car = useRef({ x: 160, y: 115, angle: 0 });
  const keys = useRef(new Set<string>());
  const target = useRef(0);
  const [deliveries, setDeliveries] = useState(0);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const context = canvas.current?.getContext("2d"); if (!context) return;
    let frame = 0, last = 0;
    const draw = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, .03) : 0; last = time;
      const vehicle = car.current;
      if (keys.current.has("left")) vehicle.angle -= dt * 3;
      if (keys.current.has("right")) vehicle.angle += dt * 3;
      const speed = keys.current.has("up") ? 80 : keys.current.has("down") ? -45 : 0;
      vehicle.x = Math.max(12, Math.min(308, vehicle.x + Math.cos(vehicle.angle) * speed * dt));
      vehicle.y = Math.max(12, Math.min(218, vehicle.y + Math.sin(vehicle.angle) * speed * dt));
      const destination = STOPS[target.current];
      if (Math.hypot(vehicle.x - destination.x, vehicle.y - destination.y) < 19) {
        target.current = (target.current + 1) % 4; setDeliveries((value) => value + 1); logNightActivity("odd deliveries");
      }
      if (Math.floor(time / 200) !== Math.floor((time - dt * 1000) / 200)) setDistance(Math.round(Math.hypot(vehicle.x - STOPS[target.current].x, vehicle.y - STOPS[target.current].y)));
      context.fillStyle = "#17231e"; context.fillRect(0, 0, 320, 230);
      context.strokeStyle = "#374a3b"; context.lineWidth = 26; context.strokeRect(45, 45, 230, 140);
      context.lineWidth = 1; context.strokeStyle = "#71836b"; context.setLineDash([3, 8]); context.strokeRect(45, 45, 230, 140); context.setLineDash([]);
      STOPS.forEach((stop, index) => { context.fillStyle = index === target.current ? "#e4d8a2" : "#556759"; context.fillRect(stop.x - 8, stop.y - 8, 16, 16); context.font = "8px monospace"; context.fillText(String(index + 1), stop.x - 2, stop.y - 12); });
      context.save(); context.translate(vehicle.x, vehicle.y); context.rotate(vehicle.angle); context.fillStyle = "#dab974"; context.fillRect(-9, -6, 18, 12); context.fillStyle = "#242f29"; context.fillRect(1, -4, 4, 8); context.fillStyle = "#fff3c2"; context.fillRect(8, -5, 2, 3); context.fillRect(8, 2, 2, 3); context.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, []);
  const direction = (key: string) => ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" }[key]);
  return <>
    <div className={styles.deliveryLabel}><small>CARGO: {CARGO[deliveries % 4]}</small><b>→ {STOPS[deliveries % 4].name}</b><span>{distance}m / {deliveries} delivered</span></div>
    <canvas ref={canvas} className={styles.delivery} width="320" height="230" tabIndex={0} aria-label="Delivery yard. Arrow keys or WASD steer the cart. Up accelerates, left and right turn." onKeyDown={(e) => { const value = direction(e.key); if (value) { e.preventDefault(); keys.current.add(value); } }} onKeyUp={(e) => { const value = direction(e.key); if (value) { e.preventDefault(); keys.current.delete(value); } }} onBlur={() => keys.current.clear()} />
    <div className={styles.dpad}>{[["left", "↶"], ["up", "GO"], ["down", "REV"], ["right", "↷"]].map(([id, label]) => <button type="button" key={id} aria-label={`Drive ${id}`} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(id); }} onPointerUp={() => keys.current.delete(id)} onPointerCancel={() => keys.current.delete(id)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); keys.current.add(id); } }} onKeyUp={() => keys.current.delete(id)} onBlur={() => keys.current.delete(id)}>{label}</button>)}</div>
    <p className={styles.hint}>Drive into the glowing depot. Left/right steer; GO moves forward. No deadlines. Very questionable cargo.</p>
  </>;
}

export function WastedReceipt() {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    beginNightSession();
    const update = () => { setLedger({ ...fallbackLedger! }); setNow(Date.now()); };
    update(); const timer = setInterval(update, 1000); window.addEventListener("night-ledger", update);
    return () => { clearInterval(timer); window.removeEventListener("night-ledger", update); };
  }, []);
  const elapsed = ledger ? Math.floor((now - ledger.started) / 1000) : 0;
  const entries = Object.entries(ledger?.counts || {});
  const text = `NIGHT DISPATCH\nRECEIPT OF TIME WELL WASTED\n${entries.map(([name, count]) => `${String(count).padStart(3, "0")} × ${name}`).join("\n")}\n${Math.floor(elapsed / 60)}m ${elapsed % 60}s wandering\nPRODUCTIVITY: 0.00\nNO REFUNDS. COME BACK SOON.`;
  return <><div className={styles.receipt}><small>THE NIGHT SHIFT / EST. NOW</small><h3>TIME WELL<br />WASTED</h3><p>Not a purchase. A very good detour.</p><hr />{entries.length ? entries.map(([name, count]) => <div key={name}><span>{name}</span><b>{String(count).padStart(3, "0")}</b></div>) : <p>Nothing yet. Go cause a small, harmless distraction.</p>}<hr /><div><span>Minutes not optimised</span><b>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</b></div><div><span>Productivity</span><b>0.00</b></div><p>PAID IN ATTENTION<br />NO REFUNDS. COME BACK SOON.</p><footer aria-hidden="true">▎▏▍▎▏▍▏▎▍▏▎▏▍▎▏▍▏▎</footer></div><div className={styles.controls}><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Receipt copied" : "Copy receipt"}</button></div><p className={styles.hint}>Your session stays in this browser tab. No accounts, tracking or leaderboard.</p></>;
}

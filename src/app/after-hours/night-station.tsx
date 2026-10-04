"use client";

import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";
import styles from "./night-station.module.css";
import { beginNightSession, FactoryPercussion, logNightActivity, NightDelivery, PirateRadio, PocketFurnace, WastedReceipt } from "./night-toys";

export type StationId = "memory" | "drive" | "signal" | "match" | "furnace" | "radio" | "percussion" | "delivery" | "receipt";
const STATIONS: { id: StationId; name: string; subtitle: string }[] = [
  { id: "memory", name: "Print room", subtitle: "Small things deserve a physical copy." },
  { id: "drive", name: "Light table", subtitle: "Find the hour between day and night." },
  { id: "signal", name: "Signal garden", subtitle: "Plant a pattern. Let it repeat." },
  { id: "match", name: "One more game", subtitle: "You said that three games ago." },
  { id: "furnace", name: "Pocket furnace", subtitle: "A small vessel for very bad experiments." },
  { id: "radio", name: "Pirate radio", subtitle: "Some messages only arrive after midnight." },
  { id: "percussion", name: "Factory percussion", subtitle: "Make the machinery work for your rhythm." },
  { id: "delivery", name: "Night delivery", subtitle: "Important cargo. Unimportant deadlines." },
  { id: "receipt", name: "Your receipt", subtitle: "A paper trail of completely worthwhile distractions." },
];
const PRINTS = ["sony-night-reference.png", "nsx-reference.png", "japanese-editorial-reference.png", "dark-fantasy-reference.png"];

function SignalGarden() {
  const [pattern, setPattern] = useState([0, 2, -1, 4, 2, -1, 1, 3]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [tempo, setTempo] = useState(96);
  const audio = useRef<AudioContext | null>(null);
  const patternRef = useRef(pattern);
  const cursor = useRef(0);
  patternRef.current = pattern;

  useEffect(() => {
    if (!running) { setStep(-1); return; }
    const tick = () => {
      const index = cursor.current++ % 8;
      setStep(index);
      const note = patternRef.current[index];
      const context = audio.current;
      if (note < 0 || !context || context.state !== "running") return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = [220, 261.63, 293.66, 329.63, 392][note];
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(.075, context.currentTime + .012);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .34);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + .36);
    };
    tick();
    const timer = window.setInterval(tick, 30000 / tempo);
    return () => window.clearInterval(timer);
  }, [running, tempo]);

  useEffect(() => () => { void audio.current?.close(); }, []);
  const toggle = async () => {
    if (running) { setRunning(false); return; }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setRunning(true);
    } catch { setRunning(false); }
  };
  return <>
    <div className={styles.sequence} aria-label="Eight step musical sequencer">
      {[4, 3, 2, 1, 0].map((note) => <div className={styles.sequenceRow} key={note}>
        <span>{["A", "C", "D", "E", "G"][note]}</span>
        {pattern.map((value, index) => <button key={index} type="button" aria-label={`Step ${index + 1}, note ${["A", "C", "D", "E", "G"][note]}`} aria-pressed={value === note} data-lit={step === index} onClick={() => { setPattern((current) => current.map((n, i) => i === index ? n === note ? -1 : note : n)); logNightActivity("seeds planted"); }} />)}
      </div>)}
    </div>
    <div className={styles.controls}><button type="button" onClick={() => void toggle()}>{running ? "Stop loop" : "Start loop"}</button><label>Tempo <input aria-label="Loop tempo" type="range" min="60" max="140" value={tempo} onChange={(e) => setTempo(Number(e.target.value))} /><output>{tempo}</output></label></div>
    <p className={styles.hint}>Tap the seeds to change the melody. Sound starts only when you press play.</p>
  </>;
}

function PocketMatch() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const paddle = useRef(160);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    let x = 160, y = 80, vx = 100, vy = 130, hits = 0, frame = 0, last = 0;
    const draw = (time: number) => {
      const delta = last ? Math.min((time - last) / 1000, .03) : 0;
      last = time;
      if (running) {
        x += vx * delta; y += vy * delta;
        if (x < 7 || x > 313) { x = Math.max(7, Math.min(313, x)); vx *= -1; }
        if (y < 7) { y = 7; vy *= -1; }
        if (vy > 0 && y >= 194 && y <= 208 && Math.abs(x - paddle.current) < 38) {
          y = 193; vy = -Math.min(320, Math.abs(vy) + 12);
          vx = (x - paddle.current) * 5;
          hits++; setScore(hits); setBest((value) => Math.max(value, hits)); logNightActivity("rallies returned");
        }
        if (y > 230) { setRunning(false); setEnded(true); logNightActivity("rallies lost"); return; }
      }
      context.fillStyle = "#102c27"; context.fillRect(0, 0, 320, 230);
      context.strokeStyle = "#739489"; context.lineWidth = 1;
      context.strokeRect(5, 5, 310, 220);
      context.setLineDash([3, 6]); context.beginPath(); context.moveTo(5, 115); context.lineTo(315, 115); context.stroke(); context.setLineDash([]);
      context.fillStyle = "#ead9a3"; context.fillRect(paddle.current - 32, 201, 64, 5);
      context.fillStyle = "#fff8dc"; context.fillRect(x - 3, y - 3, 6, 6);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  return <>
    <canvas ref={canvas} className={styles.court} width="320" height="230" tabIndex={0} role="img" aria-label="Table tennis court. Move pointer or slide your finger to move the paddle. Arrow keys also move it." onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); paddle.current = Math.max(34, Math.min(286, (event.clientX - rect.left) / rect.width * 320)); }} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); paddle.current = Math.max(34, Math.min(286, paddle.current + (event.key === "ArrowLeft" ? -24 : 24))); } }} />
    <div className={styles.score}><span>Rally <b>{String(score).padStart(2, "0")}</b></span><span>Best <b>{String(best).padStart(2, "0")}</b></span><button type="button" onClick={() => { setScore(0); setEnded(false); setRunning((value) => !value); }}>{running ? "End game" : ended ? "One more?" : "Serve"}</button></div>
    <p className={styles.hint}>{ended ? "Out. There is always time for one more." : "Move your pointer or slide a finger across the table. Keep the rally alive."}</p>
  </>;
}

export default memo(function NightStation({ station, onChange, onClose, onArchive }: { station: StationId; onChange: (id: StationId) => void; onClose: () => void; onArchive: () => void }) {
  const [visited, setVisited] = useState<StationId[]>([station]);
  const [print, setPrint] = useState(0);
  const [printed, setPrinted] = useState(false);
  const [exposure, setExposure] = useState(50);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const current = STATIONS.find((item) => item.id === station)!;
  useEffect(() => { beginNightSession(); }, []);
  useEffect(() => { setVisited((values) => values.includes(station) ? values : [...values, station]); }, [station]);
  useEffect(() => { panel.current?.scrollTo({ top: 0 }); }, [station]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); previous?.focus(); };
  }, [onClose]);
  return <aside ref={panel} className={styles.station} aria-label="Night dispatch station">
    <div className={styles.topline}><span><i /> NIGHT DISPATCH</span><select className={styles.stopSelect} aria-label="Choose night stop" value={station} onChange={(e) => onChange(e.target.value as StationId)}>{STATIONS.map((item, index) => <option key={item.id} value={item.id}>{String(index + 1).padStart(2, "0")} / {item.name}</option>)}</select><button ref={close} type="button" aria-label="Close night station" onClick={onClose}>×</button></div>
    <nav className={styles.route} aria-label="Night station stops">{STATIONS.map((item, index) => <button type="button" key={item.id} aria-label={item.name} aria-pressed={station === item.id} onClick={() => onChange(item.id)}><span>{String(index + 1).padStart(2, "0")}</span><small>{item.name}</small>{visited.includes(item.id) && <i aria-label="Visited">✓</i>}</button>)}</nav>
    <div className={styles.body}><p className={styles.kicker}>STOP {STATIONS.findIndex((item) => item.id === station) + 1} / 09</p><h2>{current.name}</h2><p className={styles.subtitle}>{current.subtitle}</p>
      {station === "memory" && <><div key={`${print}-${printed}`} className={`${styles.print} ${printed ? styles.printed : ""}`}><div className={styles.photo}><Image src={`/after-hours/${PRINTS[print]}`} alt="Selected reference from the visual archive" fill sizes="350px" /></div><span>FIELD NOTE / {String(print + 1).padStart(2, "0")} <b>{printed ? "FILED ✓" : "UNDEVELOPED"}</b></span></div><div className={styles.controls}><button type="button" onClick={() => { setPrint((value) => (value + 1) % PRINTS.length); setPrinted(false); }}>Next negative</button><button type="button" disabled={printed} onClick={() => { setPrinted(true); logNightActivity("prints developed"); }}>{printed ? "In the drawer" : "Make a print"}</button></div><button className={styles.textButton} type="button" onClick={onArchive}>Browse the full archive ↗</button></>}
      {station === "drive" && <><div className={styles.lightTable}><Image src="/after-hours/nsx-reference.png" alt="Japanese sports car at sunset on an adjustable light table" fill sizes="350px" style={{ filter: `brightness(${.45 + exposure / 90}) saturate(${.6 + exposure / 100})` }} /><span>{exposure < 35 ? "02:13 / NIGHT RUN" : exposure > 70 ? "17:42 / GOLDEN HOUR" : "19:06 / BLUE HOUR"}</span></div><label className={styles.exposure}>Turn the light <input type="range" min="0" max="100" value={exposure} aria-label="Light table exposure" onChange={(e) => setExposure(Number(e.target.value))} /><output>{exposure}%</output></label><p className={styles.hint}>A tiny darkroom for the machines that keep you up at night.</p></>}
      {station === "signal" && <SignalGarden />}
      {station === "match" && <PocketMatch />}
      {station === "furnace" && <PocketFurnace />}
      {station === "radio" && <PirateRadio />}
      {station === "percussion" && <FactoryPercussion />}
      {station === "delivery" && <NightDelivery />}
      {station === "receipt" && <WastedReceipt />}
    </div><footer className={styles.ticket}><span>PERSONAL TRANSMISSION</span><b>{visited.length === STATIONS.length ? "ALL STOPS / NIGHT WELL SPENT" : `${visited.length} OF ${STATIONS.length} STOPS STAMPED`}</b><div aria-hidden="true">▎▏▍▎▏▍▏▎▍▏▎▏▍▎▏▍▏▎▍▏</div></footer>
  </aside>;
});

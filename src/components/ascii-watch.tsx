"use client";

import makeClock, { meta } from "ascii.rest/pieces/analog-clock";
import { useEffect, useRef } from "react";
import { createClockFragmentPainter } from "./ascii-clock-flight";
import styles from "./space-clock.module.css";

const halfWidth = (meta.cols - 1) / 2;
const halfHeight = (meta.rows - 1) / 2;
const handScale = 1.5;
const handColumns = 71;
const handRows = 35;
const handCenterX = (handColumns - 1) / 2;
const handCenterY = (handRows - 1) / 2;
const fullTurn = 2 * Math.PI;
const gearRadius = 8.8;
const gearTeeth = 12;
const ascii = new Map([
  ["·", "."], ["╱", "/"], ["╲", "\\"], ["─", "-"], ["│", "|"], ["▀", "+"], ["▄", "+"], ["║", "|"],
]);

function gearCharacter(x: number, y: number, time: number) {
  const distance = Math.hypot(x, y);
  if (distance > gearRadius || distance < 1.5) return " ";

  const turn = Math.atan2(y, x) / fullTurn - time / gearTeeth;
  const tooth = turn * gearTeeth;
  if (distance >= gearRadius - 1.8) return tooth - Math.floor(tooth) < .55 ? "#" : " ";
  if (distance >= gearRadius - 3) return "=";
  if (distance < 2.8) return "o";

  const spoke = turn * 5;
  return Math.abs(spoke - Math.round(spoke)) < .14 ? "+" : " ";
}

function drawHand(target: string[][], occupied: Set<number>, turn: number, length: number, stroke: string) {
  const angle = turn * fullTurn;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);

  for (let step = 1.6; step <= length; step += .24) {
    const x = dx * step;
    const y = dy * step / 2;
    const column = Math.round(handCenterX + x * handScale);
    const row = Math.round(handCenterY + y * handScale);
    target[row][column] = stroke;
    occupied.add(Math.round(halfHeight + y) * meta.cols + Math.round(halfWidth + x));
  }
}

function composeDial(frame: string, date: Date, motionTime: number, afterHours: boolean) {
  const face: string[] = [];
  const movement: string[] = [];
  const accent: string[] = [];
  const hourHand = Array.from({ length: handRows }, () => Array<string>(handColumns).fill(" "));
  const minuteHand = hourHand.map((row) => [...row]);
  const secondHand = hourHand.map((row) => [...row]);
  const seconds = date.getSeconds();
  const minutes = date.getMinutes() + seconds / 60;
  const occupied = new Set([halfHeight * meta.cols + halfWidth]);
  drawHand(secondHand, occupied, seconds / 60, 16, "*");
  drawHand(minuteHand, occupied, minutes / 60, 14.5, "=");
  drawHand(hourHand, occupied, (date.getHours() % 12 + minutes / 60) / 12, 9.5, "#");
  hourHand[handCenterY][handCenterX] = "@";

  for (const [row, line] of frame.split("\n").entries()) {
    let faceLine = "";
    let movementLine = "";
    let accentLine = "";

    for (const [column, raw] of Array.from(line).entries()) {
      const x = column - halfWidth;
      const y = (row - halfHeight) * 2;
      const angle = (Math.atan2(x, -y) / fullTurn + 1) % 1;
      const radius = Math.hypot(x, y);
      const char = ascii.get(raw) ?? raw;
      const night = angle >= 5 / 12 && angle <= 9 / 12;
      const litRim = radius > 18 && night !== afterHours;
      faceLine += litRim || radius < 16.7 ? " " : char;
      const underHand = occupied.has(row * meta.cols + column);
      movementLine += underHand ? " " : gearCharacter(x, y, motionTime);
      accentLine += litRim ? char : " ";
    }

    face.push(faceLine);
    movement.push(movementLine);
    accent.push(accentLine);
  }

  const hands = [secondHand, minuteHand, hourHand].map((grid) => grid.map((row) => row.join("")));
  return [face, movement, accent, ...hands].map((layer) => layer.join("\n"));
}

export function AsciiWatch({ afterHours, movable }: { afterHours: boolean; movable: boolean }) {
  const dial = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLTimeElement>(null);
  const layers = useRef<(HTMLPreElement | null)[]>([]);
  const flightCanvas = useRef<HTMLCanvasElement>(null);
  const indices = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = makeClock({ numerals: false, seconds: true });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
    const started = performance.now();
    let timer: number;

    const clock = dial.current;
    const flight = clock?.closest<HTMLElement>("[data-clock-flight]");
    const canvas = flightCanvas.current;
    const numbers = indices.current;
    let paintFlight: ReturnType<typeof createClockFragmentPainter> = null;

    function updateFlight() {
      if (!clock || !flight || !canvas || !numbers) return;
      const spread = Number(flight.style.getPropertyValue("--clock-fracture")) || 0;
      clock.toggleAttribute("data-fracturing", spread > 0);
      if (spread <= 0) {
        paintFlight = null;
        return;
      }
      paintFlight ??= createClockFragmentPainter(canvas, layers.current, numbers);
      paintFlight?.(spread);
    }

    const observer = flight ? new MutationObserver(updateFlight) : null;
    if (flight) observer?.observe(flight, { attributes: true, attributeFilter: ["style"] });

    function resizeFlight() {
      paintFlight = null;
      updateFlight();
    }

    function draw() {
      const elapsed = (performance.now() - started) / 1000;
      const date = new Date();
      const picture = composeDial(frame(0), date, preference.matches ? 0 : elapsed, afterHours);
      layers.current.forEach((layer, index) => {
        if (layer && layer.textContent !== picture[index]) layer.textContent = picture[index];
      });
      const time = timeFormat.format(date);
      if (tooltip.current && tooltip.current.textContent !== time) {
        tooltip.current.textContent = time;
        tooltip.current.dateTime = date.toTimeString().slice(0, 8);
      }
      const label = `Local time ${time}`;
      if (dial.current?.getAttribute("aria-label") !== label) dial.current?.setAttribute("aria-label", label);
    }

    function syncMotion() {
      window.clearInterval(timer);
      draw();
      timer = window.setInterval(() => { if (!document.hidden) draw(); }, preference.matches ? 1000 : 125);
    }

    syncMotion();
    updateFlight();
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    if (flight) window.addEventListener("resize", resizeFlight);
    return () => {
      observer?.disconnect();
      clock?.removeAttribute("data-fracturing");
      window.clearInterval(timer);
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
      if (flight) window.removeEventListener("resize", resizeFlight);
    };
  }, [afterHours, movable]);

  return (
    <>
      <div ref={dial} role="img" aria-label="Local time" className={styles.asciiWatch}>
        {[styles.face, styles.movement, styles.accent, styles.second, styles.minute, styles.hour].map((className, index) => (
          <pre
            key={className}
            ref={(element) => { layers.current[index] = element; }}
            className={className}
            aria-hidden="true"
          />
        ))}
        <div ref={indices} className={styles.indices} aria-hidden="true">
          <span>12</span><span>3</span><span>6</span><span>9</span>
        </div>
        {movable && <canvas ref={flightCanvas} className={styles.flight} aria-hidden="true" />}
      </div>
      <time ref={tooltip} className={styles.time} aria-hidden="true" />
    </>
  );
}

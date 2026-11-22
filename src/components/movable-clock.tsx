"use client";

import { cn } from "@/lib/utils";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpaceClock } from "./space-clock";

interface Point { x: number; y: number }

const scrollStart = 24;
const scrollDistance = 190;
const flightDuration = 680;

function ease(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

export function MovableClock({
  afterHours = false,
  dockRef,
  className,
}: {
  afterHours?: boolean;
  dockRef?: RefObject<HTMLSpanElement>;
  className: string;
}) {
  const clockOrigin = useRef<HTMLDivElement>(null);
  const clockFace = useRef<HTMLDivElement>(null);
  const moveTo = useRef<(point: Point) => void>();
  const aim = useRef<Point>({ x: 0, y: 0 });
  const marker = useRef<HTMLSpanElement>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    const origin = clockOrigin.current;
    const face = clockFace.current;
    const dock = dockRef?.current;
    if (!origin || !face) return;

    const wide = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let destination: Point | null = null;
    let flight: { from: DOMRect; started: number } | null = null;

    function placeFixed(element: HTMLDivElement, left: number, top: number, scale: number) {
      element.style.position = "fixed";
      element.style.left = "0";
      element.style.top = "0";
      element.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
    }

    function placeClock(now: number) {
      frame = 0;
      if (!origin || !face) return;
      const from = origin.getBoundingClientRect();

      if (destination) {
        const viewportWidth = document.documentElement.clientWidth;
        const size = Math.min(from.width, viewportWidth - 24, window.innerHeight - 24);
        const left = Math.max(12, Math.min(destination.x - size / 2, viewportWidth - size - 12));
        const top = Math.max(12, Math.min(destination.y - size / 2, window.innerHeight - size - 12));
        const progress = flight && !reduced.matches ? Math.min(1, Math.max(0, (now - flight.started) / flightDuration)) : 1;

        if (flight && progress < 1) {
          const arrival = ease(progress);
          const fracture = Math.sin(progress * Math.PI);
          face.style.setProperty("--clock-fracture", String(fracture));
          placeFixed(
            face,
            flight.from.left + (left - flight.from.left) * arrival,
            flight.from.top + (top - flight.from.top) * arrival - fracture * 38,
            (flight.from.width + (size - flight.from.width) * arrival) / from.width,
          );
          frame = window.requestAnimationFrame(placeClock);
        } else {
          flight = null;
          face.style.removeProperty("--clock-fracture");
          placeFixed(face, left, top, size / from.width);
        }
        return;
      }

      if (!dock) return;
      const scroll = window.scrollY;
      const progress = wide.matches ? Math.min(1, Math.max(0, (scroll - scrollStart) / scrollDistance)) : 0;
      const arrival = reduced.matches ? Number(progress >= .5) : ease(progress);
      if (arrival === 0) {
        face.removeAttribute("style");
        return;
      }

      const to = dock.getBoundingClientRect();
      const scale = 1 + (to.width / from.width - 1) * arrival;
      if (arrival === 1) {
        face.style.removeProperty("--clock-fracture");
        placeFixed(face, to.left, to.top, scale);
        return;
      }

      const launchY = from.top + scroll - scrollStart;
      const x = (to.left - from.left) * arrival;
      const fracture = Math.sin(progress * Math.PI);
      const y = launchY + (to.top - launchY) * arrival - fracture * 38;
      face.style.setProperty("--clock-fracture", String(fracture));
      face.style.position = "";
      face.style.left = "";
      face.style.top = "";
      face.style.transform = `translate3d(${x}px, ${y - from.top}px, 0) scale(${scale})`;
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(placeClock);
    }

    moveTo.current = (point) => {
      flight = { from: face.getBoundingClientRect(), started: performance.now() };
      destination = point;
      schedule();
    };

    placeClock(performance.now());
    if (dock) window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      moveTo.current = undefined;
      if (dock) window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      face.removeAttribute("style");
    };
  }, [dockRef]);

  useEffect(() => {
    if (!placing) return;
    const root = document.documentElement;
    root.setAttribute("data-clock-placing", "");

    function pointAt(x: number, y: number) {
      aim.current = {
        x: Math.min(root.clientWidth - 1, Math.max(0, x)),
        y: Math.min(window.innerHeight - 1, Math.max(0, y)),
      };
      if (marker.current) {
        marker.current.style.left = `${aim.current.x}px`;
        marker.current.style.top = `${aim.current.y}px`;
      }
    }

    function confirm() {
      moveTo.current?.(aim.current);
      setPlacing(false);
    }

    function onPointerMove(event: PointerEvent) {
      pointAt(event.clientX, event.clientY);
    }

    function onClick(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail > 0) pointAt(event.clientX, event.clientY);
      confirm();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") {
        setPlacing(false);
        return;
      }
      const step = event.shiftKey ? 60 : 24;
      const { x, y } = aim.current;
      switch (event.key) {
        case "Escape": setPlacing(false); break;
        case "Enter": confirm(); break;
        case "ArrowUp": pointAt(x, y - step); break;
        case "ArrowDown": pointAt(x, y + step); break;
        case "ArrowLeft": pointAt(x - step, y); break;
        case "ArrowRight": pointAt(x + step, y); break;
        default: return;
      }
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      root.removeAttribute("data-clock-placing");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [placing]);

  return (
    <div ref={clockOrigin} className={cn("pointer-events-none z-[45] aspect-square w-[var(--space-clock-size)]", className)}>
      <div ref={clockFace} data-clock-flight className="pointer-events-auto origin-top-left">
        <SpaceClock afterHours={afterHours} onMove={() => {
          const bounds = clockFace.current?.getBoundingClientRect();
          if (!bounds) return;
          aim.current = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
          setPlacing(true);
        }} />
      </div>
      {placing && createPortal(
        <>
          <span
            ref={marker}
            aria-hidden="true"
            className="pointer-events-none fixed z-[65] size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/70"
            style={{ left: aim.current.x, top: aim.current.y }}
          />
          <p role="status" className="pointer-events-none fixed bottom-24 left-1/2 z-[65] w-max max-w-[90vw] -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-center text-xs text-popover-foreground">
            Pick a spot or use the arrow keys and Enter. Esc cancels.
          </p>
        </>,
        document.body,
      )}
    </div>
  );
}

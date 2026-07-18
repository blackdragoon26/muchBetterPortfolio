"use client";

import { ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { YAP_LYRICS } from "@/data/yap-lyrics";

type Point = { x: number; y: number };
type Onset = { time: number; intensity: number };
type LyricState = { line: number; word: number };
type StormTarget = {
  angularVelocity: number;
  depth: number;
  dx: number;
  dy: number;
  element: HTMLElement;
  kick: number;
  original: {
    filter: string;
    transform: string;
    transformOrigin: string;
    transition: string;
    willChange: string;
  };
  phase: number;
  rotation: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};
type Bolt = {
  color: string;
  duration: number;
  intensity: number;
  points: Point[];
  startedAt: number;
};

const FULL_SONG_URL = "https://elevenlabs.io/music/songs/AW8sZfzo8V23oop2Ekzw";
const DISPLAY_LYRICS = YAP_LYRICS.map((word) => ({
  ...word,
  // The transcript assigns instrumental lead-ins to held words. Clamp those
  // outliers so text appears when the vocal actually arrives.
  start: word.end - word.start > 1.4 ? word.end - 0.82 : word.start,
}));

function buildBolt(width: number, height: number, intensity: number, impact?: Point): Bolt {
  const edge = Math.floor(Math.random() * 4);
  const start = edge === 0
    ? { x: Math.random() * width, y: 0 }
    : edge === 1
      ? { x: width, y: Math.random() * height }
      : edge === 2
        ? { x: Math.random() * width, y: height }
        : { x: 0, y: Math.random() * height };
  const end = impact ?? {
    x: width * (0.35 + Math.random() * 0.3),
    y: height * (0.3 + Math.random() * 0.4),
  };
  const points: Point[] = [start];

  for (let index = 1; index < 14; index += 1) {
    const progress = index / 14;
    const spread = Math.sin(progress * Math.PI) * 42 * intensity;
    points.push({
      x: start.x + (end.x - start.x) * progress + (Math.random() - 0.5) * spread,
      y: start.y + (end.y - start.y) * progress + (Math.random() - 0.5) * spread,
    });
  }
  points.push(end);

  return {
    color: document.documentElement.classList.contains("dark") ? "255,255,255" : "8,8,8",
    duration: 120 + Math.random() * 110,
    intensity,
    points,
    startedAt: performance.now(),
  };
}

export function YapHover({ audioSrc = "/output.mp3" }: { audioSrc?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const volumeAnimationRef = useRef<number>();
  const activeRef = useRef(false);
  const sessionRef = useRef(0);
  const onsetsRef = useRef<Onset[]>([]);
  const onsetIndexRef = useRef(0);
  const boltsRef = useRef<Bolt[]>([]);
  const flashRef = useRef(0);
  const warpRef = useRef(0);
  const stormTargetsRef = useRef<StormTarget[]>([]);
  const lyricStateRef = useRef<LyricState>({ line: -1, word: -1 });
  const [active, setActive] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [lyricState, setLyricState] = useState<LyricState>({ line: -1, word: -1 });
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPortalHost(document.body);
    fetch("/onsets.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Onset[]>;
      })
      .then((onsets) => { onsetsRef.current = onsets; })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Could not load the yap preview timing data.", error);
      });
    return () => controller.abort();
  }, []);

  const resetPage = useCallback(() => {
    const page = document.getElementById("page-wrap");
    if (page) page.style.filter = "";
    stormTargetsRef.current.forEach(({ element, original }) => {
      element.style.filter = original.filter;
      element.style.transform = original.transform;
      element.style.transformOrigin = original.transformOrigin;
      element.style.transition = original.transition;
      element.style.willChange = original.willChange;
    });
    stormTargetsRef.current = [];
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    sessionRef.current += 1;
    setActive(false);
    if (animationRef.current !== undefined) cancelAnimationFrame(animationRef.current);
    animationRef.current = undefined;
    if (volumeAnimationRef.current !== undefined) cancelAnimationFrame(volumeAnimationRef.current);
    volumeAnimationRef.current = undefined;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
    }
    boltsRef.current = [];
    flashRef.current = 0;
    warpRef.current = 0;
    lyricStateRef.current = { line: -1, word: -1 };
    setLyricState({ line: -1, word: -1 });
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    resetPage();
  }, [resetPage]);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    activeRef.current = true;
    setActive(true);
    const session = ++sessionRef.current;
    onsetIndexRef.current = 0;
    boltsRef.current = [];
    audio.currentTime = 0;
    audio.volume = 0;

    try {
      await audio.play();
    } catch {
      setNeedsGesture(true);
      if (session === sessionRef.current) stop();
      return;
    }
    if (!activeRef.current || session !== sessionRef.current) return stop();
    setNeedsGesture(false);
    const volumeStartedAt = performance.now();
    const fadeVolume = (now: number) => {
      if (!activeRef.current || session !== sessionRef.current) return;
      const progress = Math.min(1, Math.max(0, (now - volumeStartedAt) / 900));
      const eased = 1 - Math.pow(1 - progress, 3);
      audio.volume = eased * 0.82;
      if (progress < 1) volumeAnimationRef.current = requestAnimationFrame(fadeVolume);
      else volumeAnimationRef.current = undefined;
    };
    volumeAnimationRef.current = requestAnimationFrame(fadeVolume);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = canvas.getContext("2d");
    if (!context) return;
    const collectStormTargets = () => {
      resetPage();
      const elements = Array.from(new Set([
        ...document.querySelectorAll<HTMLElement>("#page-wrap > section"),
        ...document.querySelectorAll<HTMLElement>("#page-wrap [data-storm-body]"),
        ...document.querySelectorAll<HTMLElement>("#site-navbar"),
      ]));
      stormTargetsRef.current = elements.map((element, index) => {
        const bounds = element.getBoundingClientRect();
        const isCard = element.hasAttribute("data-storm-body");
        const depth = isCard ? 1 : element.id === "site-navbar" ? 0.5 : 0.28;
        const original = {
          filter: element.style.filter,
          transform: element.style.transform,
          transformOrigin: element.style.transformOrigin,
          transition: element.style.transition,
          willChange: element.style.willChange,
        };
        element.style.transformOrigin = "center center";
        element.style.willChange = "transform, filter";
        element.style.transition = "filter 100ms linear";
        return {
          angularVelocity: 0,
          depth,
          dx: 0,
          dy: 0,
          element,
          kick: 0,
          original,
          phase: index * 1.73,
          rotation: 0,
          vx: 0,
          vy: 0,
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        };
      });
    };
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!reducedMotion) collectStormTargets();
    };
    resize();
    let lastFrame = performance.now();

    const render = (now: number) => {
      if (!activeRef.current || session !== sessionRef.current) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const onsets = onsetsRef.current;
      const currentTime = audio.currentTime;

      let activeWord = -1;
      for (let index = 0; index < DISPLAY_LYRICS.length; index += 1) {
        if (DISPLAY_LYRICS[index].start <= currentTime) activeWord = index;
        else break;
      }
      const word = DISPLAY_LYRICS[activeWord];
      const lineWords = word ? DISPLAY_LYRICS.filter((item) => item.line === word.line) : [];
      const lineEnd = lineWords.at(-1)?.end ?? -1;
      const nextLyric = word && currentTime <= lineEnd + 0.7
        ? { line: word.line, word: activeWord }
        : { line: -1, word: -1 };
      if (nextLyric.line !== lyricStateRef.current.line || nextLyric.word !== lyricStateRef.current.word) {
        lyricStateRef.current = nextLyric;
        setLyricState(nextLyric);
      }

      while (onsetIndexRef.current < onsets.length && onsets[onsetIndexRef.current].time <= currentTime + 0.025) {
        const onset = onsets[onsetIndexRef.current];
        const intensity = Math.min(Math.max(onset.intensity, 0.65), 1.8);
        if (!reducedMotion) {
          for (let index = 0; index < (intensity > 1.45 ? 2 : 1); index += 1) {
            const visibleTargets = stormTargetsRef.current.filter((target) => {
              const bounds = target.element.getBoundingClientRect();
              return bounds.bottom > -80 && bounds.top < height + 80;
            });
            const target = visibleTargets[Math.floor(Math.random() * visibleTargets.length)];
            const bounds = target?.element.getBoundingClientRect();
            const impact = bounds ? {
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2,
            } : undefined;
            const bolt = buildBolt(width, height, intensity, impact);
            boltsRef.current.push(bolt);

            if (target) {
              const origin = bolt.points[0];
              const end = bolt.points.at(-1) ?? origin;
              const distance = Math.hypot(end.x - origin.x, end.y - origin.y) || 1;
              const impulse = intensity * 0.72 * target.depth;
              target.vx += ((end.x - origin.x) / distance) * impulse;
              target.vy += ((end.y - origin.y) / distance) * impulse;
              target.angularVelocity += (Math.random() - 0.5) * intensity * 0.38;
              target.kick = Math.max(target.kick, intensity * 0.018);
            }
          }
          flashRef.current = Math.max(flashRef.current, intensity * 0.08);
          warpRef.current = Math.max(warpRef.current, intensity);
        }
        onsetIndexRef.current += 1;
      }

      context.clearRect(0, 0, width, height);
      const isDark = document.documentElement.classList.contains("dark");
      if (flashRef.current > 0.004) {
        context.fillStyle = isDark
          ? `rgba(255,255,255,${flashRef.current})`
          : `rgba(0,0,0,${flashRef.current * 0.7})`;
        context.fillRect(0, 0, width, height);
        flashRef.current *= 0.72;
      }

      boltsRef.current = boltsRef.current.filter((bolt) => {
        const progress = Math.max(0, (now - bolt.startedAt) / bolt.duration);
        if (progress >= 1) return false;
        const alpha = (1 - progress) * 0.9;
        context.beginPath();
        context.moveTo(bolt.points[0].x, bolt.points[0].y);
        bolt.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.lineWidth = Math.max(0.7, 2.2 * (1 - progress));
        context.shadowBlur = 18 * (1 - progress) * bolt.intensity;
        context.shadowColor = `rgba(${bolt.color},${alpha})`;
        context.strokeStyle = `rgba(${bolt.color},${alpha})`;
        context.stroke();
        context.shadowBlur = 0;

        const impact = bolt.points.at(-1);
        if (impact && progress < 0.62) {
          const ringProgress = progress / 0.62;
          context.beginPath();
          context.arc(impact.x, impact.y, 6 + ringProgress * 34 * bolt.intensity, 0, Math.PI * 2);
          context.lineWidth = Math.max(0.5, 2 * (1 - ringProgress));
          context.strokeStyle = `rgba(${bolt.color},${(1 - ringProgress) * 0.55})`;
          context.stroke();
        }
        return true;
      });

      const page = document.getElementById("page-wrap");
      if (!reducedMotion && page) {
        const warp = warpRef.current;
        const delta = Math.min(32, now - lastFrame);
        const frame = delta / 16.67;
        lastFrame = now;
        const centerX = width / 2;
        const centerY = height * 0.46;
        const pull = Math.min(0.032, warp * 0.014);
        page.style.filter = warp > 0.03
          ? `contrast(${1 + warp * 0.05}) saturate(${1 - warp * 0.075})`
          : "";
        stormTargetsRef.current.forEach((target, index) => {
          const direction = index % 2 === 0 ? 1 : -1;
          const damping = Math.pow(0.86, frame);
          target.vx = (target.vx - target.dx * 0.022 * frame) * damping;
          target.vy = (target.vy - target.dy * 0.022 * frame) * damping;
          target.angularVelocity = (target.angularVelocity - target.rotation * 0.025 * frame) * damping;
          target.dx += target.vx * frame;
          target.dy += target.vy * frame;
          target.rotation += target.angularVelocity * frame;
          target.kick *= Math.pow(0.8, frame);

          const orbit = (3.2 + (index % 4)) * target.depth;
          const driftX = Math.sin(now * 0.00072 + target.phase) * orbit;
          const driftY = Math.cos(now * 0.00057 + target.phase * 1.13) * orbit * 0.72;
          const x = target.dx + driftX + (centerX - target.x) * pull * target.depth;
          const y = target.dy + driftY + (centerY - target.y) * pull * target.depth;
          const rotation = target.rotation + direction * Math.sin(now * 0.00048 + target.phase) * 0.28 * target.depth;
          const scale = 1 + target.kick - warp * 0.0018 * target.depth;
          target.element.style.transform = `translate3d(${x}px,${y}px,0) rotate(${rotation}deg) scale(${scale})`;
          target.element.style.filter = warp > 0.03 ? `blur(${warp * 0.1 * target.depth}px)` : "";
        });
        warpRef.current *= 0.82;
      }

      animationRef.current = requestAnimationFrame(render);
    };

    window.addEventListener("resize", resize);
    audio.addEventListener("pause", () => window.removeEventListener("resize", resize), { once: true });
    animationRef.current = requestAnimationFrame(render);
  }, [resetPage, stop]);

  return (
    <span className="relative inline-flex items-baseline">
      <audio ref={audioRef} src={audioSrc} preload="metadata" onEnded={stop} />
      {portalHost && createPortal(
        <>
          <AnimatePresence>
            {active && lyricState.line >= 0 && (
              <motion.div
                key="lyric-scrim"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-none fixed inset-0 z-[61] bg-background/35 backdrop-blur-[1.5px]"
              />
            )}
          </AnimatePresence>
          <div className="pointer-events-none fixed inset-0 z-[70] flex items-start justify-center px-6 pt-[24vh]" aria-live="polite">
            <AnimatePresence mode="wait">
              {active && lyricState.line >= 0 && (
                <motion.p
                  key={lyricState.line}
                  initial={{ opacity: 0, scale: 0.94, filter: "blur(10px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.04, filter: "blur(12px)" }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="max-w-3xl text-center text-3xl font-black tracking-tight text-foreground [text-shadow:0_2px_18px_hsl(var(--background)),0_0_3px_hsl(var(--background))] sm:text-4xl md:text-5xl"
                >
                  {DISPLAY_LYRICS.map((lyric, index) => lyric.line === lyricState.line && (
                    <motion.span
                      key={`${lyric.start}-${lyric.word}`}
                      animate={{ opacity: index === lyricState.word ? 1 : index < lyricState.word ? 0.68 : 0.28 }}
                      transition={{ duration: 0.12 }}
                      className="mr-[0.24em] inline-block"
                    >
                      {lyric.word}
                    </motion.span>
                  ))}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={`pointer-events-none fixed inset-0 z-[65] h-screen w-screen transition-opacity duration-100 ${active ? "opacity-100" : "opacity-0"}`}
          />
        </>,
        portalHost,
      )}
      <button
        type="button"
        onPointerEnter={(event) => { if (event.pointerType !== "touch") void start(); }}
        onPointerLeave={stop}
        onPointerDown={() => { if (!activeRef.current) void start(); }}
        onClick={() => { if (!activeRef.current) void start(); }}
        onFocus={() => void start()}
        onBlur={stop}
        className="relative inline-flex items-center rounded-sm font-medium underline decoration-dotted decoration-1 underline-offset-4 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Preview Yap"
      >
        yap
        {needsGesture && (
          <span className="pointer-events-none absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 rounded-md border bg-background/95 px-2 py-1 text-[10px] font-normal text-muted-foreground shadow-sm">
            click once for sound
          </span>
        )}
      </button>
      <a
        href={FULL_SONG_URL}
        target="_blank"
        rel="noopener noreferrer"
        onPointerEnter={stop}
        className="group ml-0.5 inline-flex rounded-sm align-baseline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Open the full song"
        title="Open the full song"
      >
        <ExternalLink aria-hidden="true" className="size-2.5 opacity-55 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
      </a>
      <span className="sr-only">Hover to preview; use the external link for the full song.</span>
    </span>
  );
}

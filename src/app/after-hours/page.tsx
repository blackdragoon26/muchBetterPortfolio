"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LocateFixed, Pause, Play, RotateCcw, X } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./after-hours.module.css";

const LANDMARKS = [
  { id: "memory", label: "memory line", index: "01", copy: "Photos, tickets and tiny stories — fed into the line slowly, never as a normal gallery.", position: { left: "34%", top: "59%" } },
  { id: "drive", label: "midnight drive", index: "02", copy: "Old Japanese adverts, beautiful machines and the quiet part of the city after midnight.", position: { left: "54%", top: "43%" } },
  { id: "signal", label: "signal room", index: "03", copy: "The permanent soundtrack. The radio stays put while the rest of the map moves under it.", position: { left: "66%", top: "56%" } },
  { id: "match", label: "match point", index: "04", copy: "Table tennis, scorecards and one more game after saying the previous one was the last.", position: { left: "48%", top: "76%" } },
] as const;

const REFERENCES = [
  { src: "/after-hours/sony-night-reference.png", alt: "Night city reference with vintage illuminated signage", label: "night signal" },
  { src: "/after-hours/nsx-reference.png", alt: "Japanese sports car reference photographed at sunset", label: "machine crush" },
  { src: "/after-hours/japanese-editorial-reference.png", alt: "Colourful Japanese editorial illustration reference", label: "print energy" },
  { src: "/after-hours/dark-fantasy-reference.png", alt: "Dark fantasy line-art reference", label: "myth file" },
] as const;

type Offset = { x: number; y: number };

// YouTube is the playback engine while the site presents its own in-dash
// controls, matching the reference experience.
const YOUTUBE_VIDEO_IDS = [
  "8hnBARKWUy4",
] as const;

type YouTubeVideoData = { author?: string; title?: string; video_id?: string };
type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaylist: () => string[];
  getPlaylistIndex: () => number;
  getVolume: () => number;
  getVideoData: () => YouTubeVideoData;
  nextVideo: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  previousVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setLoop: (loop: boolean) => void;
  setShuffle: (shuffle: boolean) => void;
  setVolume: (volume: number) => void;
};
type YouTubePlayerEvent = { target: YouTubePlayer; data: number };
type YouTubeNamespace = {
  Player: new (element: HTMLElement, options: {
    height: string;
    width: string;
    videoId: string;
    playerVars: Record<string, string | number>;
    events: {
      onError: (event: YouTubePlayerEvent) => void;
      onReady: (event: YouTubePlayerEvent) => void;
      onStateChange: (event: YouTubePlayerEvent) => void;
    };
  }) => YouTubePlayer;
  PlayerState: { BUFFERING: number; ENDED: number; PAUSED: number; PLAYING: number };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00";
  return Math.floor(seconds).toString().padStart(2, "0");
}

function DashboardStereo() {
  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const volumeDragRef = useRef<{ pointerId: number; startY: number; startVolume: number } | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [trackCount, setTrackCount] = useState(0);
  const [trackTitle, setTrackTitle] = useState("YOUTUBE SIGNAL READY");
  const [trackAuthor, setTrackAuthor] = useState("WAITING FOR TUNER");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [displayMode, setDisplayMode] = useState<"meter" | "spectrum">("meter");
  const [status, setStatus] = useState("CONNECTING YOUTUBE TUNER");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(64);

  useEffect(() => {
    let disposed = false;

    const syncMetadata = (player: YouTubePlayer) => {
      if (
        typeof player.getVideoData !== "function" ||
        typeof player.getPlaylistIndex !== "function" ||
        typeof player.getPlaylist !== "function"
      ) return;
      const data = player.getVideoData();
      setTrackTitle(data.title || "YOUTUBE PLAYLIST");
      setTrackAuthor(data.author || "YOUTUBE");
      setTrackIndex(Math.max(0, player.getPlaylistIndex()));
      setTrackCount(player.getPlaylist()?.length || 0);
    };

    const createPlayer = () => {
      if (disposed || !window.YT?.Player || !playerMountRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(playerMountRef.current, {
        width: "100%",
        height: "100%",
        videoId: YOUTUBE_VIDEO_IDS[0],
        playerVars: {
          playlist: YOUTUBE_VIDEO_IDS.join(","),
          loop: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          fs: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            target.setLoop(true);
            target.setShuffle(false);
            target.setVolume(64);
            setReady(true);
            setStatus("YT LINK / PRESS PLAY");
            syncMetadata(target);
          },
          onStateChange: ({ target, data }) => {
            const states = window.YT?.PlayerState;
            if (!states) return;
            syncMetadata(target);
            if (data === states.PLAYING) {
              setPlaying(true);
              setStatus("YOUTUBE / PLAYING");
            } else if (data === states.PAUSED) {
              setPlaying(false);
              setStatus("PAUSED / YOUTUBE");
            } else if (data === states.BUFFERING) {
              setStatus("BUFFERING YOUTUBE SIGNAL");
            } else if (data === states.ENDED) {
              target.nextVideo();
            }
          },
          onError: () => {
            setPlaying(false);
            setStatus("VIDEO UNAVAILABLE / PRESS NEXT");
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        createPlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    }

    const ticker = window.setInterval(() => {
      const player = playerRef.current;
      if (
        !player ||
        typeof player.getDuration !== "function" ||
        typeof player.getCurrentTime !== "function"
      ) return;
      const nextDuration = player.getDuration() || 0;
      const currentTime = player.getCurrentTime() || 0;
      setDuration(nextDuration);
      setProgress(nextDuration ? (currentTime / nextDuration) * 100 : 0);
      syncMetadata(player);
    }, 500);

    return () => {
      disposed = true;
      window.clearInterval(ticker);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const play = () => {
    if (!playerRef.current) return;
    playerRef.current.playVideo();
    setPlaying(true);
    setStatus("RELEASING YOUTUBE AUDIO");
  };

  const pause = () => {
    const player = playerRef.current;
    if (!player) return;
    player.pauseVideo();
    setPlaying(false);
    setStatus("PAUSED / YOUTUBE");
  };

  const restart = () => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(0, true);
    player.playVideo();
    setPlaying(true);
  };

  const applyVolume = (nextVolume: number) => {
    const next = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolume(next);
    playerRef.current?.setVolume(next);
  };

  return (
    <aside className={styles.dashboardStereo} aria-label="After Hours YouTube music stereo">
      <div className={styles.deckBrand}>
        <strong>SJ</strong>
        <span>MD/CD DASH CONTROL · DIGITAL SIGNAL PROCESSOR</span>
        <b>YT / {trackCount.toString().padStart(3, "0")}</b>
      </div>
      <div className={styles.deckBody}>
        <div className={styles.deckCenter}>
          <div className={styles.youtubeEngine} aria-hidden="true"><div ref={playerMountRef} /></div>
          <div className={styles.deckScreen}>
            <div className={styles.screenTopline}><span>YT</span><span>{(trackIndex + 1).toString().padStart(2, "0")}</span><span>{formatTime(duration)}</span><span>{Math.round(progress).toString().padStart(2, "0")}</span></div>
            <div className={styles.trackMarquee}><strong>{trackTitle.toUpperCase()}</strong><small>{trackAuthor.toUpperCase()}</small></div>
            <div className={styles.visualizerGrid}>
              <div className={styles.screenFlags} aria-hidden="true"><span>REP</span><span>YT</span><span>PGM</span><span>DSO</span></div>
              {displayMode === "meter" ? (
                <div className={`${styles.volumeMeter} ${playing ? styles.meterLive : ""}`} aria-hidden="true">
                  {Array.from({ length: 25 }, (_, index) => (
                    <i key={index} style={{ transform: `rotate(${-76 + index * (152 / 24)}deg)` }}>
                      <b style={{ animationDelay: `${-index * 53}ms`, animationDuration: `${430 + (index % 6) * 83}ms` }} />
                    </i>
                  ))}
                  <span>SJ<small>dB</small></span>
                </div>
              ) : (
                <div className={`${styles.equalizer} ${playing ? styles.equalizerLive : ""}`} aria-hidden="true">
                  {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ animationDelay: `${-index * 77}ms` }} />)}
                </div>
              )}
              <div className={styles.screenStats} aria-hidden="true"><span><b>{Math.floor(duration / 60).toString().padStart(2, "0")}</b> MIN</span><span><b>{formatTime(duration % 60)}</b> SEC</span><span>STEREO</span></div>
            </div>
            <div className={styles.signalRow}><span>{status}</span><span>{ready ? "ST" : "--"}</span></div>
            <div className={styles.progressRail}><span style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
        <button
          type="button"
          className={styles.volumeKnob}
          style={{ "--knob-angle": `${-135 + volume * 2.7}deg` } as React.CSSProperties}
          role="slider"
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volume}
          onWheel={(event: ReactWheelEvent<HTMLButtonElement>) => {
            event.preventDefault();
            applyVolume(volume + (event.deltaY < 0 ? 5 : -5));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            volumeDragRef.current = { pointerId: event.pointerId, startY: event.clientY, startVolume: volume };
          }}
          onPointerMove={(event) => {
            const drag = volumeDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            applyVolume(drag.startVolume + (drag.startY - event.clientY) * 0.7);
          }}
          onPointerUp={(event) => {
            if (volumeDragRef.current?.pointerId === event.pointerId) volumeDragRef.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowRight") applyVolume(volume + 5);
            if (event.key === "ArrowDown" || event.key === "ArrowLeft") applyVolume(volume - 5);
          }}
        >
          <span className={styles.knobMarker} aria-hidden="true" />
          <strong>{volume}</strong>
          <small>VOL</small>
        </button>
      </div>

      <div className={styles.deckControls}>
        <button type="button" onClick={() => setDisplayMode((mode) => mode === "meter" ? "spectrum" : "meter")}>DISPLAY</button>
        <button type="button" className={styles.transportRoller} onClick={() => playing ? pause() : play()} disabled={!ready} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={13} /> : <Play size={13} />}<span>{playing ? "PAUSE" : "PLAY"}</span>
        </button>
        <button type="button" onClick={restart} disabled={!ready} aria-label="Restart track"><RotateCcw size={11} /> RESET</button>
      </div>
    </aside>
  );
}

export default function AfterHoursPage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const factoryVideoRef = useRef<HTMLVideoElement>(null);
  const targetOffsetRef = useRef<Offset>({ x: 0, y: 0 });
  const renderedOffsetRef = useRef<Offset>({ x: 0, y: 0 });
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [activeLandmark, setActiveLandmark] = useState<string>("");
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [clock, setClock] = useState("--:--:--");

  const startFactoryFeed = useCallback(() => {
    const video = factoryVideoRef.current;
    if (!video) return;
    video.defaultMuted = true;
    video.muted = true;
    const playback = video.play();
    if (playback) void playback.catch(() => undefined);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("after-hours-active");
    body.classList.add("after-hours-active");

    return () => {
      root.classList.remove("after-hours-active");
      body.classList.remove("after-hours-active");
    };
  }, []);

  useEffect(() => {
    const updateClock = () => {
      setClock(new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      }).format(new Date()));
    };
    updateClock();
    const interval = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(startFactoryFeed);
    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible") startFactoryFeed();
    };
    window.addEventListener("pageshow", startFactoryFeed);
    window.addEventListener("focus", startFactoryFeed);
    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", startFactoryFeed);
      window.removeEventListener("focus", startFactoryFeed);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
    };
  }, [startFactoryFeed]);

  useEffect(() => {
    let frame = 0;
    const glide = () => {
      setOffset((current) => {
        const target = targetOffsetRef.current;
        const x = current.x + (target.x - current.x) * 0.045;
        const y = current.y + (target.y - current.y) * 0.045;
        const next = Math.abs(target.x - x) < 0.08 && Math.abs(target.y - y) < 0.08 ? target : { x, y };
        renderedOffsetRef.current = next;
        return next;
      });
      frame = window.requestAnimationFrame(glide);
    };
    frame = window.requestAnimationFrame(glide);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (galleryOpen) return;
    const interval = window.setInterval(() => {
      setSpotlightIndex((current) => {
        if (REFERENCES.length < 2) return current;
        const jump = 1 + Math.floor(Math.random() * (REFERENCES.length - 1));
        return (current + jump) % REFERENCES.length;
      });
    }, 5200);
    return () => window.clearInterval(interval);
  }, [galleryOpen]);

  useEffect(() => {
    if (!galleryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGalleryOpen(false);
      if (event.key === "ArrowLeft") setGalleryIndex((current) => (current - 1 + REFERENCES.length) % REFERENCES.length);
      if (event.key === "ArrowRight") setGalleryIndex((current) => (current + 1) % REFERENCES.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryOpen]);

  const clampOffset = (next: Offset): Offset => {
    const viewport = viewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return next;
    const maxX = Math.max(0, (map.clientWidth - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (map.clientHeight - viewport.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, [role='dialog']")) {
      targetOffsetRef.current = renderedOffsetRef.current;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    const normalizedY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
    const viewport = viewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;
    const maxX = Math.max(0, (map.clientWidth - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (map.clientHeight - viewport.clientHeight) / 2);
    targetOffsetRef.current = clampOffset({ x: -normalizedX * maxX * 0.82, y: -normalizedY * maxY * 0.82 });
  };

  return (
    <main className={styles.world}>
      <div
        ref={viewportRef}
        className={styles.mapViewport}
        onPointerMove={handlePointerMove}
        aria-label="Cursor-responsive personal factory map"
      >
        <video
          ref={factoryVideoRef}
          className={styles.factoryVideo}
          style={{ transform: `translate3d(${offset.x * 0.035}px, ${offset.y * 0.035}px, 0) scale(1.055)` }}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/after-hours/factory-feed-01.jpg"
          onCanPlay={startFactoryFeed}
          onLoadedData={startFactoryFeed}
        >
          <source src="/after-hours/factory-feed.mp4" type="video/mp4" />
        </video>
        <div className={styles.factoryGrade} aria-hidden="true" />

        <div ref={mapRef} className={styles.mapCanvas} style={{ transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0)` }}>
          <section className={styles.introNote} aria-labelledby="after-hours-title">
            <svg className={styles.glassFilterDefs} aria-hidden="true">
              <defs>
                <filter id="wet-glass-text" x="-15%" y="-25%" width="130%" height="160%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.012 0.055" numOctaves="2" seed="11" result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.65" xChannelSelector="R" yChannelSelector="B" result="ripple" />
                  <feGaussianBlur in="SourceAlpha" stdDeviation="0.55" result="softAlpha" />
                  <feSpecularLighting in="softAlpha" surfaceScale="3" specularConstant="0.38" specularExponent="24" lightingColor="#ffffff" result="shine">
                    <feDistantLight azimuth="225" elevation="48" />
                  </feSpecularLighting>
                  <feComposite in="shine" in2="SourceAlpha" operator="in" result="clippedShine" />
                  <feMerge><feMergeNode in="ripple" /><feMergeNode in="clippedShine" /></feMerge>
                </filter>
              </defs>
            </svg>
            <p>FILE: THE OTHER SIDE</p>
            <h1 id="after-hours-title">
              <span className={styles.liquidTitle} data-text="I build systems for a living.">I build systems for a living.</span>
              <em>This is what I build for fun.</em>
            </h1>
            <small>Move your cursor. Let the factory follow. Find the live signals.</small>
          </section>

          <nav className={styles.landmarks} aria-label="Factory landmarks">
            {LANDMARKS.map((landmark) => {
              const isActive = activeLandmark === landmark.id;
              return (
                <button key={landmark.id} type="button" className={`${styles.landmark} ${isActive ? styles.landmarkActive : ""}`} style={landmark.position} aria-pressed={isActive} onClick={() => setActiveLandmark(landmark.id)}>
                  <span className={styles.landmarkIndex}>{landmark.index}</span>
                  <span className={styles.landmarkBeacon} aria-hidden="true" />
                  <strong>{landmark.label}</strong>
                  {isActive ? <span className={styles.landmarkCopy}>{landmark.copy}</span> : null}
                </button>
              );
            })}
          </nav>

          <aside className={styles.referenceCluster} aria-labelledby="visual-brain-title">
            <div className={styles.clusterLabel}><p id="visual-brain-title">visual brain</p><span>click to open archive</span></div>
            <button
              type="button"
              className={styles.referenceSpotlight}
              onClick={() => { setGalleryIndex(spotlightIndex); setGalleryOpen(true); }}
              aria-label={`Open gallery at ${REFERENCES[spotlightIndex].label}`}
            >
              <span className={styles.referenceStack} aria-hidden="true" />
              <span className={styles.spotlightImage}>
                <Image key={REFERENCES[spotlightIndex].src} src={REFERENCES[spotlightIndex].src} alt={REFERENCES[spotlightIndex].alt} fill sizes="360px" />
              </span>
              <span className={styles.spotlightCaption}><b>0{spotlightIndex + 1}</b> {REFERENCES[spotlightIndex].label}<em>{spotlightIndex + 1} / {REFERENCES.length}</em></span>
            </button>
          </aside>
        </div>
      </div>

      {galleryOpen ? (
        <section className={styles.galleryOverlay} role="dialog" aria-modal="true" aria-label="Visual brain gallery">
          <button type="button" className={styles.galleryBackdrop} onClick={() => setGalleryOpen(false)} aria-label="Close gallery" />
          <div className={styles.galleryStage}>
            <div className={styles.galleryTopline}><span>VISUAL BRAIN / 0{galleryIndex + 1}</span><button type="button" onClick={() => setGalleryOpen(false)} aria-label="Close gallery"><X size={16} /></button></div>
            <div className={styles.galleryImage}><Image src={REFERENCES[galleryIndex].src} alt={REFERENCES[galleryIndex].alt} fill sizes="(max-width: 800px) 90vw, 60vw" /></div>
            <div className={styles.galleryFooter}>
              <button type="button" onClick={() => setGalleryIndex((current) => (current - 1 + REFERENCES.length) % REFERENCES.length)} aria-label="Previous image"><ChevronLeft size={18} /></button>
              <p><strong>{REFERENCES[galleryIndex].label}</strong><span>{REFERENCES[galleryIndex].alt}</span></p>
              <button type="button" onClick={() => setGalleryIndex((current) => (current + 1) % REFERENCES.length)} aria-label="Next image"><ChevronRight size={18} /></button>
            </div>
          </div>
        </section>
      ) : null}

      <header className={styles.hud}>
        <time className={styles.identity} dateTime={clock} suppressHydrationWarning><span>{clock}</span><small>IST</small></time>
        <Link href="/" className={styles.modeSwitch} aria-label="Return to work portfolio">
          <span>work</span><span className={styles.switchTrack} aria-hidden="true"><span /></span><strong>after hours</strong>
        </Link>
      </header>

      <button type="button" className={styles.recenter} onClick={() => { targetOffsetRef.current = { x: 0, y: 0 }; }}>
        <LocateFixed size={15} aria-hidden="true" /> recenter
      </button>

      <DashboardStereo />

    </main>
  );
}

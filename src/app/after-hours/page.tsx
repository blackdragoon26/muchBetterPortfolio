"use client";

import { MovableClock } from "@/components/movable-clock";
import dynamic from "next/dynamic";
import Image from "next/image";
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
import type { StationId } from "./night-station";

const NightStation = dynamic(() => import("./night-station"));

const LANDMARKS = [
  { id: "memory", label: "memory line", index: "01", copy: "Photos, tickets and tiny stories — fed into the line slowly, never as a normal gallery.", position: { left: "34%", top: "59%" } },
  { id: "drive", label: "midnight drive", index: "02", copy: "Old Japanese adverts, beautiful machines and the quiet part of the city after midnight.", position: { left: "54%", top: "43%" } },
  { id: "signal", label: "signal room", index: "03", copy: "The permanent soundtrack. The radio stays put while the rest of the map moves under it.", position: { left: "66%", top: "56%" } },
  { id: "match", label: "match point", index: "04", copy: "Table tennis, scorecards and one more game after saying the previous one was the last.", position: { left: "48%", top: "76%" } },
  { id: "furnace", label: "pocket furnace", index: "05", position: { left: "62%", top: "35%" } },
  { id: "radio", label: "pirate frequency", index: "06", position: { left: "28%", top: "40%" } },
  { id: "percussion", label: "machine rhythm", index: "07", position: { left: "75%", top: "70%" } },
  { id: "delivery", label: "night deliveries", index: "08", position: { left: "27%", top: "78%" } },
  { id: "receipt", label: "time well wasted", index: "09", position: { left: "56%", top: "66%" } },
] as const;

const REFERENCES = [
  { src: "/after-hours/sony-night-reference.png", alt: "Night city reference with vintage illuminated signage" },
  { src: "/after-hours/nsx-reference.png", alt: "Japanese sports car reference photographed at sunset" },
  { src: "/after-hours/japanese-editorial-reference.png", alt: "Colourful Japanese editorial illustration reference" },
  { src: "/after-hours/dark-fantasy-reference.png", alt: "Dark fantasy line-art reference" },
] as const;

const SKY_PHOTOS = [
  [1, "Pink clouds behind a row of buildings at dusk"],
  [2, "A thin orange sunset below a deep blue sky"],
  [3, "Sunset between dark columns and overhead wires"],
  [4, "A park path framed by trees at dusk"],
  [5, "A panoramic view across a city under an overcast sky"],
  [6, "Mountain ridges beneath a bright blue sky"],
  [7, "Low sun reflecting on wet ground"],
  [8, "Green fields and a single tree beneath scattered clouds"],
  [9, "A silhouetted arch and trees against a blue evening sky"],
  [10, "Moonlight filtering through dark clouds"],
  [11, "A domed pavilion and trees in silhouette"],
  [12, "Clouds above distant mountains and scrubland"],
  [13, "Sunrise at the end of a road lined with bare trees"],
  [14, "A bright light above a red structure at night"],
  [15, "A bright light shining through trees at night"],
  [16, "Rocks on a mountaintop under a clear blue sky"],
  [17, "Two people fist-bumping on a mountain overlook"],
  [18, "A valley below a blue twilight sky"],
  [19, "A city lit up below a dark hillside"],
  [20, "An orange sunset reflected in a side mirror"],
  [21, "Purple storm clouds above city traffic"],
  [22, "A strip of orange dusk beneath thick clouds"],
  [23, "Branches silhouetted against a bright evening sky"],
  [24, "A decorated camel on a beach"],
  [25, "Sunrise over waves with people along the shoreline"],
  [26, "A low sun reflecting across the beach"],
  [27, "An ornate stone ceiling lit in amber"],
  [29, "A tall stone interior in warm light and shadow"],
  [30, "Nested doorways in an amber-lit stone corridor"],
  [31, "A symmetrical stone hall framed by carved columns"],
  [32, "A lake and distant buildings beneath a muted dusk sky"],
  [41, "A lit bridge and streetlamps under a blue night sky"],
  [34, "A pool lit blue at night"],
  [36, "Orange clouds above dark trees and rooftops"],
  [37, "A sunset reflected in calm water"],
  [38, "A grassy landscape and a lone pole at dusk"],
  [39, "Trees and streetlights against a red evening sky"],
  [42, "A laptop and headphones on a warmly lit café table"],
  [43, "A laptop in front of a warmly lit café counter"],
  [44, "A wall of photographs in a room illuminated red"],
  [45, "Glowing oil lamps arranged among orange flower petals"],
  [40, "A tree canopy silhouetted against a pale sunset"],
].map(([number, alt]) => ({
  src: `/after-hours/sky/${String(number).padStart(2, "0")}.webp`,
  alt: String(alt),
}));
const SKY_COVER = SKY_PHOTOS.find((photo) => photo.src.endsWith("/31.webp")) ?? SKY_PHOTOS[0];

type GalleryCollection = "sky" | "references";

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
  const targetOffsetRef = useRef<Offset>({ x: 0, y: 0 });
  const renderedOffsetRef = useRef<Offset>({ x: 0, y: 0 });
  const panFrame = useRef<number | null>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [station, setStation] = useState<StationId | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const dispatchButton = useRef<HTMLButtonElement>(null);
  const openedFromDispatch = useRef(false);
  const closeStation = useCallback(() => {
    setStation(null);
    if (openedFromDispatch.current) dispatchButton.current?.focus();
    openedFromDispatch.current = false;
  }, []);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [collection, setCollection] = useState<GalleryCollection>("sky");
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const galleryDialog = useRef<HTMLDialogElement>(null);
  const closeGalleryButton = useRef<HTMLButtonElement>(null);
  const galleryPhotos = collection === "sky" ? SKY_PHOTOS : REFERENCES;
  const galleryPhoto = galleryPhotos[galleryIndex];

  const selectCollection = useCallback((next: GalleryCollection) => {
    setCollection(next);
    setGalleryIndex(0);
    setSlideshowPlaying(next === "sky" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const openStationArchive = useCallback(() => {
    selectCollection("references");
    setGalleryOpen(true);
  }, [selectCollection]);

  const openSky = () => {
    selectCollection("sky");
    setGalleryOpen(true);
  };

  const stepGallery = useCallback((direction: number) => {
    setGalleryIndex((index) => (index + direction + galleryPhotos.length) % galleryPhotos.length);
  }, [galleryPhotos.length]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setMotionAllowed(!preference.matches);
    syncMotion();
    preference.addEventListener("change", syncMotion);
    return () => preference.removeEventListener("change", syncMotion);
  }, []);

  const moveMap = useCallback((target: Offset) => {
    targetOffsetRef.current = target;
    if (panFrame.current !== null) return;

    function glide() {
      const current = renderedOffsetRef.current;
      const destination = targetOffsetRef.current;
      const dx = destination.x - current.x;
      const dy = destination.y - current.y;
      const settled = Math.abs(dx) < .25 && Math.abs(dy) < .25;
      const next = settled ? destination : { x: current.x + dx * .12, y: current.y + dy * .12 };
      renderedOffsetRef.current = next;
      viewportRef.current?.style.setProperty("--map-x", `${next.x}px`);
      viewportRef.current?.style.setProperty("--map-y", `${next.y}px`);
      panFrame.current = settled ? null : window.requestAnimationFrame(glide);
    }

    panFrame.current = window.requestAnimationFrame(glide);
  }, []);

  useEffect(() => {
    if (!motionAllowed) moveMap({ x: 0, y: 0 });
    return () => {
      if (panFrame.current !== null) window.cancelAnimationFrame(panFrame.current);
      panFrame.current = null;
    };
  }, [motionAllowed, moveMap]);

  useEffect(() => {
    if (!dispatchOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDispatchOpen(false);
        dispatchButton.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dispatchOpen]);

  useEffect(() => {
    const dialog = galleryDialog.current;
    if (!galleryOpen || !dialog) return;
    const previous = document.activeElement;
    if (!dialog.open) dialog.showModal();
    closeGalleryButton.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [galleryOpen]);

  useEffect(() => {
    if (!galleryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      stepGallery(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryOpen, stepGallery]);

  useEffect(() => {
    if (!galleryOpen || !slideshowPlaying) return;
    const interval = window.setInterval(() => {
      if (!document.hidden) stepGallery(1);
    }, 5200);
    return () => window.clearInterval(interval);
  }, [galleryIndex, galleryOpen, slideshowPlaying, stepGallery]);

  const openStation = (id: StationId, fromDispatch = false) => {
    openedFromDispatch.current = fromDispatch;
    setDispatchOpen(false);
    setStation(id);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!motionAllowed || event.pointerType === "touch" || window.innerWidth <= 700) return;
    if (document.documentElement.hasAttribute("data-clock-placing")) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a")) {
      targetOffsetRef.current = renderedOffsetRef.current;
      return;
    }

    const map = mapRef.current;
    const viewport = event.currentTarget;
    if (!map) return;
    const rect = viewport.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2));
    const maxX = Math.max(0, (map.clientWidth - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (map.clientHeight - viewport.clientHeight) / 2);
    moveMap({ x: -x * maxX * .54, y: -y * maxY * .54 });
  };

  return (
    <main data-after-hours className={styles.world}>
      <div
        ref={viewportRef}
        className={styles.mapViewport}
        onPointerMove={handlePointerMove}
        aria-label="Cursor-responsive personal factory map"
      >
        {motionAllowed && (
          <video
            className={styles.factoryVideo}
            src="/after-hours/factory-feed.mp4"
            poster="/after-hours/factory-feed-01.jpg"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
          />
        )}
        <div className={styles.factoryGrade} aria-hidden="true" />

        <div ref={mapRef} className={styles.mapCanvas}>
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
            <h1 id="after-hours-title">
              <span className={styles.liquidTitle} data-text="I build systems for a living.">I build systems for a living.</span>
              <em>This is what I build for fun.</em>
            </h1>
          </section>

          <nav className={styles.landmarks} aria-label="Factory landmarks">
            {LANDMARKS.map((landmark) => {
              const isActive = station === landmark.id;
              return (
                <button key={landmark.id} type="button" className={`${styles.landmark} ${isActive ? styles.landmarkActive : ""}`} style={landmark.position} aria-pressed={isActive} onClick={() => openStation(landmark.id)}>
                  <span className={styles.landmarkBeacon} aria-hidden="true" />
                  <strong>{landmark.label}</strong>
                </button>
              );
            })}
          </nav>

        </div>
        <aside className={styles.referenceCluster} aria-labelledby="visual-brain-title">
          <div className={styles.clusterLabel}><p id="visual-brain-title">visual brain</p></div>
          <button
            type="button"
            className={styles.referenceSpotlight}
            onClick={openSky}
            aria-label="Open Sky photo album"
          >
            <span className={styles.referenceStack} aria-hidden="true" />
            <span className={styles.spotlightImage}>
              <Image src={SKY_COVER.src} alt="" fill sizes="(max-width: 700px) 176px, 330px" />
            </span>
            <span className={styles.spotlightCaption}><b>Sky</b><em>{SKY_PHOTOS.length} photos</em></span>
          </button>
        </aside>
      </div>

      {station && !galleryOpen ? (
        <NightStation key={station} station={station} onClose={closeStation} onArchive={openStationArchive} />
      ) : null}
      <div className={styles.dispatch}>
        <button
          ref={dispatchButton}
          type="button"
          className={styles.dispatchButton}
          aria-expanded={dispatchOpen}
          aria-controls="dispatch-games"
          onClick={() => {
            setStation(null);
            setDispatchOpen((open) => !open);
          }}
        >Night dispatch</button>
        {dispatchOpen && (
          <nav id="dispatch-games" className={styles.dispatchGames} aria-label="Choose an experiment">
            {LANDMARKS.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => openStation(id, true)}>{label}</button>
            ))}
          </nav>
        )}
      </div>

      {galleryOpen && (
        <dialog
          ref={galleryDialog}
          className={styles.galleryOverlay}
          aria-label="Visual Brain slideshow"
          onCancel={(event) => {
            event.preventDefault();
            setGalleryOpen(false);
          }}
        >
          <button type="button" tabIndex={-1} className={styles.galleryBackdrop} onClick={() => setGalleryOpen(false)} aria-label="Close slideshow" />
          <div className={styles.galleryStage}>
            <div className={styles.galleryTopline}>
              <div className={styles.galleryCollections} aria-label="Photo collections" role="group">
                <button type="button" aria-pressed={collection === "sky"} onClick={() => selectCollection("sky")}>Sky</button>
                <button type="button" aria-pressed={collection === "references"} onClick={() => selectCollection("references")}>References</button>
              </div>
              <button ref={closeGalleryButton} type="button" onClick={() => setGalleryOpen(false)} aria-label="Close gallery"><X size={17} /></button>
            </div>
            <div className={styles.galleryImage}>
              <Image key={galleryPhoto.src} src={galleryPhoto.src} alt={galleryPhoto.alt} fill loading="eager" sizes="(max-width: 800px) 95vw, 1000px" />
            </div>
            <div className={styles.galleryFooter}>
              <button type="button" onClick={() => stepGallery(-1)} aria-label="Previous photo"><ChevronLeft size={18} /></button>
              <span>{galleryIndex + 1} / {galleryPhotos.length}</span>
              <button
                type="button"
                onClick={() => setSlideshowPlaying((playing) => !playing)}
                aria-label={slideshowPlaying ? "Pause slideshow" : "Play slideshow"}
              >
                {slideshowPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button type="button" onClick={() => stepGallery(1)} aria-label="Next photo"><ChevronRight size={18} /></button>
            </div>
          </div>
        </dialog>
      )}

      <header className={styles.hud}>
        <MovableClock afterHours className={styles.watch} />
      </header>

      {motionAllowed && (
        <button type="button" className={styles.recenter} onClick={() => moveMap({ x: 0, y: 0 })}>
          <LocateFixed size={15} aria-hidden="true" /> recenter
        </button>
      )}

      <DashboardStereo />

    </main>
  );
}

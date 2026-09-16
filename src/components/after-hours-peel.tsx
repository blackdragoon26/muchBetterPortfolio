"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type PeelStyle = CSSProperties & {
  "--peel-distance": string;
  "--peel-depth": string;
};

const RESTING_CORNER = 76;
const COMMIT_DELAY = 430;

export function AfterHoursPeel() {
  const router = useRouter();
  const [dragDistance, setDragDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [committing, setCommitting] = useState(false);
  const startPoint = useRef({ x: 0, y: 0 });
  const distanceRef = useRef(0);
  const draggedRef = useRef(false);
  const committingRef = useRef(false);

  useEffect(() => {
    router.prefetch("/after-hours");
  }, [router]);

  const threshold = () => Math.max(160, window.innerWidth * 0.5);

  const commitPeel = useCallback(() => {
    if (committingRef.current) return;
    committingRef.current = true;
    setDragging(false);
    setCommitting(true);
    setDragDistance(threshold());
    document.documentElement.classList.add("after-hours-transition-used");
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : COMMIT_DELAY;
    window.setTimeout(() => router.push("/after-hours"), delay);
  }, [router]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (committingRef.current || event.button !== 0) return;
    startPoint.current = { x: event.clientX, y: event.clientY };
    distanceRef.current = 0;
    draggedRef.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || committingRef.current) return;
    const horizontalTravel = Math.max(0, startPoint.current.x - event.clientX);
    const downwardTravel = Math.max(0, event.clientY - startPoint.current.y) * 0.82;
    const nextDistance = Math.min(threshold(), Math.max(horizontalTravel, downwardTravel));
    distanceRef.current = nextDistance;
    draggedRef.current ||= nextDistance > 5;
    setDragDistance(nextDistance);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging || committingRef.current) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (distanceRef.current >= threshold() * 0.96) {
      commitPeel();
      return;
    }
    distanceRef.current = 0;
    setDragDistance(0);
  };

  const onClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    commitPeel();
  };

  const maxDistance = typeof window === "undefined" ? 640 : threshold();
  const progress = Math.min(1, dragDistance / maxDistance);
  const visualDistance = RESTING_CORNER + dragDistance;
  const visualDepth = RESTING_CORNER + dragDistance * 0.72;
  const style: PeelStyle = {
    "--peel-distance": `${visualDistance}px`,
    "--peel-depth": `${visualDepth}px`,
  };

  return (
    <div
      className={`page-peel ${dragging ? "page-peel-dragging" : ""} ${committing ? "page-peel-committing" : ""}`}
      style={style}
    >
      <div className="page-peel-preview" aria-hidden="true" />
      <div className="page-peel-fold" aria-hidden="true" />
      <button
        type="button"
        className="page-peel-trigger"
        aria-label="Peel open After Hours"
        aria-describedby="page-peel-instruction"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        <span>AFTER<br />HOURS</span>
        <i aria-hidden="true">↙</i>
      </button>
      <span id="page-peel-instruction" className="page-peel-instruction">
        {dragging ? `${Math.round(progress * 100)}% · keep peeling` : "drag halfway"}
      </span>
    </div>
  );
}

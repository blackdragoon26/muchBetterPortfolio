"use client";

import { AsciiWatch } from "./ascii-watch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./space-clock.module.css";

export function SpaceClock({ afterHours = false, onMove }: { afterHours?: boolean; onMove?: () => void }) {
  const router = useRouter();
  const timer = useRef<number>();
  const [peeling, setPeeling] = useState(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <nav aria-label="Portfolio spaces" className={styles.navigation}>
      <div className={styles.dial}>
        <AsciiWatch afterHours={afterHours} movable={Boolean(onMove)} />
        {afterHours ? (
          <Link
            href="/"
            className={`${styles.sector} ${styles.day}`}
            aria-label="Return to portfolio"
            title="Return to portfolio"
          />
        ) : (
          <Link
            href="/after-hours"
            className={`${styles.sector} ${styles.night}`}
            aria-label="Enter After Hours"
            title="Enter After Hours"
            onNavigate={(event) => {
              if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
              event.preventDefault();
              if (timer.current !== undefined) return;
              setPeeling(true);
              timer.current = window.setTimeout(() => router.push("/after-hours"), 240);
            }}
          />
        )}
        {onMove && <button type="button" aria-label="Move clock" title="Move clock" className={styles.move} onClick={onMove} />}
      </div>
      {peeling && createPortal(<div className="space-clock-peel" aria-hidden="true" />, document.body)}
    </nav>
  );
}

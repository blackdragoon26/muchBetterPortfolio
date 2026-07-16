"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface ProjectLaunchLinkProps {
  href: string;
  title: string;
  image?: string;
  video?: string;
  className?: string;
}

export function ProjectLaunchLink({
  href,
  title,
  image,
  video,
  className,
}: ProjectLaunchLinkProps) {
  const [launching, setLaunching] = useState(false);
  const navigationTimer = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => () => {
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
  }, []);

  function launch(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      launching
    ) {
      return;
    }

    event.preventDefault();
    if (reduceMotion) {
      window.location.assign(href);
      return;
    }

    setLaunching(true);
    navigationTimer.current = window.setTimeout(() => window.location.assign(href), 720);
  }

  return (
    <>
      <Link href={href} onClick={launch} className={className} aria-label={`Open ${title}`}>
        {video && (
          <video
            src={video}
            autoPlay
            loop
            muted
            playsInline
            className="pointer-events-none mx-auto h-40 w-full object-cover object-top"
          />
        )}
        {image && (
          <Image
            src={image}
            alt={title}
            width={500}
            height={300}
            className="h-44 w-full overflow-hidden border-b object-cover object-top transition-transform duration-500 group-hover:scale-[1.035]"
          />
        )}
      </Link>

      <AnimatePresence>
        {launching && (
          <motion.div
            className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-background/95 px-6 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="status"
            aria-live="polite"
          >
            <motion.div
              className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.10),transparent_58%)]"
              initial={{ scale: 0.65, opacity: 0 }}
              animate={{ scale: 1.25, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-2xl"
              initial={{ y: 28, scale: 0.88, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {image && (
                <div className="relative aspect-video overflow-hidden">
                  <Image src={image} alt="" fill priority className="object-cover object-top" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/15 to-transparent" />
                </div>
              )}
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                      Launching project
                    </p>
                    <p className="mt-1 text-lg font-semibold">{title}</p>
                  </div>
                  <motion.div
                    animate={{ x: [0, 4, 0], y: [0, -4, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                  >
                    <ArrowUpRight className="size-5" />
                  </motion.div>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full origin-left rounded-full bg-foreground"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.68, ease: "easeInOut" }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

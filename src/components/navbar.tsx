"use client";

import { Dock, DockIcon } from "@/components/magicui/dock";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DATA } from "@/data/resume";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, useEffect } from "react";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    router.prefetch("/after-hours");
  }, [router]);

  useEffect(() => {
    if (pathname !== "/after-hours") document.documentElement.classList.remove("after-hours-transition-used");
  }, [pathname]);

  const enterAfterHours = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const transitionDocument = document as ViewTransitionDocument;
    if (!transitionDocument.startViewTransition) return;

    event.preventDefault();
    const switchBounds = event.currentTarget.getBoundingClientRect();
    const root = document.documentElement;
    root.style.setProperty("--portal-x", `${switchBounds.left + switchBounds.width / 2}px`);
    root.style.setProperty("--portal-y", `${switchBounds.top + switchBounds.height / 2}px`);
    root.classList.add("after-hours-transition", "after-hours-transition-used");

    const transition = transitionDocument.startViewTransition(async () => {
      router.push("/after-hours");
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const waitForFactory = () => {
          if (document.querySelector('[aria-label="Cursor-responsive personal factory map"]') || performance.now() - startedAt > 1800) {
            resolve();
            return;
          }
          window.setTimeout(waitForFactory, 16);
        };
        waitForFactory();
      });
    });

    transition.finished.finally(() => {
      root.classList.remove("after-hours-transition");
      if (window.location.pathname !== "/after-hours") root.classList.remove("after-hours-transition-used");
    });
  };

  return (
    <>
      <Link href="/after-hours" className="work-mode-switch" aria-label="Enter After Hours" onClick={enterAfterHours}>
        <strong>work</strong><span className="work-switch-track" aria-hidden="true"><span /></span><span>after hours</span>
      </Link>
      <div id="site-navbar" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto mb-4 flex origin-bottom h-full max-h-14">
        <div className="fixed bottom-0 inset-x-0 h-16 w-full bg-background to-transparent backdrop-blur-lg [-webkit-mask-image:linear-gradient(to_top,black,transparent)] dark:bg-background"></div>
        <Dock className="z-50 pointer-events-auto relative mx-auto flex min-h-full h-full items-center px-1 bg-background [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)] transform-gpu dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#ffffff1f_inset] ">
        {DATA.navbar.map((item) => (
          <DockIcon key={item.href}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                    "size-12"
                  )}
                >
                  <item.icon className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          </DockIcon>
        ))}
        <Separator orientation="vertical" className="h-full" />
        {Object.entries(DATA.contact.social)
          .filter(([_, social]) => social.navbar)
          .map(([name, social]) => (
            <DockIcon key={name}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={social.url}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon" }),
                      "size-12"
                    )}
                  >
                    <social.icon className="size-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{name}</p>
                </TooltipContent>
              </Tooltip>
            </DockIcon>
          ))}
        <Separator orientation="vertical" className="h-full py-2" />
        <DockIcon>
          <Tooltip>
            <TooltipTrigger asChild>
              <ModeToggle />
            </TooltipTrigger>
            <TooltipContent>
              <p>Theme</p>
            </TooltipContent>
          </Tooltip>
        </DockIcon>
        </Dock>
      </div>
    </>
  );
}

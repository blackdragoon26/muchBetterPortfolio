"use client";

import { Button } from "@/components/ui/button";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import resume from "@/generated/resume.json";

const RESUME_PATH = "/resume/Sankalp-Jha-Resume.pdf";

export function ResumeActions() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  async function copyResumeLink() {
    const url = new URL(RESUME_PATH, window.location.origin).toString();
    let didCopy = false;
    try {
      if (window.navigator.clipboard) {
        await window.navigator.clipboard.writeText(url);
        didCopy = true;
      }
    } catch {
      // Fall through to the compatibility path below.
    }
    if (!didCopy) {
      const temporary = document.createElement("textarea");
      temporary.value = url;
      temporary.setAttribute("readonly", "");
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.appendChild(temporary);
      temporary.select();
      didCopy = document.execCommand("copy");
      temporary.remove();
    }
    setCopied(didCopy);
    if (!didCopy) return;
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <Link href={RESUME_PATH} target="_blank">
          <ExternalLink className="mr-2 size-4" /> View
        </Link>
      </Button>
      <Button asChild size="sm" variant="secondary">
        <a href={RESUME_PATH} download="Sankalp-Jha-Resume.pdf">
          <Download className="mr-2 size-4" /> Download
        </a>
      </Button>
      <Button size="sm" variant="outline" onClick={copyResumeLink}>
        {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      {resume.driveUrl && (
        <Button asChild size="sm" variant="outline">
          <Link href={resume.driveUrl} target="_blank">
            <ExternalLink className="mr-2 size-4" /> Google Drive
          </Link>
        </Button>
      )}
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import resume from "@/generated/resume.json";


// Always point to the static Next.js public folder path
const RESUME_PATH = "/resume/Sankalp-Jha-Resume.pdf";
const resumeMetadata = resume as {
  fileName?: string;
  updatedAt?: string;
};

export function ResumeActions() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  async function copyResumeLink() {
    // Always use the absolute URL of the static file
    const url = new URL(RESUME_PATH, window.location.origin).toString();
    
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current=window.setTimeout(()=> setCopied(false),1800);
      }
    } catch (err) {
      console.error("Failed to copy link",err);
    }
  }

  const downloadFileName=resumeMetadata.fileName || "Sankalp-Jha-Resume.pdf";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={RESUME_PATH} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 size-4" /> View
          </Link>
        </Button>

        <Button asChild size="sm" variant="secondary">
          <a href={RESUME_PATH} download={downloadFileName}>
            <Download className="mr-2 size-4" /> Download
          </a>
        </Button>

        <Button size="sm" variant="outline" onClick={copyResumeLink}>
          {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>

      {(resumeMetadata.fileName || resumeMetadata.updatedAt) && (
        <p className="text-[11px] text-muted-foreground">
          {resumeMetadata.fileName || "Sankalp-Jha-Resume.pdf"}
          {resumeMetadata.updatedAt 
            ? ` · updated ${new Date(resumeMetadata.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
             : ""}
        </p>
      )}
    </div>
  );
}

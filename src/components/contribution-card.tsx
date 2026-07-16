import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, FileCode2, GitMerge, Star } from "lucide-react";
import Link from "next/link";

interface ContributionCardProps {
  title: string;
  number: number;
  href: string;
  repository: string;
  repositoryUrl: string;
  repositoryDescription: string;
  stars: number;
  mergedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  technologies: readonly string[];
}

export function ContributionCard({
  title,
  number,
  href,
  repository,
  repositoryUrl,
  repositoryDescription,
  stars,
  mergedAt,
  additions,
  deletions,
  changedFiles,
  technologies,
}: ContributionCardProps) {
  const [owner, name] = repository.split("/");
  const monogram = `${owner?.[0] || ""}${name?.[0] || ""}`.toUpperCase();

  return (
    <article className="group relative grid gap-4 border-b py-6 first:border-t sm:grid-cols-[3.25rem_1fr_auto] sm:items-start">
      <Link
        href={repositoryUrl}
        target="_blank"
        aria-label={`Open ${repository}`}
        className="hidden size-11 items-center justify-center rounded-full border bg-muted font-mono text-xs font-semibold transition-colors group-hover:bg-foreground group-hover:text-background sm:flex"
      >
        {monogram}
      </Link>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Link href={repositoryUrl} target="_blank" className="font-medium text-foreground hover:underline">
            {repository}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="inline-flex items-center gap-1 font-mono">
            <GitMerge className="size-3" /> PR #{number}
          </span>
          <span aria-hidden="true">·</span>
          <time>
            {new Date(mergedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </time>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-base font-semibold leading-snug sm:text-lg">
            <Link href={href} target="_blank" className="inline-flex items-start gap-2 hover:underline">
              {title}
              <ArrowUpRight className="mt-0.5 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </h3>
          <p className="line-clamp-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {repositoryDescription}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {technologies.length > 0 ? technologies.map((technology) => (
            <Badge key={technology} variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-normal">
              {technology}
            </Badge>
          )) : (
            <span className="text-[11px] text-muted-foreground">No source-language change detected</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground sm:flex-col sm:items-end sm:gap-2">
        <span className="inline-flex items-center gap-1" title="Repository stars">
          <Star className="size-3" /> {stars.toLocaleString("en-US")}
        </span>
        <span className="inline-flex items-center gap-1" title="Files changed">
          <FileCode2 className="size-3" /> {changedFiles} {changedFiles === 1 ? "file" : "files"}
        </span>
        <span className="font-mono">
          <span className="text-emerald-600">+{additions}</span>{" "}
          <span className="text-red-500">-{deletions}</span>
        </span>
      </div>
    </article>
  );
}

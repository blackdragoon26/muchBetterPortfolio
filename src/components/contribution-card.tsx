import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, FileCode2, GitMerge, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface ContributionCardProps {
  title: string;
  number: number;
  href: string;
  repository: string;
  repositoryUrl: string;
  organizationLogo: string;
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
  organizationLogo,
  stars,
  mergedAt,
  additions,
  deletions,
  changedFiles,
  technologies,
}: ContributionCardProps) {
  return (
    <Card className="group flex h-full min-w-0 flex-col border border-border bg-muted/20 transition-colors hover:border-foreground/30">
      <CardHeader className="space-y-4 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <Link href={repositoryUrl} target="_blank" className="flex min-w-0 items-center gap-2.5 hover:underline">
            <Image
              src={organizationLogo}
              alt={`${repository.split("/")[0]} logo`}
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-lg border bg-white object-cover"
            />
            <span className="truncate text-xs font-medium">{repository}</span>
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title="Repository stars">
            <Star className="size-3" /> {stars.toLocaleString("en-US")}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <GitMerge className="size-3" /> PR #{number}
            <span aria-hidden="true">·</span>
            <time>{new Date(mergedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</time>
          </div>
          <CardTitle className="text-base leading-snug">
            <Link href={href} target="_blank" className="flex min-w-0 items-start gap-1.5 hover:underline">
              <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
              <ArrowUpRight className="mt-0.5 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="mt-auto px-4 pb-3 pt-2">
        <div className="flex flex-wrap gap-1.5">
          {technologies.length > 0 ? technologies.map((technology) => (
            <Badge key={technology} variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-normal">
              {technology}
            </Badge>
          )) : (
            <span className="text-[11px] text-muted-foreground">Metadata-only change</span>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 px-4 pb-4 pt-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <FileCode2 className="size-3.5" aria-hidden="true" /> {changedFiles} {changedFiles === 1 ? "file" : "files"}
        </span>
        <Link
          href={`${href}/files`}
          target="_blank"
          aria-label={`View PR #${number} diff: ${additions} lines added, ${deletions} removed`}
          className="flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 font-mono text-xs font-semibold tabular-nums hover:border-foreground/40"
        >
          <span className="text-emerald-700 dark:text-emerald-400">+{additions.toLocaleString("en-US")}</span>
          <span className="text-red-700 dark:text-red-400">−{deletions.toLocaleString("en-US")}</span>
          <span aria-hidden="true" className="text-[10px] font-normal text-muted-foreground">lines</span>
        </Link>
      </CardFooter>
    </Card>
  );
}

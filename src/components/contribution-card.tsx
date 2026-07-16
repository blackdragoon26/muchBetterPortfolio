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
    <Card className="group flex h-full min-h-64 flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
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
            <Link href={href} target="_blank" className="inline-flex items-start gap-1.5 hover:underline">
              {title}
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

      <CardFooter className="flex items-center justify-between border-t px-4 py-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileCode2 className="size-3" /> {changedFiles} {changedFiles === 1 ? "file" : "files"}
        </span>
        <span className="font-mono">
          <span className="text-emerald-600">+{additions}</span>{" "}
          <span className="text-red-500">-{deletions}</span>
        </span>
      </CardFooter>
    </Card>
  );
}

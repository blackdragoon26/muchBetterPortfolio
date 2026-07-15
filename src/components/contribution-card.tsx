import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitPullRequest, Star } from "lucide-react";
import Link from "next/link";

interface ContributionCardProps {
  title: string;
  number: number;
  href: string;
  repository: string;
  repositoryUrl: string;
  stars: number;
  mergedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  languages: readonly string[];
}

export function ContributionCard({
  title,
  number,
  href,
  repository,
  repositoryUrl,
  stars,
  mergedAt,
  additions,
  deletions,
  changedFiles,
  languages,
}: ContributionCardProps) {
  return (
    <Card className="flex h-full flex-col border transition-all duration-300 ease-out hover:shadow-lg">
      <CardHeader className="space-y-2 px-3 pb-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <Link href={repositoryUrl} target="_blank" className="truncate hover:underline">
            {repository}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Star className="size-3" /> {stars.toLocaleString("en-US")}
          </span>
        </div>
        <CardTitle className="text-sm leading-snug">
          <Link href={href} target="_blank" className="hover:underline">
            {title}
          </Link>
        </CardTitle>
        <time className="font-sans text-xs text-muted-foreground">
          PR #{number} · merged {new Date(mergedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </time>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 px-3 pb-3">
        <div className="flex flex-wrap gap-1">
          {languages.map((language) => (
            <Badge key={language} variant="secondary" className="px-1 py-0 text-[10px]">
              {language}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <GitPullRequest className="size-3" /> {changedFiles} files
          </span>
          <span>
            <span className="text-emerald-600">+{additions}</span>{" "}
            <span className="text-red-500">-{deletions}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

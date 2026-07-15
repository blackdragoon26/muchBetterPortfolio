import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const USER = process.env.GITHUB_USER || "blackdragoon26";
const PROFILE_README_PATH = process.env.PROFILE_README_PATH || "../README.md";
const MIN_REPO_STARS = Number(process.env.MIN_REPO_STARS || 300);
const MAX_PRS = Number(process.env.MAX_FEATURED_PRS || 12);
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const API = "https://api.github.com";
const OUTPUT_PATH = "src/generated/portfolio.json";
const IMAGE_DIR = "public/generated/projects";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${USER}-portfolio-sync`,
  "X-GitHub-Api-Version": "2022-11-28",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

function cleanText(value) {
  return value
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function allUrls(value) {
  return [...value.matchAll(/https?:\/\/[^\s)>,]+/g)].map((match) =>
    match[0].replace(/[.,;:]$/, ""),
  );
}

function githubRepository(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo || ["pull", "issues", "blob", "tree"].includes(repo)) {
      return null;
    }
    return `${owner}/${repo.replace(/\.git$/, "")}`;
  } catch {
    return null;
  }
}

function parseWallOfFame(readme) {
  const section = readme.match(/## Wall of Fame\s*\n([^]*?)(?=\n##\s|$)/i)?.[1];
  if (!section) throw new Error("README is missing the 'Wall of Fame' section");

  const entries = [...section.matchAll(/^\d+\.\s+([^]*?)(?=^\d+\.\s+|(?![\s\S]))/gm)];
  return entries.map((entry, index) => {
    const raw = entry[1].trim();
    const heading = raw.match(/^\[(?:<b>)?([^\]<]+)(?:<\/b>)?\]\(([^)]+)\)/i);
    const title = cleanText(heading?.[1] || `Project ${index + 1}`);
    const primaryUrl = heading?.[2] || allUrls(raw)[0] || "";
    const urls = [primaryUrl, ...allUrls(raw)].filter(Boolean);
    const repository = urls.map(githubRepository).find(Boolean) || null;
    const liveUrl = urls.find((url) => {
      try {
        const hostname = new URL(url).hostname;
        return ![
          "github.com",
          "www.linkedin.com",
          "linkedin.com",
          "arxiv.org",
          "summerofcode.withgoogle.com",
        ].includes(hostname);
      } catch {
        return false;
      }
    });

    const descriptionStart = heading ? raw.slice(heading[0].length) : raw;
    return {
      id: slugify(title),
      title,
      description: cleanText(descriptionStart.replace(/^\s*:\s*/, "")),
      href: liveUrl || primaryUrl,
      liveUrl: liveUrl || null,
      repository,
      repositoryUrl: repository ? `https://github.com/${repository}` : null,
      technologies: [],
      stars: null,
      image: "",
    };
  });
}

async function github(endpoint) {
  const response = await fetch(`${API}${endpoint}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${endpoint}`);
  }
  return response.json();
}

async function repositoryInfo(repository, cache) {
  if (!repository) return null;
  if (!cache.has(repository)) {
    cache.set(repository, github(`/repos/${repository}`));
  }
  return cache.get(repository);
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

async function writeProjectImage(project) {
  const slug = project.id || slugify(project.title);
  if (project.repository) {
    const target = path.join(IMAGE_DIR, `${slug}.png`);
    const preview = `https://opengraph.githubassets.com/portfolio-sync/${project.repository}`;
    const response = await fetch(preview, { headers: { "User-Agent": headers["User-Agent"] } });
    if (response.ok) {
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
      return `/generated/projects/${slug}.png`;
    }
  }

  const target = path.join(IMAGE_DIR, `${slug}.svg`);
  const title = escapeXml(project.title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#111827"/><circle cx="1040" cy="110" r="190" fill="#1f2937"/><circle cx="110" cy="600" r="260" fill="#0f766e" opacity=".45"/><text x="72" y="290" fill="#f9fafb" font-family="ui-sans-serif,system-ui,sans-serif" font-size="62" font-weight="700">${title}</text><text x="74" y="360" fill="#9ca3af" font-family="ui-monospace,monospace" font-size="24">Featured project · ${USER}</text></svg>`;
  await writeFile(target, svg);
  return `/generated/projects/${slug}.svg`;
}

async function enrichProjects(projects, repoCache) {
  for (const project of projects) {
    if (project.repository) {
      try {
        const repo = await repositoryInfo(project.repository, repoCache);
        project.stars = repo.stargazers_count;
        project.technologies = [repo.language, ...(repo.topics || [])]
          .filter(Boolean)
          .slice(0, 8);
        if (!project.description && repo.description) project.description = repo.description;
        if (!project.liveUrl && repo.homepage) {
          project.liveUrl = repo.homepage;
          project.href = repo.homepage;
        }
      } catch (error) {
        console.warn(`Could not enrich ${project.repository}: ${error.message}`);
      }
    }
    project.image = await writeProjectImage(project);
  }
  return projects;
}

async function discoverPullRequests(repoCache) {
  const items = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await github(
      `/search/issues?q=${encodeURIComponent(`author:${USER} type:pr is:merged`)}&per_page=100&page=${page}&sort=updated&order=desc`,
    );
    items.push(...result.items);
    if (result.items.length < 100) break;
  }
  const candidates = [];

  for (const item of items) {
    const repository = item.repository_url.replace(`${API}/repos/`, "");
    const [owner] = repository.split("/");
    if (owner.toLowerCase() === USER.toLowerCase()) continue;

    let repo;
    try {
      repo = await repositoryInfo(repository, repoCache);
    } catch (error) {
      console.warn(`Could not inspect ${repository}: ${error.message}`);
      continue;
    }
    if (repo.stargazers_count < MIN_REPO_STARS) continue;

    const details = await github(new URL(item.pull_request.url).pathname.replace("/repos", "/repos"));
    if (!details.merged_at) continue;
    candidates.push({
      id: `${repository}#${item.number}`,
      title: item.title,
      number: item.number,
      href: item.html_url,
      repository,
      repositoryUrl: repo.html_url,
      repositoryDescription: repo.description || "",
      stars: repo.stargazers_count,
      mergedAt: details.merged_at,
      additions: details.additions,
      deletions: details.deletions,
      changedFiles: details.changed_files,
      languages: [repo.language, ...(repo.topics || [])].filter(Boolean).slice(0, 6),
    });
  }

  return candidates
    .sort((a, b) => b.stars - a.stars || Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .slice(0, MAX_PRS);
}

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await rm(IMAGE_DIR, { recursive: true, force: true });
  await mkdir(IMAGE_DIR, { recursive: true });
  const readme = await readFile(PROFILE_README_PATH, "utf8");
  const repoCache = new Map();
  const projects = await enrichProjects(parseWallOfFame(readme), repoCache);
  const pullRequests = await discoverPullRequests(repoCache);
  const generatedAt = new Date().toISOString();

  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify({ generatedAt, filter: { minimumRepositoryStars: MIN_REPO_STARS, maximumPullRequests: MAX_PRS }, projects, pullRequests }, null, 2)}\n`,
  );
  console.log(`Synced ${projects.length} projects and ${pullRequests.length} featured PRs.`);
}

await main();

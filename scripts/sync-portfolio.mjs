import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USER = process.env.GITHUB_USER || "blackdragoon26";
const PROFILE_README_PATH = process.env.PROFILE_README_PATH || "../profile/README.md";
const MIN_REPO_STARS = Number(process.env.MIN_REPO_STARS || 300);
const MAX_PRS = Number(process.env.MAX_FEATURED_PRS || 999);
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const API = "https://api.github.com";
const OUTPUT_PATH = "src/generated/portfolio.json";
const IMAGE_DIR = "public/generated/projects";
const ORGANIZATION_IMAGE_DIR = "public/generated/organizations";

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
    .replace(/(?:Repo|Live|Report):?\s*https?:\/\/\S+/gi, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
}

function parseMetadata(raw, title) {
  const body = raw.match(/<!--\s*portfolio-meta\s*\n([^]*?)-->/i)?.[1];
  if (!body) throw new Error(`${title}: missing <!-- portfolio-meta ... --> block`);
  const metadata = {};
  for (const line of body.split("\n")) {
    const match = line.trim().match(/^([a-z][a-z0-9._-]*):\s*(.*)$/i);
    if (match) metadata[match[1].toLowerCase()] = match[2].trim();
  }
  for (const required of ["repo", "live", "stack", "screenshot", "resume"]) {
    if (!metadata[required]) throw new Error(`${title}: portfolio metadata is missing '${required}'`);
  }
  if (metadata.resume.toLowerCase() === "yes") {
    for (const required of ["resume.objective", "resume.approach", "resume.impact"]) {
      if (!metadata[required]) throw new Error(`${title}: résumé metadata is missing '${required}'`);
    }
  }
  return metadata;
}

function normalizeUrl(value) {
  if (!value || ["none", "private"].includes(value.toLowerCase())) return null;
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`Only HTTPS URLs are allowed: ${value}`);
  return url.toString();
}

function githubRepository(value) {
  const url = normalizeUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") throw new Error(`Repository must be a github.com URL: ${value}`);
  const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo) throw new Error(`Invalid GitHub repository URL: ${value}`);
  return `${owner}/${repo.replace(/\.git$/, "")}`;
}

function parseWallOfFame(readme) {
  const section = readme.match(/## Wall of Fame\s*\n([^]*?)(?=\n##\s|$)/i)?.[1];
  if (!section) throw new Error("README is missing the 'Wall of Fame' section");
  const entries = [...section.matchAll(/^\d+\.\s+([^]*?)(?=^\d+\.\s+|(?![\s\S]))/gm)];

  return entries.map((entry, index) => {
    const raw = entry[1].trim();
    const heading = raw.match(/^\[(?:<b>)?([^\]<]+)(?:<\/b>)?\]\(([^)]+)\)/i);
    const title = cleanText(heading?.[1] || `Project ${index + 1}`);
    const metadata = parseMetadata(raw, title);
    const repository = githubRepository(metadata.repo);
    const liveUrl = normalizeUrl(metadata.live);
    const primaryUrl = liveUrl || repository ? liveUrl || `https://github.com/${repository}` : normalizeUrl(heading?.[2]);
    const descriptionStart = heading ? raw.slice(heading[0].length) : raw;

    return {
      id: slugify(title),
      title,
      description: cleanText(descriptionStart.replace(/^\s*:\s*/, "")),
      href: primaryUrl,
      liveUrl,
      repository,
      repositoryUrl: repository ? `https://github.com/${repository}` : null,
      technologies: metadata.stack.split(",").map((item) => item.trim()).filter(Boolean),
      screenshot: metadata.screenshot,
      screenshotWaitSeconds: Number(metadata["screenshot.wait_seconds"] || 7),
      stars: null,
      image: "",
      resume: {
        include: metadata.resume.toLowerCase() === "yes",
        objective: metadata["resume.objective"] || "",
        approach: (metadata["resume.approach"] || "").split("||").map((item) => item.trim()).filter(Boolean),
        impact: metadata["resume.impact"] || "",
      },
    };
  });
}

async function github(endpoint) {
  const response = await fetch(`${API}${endpoint}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${endpoint}`);
  return response.json();
}

async function repositoryInfo(repository, cache) {
  if (!repository) return null;
  if (!cache.has(repository)) cache.set(repository, github(`/repos/${repository}`));
  return cache.get(repository);
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  })[character]);
}

async function fileExists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function writeFallbackImage(project) {
  const target = path.join(IMAGE_DIR, `${project.id}.svg`);
  const title = escapeXml(project.title);
  const stack = escapeXml(project.technologies.slice(0, 4).join(" · "));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#09090b"/><stop offset="1" stop-color="#27272a"/></linearGradient></defs><rect width="1200" height="720" fill="url(#g)"/><circle cx="1050" cy="80" r="260" fill="#3f3f46" opacity=".45"/><circle cx="80" cy="730" r="330" fill="#0f766e" opacity=".28"/><text x="72" y="330" fill="#fafafa" font-family="ui-sans-serif,system-ui,sans-serif" font-size="68" font-weight="700">${title}</text><text x="75" y="398" fill="#a1a1aa" font-family="ui-monospace,monospace" font-size="25">${stack}</text></svg>`;
  await writeFile(target, svg);
  return `/generated/projects/${project.id}.svg`;
}

async function resolveProjectImage(project) {
  const jpgTarget = path.join(IMAGE_DIR, `${project.id}.jpg`);
  const pngTarget = path.join(IMAGE_DIR, `${project.id}.png`);
  if (project.screenshot.toLowerCase() === "auto" && project.liveUrl) {
    if (await fileExists(jpgTarget)) return `/generated/projects/${project.id}.jpg`;
    return writeFallbackImage(project);
  }
  if (project.screenshot.toLowerCase() === "auto" && project.repository) {
    const response = await fetch(`https://opengraph.githubassets.com/portfolio-sync/${project.repository}`, {
      headers: { "User-Agent": headers["User-Agent"] },
    });
    if (response.ok) {
      await writeFile(pngTarget, Buffer.from(await response.arrayBuffer()));
      return `/generated/projects/${project.id}.png`;
    }
  }
  if (/^https:\/\//i.test(project.screenshot)) {
    const response = await fetch(project.screenshot, { headers: { "User-Agent": headers["User-Agent"] } });
    if (!response.ok) throw new Error(`${project.title}: screenshot returned HTTP ${response.status}`);
    await writeFile(pngTarget, Buffer.from(await response.arrayBuffer()));
    return `/generated/projects/${project.id}.png`;
  }
  return writeFallbackImage(project);
}

async function enrichProjects(projects, repoCache) {
  for (const project of projects) {
    if (project.repository) {
      try {
        const repo = await repositoryInfo(project.repository, repoCache);
        project.stars = repo.stargazers_count;
        if (!project.description && repo.description) project.description = repo.description;
      } catch (error) {
        console.warn(`Could not enrich ${project.repository}: ${error.message}`);
      }
    }
    project.image = await resolveProjectImage(project);
  }
  return projects;
}

const extensionTechnology = new Map([
  [".c", "C"], [".h", "C/C++"], [".cc", "C++"], [".cpp", "C++"], [".cxx", "C++"],
  [".hpp", "C++"], [".rs", "Rust"], [".go", "Go"], [".py", "Python"], [".p4", "P4"],
  [".ts", "TypeScript"], [".tsx", "React/TypeScript"], [".js", "JavaScript"], [".jsx", "React"],
  [".sh", "Shell"], [".yml", "GitHub Actions"], [".yaml", "GitHub Actions"], [".md", "Markdown"],
  [".toml", "TOML"], [".json", "JSON"], [".cmake", "CMake"],
]);

function technologiesFromFiles(files) {
  const technologies = [];
  for (const { filename } of files) {
    const basename = path.basename(filename).toLowerCase();
    let technology = basename === "dockerfile" || basename.startsWith("dockerfile.") ? "Docker" : null;
    if (!technology && basename === "cmakelists.txt") technology = "CMake";
    if (!technology) technology = extensionTechnology.get(path.extname(basename));
    if (technology && !technologies.includes(technology)) technologies.push(technology);
  }
  return technologies.slice(0, 6);
}

async function pullRequestFiles(repository, number) {
  const files = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await github(`/repos/${repository}/pulls/${number}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

async function organizationLogo(owner, avatarUrl, cache) {
  const slug = slugify(owner);
  if (!cache.has(owner)) {
    cache.set(owner, (async () => {
      const target = path.join(ORGANIZATION_IMAGE_DIR, `${slug}.jpg`);
      const response = await fetch(avatarUrl, { headers: { "User-Agent": headers["User-Agent"] } });
      if (!response.ok) throw new Error(`Could not download organization logo for ${owner}`);
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
      return `/generated/organizations/${slug}.jpg`;
    })());
  }
  return cache.get(owner);
}

async function discoverPullRequests(repoCache, logoCache) {
  const items = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await github(`/search/issues?q=${encodeURIComponent(`author:${USER} type:pr is:merged`)}&per_page=100&page=${page}&sort=updated&order=desc`);
    items.push(...result.items);
    if (result.items.length < 100) break;
  }
  const candidates = [];

  for (const item of items) {
    const repository = item.repository_url.replace(`${API}/repos/`, "");
    if (repository.split("/")[0].toLowerCase() === USER.toLowerCase()) continue;
    let repo;
    try { repo = await repositoryInfo(repository, repoCache); } catch { continue; }
    if (repo.stargazers_count < MIN_REPO_STARS) continue;
    const details = await github(`/repos/${repository}/pulls/${item.number}`);
    if (!details.merged_at) continue;
    const files = await pullRequestFiles(repository, item.number);
    candidates.push({
      id: `${repository}#${item.number}`,
      title: details.title,
      number: item.number,
      href: item.html_url,
      repository,
      repositoryUrl: repo.html_url,
      repositoryDescription: repo.description || "",
      organizationLogo: await organizationLogo(repo.owner.login, repo.owner.avatar_url, logoCache),
      stars: repo.stargazers_count,
      mergedAt: details.merged_at,
      additions: details.additions,
      deletions: details.deletions,
      changedFiles: details.changed_files,
      technologies: technologiesFromFiles(files),
    });
  }

  // return candidates
  //   .sort((a, b) => b.stars - a.stars || Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
  //   .slice(0, MAX_PRS);
    return candidates
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt)) // Sorts newest first
    .slice(0, MAX_PRS); // <-- See note below about this line
}

async function main() {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await mkdir(IMAGE_DIR, { recursive: true });
  await mkdir(ORGANIZATION_IMAGE_DIR, { recursive: true });
  const readme = await readFile(PROFILE_README_PATH, "utf8");
  const repoCache = new Map();
  const logoCache = new Map();
  const projects = await enrichProjects(parseWallOfFame(readme), repoCache);
  const pullRequests = await discoverPullRequests(repoCache, logoCache);
  const generatedAt = new Date().toISOString();
  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    generatedAt,
    filter: { minimumRepositoryStars: MIN_REPO_STARS, maximumPullRequests: MAX_PRS },
    projects,
    pullRequests,
  }, null, 2)}\n`);
  console.log(`Synced ${projects.length} projects and ${pullRequests.length} featured PRs.`);
}

await main();

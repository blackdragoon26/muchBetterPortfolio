# Sankalp Jha's Portfolio

Source for [sankalpjha.dev](https://sankalpjha.dev), built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, and Framer Motion.

## Run locally

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000).

## System Architecture
<img width="1200" height="2065" alt="image" src="https://github.com/user-attachments/assets/89adc911-c9a4-4675-b7ee-89258adc35d8" />


## Automated content

The daily GitHub Actions workflow:

- reads projects from the `Wall of Fame` in [`blackdragoon26/blackdragoon26`](https://github.com/blackdragoon26/blackdragoon26);
- refreshes project cards, stacks, links, and screenshots;
- selects merged upstream PRs from repositories with at least 300 stars;
- rebuilds the LaTeX resume and replaces both the website PDF and Google Drive copy;
- commits generated artifacts back to this repository.

No application backend is required; the deployed portfolio is static.

## Adding a project

Add a numbered project to the profile README with this hidden block:

```md
<!-- portfolio-meta
repo: https://github.com/blackdragoon26/project
live: https://project.example/
stack: Go, React, PostgreSQL
screenshot: auto
resume: yes
resume.objective: What the project solves.
resume.approach: First implementation point || Second implementation point
resume.impact: A concrete outcome.
-->
```

Use `live: none` when there is no deployment. `stack` is the authoritative technology list. Optional `screenshot.wait_seconds` delays capture for cold-starting services.

## Configuration

- `PORTFOLIO_MIN_REPO_STARS`: minimum stars for featured merged PRs; defaults to `300`.
- `DRIVE_OAUTH_TOKEN`: Google OAuth authorized-user JSON.
- `DRIVE_FOLDER_ID`: destination Google Drive folder.

Workflow: [`.github/workflows/sync-portfolio.yml`](.github/workflows/sync-portfolio.yml)

## License

[MIT](LICENSE.md)

# Field Tracer

Static browser editor for human annotation of annual-crop field boundaries.

The intended production workflow is:

```text
HOT Tasking Manager → locked task → Field Tracer → OSM changeset → TM validation
```

HOT TM owns project/task coordination and QA status. OpenStreetMap owns the public
geometry and edit history. The editor is designed to run on GitHub Pages without an
application backend.

## Local development

```bash
bun install
bun run dev
```

Build the deployable static site with:

```bash
bun run build
```

Run the full local gate with:

```bash
bun run check
```

This runs Biome checks, Bun tests, TypeScript validation, and the production build.

Run the local Playwright browser suite with:

```bash
bunx playwright install chromium
bun run test:e2e
```

The suite starts Vite automatically on port `4173` and tests only local UI behavior;
it does not authenticate with OSM, Planet, or upload external changes.

## GitHub Pages deployment

The repository includes a GitHub Actions workflow at
`.github/workflows/deploy-pages.yml`. It publishes the site at:

<https://fieldsoftheworld.github.io/field-tracer/>

Enable **Settings → Pages → Source: GitHub Actions** in the repository. Add the
public OSM OAuth client ID as a repository variable named `OSM_CLIENT_ID`. The
workflow embeds it into the static bundle and uses the production OSM API by
default. You can set `OSM_API_BASE=development` while testing against the OSM
development server.

Register this exact production redirect URI in the OSM OAuth application:

```text
https://fieldsoftheworld.github.io/field-tracer/
```

Keep `http://127.0.0.1:5173/` registered as a second redirect URI for local
development. The OAuth client ID is public in a browser app; do not add a client
secret to GitHub Pages.

## Standalone OSM testing

HOT TM is not required for an end-to-end editor test. Configure an OAuth 2.0 PKCE
client for the OSM development server in `.env.local`:

```text
VITE_OSM_CLIENT_ID=your-development-server-client-id
VITE_OSM_API_BASE=development
```

See [docs/standalone-test.md](docs/standalone-test.md). Use a development-server
account and data until the upload path has been verified.

## Project guidance

See [docs/mapping-guidelines.md](docs/mapping-guidelines.md) for the current field
definition, geometry thresholds, tagging, provenance, and review contract.

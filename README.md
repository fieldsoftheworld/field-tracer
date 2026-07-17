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

<https://fieldsofthe.world/field-tracer/>

The `github.io` URL redirects to this custom Pages domain.

Enable **Settings → Pages → Source: GitHub Actions** in the repository. Add the
public OSM OAuth client ID as a repository variable named `OSM_CLIENT_ID` and a
stable campaign identifier as `FTW_CAMPAIGN_ID`. The workflow embeds both public
values into the static bundle and uses the production OSM API by default. You can
set `OSM_API_BASE=development` while testing against the OSM development server.

Register this exact production redirect URI in the OSM OAuth application:

```text
https://fieldsofthe.world/field-tracer/
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
account and data for the first upload verification.

## Campaign provenance and extraction

Each upload creates one OSM changeset tagged with campaign metadata:

```text
ftw:campaign=<VITE_FTW_CAMPAIGN_ID>
ftw:project=<Tasking Manager project ID>
ftw:task=<Tasking Manager task ID>
```

The tags belong on the **changeset**, not individual OSM field ways. This keeps OSM
feature tagging clean while retaining campaign, task, mapper UID, and changeset
provenance. Set a stable public campaign identifier when building the site:

```text
VITE_FTW_CAMPAIGN_ID=ftw-annual-crops-2026-pilot
```

After a mapper uploads, record the shown changeset ID. Export the original submitted
field geometry with the separate public-data script:

```bash
bun scripts/extract-campaign.ts \
  --campaign ftw-annual-crops-2026-pilot \
  --changeset 123456789 \
  --output ftw-annual-crops-2026-pilot.geojson
```

Pass `--changeset` more than once for multiple uploads. The script verifies the
`ftw:campaign` changeset tag, then downloads the original OSM change and writes
GeoJSON with the changeset and way ID retained per field. It intentionally exports
the submitted version; later OSM edits or deletion do not erase this audit record.

For campaign-scale discovery, maintain the changeset IDs from Tasking Manager or use
an OSM changeset-review service to find changesets by area/time/user, then feed the
verified IDs to this script. The core OSM API does not provide a general custom-tag
search endpoint for arbitrary campaigns.

## Project guidance

See [docs/mapping-guidelines.md](docs/mapping-guidelines.md) for the current field
definition, geometry thresholds, tagging, provenance, and review contract.

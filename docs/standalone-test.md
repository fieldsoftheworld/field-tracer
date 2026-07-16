# Standalone OSM test

HOT Tasking Manager is not required to test the editor’s OSM contribution path.
Use the standalone demo task while the HOT organization/project approval is pending.

## 1. Create a development OSM account

Use the separate OSM development server:

<https://master.apis.dev.openstreetmap.org>

Development-server accounts and data are separate from production. Register an
OAuth application in that account and use the GitHub Pages or local development
redirect URI. The application is a public browser client, so use OAuth 2.0 PKCE and
do not configure a client secret.

## 2. Configure the local app

Create a local `.env.local` file:

```text
VITE_OSM_CLIENT_ID=your-development-server-client-id
VITE_OSM_API_BASE=development
VITE_BASE_PATH=/
```

The local redirect URI is `http://127.0.0.1:5173/`. For the deployed site,
register `https://fieldsoftheworld.github.io/field-tracer/` as another redirect
URI and set the GitHub repository variable `OSM_CLIENT_ID`. The Pages workflow
uses the production OSM API unless `OSM_API_BASE=development` is configured.

The app defaults to the development server unless `VITE_OSM_API_BASE=production` is
set explicitly.

## 3. Test the standalone flow

1. Start the app with `bun run dev`.
2. Draw a field inside the demo task.
3. Confirm area, edge-length, and overlap validation.
4. Click **Continue with OpenStreetMap**.
5. Authorize the development-server app.
6. Upload a test changeset once the OSM upload adapter is enabled.
7. Confirm the changeset and its tags on the development server.

The eventual HOT TM path uses the same editor, but supplies a real locked task
boundary and project/task identifiers instead of the demo task.

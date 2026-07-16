const OSM_DEV = "https://master.apis.dev.openstreetmap.org";
const OSM_PROD = "https://www.openstreetmap.org";

export type OsmSession = { accessToken: string; apiBase: string };

function apiBase(): string {
  return import.meta.env.VITE_OSM_API_BASE === "production" ? OSM_PROD : OSM_DEV;
}

function clientId(): string | undefined {
  return import.meta.env.VITE_OSM_CLIENT_ID;
}

function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function beginOsmLogin(): Promise<void> {
  const configuredClientId = clientId();
  if (!configuredClientId) throw new Error("Set VITE_OSM_CLIENT_ID before enabling OSM login.");
  const verifier = randomString(32);
  sessionStorage.setItem("field-tracer-osm-verifier", verifier);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: configuredClientId,
    redirect_uri: redirectUri(),
    scope: "openid read_prefs write_api",
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
  });
  window.location.assign(`${apiBase()}/oauth2/authorize?${params.toString()}`);
}

export async function completeOsmLogin(): Promise<OsmSession | undefined> {
  const code = new URLSearchParams(window.location.search).get("code");
  const verifier = sessionStorage.getItem("field-tracer-osm-verifier");
  const configuredClientId = clientId();
  if (!code || !verifier || !configuredClientId) return undefined;

  const response = await fetch(`${apiBase()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: configuredClientId,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error(`OSM token exchange failed (${response.status}).`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("OSM did not return an access token.");
  sessionStorage.removeItem("field-tracer-osm-verifier");
  window.history.replaceState({}, "", window.location.pathname);
  return { accessToken: payload.access_token, apiBase: apiBase() };
}

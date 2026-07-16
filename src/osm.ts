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

export async function beginOsmLogin(): Promise<string> {
  const configuredClientId = clientId();
  if (!configuredClientId) throw new Error("Set VITE_OSM_CLIENT_ID before enabling OSM login.");
  const verifier = randomString(32);
  const state = randomString(16);
  sessionStorage.setItem("field-tracer-osm-verifier", verifier);
  sessionStorage.setItem("field-tracer-osm-state", state);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: configuredClientId,
    redirect_uri: redirectUri(),
    scope: "openid read_prefs write_api",
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
  });
  return `${apiBase()}/oauth2/authorize?${params.toString()}`;
}

export async function completeOsmLogin(search = window.location.search): Promise<OsmSession | undefined> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const verifier = sessionStorage.getItem("field-tracer-osm-verifier");
  const expectedState = sessionStorage.getItem("field-tracer-osm-state");
  const configuredClientId = clientId();
  if (!code || !verifier || !configuredClientId || !returnedState || returnedState !== expectedState) {
    if (params.has("error")) throw new Error(params.get("error_description") ?? "OSM login was not completed.");
    return undefined;
  }

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
  sessionStorage.removeItem("field-tracer-osm-state");
  window.history.replaceState({}, "", window.location.pathname);
  return { accessToken: payload.access_token, apiBase: apiBase() };
}

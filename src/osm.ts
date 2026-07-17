const OSM_DEV = "https://master.apis.dev.openstreetmap.org";
const OSM_PROD = "https://www.openstreetmap.org";

export type OsmSession = { accessToken: string; apiBase: string };
export type CampaignUploadContext = {
  campaignId: string;
  projectId?: string;
  taskId?: string;
  source?: string;
};
export type OsmUploadResult = { changesetId: string; changesetUrl: string };

export function isOauthPopupCallback(windowName: string, search: string): boolean {
  const callback = new URLSearchParams(search);
  return windowName === "field-tracer-osm-login" && (callback.has("code") || callback.has("error"));
}

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

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function xmlTag(key: string, value: string): string {
  return `<tag k="${escapeXml(key)}" v="${escapeXml(value)}"/>`;
}

export function campaignId(): string {
  return import.meta.env.VITE_FTW_CAMPAIGN_ID || "field-tracer-pilot";
}

export function buildChangesetXml(context: CampaignUploadContext): string {
  const tags = [
    [
      "comment",
      `FTW annual-crop field boundaries · ${context.campaignId}${context.taskId ? ` · task ${context.taskId}` : ""}`,
    ],
    ["hashtags", "#fieldsoftheworld"],
    ["source", context.source || "Sentinel-2 EOX Cloudless"],
    ["host", `${window.location.origin}${window.location.pathname}`],
    ["ftw:campaign", context.campaignId],
    ...(context.projectId ? [["ftw:project", context.projectId]] : []),
    ...(context.taskId ? [["ftw:task", context.taskId]] : []),
  ];
  return `<osm version="0.6" generator="Field Tracer"><changeset>${tags.map(([key, value]) => xmlTag(key, value)).join("")}</changeset></osm>`;
}

export function buildFieldOsmChange(
  fields: Array<{ geometry: { coordinates: number[][][] } }>,
  changesetId: string,
): string {
  let nextId = -1;
  const nodes: string[] = [];
  const ways: string[] = [];
  for (const field of fields) {
    const ring = field.geometry.coordinates[0];
    const nodeIds = ring.slice(0, -1).map((coordinate) => {
      const nodeId = nextId--;
      nodes.push(`<node id="${nodeId}" changeset="${changesetId}" lat="${coordinate[1]}" lon="${coordinate[0]}"/>`);
      return nodeId;
    });
    ways.push(
      `<way id="${nextId--}" changeset="${changesetId}">${[...nodeIds, nodeIds[0]].map((nodeId) => `<nd ref="${nodeId}"/>`).join("")}${xmlTag("landuse", "farmland")}</way>`,
    );
  }
  return `<osmChange version="0.6" generator="Field Tracer"><create>${nodes.join("")}${ways.join("")}</create></osmChange>`;
}

async function osmRequest(session: OsmSession, path: string, options: RequestInit): Promise<Response> {
  const response = await fetch(`${session.apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "text/xml; charset=utf-8",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok)
    throw new Error(`OSM API request failed (${response.status}): ${(await response.text()).slice(0, 180)}`);
  return response;
}

export async function uploadFieldsToOsm(
  session: OsmSession,
  fields: Array<{ geometry: { coordinates: number[][][] } }>,
  context: CampaignUploadContext,
): Promise<OsmUploadResult> {
  const created = await osmRequest(session, "/api/0.6/changeset/create", {
    method: "PUT",
    body: buildChangesetXml(context),
  });
  const changesetId = (await created.text()).trim();
  if (!/^\d+$/.test(changesetId)) throw new Error("OSM did not return a changeset ID.");
  try {
    await osmRequest(session, `/api/0.6/changeset/${changesetId}/upload`, {
      method: "POST",
      body: buildFieldOsmChange(fields, changesetId),
    });
  } finally {
    await osmRequest(session, `/api/0.6/changeset/${changesetId}/close`, { method: "PUT" });
  }
  return { changesetId, changesetUrl: `${session.apiBase}/changeset/${changesetId}` };
}

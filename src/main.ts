import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, Polygon, Position } from "geojson";
import maplibregl from "maplibre-gl";
import { createFieldFeature, polygonAreaM2, validateField } from "./geometry";
import { createMap, setDraftData, setTaskData, toggleLayer } from "./map";
import { beginOsmLogin, completeOsmLogin, type OsmSession } from "./osm";
import type { FieldCollection, TaskContext } from "./types";
import "./styles.css";

const demoBoundary: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-88.174, 40.118],
        [-88.148, 40.118],
        [-88.148, 40.096],
        [-88.174, 40.096],
        [-88.174, 40.118],
      ],
    ],
  },
};
const task: TaskContext = {
  projectId: "123",
  taskId: "DEMO-01",
  title: "Central Illinois pilot",
  boundary: demoBoundary,
};
const fields: FieldCollection = { type: "FeatureCollection", features: [] };
let drawing = false;
let draft: Position[] = [];
let osmConnected = false;
let planetKeyPresent = false;
let osmSession: OsmSession | undefined;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const map = createMap("map", task, {
  onMapClick: (event) => {
    if (!drawing) return;
    draft.push([event.lngLat.lng, event.lngLat.lat]);
    setDraftData(map, draft as number[][]);
    updateDrawState();
  },
  onMapDoubleClick: () => finishDraft(),
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

function toast(message: string): void {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("is-visible");
  window.setTimeout(() => element.classList.remove("is-visible"), 3200);
}

function updateDrawState(): void {
  $("draw-button").textContent = drawing ? "Drawing field…" : "Draw field polygon";
  $("finish-button").toggleAttribute("disabled", !drawing || draft.length < 3);
  $("draw-hint").textContent = drawing
    ? `${draft.length} points · double-click to close`
    : "Click around a field. Double-click to close it.";
}

function finishDraft(): void {
  if (!drawing || draft.length < 3) return;
  const feature = createFieldFeature(draft, `field-${fields.features.length + 1}`);
  const errors = validateField(feature, task, fields);
  if (errors.length > 0) {
    toast(`Needs another pass: ${errors.join(" · ")}`);
    return;
  }
  feature.properties.valid = true;
  fields.features.push(feature);
  drawing = false;
  draft = [];
  setDraftData(map, []);
  setTaskData(map, task, fields.features);
  updateSummary();
  updateDrawState();
  toast("Field added to this task");
}

function updateSummary(): void {
  $("field-count").textContent = `${fields.features.length}`;
  $("area-count").textContent =
    `${Math.round(fields.features.reduce((total, field) => total + polygonAreaM2(field.geometry.coordinates[0]), 0)).toLocaleString()}`;
  $("upload-button").toggleAttribute("disabled", fields.features.length === 0 || !osmConnected);
}

async function connectOsm(): Promise<void> {
  try {
    await beginOsmLogin();
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not start OSM login");
  }
}

$("draw-button").addEventListener("click", () => {
  drawing = !drawing;
  if (!drawing) {
    draft = [];
    setDraftData(map, []);
  }
  updateDrawState();
});
$("finish-button").addEventListener("click", finishDraft);
$("osm-login").addEventListener("click", () => void connectOsm());
$("osm-layer").addEventListener("change", (event) =>
  toggleLayer(map, "task-boundary", (event.target as HTMLInputElement).checked),
);
$("task-layer").addEventListener("change", (event) => {
  const visible = (event.target as HTMLInputElement).checked;
  toggleLayer(map, "task-boundary", visible);
  toggleLayer(map, "task-fill", visible);
});
$("planet-login").addEventListener("click", () =>
  toast("Planet OAuth will be enabled after the tile-auth feasibility check"),
);
$("planet-key").addEventListener("click", () => {
  const key = window.prompt("Paste a Planet API key for this browser session. It will not be saved.");
  planetKeyPresent = Boolean(key?.trim());
  if (planetKeyPresent) toast("Planet key held for this session only — tile adapter pending");
});
$("upload-button").addEventListener("click", () =>
  toast("Upload flow placeholder — OSM OAuth and osmChange upload next"),
);
$("return-button").addEventListener("click", () => window.history.back());

updateDrawState();
updateSummary();
void planetKeyPresent;
void completeOsmLogin()
  .then((session) => {
    if (!session) return;
    osmSession = session;
    osmConnected = true;
    $("session-copy").textContent = "OSM session ready · upload adapter pending";
    $("osm-login").textContent = "Connected to OpenStreetMap ✓";
    $("osm-login").classList.add("is-connected");
    updateSummary();
  })
  .catch((error: unknown) => toast(error instanceof Error ? error.message : "Could not complete OSM login"));
void osmSession;

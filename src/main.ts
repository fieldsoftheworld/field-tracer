import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, Polygon, Position } from "geojson";
import maplibregl from "maplibre-gl";
import { circleCoordinates, createFieldFeature, polygonAreaM2, validateField } from "./geometry";
import { createMap, setDraftData, setMosaicYear, setTaskData, toggleLayer } from "./map";
import { beginOsmLogin, completeOsmLogin, type OsmSession } from "./osm";
import { trainingCategories, trainingExamples, trainingVideos } from "./training";
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
let drawingMode: "polygon" | "circle" = "polygon";
let circleCenter: Position | undefined;
let circleDragging = false;
let osmConnected = false;
let planetKeyPresent = false;
let osmSession: OsmSession | undefined;
let selectedFieldId: string | undefined;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const oauthCallback = new URLSearchParams(window.location.search);
const isOauthPopup = Boolean(
  window.opener && window.opener !== window && (oauthCallback.has("code") || oauthCallback.has("error")),
);
if (isOauthPopup) {
  window.opener.postMessage(
    { type: "field-tracer-osm-callback", search: window.location.search },
    window.location.origin,
  );
  window.close();
}

const map = createMap("map", task, {
  onMapClick: (event) => {
    if (!drawing) {
      const hit = map.queryRenderedFeatures(event.point, { layers: ["field-fill"] })[0];
      selectedFieldId = typeof hit?.properties?.id === "string" ? hit.properties.id : undefined;
      setTaskData(map, task, fields.features, selectedFieldId);
      updateEditingControls();
      return;
    }
    if (drawingMode === "circle") return;
    draft.push([event.lngLat.lng, event.lngLat.lat]);
    setDraftData(map, draft as number[][]);
    updateEditingControls();
  },
  onMapDoubleClick: () => finishDraft(),
  onMapMouseDown: (event) => {
    if (!drawing || drawingMode !== "circle") return;
    circleCenter = [event.lngLat.lng, event.lngLat.lat];
    circleDragging = true;
    draft = circleCoordinates(circleCenter, circleCenter);
    setDraftData(map, draft as number[][]);
    updateEditingControls();
  },
  onMapMouseMove: (event) => {
    if (!circleDragging || !circleCenter) return;
    draft = circleCoordinates(circleCenter, [event.lngLat.lng, event.lngLat.lat]);
    setDraftData(map, draft as number[][]);
  },
  onMapMouseUp: (event) => {
    if (!circleDragging || !circleCenter) return;
    draft = circleCoordinates(circleCenter, [event.lngLat.lng, event.lngLat.lat]);
    circleDragging = false;
    setDraftData(map, draft as number[][]);
    finishDraft();
  },
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

function toast(message: string): void {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("is-visible");
  window.setTimeout(() => element.classList.remove("is-visible"), 3200);
}

function updateEditingControls(): void {
  $("draw-button").textContent = drawing
    ? "Drawing field…"
    : drawingMode === "circle"
      ? "Draw circular field"
      : "Draw field polygon";
  $("finish-button").toggleAttribute("disabled", !drawing || draft.length < 3);
  $("undo-point-button").toggleAttribute("disabled", !drawing || draft.length === 0);
  $("cancel-draft-button").toggleAttribute("disabled", !drawing);
  $("remove-field-button").toggleAttribute("disabled", !selectedFieldId);
  $("undo-field-button").toggleAttribute("disabled", fields.features.length === 0);
  $("selection-note").textContent = selectedFieldId ? `Selected ${selectedFieldId}` : "None selected";
  const selected = fields.features.find((field) => field.properties.id === selectedFieldId);
  const reviewButton = $("review-field-button") as HTMLButtonElement;
  reviewButton.disabled = !selected;
  reviewButton.textContent = selected?.properties.needsReview ? "Clear review flag" : "Mark for review";
  $("review-reason").toggleAttribute("disabled", !selected?.properties.needsReview);
  $("draw-hint").textContent = drawing
    ? drawingMode === "circle"
      ? "Drag from the field center to set the radius. Release to finish."
      : `${draft.length} points · click Undo point or press ⌘/Ctrl+Z`
    : drawingMode === "circle"
      ? "Choose Circle, then drag from the field center to set the radius."
      : "Click around a field. Double-click to close it.";
}

function resetDraft(): void {
  drawing = false;
  draft = [];
  circleCenter = undefined;
  circleDragging = false;
  setDraftData(map, []);
  updateEditingControls();
}

function undoDraftPoint(): void {
  if (!drawing || draft.length === 0) return;
  draft.pop();
  setDraftData(map, draft as number[][]);
  updateEditingControls();
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
  resetDraft();
  selectedFieldId = undefined;
  setTaskData(map, task, fields.features, selectedFieldId);
  updateSummary();
  updateEditingControls();
  toast("Field added to this task");
}

function removeField(fieldId: string | undefined): void {
  if (!fieldId) return;
  const index = fields.features.findIndex((field) => field.properties.id === fieldId);
  if (index === -1) return;
  fields.features.splice(index, 1);
  selectedFieldId = undefined;
  setTaskData(map, task, fields.features, selectedFieldId);
  updateSummary();
  updateEditingControls();
  toast("Field removed · nothing is uploaded yet");
}

function toggleReviewFlag(): void {
  const selected = fields.features.find((field) => field.properties.id === selectedFieldId);
  if (!selected) return;
  selected.properties.needsReview = !selected.properties.needsReview;
  if (!selected.properties.needsReview) delete selected.properties.reviewReason;
  setTaskData(map, task, fields.features, selectedFieldId);
  updateEditingControls();
  toast(selected.properties.needsReview ? "Field marked for review" : "Review flag cleared");
}

function setReviewReason(reason: string): void {
  const selected = fields.features.find((field) => field.properties.id === selectedFieldId);
  if (!selected?.properties.needsReview) return;
  selected.properties.reviewReason = reason as typeof selected.properties.reviewReason;
}

function updateSummary(): void {
  $("field-count").textContent = `${fields.features.length}`;
  $("area-count").textContent =
    `${Math.round(fields.features.reduce((total, field) => total + polygonAreaM2(field.geometry.coordinates[0]), 0)).toLocaleString()}`;
  $("upload-button").toggleAttribute("disabled", fields.features.length === 0 || !osmConnected);
  updateEditingControls();
}

async function connectOsm(): Promise<void> {
  try {
    const authorizationUrl = await beginOsmLogin();
    const loginWindow = window.open(authorizationUrl, "field-tracer-osm-login", "popup,width=520,height=720");
    if (!loginWindow) toast("Allow pop-ups for Field Tracer to continue with OpenStreetMap.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not start OSM login");
  }
}

$("draw-button").addEventListener("click", () => {
  drawing = !drawing;
  if (!drawing) {
    resetDraft();
  }
  updateEditingControls();
});
$("drawing-mode").addEventListener("change", (event) => {
  drawingMode = (event.target as HTMLSelectElement).value as typeof drawingMode;
  if (drawing) resetDraft();
  $("draw-button").textContent = drawingMode === "circle" ? "Draw circular field" : "Draw field polygon";
  updateEditingControls();
});
$("undo-point-button").addEventListener("click", undoDraftPoint);
$("cancel-draft-button").addEventListener("click", () => {
  resetDraft();
  toast("Current polygon canceled");
});
$("finish-button").addEventListener("click", finishDraft);
$("remove-field-button").addEventListener("click", () => removeField(selectedFieldId));
$("undo-field-button").addEventListener("click", () => removeField(fields.features.at(-1)?.properties.id));
$("review-field-button").addEventListener("click", toggleReviewFlag);
$("review-reason").addEventListener("change", (event) => setReviewReason((event.target as HTMLSelectElement).value));
$("zoom-task-button").addEventListener("click", () => {
  map.fitBounds(
    [
      [demoBoundary.geometry.coordinates[0][0][0], demoBoundary.geometry.coordinates[0][0][1]],
      [demoBoundary.geometry.coordinates[0][2][0], demoBoundary.geometry.coordinates[0][2][1]],
    ],
    { padding: 80, duration: 350 },
  );
});
$("guidance-button").addEventListener("click", () => {
  showTutorialContent();
  ($("guidance-dialog") as HTMLDialogElement).showModal();
});
$("close-guidance").addEventListener("click", () => closeTutorial());

const workflowSteps = [
  [
    "1",
    "Is it managed?",
    "Look for a clear boundary and evidence of active or recent agricultural management. Include fallow or inactive fields when management remains legible; exclude regrowth and unchanged bare ground.",
  ],
  [
    "2",
    "Does time agree?",
    "Compare the two Sentinel-2 windows first, then use matching-date basemaps. Harvest, fire, cloud, mining, and bare ground can create field-like patterns in one image.",
  ],
  [
    "3",
    "Where is the edge?",
    "Draw the contact between field interior and background. Use roads and obstacles as boundaries, include small features subsumed by the field, and keep neighboring fields touching without a real background gap.",
  ],
  [
    "4",
    "Should it be reviewed?",
    "Split only with a clear divide and 1–2 pixels of pure interior. If evidence conflicts, mark the field for review; if there is no defensible boundary, leave it unmapped.",
  ],
] as const;
let workflowStep = 0;
let exampleCategory = "all";

function renderTraining(): void {
  $("training-progress").innerHTML = workflowSteps
    .map(
      ([number, title], index) =>
        `<button type="button" class="step-button${index === workflowStep ? " is-active" : ""}" data-step="${index}"><span>${number}</span>${title}</button>`,
    )
    .join("");
  const [number, title, copy] = workflowSteps[workflowStep];
  $("training-step").innerHTML =
    `<span class="eyebrow">Step ${number} of ${workflowSteps.length}</span><h3>${title}</h3><p>${copy}</p><div class="step-actions"><button type="button" class="btn-quiet" id="previous-step" ${workflowStep === 0 ? "disabled" : ""}>Back</button><button type="button" class="btn-secondary" id="next-step" ${workflowStep === workflowSteps.length - 1 ? "disabled" : ""}>Next</button></div>`;
  $("training-progress")
    .querySelectorAll<HTMLButtonElement>("[data-step]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        workflowStep = Number(button.dataset.step);
        renderTraining();
      });
    });
  $("previous-step").addEventListener("click", () => {
    workflowStep -= 1;
    renderTraining();
  });
  $("next-step").addEventListener("click", () => {
    workflowStep += 1;
    renderTraining();
  });
}

function renderExamples(): void {
  $("example-filters").innerHTML = trainingCategories
    .map(
      ([value, label]) =>
        `<button type="button" class="filter-button${value === exampleCategory ? " is-active" : ""}" data-category="${value}">${label}</button>`,
    )
    .join("");
  const examples = trainingExamples.filter(
    (example) => exampleCategory === "all" || example.category === exampleCategory,
  );
  $("example-deck").innerHTML = examples
    .map(
      (example) =>
        `<article class="example-card"><img src="${example.image}" alt="${example.title} from annotation discussion slide ${example.slide}" loading="lazy" /><div class="example-copy"><span class="eyebrow">Slide ${example.slide}</span><h3>${example.title}</h3><p>${example.takeaway}</p></div></article>`,
    )
    .join("");
  $("example-filters")
    .querySelectorAll<HTMLButtonElement>("[data-category]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        exampleCategory = button.dataset.category ?? "all";
        renderExamples();
      });
    });
}

function renderVideos(): void {
  $("video-deck").innerHTML = trainingVideos
    .map(
      (video) =>
        `<article class="video-card"><video controls preload="metadata"><source src="${video.source}" type="video/webm" /></video><div><span class="eyebrow">Walkthrough</span><h3>${video.title}</h3><p>${video.description} <a class="training-source" href="${video.youtube}" target="_blank" rel="noreferrer">Watch original ↗</a></p></div></article>`,
    )
    .join("");
}

function showTutorialContent(): void {
  $("tutorial-intro").classList.add("is-hidden");
  $("tutorial-content").classList.remove("is-hidden");
}

function rememberTutorialChoice(): void {
  if (($("remember-tutorial") as HTMLInputElement).checked) {
    localStorage.setItem("field-tracer-tutorial-seen", "true");
  }
}

function closeTutorial(): void {
  rememberTutorialChoice();
  ($("guidance-dialog") as HTMLDialogElement).close();
}

function skipTutorial(): void {
  localStorage.setItem("field-tracer-tutorial-seen", "true");
  closeTutorial();
}

$("workflow-tab").addEventListener("click", () => {
  $("workflow-tab").classList.add("is-active");
  $("examples-tab").classList.remove("is-active");
  $("workflow-tab").setAttribute("aria-selected", "true");
  $("examples-tab").setAttribute("aria-selected", "false");
  $("workflow-panel").classList.remove("is-hidden");
  $("examples-panel").classList.add("is-hidden");
  $("videos-tab").classList.remove("is-active");
  $("videos-tab").setAttribute("aria-selected", "false");
  $("videos-panel").classList.add("is-hidden");
});
$("examples-tab").addEventListener("click", () => {
  $("examples-tab").classList.add("is-active");
  $("workflow-tab").classList.remove("is-active");
  $("examples-tab").setAttribute("aria-selected", "true");
  $("workflow-tab").setAttribute("aria-selected", "false");
  $("examples-panel").classList.remove("is-hidden");
  $("workflow-panel").classList.add("is-hidden");
  $("videos-tab").classList.remove("is-active");
  $("videos-tab").setAttribute("aria-selected", "false");
  $("videos-panel").classList.add("is-hidden");
});
$("videos-tab").addEventListener("click", () => {
  $("videos-tab").classList.add("is-active");
  $("workflow-tab").classList.remove("is-active");
  $("examples-tab").classList.remove("is-active");
  $("videos-tab").setAttribute("aria-selected", "true");
  $("workflow-tab").setAttribute("aria-selected", "false");
  $("examples-tab").setAttribute("aria-selected", "false");
  $("videos-panel").classList.remove("is-hidden");
  $("workflow-panel").classList.add("is-hidden");
  $("examples-panel").classList.add("is-hidden");
});
$("start-tutorial").addEventListener("click", showTutorialContent);
$("skip-tutorial").addEventListener("click", skipTutorial);
$("tutorial-info").addEventListener("click", () => {
  showTutorialContent();
  ($("guidance-dialog") as HTMLDialogElement).showModal();
});
renderTraining();
renderExamples();
renderVideos();

if (localStorage.getItem("field-tracer-tutorial-seen") !== "true") {
  window.setTimeout(() => ($("guidance-dialog") as HTMLDialogElement).showModal(), 500);
}
$("osm-login").addEventListener("click", () => void connectOsm());
$("osm-layer").addEventListener("change", (event) =>
  toggleLayer(map, "task-boundary", (event.target as HTMLInputElement).checked),
);
$("task-layer").addEventListener("change", (event) => {
  const visible = (event.target as HTMLInputElement).checked;
  toggleLayer(map, "task-boundary", visible);
  toggleLayer(map, "task-fill", visible);
});
$("mosaic-year").addEventListener("input", (event) => {
  const year = Number((event.target as HTMLInputElement).value);
  $("mosaic-year-value").textContent = `${year}`;
  setMosaicYear(map, year);
});
$("roads-layer").addEventListener("change", (event) => {
  const visible = (event.target as HTMLInputElement).checked;
  toggleLayer(map, "overture-road-casing", visible);
  toggleLayer(map, "overture-roads", visible);
});
$("waterways-layer").addEventListener("change", (event) => {
  const visible = (event.target as HTMLInputElement).checked;
  toggleLayer(map, "overture-water", visible);
  toggleLayer(map, "overture-water-line", visible);
});
$("buildings-layer").addEventListener("change", (event) => {
  const visible = (event.target as HTMLInputElement).checked;
  toggleLayer(map, "overture-buildings", visible);
  toggleLayer(map, "overture-building-line", visible);
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

updateEditingControls();
updateSummary();
void planetKeyPresent;

window.addEventListener("message", (event: MessageEvent<{ type?: string; search?: string }>) => {
  if (event.origin !== window.location.origin || event.data.type !== "field-tracer-osm-callback" || !event.data.search)
    return;
  void completeOsmLogin(event.data.search)
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
});

if (!isOauthPopup)
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

window.addEventListener("keydown", (event) => {
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoDraftPoint();
  }
  if (event.key === "Escape" && drawing) resetDraft();
  if ((event.key === "Delete" || event.key === "Backspace") && !drawing) removeField(selectedFieldId);
});

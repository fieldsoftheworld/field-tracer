import "maplibre-gl/dist/maplibre-gl.css";
import { featureCollection, lineString } from "@turf/helpers";
import polygonToLine from "@turf/polygon-to-line";
import polygonize from "@turf/polygonize";
import union from "@turf/union";
import type { Feature, Polygon, Position } from "geojson";
import maplibregl from "maplibre-gl";
import {
  circleCoordinates,
  cleanField,
  createFieldFeature,
  dropRepeatedPoints,
  fieldWarnings,
  fixSelfCrossingField,
  polygonAreaM2,
  rectangleCoordinates,
  snapPoint,
  trimFieldOverlaps,
  validateField,
} from "./geometry";
import {
  createMap,
  setComparisonYear,
  setDraftData,
  setMosaicAppearance,
  setMosaicYear,
  setTaskData,
  toggleLayer,
  visibleReferenceLines,
} from "./map";
import {
  beginOsmLogin,
  campaignId,
  isOauthPopupCallback,
  notifyOauthPopup,
  type OsmSession,
  uploadFieldsToOsm,
} from "./osm";
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
let drawingMode: "polygon" | "circle" | "rectangle" = "polygon";
let circleCenter: Position | undefined;
let circleDragging = false;
let osmConnected = false;
let planetKeyPresent = false;
let osmSession: OsmSession | undefined;
let selectedFieldId: string | undefined;
let selectedVertexIndex: number | undefined;
let vertexEditMode = false;
let draggingVertex = false;
let snapEnabled = true;
let comparisonEnabled = false;
let comparisonYear = 2020;
let flickerTimer: number | undefined;
let splitMode = false;
let splitDraft: Position[] = [];
let mergeMode = false;
let referenceSnapEnabled = false;
let uploadedChangesetUrl: string | undefined;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// Clicking within this screen radius of the first vertex closes the polygon.
const CLOSE_SNAP_PX = 14;

const isOauthPopup = isOauthPopupCallback(window.location.search);
if (isOauthPopup) {
  notifyOauthPopup();
  window.close();
}

const map = createMap("map", task, {
  onMapClick: (event) => {
    if (mergeMode) {
      mergeWithFieldAt(event.point);
      return;
    }
    if (splitMode) {
      splitDraft.push([event.lngLat.lng, event.lngLat.lat]);
      setDraftData(map, splitDraft as number[][]);
      if (splitDraft.length === 2) splitSelectedField();
      return;
    }
    if (vertexEditMode && selectedFieldId) {
      insertVertexAt(event.point, [event.lngLat.lng, event.lngLat.lat]);
      return;
    }
    if (!drawing) {
      const hit = map.queryRenderedFeatures(event.point, { layers: ["field-fill"] })[0];
      selectedFieldId = typeof hit?.properties?.id === "string" ? hit.properties.id : undefined;
      selectedVertexIndex = undefined;
      refreshMap();
      updateEditingControls();
      return;
    }
    if (drawingMode === "circle") return;
    if (draft.length >= 3 && withinCloseThreshold(event.point, draft[0])) {
      finishDraft();
      return;
    }
    draft.push(snappedCoordinate([event.lngLat.lng, event.lngLat.lat]));
    setDraftData(map, draft as number[][], draft as number[][]);
    updateEditingControls();
  },
  onMapDoubleClick: () => finishDraft(),
  onMapMouseDown: (event) => {
    if (vertexEditMode && selectedFieldId) {
      beginVertexDrag(event.point);
      return;
    }
    if (!drawing || drawingMode === "polygon") return;
    circleCenter = snappedCoordinate([event.lngLat.lng, event.lngLat.lat]);
    circleDragging = true;
    draft =
      drawingMode === "circle"
        ? circleCoordinates(circleCenter, circleCenter)
        : rectangleCoordinates(circleCenter, circleCenter);
    setDraftData(map, draft as number[][]);
    updateEditingControls();
  },
  onMapMouseMove: (event) => {
    if (draggingVertex) {
      moveSelectedVertex([event.lngLat.lng, event.lngLat.lat]);
      return;
    }
    if (!circleDragging || !circleCenter) return;
    const edge = snappedCoordinate([event.lngLat.lng, event.lngLat.lat]);
    draft = drawingMode === "circle" ? circleCoordinates(circleCenter, edge) : rectangleCoordinates(circleCenter, edge);
    setDraftData(map, draft as number[][]);
  },
  onMapMouseUp: (event) => {
    if (draggingVertex) {
      draggingVertex = false;
      map.dragPan.enable();
      updateEditingControls();
      return;
    }
    if (!circleDragging || !circleCenter) return;
    const edge = snappedCoordinate([event.lngLat.lng, event.lngLat.lat]);
    draft = drawingMode === "circle" ? circleCoordinates(circleCenter, edge) : rectangleCoordinates(circleCenter, edge);
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

function selectedField(): FieldCollection["features"][number] | undefined {
  return fields.features.find((field) => field.properties.id === selectedFieldId);
}

function withinCloseThreshold(screenPoint: maplibregl.Point, firstVertex: Position): boolean {
  const projected = map.project(firstVertex as [number, number]);
  return Math.hypot(projected.x - screenPoint.x, projected.y - screenPoint.y) <= CLOSE_SNAP_PX;
}

function snappedCoordinate(coordinate: Position): Position {
  if (!snapEnabled) return coordinate;
  const referenceLines = referenceSnapEnabled
    ? visibleReferenceLines(map, map.project(coordinate as [number, number])).map((line) => line as Position[])
    : [];
  return snapPoint(coordinate, [
    task.boundary.geometry.coordinates[0],
    ...fields.features.map((field) => field.geometry.coordinates[0]),
    ...referenceLines,
  ]);
}

function refreshMap(): void {
  setTaskData(map, task, fields.features, selectedFieldId, vertexEditMode);
}

function updateQaSummary(): void {
  const warnings = fields.features.flatMap((field) => fieldWarnings(field, task, fields));
  const reviewCount = fields.features.filter((field) => field.properties.needsReview).length;
  $("qa-summary").textContent = warnings.length
    ? `${warnings.length} geometry warning${warnings.length === 1 ? "" : "s"} · resolve before upload`
    : reviewCount
      ? `${reviewCount} field${reviewCount === 1 ? "" : "s"} marked for review · geometry checks pass`
      : fields.features.length
        ? "Geometry checks pass · inspect imagery and task coverage before upload."
        : "Add a field to see the geometry report.";
}

function syncComparison(): void {
  setMosaicYear(map, Number(($("mosaic-year") as HTMLInputElement).value));
  if (comparisonEnabled) setComparisonYear(map, comparisonYear, 0.5);
}

function nearestVertex(point: maplibregl.Point): number | undefined {
  const field = selectedField();
  if (!field) return undefined;
  let nearest: number | undefined;
  let distance = 14;
  for (const [index, coordinate] of field.geometry.coordinates[0].slice(0, -1).entries()) {
    const candidate = map.project(coordinate as [number, number]);
    const candidateDistance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (candidateDistance < distance) {
      nearest = index;
      distance = candidateDistance;
    }
  }
  return nearest;
}

function beginVertexDrag(point: maplibregl.Point): void {
  selectedVertexIndex = nearestVertex(point);
  if (selectedVertexIndex === undefined) return;
  draggingVertex = true;
  map.dragPan.disable();
  updateEditingControls();
}

function moveSelectedVertex(coordinate: Position): void {
  const field = selectedField();
  if (!field || selectedVertexIndex === undefined) return;
  const ring = field.geometry.coordinates[0];
  ring[selectedVertexIndex] = snappedCoordinate(coordinate);
  ring[ring.length - 1] = ring[0];
  field.properties.areaM2 = polygonAreaM2(ring);
  refreshMap();
  updateQaSummary();
}

function insertVertexAt(point: maplibregl.Point, coordinate: Position): void {
  const field = selectedField();
  if (!field) return;
  const ring = field.geometry.coordinates[0];
  let closestIndex: number | undefined;
  let closestDistance = 12;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = map.project(ring[index] as [number, number]);
    const end = map.project(ring[index + 1] as [number, number]);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx ** 2 + dy ** 2)));
    const distance = Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }
  if (closestIndex === undefined) return;
  ring.splice(closestIndex + 1, 0, snappedCoordinate(coordinate));
  ring[ring.length - 1] = ring[0];
  selectedVertexIndex = closestIndex + 1;
  field.properties.areaM2 = polygonAreaM2(ring);
  refreshMap();
  updateEditingControls();
  updateQaSummary();
}

function replaceSelectedField(next: FieldCollection["features"][number], message: string): void {
  const index = fields.features.findIndex((field) => field.properties.id === next.properties.id);
  if (index === -1) return;
  fields.features[index] = next;
  refreshMap();
  updateEditingControls();
  updateQaSummary();
  toast(message);
}

function updateEditingControls(): void {
  $("draw-button").textContent = drawing
    ? "Drawing field…"
    : drawingMode === "circle"
      ? "Draw circular field"
      : drawingMode === "rectangle"
        ? "Draw rectangular field"
        : "Draw field polygon";
  $("finish-button").toggleAttribute("disabled", !drawing || draft.length < 3);
  $("undo-point-button").toggleAttribute("disabled", !drawing || draft.length === 0);
  $("cancel-draft-button").toggleAttribute("disabled", !drawing);
  $("remove-field-button").toggleAttribute("disabled", !selectedFieldId);
  $("undo-field-button").toggleAttribute("disabled", fields.features.length === 0);
  $("selection-note").textContent = selectedFieldId ? `Selected ${selectedFieldId}` : "None selected";
  const selected = selectedField();
  $("vertex-edit-mode").toggleAttribute("disabled", !selected);
  ($("vertex-edit-mode") as HTMLInputElement).checked = vertexEditMode;
  $("delete-vertex-button").toggleAttribute("disabled", selectedVertexIndex === undefined || !selected);
  $("clean-field-button").toggleAttribute("disabled", !selected);
  $("repair-field-button").toggleAttribute("disabled", !selected);
  $("trim-field-button").toggleAttribute("disabled", !selected || fields.features.length < 2);
  $("merge-field-button").toggleAttribute("disabled", !selected || fields.features.length < 2);
  $("split-field-button").toggleAttribute("disabled", !selected);
  const reviewButton = $("review-field-button") as HTMLButtonElement;
  reviewButton.disabled = !selected;
  reviewButton.textContent = selected?.properties.needsReview ? "Clear review flag" : "Mark for review";
  $("review-reason").toggleAttribute("disabled", !selected?.properties.needsReview);
  $("draw-hint").textContent = drawing
    ? drawingMode === "circle"
      ? "Drag from the field center to set the radius. Release to finish."
      : drawingMode === "rectangle"
        ? "Drag from one field corner to the opposite corner. Release to finish."
        : draft.length >= 3
          ? `${draft.length} points · click the first point or double-click to close`
          : `${draft.length} points · click Undo point or press ⌘/Ctrl+Z`
    : drawingMode === "circle"
      ? "Choose Circle, then drag from the field center to set the radius."
      : drawingMode === "rectangle"
        ? "Choose Rectangle, then drag between opposite field corners."
        : "Click around a field. Click the first point or double-click to close it.";
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
  setDraftData(map, draft as number[][], draft as number[][]);
  updateEditingControls();
}

function finishDraft(): void {
  if (!drawing) return;
  const points = dropRepeatedPoints(draft);
  if (points.length < 3) return;
  const feature = createFieldFeature(points, `field-${fields.features.length + 1}`);
  const errors = validateField(feature, task, fields);
  if (errors.length > 0) {
    toast(`Needs another pass: ${errors.join(" · ")}`);
    return;
  }
  feature.properties.valid = true;
  fields.features.push(feature);
  resetDraft();
  selectedFieldId = undefined;
  refreshMap();
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
  selectedVertexIndex = undefined;
  vertexEditMode = false;
  refreshMap();
  updateSummary();
  updateEditingControls();
  toast("Field removed · nothing is uploaded yet");
}

function toggleReviewFlag(): void {
  const selected = fields.features.find((field) => field.properties.id === selectedFieldId);
  if (!selected) return;
  selected.properties.needsReview = !selected.properties.needsReview;
  if (!selected.properties.needsReview) delete selected.properties.reviewReason;
  refreshMap();
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
  const unresolvedReview = fields.features.some((field) => field.properties.needsReview);
  $("upload-button").toggleAttribute(
    "disabled",
    fields.features.length === 0 || !osmConnected || unresolvedReview || Boolean(uploadedChangesetUrl),
  );
  updateQaSummary();
  updateEditingControls();
}

function cleanSelectedField(): void {
  const field = selectedField();
  if (!field) return;
  const cleaned = cleanField(field);
  if (!cleaned) {
    toast("This geometry cannot be cleaned into one field polygon");
    return;
  }
  if (JSON.stringify(cleaned.geometry) === JSON.stringify(field.geometry)) {
    toast("Geometry already clean");
    return;
  }
  replaceSelectedField(cleaned, "Clean geometry applied · inspect the highlighted field");
}

function repairSelectedField(): void {
  const field = selectedField();
  if (!field) return;
  const repaired = fixSelfCrossingField(field);
  if (!repaired) {
    toast("Repair would create multiple fields — redraw this boundary instead");
    return;
  }
  replaceSelectedField(repaired, "Crossing repaired · inspect the highlighted field");
}

function trimSelectedField(): void {
  const field = selectedField();
  if (!field) return;
  const trimmed = trimFieldOverlaps(field, fields);
  if (!trimmed) {
    toast("Trim would create multiple pieces — edit the overlap manually");
    return;
  }
  replaceSelectedField(trimmed, "Overlap trimmed · inspect the highlighted field");
}

function startMergeField(): void {
  if (!selectedField()) return;
  mergeMode = !mergeMode;
  $("merge-field-button").textContent = mergeMode
    ? "Click the other field to merge…"
    : "Merge with another traced field";
  toast(mergeMode ? "Click a second campaign-created field to merge it" : "Merge canceled");
}

function mergeWithFieldAt(point: maplibregl.Point): void {
  const first = selectedField();
  const hit = map.queryRenderedFeatures(point, { layers: ["field-fill"] })[0];
  const secondId = typeof hit?.properties?.id === "string" ? hit.properties.id : undefined;
  const second = fields.features.find((field) => field.properties.id === secondId);
  mergeMode = false;
  $("merge-field-button").textContent = "Merge with another traced field";
  if (!first || !second || first.properties.id === second.properties.id) {
    toast("Choose a different traced field to merge");
    return;
  }
  const merged = union(featureCollection([first, second]));
  if (merged?.geometry.type !== "Polygon") {
    toast("These fields are disjoint — keep them as separate polygons");
    return;
  }
  const replacement = createFieldFeature(merged.geometry.coordinates[0], first.properties.id);
  const otherFields = fields.features.filter((field) => field !== first && field !== second);
  const errors = validateField(replacement, task, { type: "FeatureCollection", features: otherFields });
  if (errors.length) {
    toast(`Merge needs another pass: ${errors[0]}`);
    return;
  }
  const firstIndex = fields.features.indexOf(first);
  fields.features.splice(firstIndex, 1, replacement);
  fields.features.splice(fields.features.indexOf(second), 1);
  selectedFieldId = replacement.properties.id;
  refreshMap();
  updateSummary();
  toast("Fields merged · inspect the highlighted boundary before upload");
}

function startSplitField(): void {
  if (!selectedField()) return;
  splitMode = !splitMode;
  splitDraft = [];
  setDraftData(map, []);
  $("split-field-button").textContent = splitMode
    ? "Draw two points across the field…"
    : "Split selected field with a line";
  toast(splitMode ? "Click two points across the selected field to split it" : "Field split canceled");
}

function splitSelectedField(): void {
  const field = selectedField();
  if (!field || splitDraft.length !== 2) return;
  const [start, end] = splitDraft;
  const splitter = lineString([
    [start[0] - (end[0] - start[0]) * 100, start[1] - (end[1] - start[1]) * 100],
    [end[0] + (end[0] - start[0]) * 100, end[1] + (end[1] - start[1]) * 100],
  ]);
  const boundary = polygonToLine(field);
  const boundaryLines = boundary.type === "FeatureCollection" ? boundary.features : [boundary];
  const pieces = polygonize(featureCollection([...boundaryLines, splitter]));
  splitMode = false;
  splitDraft = [];
  setDraftData(map, []);
  $("split-field-button").textContent = "Split selected field with a line";
  if (pieces.features.length !== 2) {
    toast("That line does not split this field into two usable polygons");
    return;
  }
  const index = fields.features.findIndex((candidate) => candidate.properties.id === field.properties.id);
  const replacements = pieces.features.map((piece, pieceIndex) =>
    createFieldFeature(piece.geometry.coordinates[0], `${field.properties.id}-${pieceIndex + 1}`),
  );
  const remaining: FieldCollection = {
    type: "FeatureCollection",
    features: fields.features.filter((candidate) => candidate !== field),
  };
  const errors = replacements.flatMap((piece) =>
    validateField(piece, task, {
      ...remaining,
      features: [...remaining.features, ...replacements.filter((other) => other !== piece)],
    }),
  );
  if (errors.length) {
    toast(`Split needs another pass: ${errors[0]}`);
    return;
  }
  fields.features.splice(index, 1, ...replacements);
  selectedFieldId = replacements[0].properties.id;
  refreshMap();
  updateSummary();
  toast("Field split into two polygons · inspect both before upload");
}

function deleteSelectedVertex(): void {
  const field = selectedField();
  if (!field || selectedVertexIndex === undefined) return;
  const ring = field.geometry.coordinates[0];
  if (ring.length <= 4) {
    toast("A field polygon needs at least three corners");
    return;
  }
  ring.splice(selectedVertexIndex, 1);
  ring[ring.length - 1] = ring[0];
  field.properties.areaM2 = polygonAreaM2(ring);
  selectedVertexIndex = undefined;
  refreshMap();
  updateEditingControls();
  updateQaSummary();
}

async function connectOsm(): Promise<void> {
  try {
    const session = await beginOsmLogin();
    acceptOsmSession(session);
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not start OSM login");
  }
}

async function uploadToOsm(): Promise<void> {
  if (!osmSession) {
    toast("Sign in with OpenStreetMap before uploading.");
    return;
  }
  if (fields.features.some((field) => field.properties.needsReview)) {
    toast("Resolve or remove review flags before uploading public OSM data.");
    return;
  }
  const button = $("upload-button") as HTMLButtonElement;
  button.disabled = true;
  button.textContent = "Uploading to OpenStreetMap…";
  try {
    const result = await uploadFieldsToOsm(osmSession, fields.features, {
      campaignId: campaignId(),
      projectId: task.projectId,
      taskId: task.taskId,
    });
    uploadedChangesetUrl = result.changesetUrl;
    button.textContent = "Uploaded to OSM";
    $("changeset-result").innerHTML =
      `Uploaded as <a href="${result.changesetUrl}" target="_blank" rel="noreferrer">OSM changeset ${result.changesetId} ↗</a>`;
    $("status-copy").textContent =
      `Uploaded ${fields.features.length} field${fields.features.length === 1 ? "" : "s"} to OpenStreetMap · return to task`;
    toast("Upload complete · review the changeset before marking the task mapped");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Upload to OSM";
    toast(error instanceof Error ? error.message : "OSM upload failed");
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
  $("draw-button").textContent =
    drawingMode === "circle"
      ? "Draw circular field"
      : drawingMode === "rectangle"
        ? "Draw rectangular field"
        : "Draw field polygon";
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
$("vertex-edit-mode").addEventListener("change", (event) => {
  vertexEditMode = (event.target as HTMLInputElement).checked;
  selectedVertexIndex = undefined;
  refreshMap();
  updateEditingControls();
  toast(vertexEditMode ? "Vertex edit mode on · drag a handle or click an edge to add one" : "Vertex edit mode off");
});
$("delete-vertex-button").addEventListener("click", deleteSelectedVertex);
$("clean-field-button").addEventListener("click", cleanSelectedField);
$("repair-field-button").addEventListener("click", repairSelectedField);
$("trim-field-button").addEventListener("click", trimSelectedField);
$("merge-field-button").addEventListener("click", startMergeField);
$("split-field-button").addEventListener("click", startSplitField);
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
$("task-layer").addEventListener("change", (event) => {
  const visible = (event.target as HTMLInputElement).checked;
  toggleLayer(map, "task-boundary", visible);
  toggleLayer(map, "task-fill", visible);
});
$("mosaic-year").addEventListener("input", (event) => {
  const year = Number((event.target as HTMLInputElement).value);
  $("mosaic-year-value").textContent = `${year}`;
  setMosaicYear(map, year);
  if (comparisonEnabled) setComparisonYear(map, comparisonYear, 0.5);
});
$("snap-mode").addEventListener("change", (event) => {
  snapEnabled = (event.target as HTMLInputElement).checked;
  toast(snapEnabled ? "Snapping to task and traced fields is on" : "Snapping is off");
});
$("reference-snap").addEventListener("change", (event) => {
  referenceSnapEnabled = (event.target as HTMLInputElement).checked;
  toast(
    referenceSnapEnabled
      ? "Road and water snapping is on when those layers are visible"
      : "Road and water snapping is off",
  );
});
$("comparison-layer").addEventListener("change", (event) => {
  comparisonEnabled = (event.target as HTMLInputElement).checked;
  syncComparison();
});
$("comparison-year").addEventListener("input", (event) => {
  comparisonYear = Number((event.target as HTMLInputElement).value);
  $("comparison-year-value").textContent = `${comparisonYear}`;
  if (comparisonEnabled) syncComparison();
});
$("flicker-button").addEventListener("click", () => {
  if (flickerTimer) {
    window.clearInterval(flickerTimer);
    flickerTimer = undefined;
    $("flicker-button").textContent = "Flicker comparison";
    syncComparison();
    return;
  }
  comparisonEnabled = false;
  ($("comparison-layer") as HTMLInputElement).checked = false;
  const baseYear = Number(($("mosaic-year") as HTMLInputElement).value);
  let alternate = false;
  flickerTimer = window.setInterval(() => {
    setMosaicYear(map, alternate ? baseYear : comparisonYear);
    alternate = !alternate;
  }, 700);
  $("flicker-button").textContent = "Stop flicker";
});
function updateAppearance(): void {
  setMosaicAppearance(map, {
    brightness: Number(($("image-brightness") as HTMLInputElement).value),
    contrast: Number(($("image-contrast") as HTMLInputElement).value),
    saturation: Number(($("image-saturation") as HTMLInputElement).value),
    opacity: 1,
  });
  if (comparisonEnabled) setComparisonYear(map, comparisonYear, 0.5);
}
for (const id of ["image-brightness", "image-contrast", "image-saturation"]) {
  $(id).addEventListener("input", updateAppearance);
}
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
$("upload-button").addEventListener("click", () => void uploadToOsm());
$("review-task-button").addEventListener("click", () => {
  const warnings = fields.features.flatMap((field) => fieldWarnings(field, task, fields));
  if (warnings.length) {
    toast(`Review found ${warnings.length} geometry warning${warnings.length === 1 ? "" : "s"}`);
    return;
  }
  toast("Geometry passes · now inspect coverage, time windows, and ambiguity flags");
});
$("no-fields-button").addEventListener("click", () => {
  if (fields.features.length) {
    toast("Remove drawn fields before marking this task as reviewed with no fields");
    return;
  }
  $("status-copy").textContent = "Reviewed · no annual-crop fields visible";
  toast("Recorded locally — mark the task state in HOT Tasking Manager when ready");
});
$("return-button").addEventListener("click", () => window.history.back());

updateEditingControls();
updateSummary();
void planetKeyPresent;

function acceptOsmSession(session: OsmSession): void {
  osmSession = session;
  osmConnected = true;
  $("osm-login").textContent = "Connected to OpenStreetMap ✓";
  $("osm-login").classList.add("is-connected");
  updateSummary();
}
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

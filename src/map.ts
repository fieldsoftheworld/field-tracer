import type { Feature, Polygon } from "geojson";
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import type { FieldFeature, TaskContext } from "./types";

const sourceId = "field-tracer-data";
const taskLayerId = "task-boundary";
const fieldLayerId = "field-fill";
const fieldLineId = "field-line";
const draftLayerId = "draft-line";

export type MapCallbacks = {
  onMapClick: (event: MapMouseEvent) => void;
  onMapDoubleClick: (event: MapMouseEvent) => void;
};

export function createMap(container: string, task: TaskContext, callbacks: MapCallbacks): MapLibreMap {
  const map = new maplibregl.Map({
    container,
    center: [-88.16, 40.11],
    zoom: 13,
    maxZoom: 19,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        eox: {
          type: "raster",
          // EOX's WMTS path is TileMatrix/TileRow/TileCol (z/y/x), while
          // MapLibre's tile placeholders are named x/y.
          tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg"],
          tileSize: 256,
          maxzoom: 14,
          attribution: "EOxCloudless · Sentinel-2 2025 · EOX IT Services GmbH",
        },
      },
      layers: [
        {
          id: "eox-basemap",
          type: "raster",
          source: "eox",
          paint: { "raster-saturation": -0.08, "raster-contrast": 0.08 },
        },
      ],
    },
    doubleClickZoom: false,
  });

  map.on("load", () => {
    map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: taskLayerId,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "kind"], "task"],
      paint: { "line-color": "#c0d85b", "line-width": 3, "line-dasharray": [2, 1] },
    });
    map.addLayer({
      id: "task-fill",
      type: "fill",
      source: sourceId,
      filter: ["==", ["get", "kind"], "task"],
      paint: { "fill-color": "#c0d85b", "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: fieldLayerId,
      type: "fill",
      source: sourceId,
      filter: ["==", ["get", "kind"], "field"],
      paint: { "fill-color": "#22a070", "fill-opacity": 0.42 },
    });
    map.addLayer({
      id: fieldLineId,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "kind"], "field"],
      paint: {
        "line-color": ["case", ["boolean", ["get", "selected"], false], "#ff7f41", "#c0d85b"],
        "line-width": ["case", ["boolean", ["get", "selected"], false], 4, 2],
      },
    });
    map.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: draftLayerId,
      type: "line",
      source: "draft",
      paint: { "line-color": "#b5e1e6", "line-width": 3, "line-dasharray": [1, 1] },
    });
    setTaskData(map, task, []);
  });

  map.on("click", callbacks.onMapClick);
  map.on("dblclick", callbacks.onMapDoubleClick);
  return map;
}

export function setTaskData(
  map: MapLibreMap,
  task: TaskContext,
  fields: FieldFeature[],
  selectedFieldId?: string,
): void {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const taskFeature: Feature<Polygon, { kind: string }> = { ...task.boundary, properties: { kind: "task" } };
  const fieldFeatures = fields.map((field) => ({
    ...field,
    properties: {
      ...field.properties,
      kind: "field",
      selected: field.properties.id === selectedFieldId,
    },
  }));
  source.setData({ type: "FeatureCollection", features: [taskFeature, ...fieldFeatures] });
}

export function setDraftData(map: MapLibreMap, coordinates: number[][]): void {
  const source = map.getSource("draft") as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features:
      coordinates.length > 1
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }]
        : [],
  });
}

export function toggleLayer(map: MapLibreMap, layer: string, visible: boolean): void {
  const visibility = visible ? "visible" : "none";
  if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visibility);
}

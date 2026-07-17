import type { Feature, Polygon } from "geojson";
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { FieldFeature, TaskContext } from "./types";

const sourceId = "field-tracer-data";
const taskLayerId = "task-boundary";
const fieldLayerId = "field-fill";
const fieldLineId = "field-line";
const draftLayerId = "draft-line";
const vertexLayerId = "field-vertices";
const mosaicYears = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const;
const overtureRelease = "2026-06-17.0";

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

export type MapCallbacks = {
  onMapClick: (event: MapMouseEvent) => void;
  onMapDoubleClick: (event: MapMouseEvent) => void;
  onMapMouseDown?: (event: MapMouseEvent) => void;
  onMapMouseMove?: (event: MapMouseEvent) => void;
  onMapMouseUp?: (event: MapMouseEvent) => void;
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
        ...Object.fromEntries(
          mosaicYears.map((year) => [
            `eox-${year}`,
            {
              type: "raster",
              // EOX's WMTS path is TileMatrix/TileRow/TileCol (z/y/x), while
              // MapLibre's tile placeholders are named x/y.
              tiles: [`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`],
              tileSize: 256,
              maxzoom: 14,
              attribution: `EOxCloudless · Sentinel-2 ${year} · EOX IT Services GmbH`,
            },
          ]),
        ),
        overtureRoads: {
          type: "vector",
          url: `pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${overtureRelease}/transportation.pmtiles`,
        },
        overtureBase: {
          type: "vector",
          url: `pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${overtureRelease}/base.pmtiles`,
        },
        overtureBuildings: {
          type: "vector",
          url: `pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${overtureRelease}/buildings.pmtiles`,
        },
      },
      layers: [
        ...mosaicYears.map((year) => ({
          id: `eox-basemap-${year}`,
          type: "raster" as const,
          source: `eox-${year}`,
          layout: { visibility: year === 2025 ? ("visible" as const) : ("none" as const) },
          paint: { "raster-saturation": -0.08, "raster-contrast": 0.08 },
        })),
        {
          id: "overture-water",
          type: "fill",
          source: "overtureBase",
          "source-layer": "water",
          layout: { visibility: "none" },
          paint: { "fill-color": "#6eaeb2", "fill-opacity": 0.2 },
        },
        {
          id: "overture-water-line",
          type: "line",
          source: "overtureBase",
          "source-layer": "water",
          layout: { visibility: "none" },
          paint: { "line-color": "#b5e1e6", "line-width": 1.5, "line-opacity": 0.75 },
        },
        {
          id: "overture-buildings",
          type: "fill",
          source: "overtureBuildings",
          "source-layer": "buildings",
          layout: { visibility: "none" },
          paint: { "fill-color": "#ff7f41", "fill-opacity": 0.22 },
        },
        {
          id: "overture-building-line",
          type: "line",
          source: "overtureBuildings",
          "source-layer": "buildings",
          layout: { visibility: "none" },
          paint: { "line-color": "#ffb18e", "line-width": 1, "line-opacity": 0.75 },
        },
        {
          id: "overture-road-casing",
          type: "line",
          source: "overtureRoads",
          "source-layer": "roads",
          minzoom: 10,
          layout: { visibility: "none" },
          paint: {
            "line-color": "#004747",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 5],
            "line-opacity": 0.8,
          },
        },
        {
          id: "overture-roads",
          type: "line",
          source: "overtureRoads",
          "source-layer": "roads",
          minzoom: 10,
          layout: { visibility: "none" },
          paint: {
            "line-color": "#c0d85b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.7, 16, 3],
            "line-opacity": 0.95,
          },
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
    map.addSource("draft-vertices", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "draft-vertices",
      type: "circle",
      source: "draft-vertices",
      paint: {
        // The first vertex stays a little larger: it is the click/double-click
        // target that closes the polygon. Interior points are kept small.
        "circle-radius": ["case", ["boolean", ["get", "first"], false], 6, 3],
        "circle-color": ["case", ["boolean", ["get", "first"], false], "#c0d85b", "#b5e1e6"],
        "circle-stroke-color": ["case", ["boolean", ["get", "first"], false], "#ff7f41", "#0b1f1c"],
        "circle-stroke-width": ["case", ["boolean", ["get", "first"], false], 2, 1],
      },
    });
    map.addSource("vertices", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: vertexLayerId,
      type: "circle",
      source: "vertices",
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#ff7f41",
        "circle-stroke-width": 2,
      },
    });
    setTaskData(map, task, []);
  });

  map.on("click", callbacks.onMapClick);
  map.on("dblclick", callbacks.onMapDoubleClick);
  if (callbacks.onMapMouseDown) map.on("mousedown", callbacks.onMapMouseDown);
  if (callbacks.onMapMouseMove) map.on("mousemove", callbacks.onMapMouseMove);
  if (callbacks.onMapMouseUp) map.on("mouseup", callbacks.onMapMouseUp);
  return map;
}

export function setTaskData(
  map: MapLibreMap,
  task: TaskContext,
  fields: FieldFeature[],
  selectedFieldId?: string,
  editingVertices = false,
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
  const vertexSource = map.getSource("vertices") as maplibregl.GeoJSONSource | undefined;
  const selected = fields.find((field) => field.properties.id === selectedFieldId);
  vertexSource?.setData({
    type: "FeatureCollection",
    features:
      editingVertices && selected
        ? selected.geometry.coordinates[0].slice(0, -1).map((coordinate, index) => ({
            type: "Feature" as const,
            properties: { index },
            geometry: { type: "Point" as const, coordinates: coordinate },
          }))
        : [],
  });
}

export function setDraftData(map: MapLibreMap, coordinates: number[][], vertices: number[][] = []): void {
  const source = map.getSource("draft") as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features:
        coordinates.length > 1
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }]
          : [],
    });
  }
  const vertexSource = map.getSource("draft-vertices") as maplibregl.GeoJSONSource | undefined;
  vertexSource?.setData({
    type: "FeatureCollection",
    features: vertices.map((coordinate, index) => ({
      type: "Feature" as const,
      properties: { first: index === 0 },
      geometry: { type: "Point" as const, coordinates: coordinate },
    })),
  });
}

export function toggleLayer(map: MapLibreMap, layer: string, visible: boolean): void {
  const visibility = visible ? "visible" : "none";
  if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visibility);
}

export function setMosaicYear(map: MapLibreMap, year: number): void {
  for (const candidate of mosaicYears) {
    const layer = `eox-basemap-${candidate}`;
    if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", candidate === year ? "visible" : "none");
  }
}

export function hideEoxBasemaps(map: MapLibreMap): void {
  for (const year of mosaicYears) {
    const layer = `eox-basemap-${year}`;
    if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", "none");
  }
}

const planetSourceId = "planet-basemap";
const planetLayerId = "planet-basemap";

// Swaps the Planet raster basemap. Pass undefined to remove it (e.g. when the
// user switches back to Sentinel-2 or has not provided an API key yet). The
// layer is inserted just below the Overture reference layers so the task and
// field overlays always draw on top.
export function setPlanetBasemap(map: MapLibreMap, tilesUrl: string | undefined): void {
  if (map.getLayer(planetLayerId)) map.removeLayer(planetLayerId);
  if (map.getSource(planetSourceId)) map.removeSource(planetSourceId);
  if (!tilesUrl) return;
  map.addSource(planetSourceId, {
    type: "raster",
    tiles: [tilesUrl],
    tileSize: 256,
    attribution: "Planet Labs PBC",
  });
  const before = map.getLayer("overture-water") ? "overture-water" : undefined;
  map.addLayer({ id: planetLayerId, type: "raster", source: planetSourceId }, before);
}

export function setMosaicAppearance(
  map: MapLibreMap,
  options: { brightness: number; contrast: number; saturation: number; opacity: number },
): void {
  for (const year of mosaicYears) {
    const layer = `eox-basemap-${year}`;
    if (!map.getLayer(layer)) continue;
    map.setPaintProperty(layer, "raster-brightness-min", Math.max(0, options.brightness - 0.5));
    map.setPaintProperty(layer, "raster-brightness-max", Math.min(1, options.brightness + 0.5));
    map.setPaintProperty(layer, "raster-contrast", options.contrast);
    map.setPaintProperty(layer, "raster-saturation", options.saturation);
    map.setPaintProperty(layer, "raster-opacity", options.opacity);
  }
}

export function setComparisonYear(map: MapLibreMap, year: number | undefined, opacity = 0.5): void {
  for (const candidate of mosaicYears) {
    const layer = `eox-basemap-${candidate}`;
    if (!map.getLayer(layer)) continue;
    if (candidate === year) {
      map.setLayoutProperty(layer, "visibility", "visible");
      map.setPaintProperty(layer, "raster-opacity", opacity);
    }
  }
}

export function visibleReferenceLines(map: MapLibreMap, point: maplibregl.Point): number[][][] {
  return map.queryRenderedFeatures(point, { layers: ["overture-roads", "overture-water-line"] }).flatMap((feature) => {
    if (feature.geometry.type === "LineString") return [feature.geometry.coordinates as number[][]];
    if (feature.geometry.type === "MultiLineString") return feature.geometry.coordinates as number[][][];
    return [];
  });
}

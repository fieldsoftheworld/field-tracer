import type { Feature, FeatureCollection, Polygon } from "geojson";

export type FieldFeature = Feature<Polygon, { id: string; areaM2: number; valid: boolean }>;
export type FieldCollection = FeatureCollection<Polygon, { id: string; areaM2: number; valid: boolean }>;

export type TaskContext = {
  projectId: string;
  taskId: string;
  title: string;
  boundary: Feature<Polygon>;
};

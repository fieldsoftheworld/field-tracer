import type { Feature, FeatureCollection, Polygon } from "geojson";

export type ReviewReason = "boundary" | "time-window" | "natural-regrowth" | "imagery";
export type FieldProperties = {
  id: string;
  areaM2: number;
  valid: boolean;
  needsReview?: boolean;
  reviewReason?: ReviewReason;
};
export type FieldFeature = Feature<Polygon, FieldProperties>;
export type FieldCollection = FeatureCollection<Polygon, FieldProperties>;

export type TaskContext = {
  projectId: string;
  taskId: string;
  title: string;
  boundary: Feature<Polygon>;
};

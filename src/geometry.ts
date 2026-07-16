import type { Position } from "geojson";
import type { FieldCollection, FieldFeature, TaskContext } from "./types";

const EARTH_RADIUS_M = 6_378_137;
export const MIN_AREA_M2 = 400;
export const MIN_EDGE_M = 10;

function toMeters([lon, lat]: Position, origin: Position): [number, number] {
  const latScale = Math.cos((origin[1] * Math.PI) / 180);
  return [
    ((lon - origin[0]) * Math.PI * EARTH_RADIUS_M * latScale) / 180,
    ((lat - origin[1]) * Math.PI * EARTH_RADIUS_M) / 180,
  ];
}

export function polygonAreaM2(ring: Position[]): number {
  const origin = ring[0];
  const points = ring.map((point) => toMeters(point, origin));
  let sum = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    sum += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
  }
  return Math.abs(sum) / 2;
}

export function shortestEdgeM(ring: Position[]): number {
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = toMeters(ring[index], ring[0]);
    const [x2, y2] = toMeters(ring[index + 1], ring[0]);
    shortest = Math.min(shortest, Math.hypot(x2 - x1, y2 - y1));
  }
  return shortest;
}

export function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function validateField(feature: FieldFeature, task: TaskContext, existing: FieldCollection): string[] {
  const ring = feature.geometry.coordinates[0];
  const errors: string[] = [];
  const area = polygonAreaM2(ring);
  const edge = shortestEdgeM(ring);
  if (area < MIN_AREA_M2) errors.push(`area ${Math.round(area)} m² is below ${MIN_AREA_M2} m²`);
  if (edge < MIN_EDGE_M) errors.push(`shortest edge ${Math.round(edge)} m is below ${MIN_EDGE_M} m`);
  const taskRing = task.boundary.geometry.coordinates[0];
  if (ring.slice(0, -1).some((point) => !pointInRing(point, taskRing))) {
    errors.push("every polygon corner must stay inside the task boundary");
  }
  if (
    existing.features.some(
      (candidate) =>
        pointInRing(ring[0], candidate.geometry.coordinates[0]) ||
        pointInRing(candidate.geometry.coordinates[0][0], ring),
    )
  ) {
    errors.push("polygon overlaps another campaign field");
  }
  return errors;
}

export function createFieldFeature(coordinates: Position[], id: string): FieldFeature {
  const closed =
    coordinates[0] === coordinates[coordinates.length - 1] ? coordinates : [...coordinates, coordinates[0]];
  const areaM2 = polygonAreaM2(closed);
  return {
    type: "Feature",
    properties: { id, areaM2, valid: false },
    geometry: { type: "Polygon", coordinates: [closed] },
  };
}

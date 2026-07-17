import booleanValid from "@turf/boolean-valid";
import cleanCoords from "@turf/clean-coords";
import difference from "@turf/difference";
import simplify from "@turf/simplify";
import unkinkPolygon from "@turf/unkink-polygon";
import type { Position } from "geojson";
import type { FieldCollection, FieldFeature, TaskContext } from "./types";

const EARTH_RADIUS_M = 6_378_137;
export const MIN_AREA_M2 = 400;
export const MIN_EDGE_M = 10;
const CLEAN_TOLERANCE_DEGREES = 0.000002;

export function circleCoordinates(center: Position, edge: Position, segments = 48): Position[] {
  const radius = Math.hypot(...toMeters(edge, center));
  const latitudeRadians = (center[1] * Math.PI) / 180;
  const longitudeScale = Math.cos(latitudeRadians);
  const ring = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const east = Math.cos(angle) * radius;
    const north = Math.sin(angle) * radius;
    return [
      center[0] + (east * 180) / (Math.PI * EARTH_RADIUS_M * longitudeScale),
      center[1] + (north * 180) / (Math.PI * EARTH_RADIUS_M),
    ] as Position;
  });
  return [...ring, ring[0]];
}

export function rectangleCoordinates(start: Position, end: Position): Position[] {
  return [start, [end[0], start[1]], end, [start[0], end[1]], start];
}

function toMeters([lon, lat]: Position, origin: Position): [number, number] {
  const latScale = Math.cos((origin[1] * Math.PI) / 180);
  return [
    ((lon - origin[0]) * Math.PI * EARTH_RADIUS_M * latScale) / 180,
    ((lat - origin[1]) * Math.PI * EARTH_RADIUS_M) / 180,
  ];
}

export function distanceM(a: Position, b: Position): number {
  return Math.hypot(...toMeters(a, b));
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
    shortest = Math.min(shortest, distanceM(ring[index], ring[index + 1]));
  }
  return shortest;
}

// Drops points that coincide with their predecessor. A double-click to close a
// polygon fires two clicks at the same spot, which would otherwise leave a
// zero-length final edge and fail the minimum-edge check on every field.
export function dropRepeatedPoints(points: Position[], minMeters = 0.5): Position[] {
  const result: Position[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || distanceM(previous, point) >= minMeters) result.push(point);
  }
  return result;
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

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const turn = (first: Position, second: Position, third: Position) =>
    (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]);
  const abC = turn(a, b, c);
  const abD = turn(a, b, d);
  const cdA = turn(c, d, a);
  const cdB = turn(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

export function hasSelfIntersection(ring: Position[]): boolean {
  const edgeCount = ring.length - 1;
  for (let index = 0; index < edgeCount; index += 1) {
    for (let candidate = index + 1; candidate < edgeCount; candidate += 1) {
      if (candidate === index + 1 || (index === 0 && candidate === edgeCount - 1)) continue;
      if (segmentsIntersect(ring[index], ring[index + 1], ring[candidate], ring[candidate + 1])) return true;
    }
  }
  return false;
}

function ringsOverlap(first: Position[], second: Position[]): boolean {
  if (first.slice(0, -1).some((point) => pointInRing(point, second))) return true;
  if (second.slice(0, -1).some((point) => pointInRing(point, first))) return true;
  for (let index = 0; index < first.length - 1; index += 1) {
    for (let candidate = 0; candidate < second.length - 1; candidate += 1) {
      if (segmentsIntersect(first[index], first[index + 1], second[candidate], second[candidate + 1])) return true;
    }
  }
  return false;
}

export function validateField(feature: FieldFeature, task: TaskContext, existing: FieldCollection): string[] {
  const ring = feature.geometry.coordinates[0];
  const errors: string[] = [];
  const area = polygonAreaM2(ring);
  const edge = shortestEdgeM(ring);
  if (area < MIN_AREA_M2) errors.push(`area ${Math.round(area)} m² is below ${MIN_AREA_M2} m²`);
  if (edge < MIN_EDGE_M) errors.push(`shortest edge ${Math.round(edge)} m is below ${MIN_EDGE_M} m`);
  if (hasSelfIntersection(ring) || !booleanValid(feature)) errors.push("polygon crosses itself");
  const taskRing = task.boundary.geometry.coordinates[0];
  if (ring.slice(0, -1).some((point) => !pointInRing(point, taskRing))) {
    errors.push("every polygon corner must stay inside the task boundary");
  }
  if (
    existing.features.some(
      (candidate) =>
        candidate.properties.id !== feature.properties.id && ringsOverlap(ring, candidate.geometry.coordinates[0]),
    )
  ) {
    errors.push("polygon overlaps another campaign field");
  }
  return errors;
}

export function fieldWarnings(feature: FieldFeature, task: TaskContext, existing: FieldCollection): string[] {
  const warnings = validateField(feature, task, existing);
  const vertexCount = feature.geometry.coordinates[0].length - 1;
  if (vertexCount > 60) warnings.push(`${vertexCount} vertices: inspect for a rough or noisy edge`);
  return warnings;
}

export function cleanField(feature: FieldFeature): FieldFeature | undefined {
  const cleaned = cleanCoords(feature);
  const simplified = simplify(cleaned, { tolerance: CLEAN_TOLERANCE_DEGREES, highQuality: true });
  if (simplified.geometry.type !== "Polygon") return undefined;
  return createFieldFeature(simplified.geometry.coordinates[0], feature.properties.id, feature.properties);
}

export function fixSelfCrossingField(feature: FieldFeature): FieldFeature | undefined {
  const pieces = unkinkPolygon(feature);
  if (pieces.features.length !== 1 || pieces.features[0].geometry.type !== "Polygon") return undefined;
  return createFieldFeature(pieces.features[0].geometry.coordinates[0], feature.properties.id, feature.properties);
}

export function trimFieldOverlaps(feature: FieldFeature, existing: FieldCollection): FieldFeature | undefined {
  const others = existing.features.filter((candidate) => candidate.properties.id !== feature.properties.id);
  if (!others.length) return feature;
  const result = difference({ type: "FeatureCollection", features: [feature, ...others] });
  if (result?.geometry.type !== "Polygon") return undefined;
  return createFieldFeature(result.geometry.coordinates[0], feature.properties.id, feature.properties);
}

export function closestPointOnSegment(point: Position, start: Position, end: Position): Position {
  const origin = point;
  const [px, py] = toMeters(point, origin);
  const [ax, ay] = toMeters(start, origin);
  const [bx, by] = toMeters(end, origin);
  const dx = bx - ax;
  const dy = by - ay;
  const ratio =
    dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx ** 2 + dy ** 2)));
  return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
}

export function snapPoint(point: Position, rings: Position[][], toleranceM = 8): Position {
  let closest = point;
  let closestDistance = toleranceM;
  for (const ring of rings) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      for (const candidate of [ring[index], closestPointOnSegment(point, ring[index], ring[index + 1])]) {
        const candidateDistance = distanceM(point, candidate);
        if (candidateDistance < closestDistance) {
          closest = candidate;
          closestDistance = candidateDistance;
        }
      }
    }
  }
  return closest;
}

export function createFieldFeature(
  coordinates: Position[],
  id: string,
  properties: Partial<FieldFeature["properties"]> = {},
): FieldFeature {
  const closed =
    coordinates[0] === coordinates[coordinates.length - 1] ? coordinates : [...coordinates, coordinates[0]];
  const areaM2 = polygonAreaM2(closed);
  return {
    type: "Feature",
    properties: { ...properties, id, areaM2, valid: properties.valid ?? false },
    geometry: { type: "Polygon", coordinates: [closed] },
  };
}

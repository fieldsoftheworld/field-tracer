import { describe, expect, test } from "bun:test";
import type { Feature, Polygon } from "geojson";
import {
  circleCoordinates,
  cleanField,
  createFieldFeature,
  dropRepeatedPoints,
  hasSelfIntersection,
  MIN_AREA_M2,
  MIN_EDGE_M,
  polygonAreaM2,
  shortestEdgeM,
  snapPoint,
  trimFieldOverlaps,
  validateField,
} from "./geometry";
import type { FieldCollection, TaskContext } from "./types";

const taskBoundary: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-88.2, 40.2],
        [-88.1, 40.2],
        [-88.1, 40.1],
        [-88.2, 40.1],
        [-88.2, 40.2],
      ],
    ],
  },
};

const task: TaskContext = {
  projectId: "test-project",
  taskId: "test-task",
  title: "Test task",
  boundary: taskBoundary,
};
const emptyFields: FieldCollection = { type: "FeatureCollection", features: [] };

describe("field geometry", () => {
  test("calculates a positive area and shortest edge", () => {
    const field = createFieldFeature(
      [
        [-88.18, 40.18],
        [-88.175, 40.18],
        [-88.175, 40.175],
        [-88.18, 40.175],
      ],
      "field-1",
    );

    expect(polygonAreaM2(field.geometry.coordinates[0])).toBeGreaterThan(MIN_AREA_M2);
    expect(shortestEdgeM(field.geometry.coordinates[0])).toBeGreaterThan(MIN_EDGE_M);
  });

  test("creates a closed circular ring from a center and radius point", () => {
    const ring = circleCoordinates([-88.18, 40.18], [-88.175, 40.18]);

    expect(ring).toHaveLength(49);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(polygonAreaM2(ring)).toBeGreaterThan(MIN_AREA_M2);
  });

  test("drops a duplicated closing point so a double-click does not leave a zero-length edge", () => {
    // A double-click to close fires two clicks at the same spot, duplicating the last vertex.
    const drawn = [
      [-88.18, 40.18],
      [-88.175, 40.18],
      [-88.175, 40.175],
      [-88.175, 40.175],
    ];
    const cleaned = dropRepeatedPoints(drawn);
    expect(cleaned).toHaveLength(3);

    const field = createFieldFeature(cleaned, "field-1");
    expect(shortestEdgeM(field.geometry.coordinates[0])).toBeGreaterThan(MIN_EDGE_M);
    expect(validateField(field, task, emptyFields).some((error) => error.includes("shortest edge"))).toBe(false);
  });

  test("keeps distinct nearby points that form a real short edge", () => {
    const points = [
      [-88.18, 40.18],
      [-88.17999, 40.18],
      [-88.17999, 40.17999],
    ];
    expect(dropRepeatedPoints(points)).toHaveLength(3);
  });

  test("rejects a field below the minimum area", () => {
    const field = createFieldFeature(
      [
        [-88.18, 40.18],
        [-88.17995, 40.18],
        [-88.17995, 40.17995],
        [-88.18, 40.17995],
      ],
      "small-field",
    );

    expect(validateField(field, task, emptyFields).some((error) => error.includes("below 400 m²"))).toBe(true);
  });

  test("rejects a field outside the task boundary", () => {
    const field = createFieldFeature(
      [
        [-88.25, 40.25],
        [-88.245, 40.25],
        [-88.245, 40.245],
        [-88.25, 40.245],
      ],
      "outside-field",
    );

    expect(validateField(field, task, emptyFields)).toContain(
      "every polygon corner must stay inside the task boundary",
    );
  });

  test("rejects a field overlapping an existing campaign field", () => {
    const existing = createFieldFeature(
      [
        [-88.18, 40.18],
        [-88.175, 40.18],
        [-88.175, 40.175],
        [-88.18, 40.175],
      ],
      "existing-field",
    );
    const candidate = createFieldFeature(
      [
        [-88.179, 40.179],
        [-88.174, 40.179],
        [-88.174, 40.174],
        [-88.179, 40.174],
      ],
      "overlapping-field",
    );
    const existingFields: FieldCollection = { type: "FeatureCollection", features: [existing] };

    expect(validateField(candidate, task, existingFields)).toContain("polygon overlaps another campaign field");
  });

  test("detects a self-crossing field and keeps a deterministic cleanup browser-side", () => {
    const crossing = createFieldFeature(
      [
        [-88.18, 40.18],
        [-88.175, 40.175],
        [-88.175, 40.18],
        [-88.18, 40.175],
      ],
      "crossing-field",
    );

    expect(hasSelfIntersection(crossing.geometry.coordinates[0])).toBe(true);
    expect(validateField(crossing, task, emptyFields)).toContain("polygon crosses itself");
    expect(cleanField(crossing)).toBeDefined();
  });

  test("snaps a draft point to a known field edge and trims overlap only when it remains one polygon", () => {
    const existing = createFieldFeature(
      [
        [-88.18, 40.18],
        [-88.175, 40.18],
        [-88.175, 40.175],
        [-88.18, 40.175],
      ],
      "existing-field",
    );
    const candidate = createFieldFeature(
      [
        [-88.178, 40.178],
        [-88.173, 40.178],
        [-88.173, 40.173],
        [-88.178, 40.173],
      ],
      "candidate-field",
    );

    const snapped = snapPoint([-88.176, 40.177], [existing.geometry.coordinates[0]], 200);
    expect(snapped[0]).toBeCloseTo(-88.175, 5);
    const trimmed = trimFieldOverlaps(candidate, { type: "FeatureCollection", features: [existing, candidate] });
    expect(trimmed).toBeDefined();
    expect(trimmed?.properties.areaM2).toBeLessThan(candidate.properties.areaM2);
  });
});

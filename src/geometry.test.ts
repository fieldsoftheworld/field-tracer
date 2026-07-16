import { describe, expect, test } from "bun:test";
import type { Feature, Polygon } from "geojson";
import { createFieldFeature, MIN_AREA_M2, MIN_EDGE_M, polygonAreaM2, shortestEdgeM, validateField } from "./geometry";
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
});

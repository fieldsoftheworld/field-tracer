import { expect, test } from "bun:test";
import { buildChangesetXml, buildFieldOsmChange, isOauthPopupCallback } from "./osm";

test("recognizes OAuth success and error callbacks", () => {
  expect(isOauthPopupCallback("?code=abc&state=123")).toBe(true);
  expect(isOauthPopupCallback("?error=access_denied&state=123")).toBe(true);
  expect(isOauthPopupCallback("?state=123")).toBe(false);
});

test("builds a changeset with campaign metadata instead of custom field tags", () => {
  Object.assign(globalThis, {
    window: { location: { origin: "https://fieldsofthe.world", pathname: "/field-tracer/" } },
  });
  const xml = buildChangesetXml({ campaignId: "pilot-2026", projectId: "123", taskId: "task-4" });

  expect(xml).toContain('k="ftw:campaign" v="pilot-2026"');
  expect(xml).toContain('k="ftw:project" v="123"');
  expect(xml).toContain('k="ftw:task" v="task-4"');
  expect(xml).not.toContain("landuse");
});

test("builds closed farmland ways using temporary node identifiers", () => {
  const xml = buildFieldOsmChange(
    [
      {
        geometry: {
          coordinates: [
            [
              [-88.1, 40.1],
              [-88, 40.1],
              [-88, 40],
              [-88.1, 40.1],
            ],
          ],
        },
      },
    ],
    "98",
  );

  expect(xml).toContain('<node id="-1" changeset="98" lat="40.1" lon="-88.1"/>');
  expect(xml).toContain('<way id="-4" changeset="98">');
  expect(xml).toContain('<nd ref="-1"/><nd ref="-2"/><nd ref="-3"/><nd ref="-1"/>');
  expect(xml).toContain('<tag k="landuse" v="farmland"/>');
});

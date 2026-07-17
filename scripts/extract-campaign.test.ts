import { expect, test } from "bun:test";
import { campaignTag, fieldFeatures } from "./extract-campaign";

test("extracts original farmland polygons from a Field Tracer changeset download", () => {
  const xml = `<osmChange><create><node id="-1" lat="40.1" lon="-88.1"/><node id="-2" lat="40.1" lon="-88.0"/><node id="-3" lat="40.0" lon="-88.0"/><way id="-4"><nd ref="-1"/><nd ref="-2"/><nd ref="-3"/><tag k="landuse" v="farmland"/></way></create></osmChange>`;
  const features = fieldFeatures(xml, "42", "field-tracer-pilot");

  expect(features).toHaveLength(1);
  expect(features[0].properties).toEqual({
    changeset: "42",
    way_id: "-4",
    campaign: "field-tracer-pilot",
    source: "original_changeset",
  });
  expect(features[0].geometry.coordinates[0]).toEqual([
    [-88.1, 40.1],
    [-88, 40.1],
    [-88, 40],
    [-88.1, 40.1],
  ]);
});

test("reads the campaign identity from changeset metadata", () => {
  expect(campaignTag('<osm><changeset><tag k="ftw:campaign" v="field-tracer-pilot"/></changeset></osm>')).toBe(
    "field-tracer-pilot",
  );
});

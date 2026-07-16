# Agricultural Field Boundary Mapping Guidelines

Draft guidance for the Field Tracer HOT Tasking Manager project and custom editor.

## Purpose

Map missing annual-crop field boundaries from the supplied imagery. The resulting
polygons are public OpenStreetMap contributions and may be used later to validate
model predictions against independently collected human annotations.

## What to map

Map one polygon for each visually distinct field that is primarily used for annual
crops.

Include:

- Cropland planted or visibly managed for annual crops.
- Fields separated from neighboring fields by a visible boundary, access track,
  ditch, hedgerow, or other meaningful division.

Do not map:

- Pasture or permanent grassland unless the project instructions explicitly add it.
- Orchards, vineyards, plantations, or agroforestry areas.
- Greenhouses, farmyards, buildings, roads, ponds, or irrigation infrastructure.
- Areas where the imagery does not provide enough evidence to identify a field.

When uncertain, leave the area unmapped rather than guessing.

## AOI and task boundaries

- Map only inside the locked Tasking Manager task.
- Keep every polygon clipped to the task boundary.
- Do not edit or replace existing OSM farmland polygons.
- Existing OSM farmland is reference context only and is not assumed to be correct.
- Do not duplicate a field already created by this campaign. The editor should flag
  overlaps with campaign-created polygons.

Fields crossing a task boundary should follow the project’s boundary convention.
Until the project defines a different convention, map only the portion inside the
locked task and do not extend the polygon into a neighboring task.

## Geometry requirements

Initial editor thresholds:

- Minimum area: **400 m²**.
- Minimum edge length: **10 m**.
- No self-intersections, invalid rings, or zero-area polygons.
- No overlaps with other campaign-created field polygons.
- Polygon must remain within the task boundary.
- Avoid extremely narrow slivers that are not plausible field parcels.

These thresholds are provisional. They should be reviewed after the first pilot
tasks and updated in the editor and project instructions together.

The editor should show a clear validation error before upload. It should not silently
discard a mapper’s geometry.

## OSM tagging

Use the project-approved OSM tag schema. The initial proposed tag is:

```text
landuse=farmland
```

Do not add annotator identity or quality scores as feature tags. Mapper identity,
creation time, and provenance come from OSM element history and changeset metadata.

## Changesets and provenance

One mapper owns each Tasking Manager task. A single changeset per task is preferred,
but multiple changesets are acceptable if every changeset includes the project and
task identifiers.

Use a deterministic changeset comment format:

```text
#fields-of-the-world #hotosm-project-<PROJECT_ID> task-<TASK_ID> annual-crop-fields
```

The editor must:

- Prevent unrelated edits from being uploaded with field annotations.
- Display the created changeset link after upload.
- Preserve the project and task identifiers in every upload.
- Provide a clear link back to the Tasking Manager task.

## Review and filtering

Tasking Manager is the source of truth for mapped, validated, and invalidated task
status. The custom editor does not maintain a parallel review database.

The downstream extraction workflow should be able to filter by:

- HOT project and task identifier.
- Task validation status.
- OSM changeset and element history.
- Original mapper username.
- Approved or excluded mapper lists.
- Geometry and area thresholds.

Validators may review contributions through Tasking Manager. Any validator edits
must remain distinguishable from the original mapper contribution through OSM
history.

## Imagery

The initial default is the EOX Sentinel-2 cloudless basemap, with required provider
attribution shown in the editor.

If enabled later, Planet Basemaps may be offered as an optional user-provided layer.
Planet API keys must remain session-only, must not be persisted or placed in URLs,
and must be used only after confirming browser/CORS and provider-policy support.

Imagery can be cloudy, outdated, or ambiguous. Mappers should leave uncertain areas
unmapped and use the project instructions to report systematic imagery problems.

## Upload workflow

1. Lock a task in HOT Tasking Manager.
2. Open the Field Tracer custom editor.
3. Confirm the displayed task boundary and imagery.
4. Review reference context without editing existing farmland.
5. Draw and validate annual-crop field polygons.
6. Authenticate with OpenStreetMap.
7. Upload the field polygons in a tagged changeset.
8. Confirm the changeset link and upload result.
9. Return to Tasking Manager.
10. Mark the task mapped so an approved validator can review it.

## Open questions for the pilot

- Confirm the final OSM tag schema with the project manager and OSM community.
- Confirm whether fields crossing task boundaries are clipped or assigned to one task.
- Review the 400 m² and 10 m thresholds after pilot annotation.
- Define the compactness/sliver rule.
- Define the accepted mapper list and exclusion process.
- Confirm the exact Tasking Manager custom-editor URL/context contract.

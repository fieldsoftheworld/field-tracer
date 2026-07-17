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

For approximately circular fields, choose **Circle** in the shape selector and drag
from the field center to its edge. The editor converts the result to a regular
polygon before applying the same area, edge, boundary, and overlap checks. Use
Polygon mode when the field is not genuinely circular or has a meaningful irregular
edge.

Use **Rectangle** only where four straight boundaries are genuinely visible. It is a
faster starting geometry, not permission to square off an irregular field.

## Editing safeguards

- While drawing, use **Undo point** or `⌘/Ctrl+Z` to remove the most recent point.
- Use **Cancel** or `Escape` to discard the current unfinished polygon.
- Click a completed field to select it, then use **Remove selected field** or
  `Delete`/`Backspace` to remove it before upload.
- **Undo last field** is a shortcut for removing the most recently completed field.
- In **Move or insert vertices** mode, drag a visible handle to refine a corner or
  click a field edge to add one. Select the resulting handle, then use **Delete
  vertex** to remove it. Snapping can align points to the task boundary and
  campaign-created fields; inspect every snapped point against the imagery.
- **Clean geometry** removes duplicate/noisy coordinates and applies an intentionally
  tiny simplification. **Repair crossing** is allowed only when it yields one field.
  **Trim overlap** is allowed only when it leaves one continuous field. Each action
  replaces the highlighted local geometry and must be visually checked before upload.
- **Split selected field with a line** is for a clearly visible internal boundary.
  Draw a line all the way across the selected field; the editor creates two polygons
  only when both meet the normal field checks. Do not merge distinct fields merely
  because they touch. **Merge with another traced field** is only for correcting an
  accidental split of one visually continuous field; it never operates on existing
  OSM farmland.
- Removing a field only changes the current browser session; nothing is sent to OSM
  until upload is explicitly completed.

## Review flags and imagery checks

- Before submitting, compare a second time window and inspect NIR or another
  available imagery source when possible. Use the wider task context to avoid
  mistaking a local texture or harvest event for a field boundary.
- A mapper can select a field and mark it **Needs review**, with a local reason
  such as unclear boundary, conflicting time windows, natural regrowth, or an
  imagery problem. This is review metadata for the annotation workflow, not an
  OSM tag and not a substitute for HOT Tasking Manager validation.
- The Sentinel-2 **Mosaic year** slider switches between annual EOX cloudless
  mosaics. It is a year-level comparison, not a single acquisition date; dates may
  vary within each mosaic.
- **Blend a second mosaic year** and **Flicker comparison** make temporal changes
  easier to inspect. Brightness, contrast, and saturation controls are display-only;
  they never modify source imagery or field coordinates.
- Optional Overture roads, waterways, and buildings are reference geometry only.
  They can help explain an edge or obstacle but must not be copied automatically or
  treated as authoritative field boundaries. Mappers can opt into snapping to
  visible Overture roads and waterways, then must confirm the snapped edge in the
  imagery before upload.
- The in-app guide summarizes the current WRI × ASU standards. Project-specific
  Tasking Manager instructions take precedence.

The editor also includes a condensed interactive decision workflow and a
scrollable visual example deck. The examples are curated from the WRI × ASU
annotation discussion slides and focus on boundary ambiguity, NIR, roads, fire
and mining, natural regrowth, plantations, and splitting decisions.

The first-run tutorial also includes three locally packaged WebM walkthroughs:
many-vertex tracing, a Paraguay boundary annotation, and field splitting. It
can be skipped, will not reopen automatically after the mapper chooses not to
see it again, and remains available from the bottom-right information button.

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

Field Tracer also writes the stable campaign/task identifiers as **changeset** tags:

```text
ftw:campaign=<campaign id>
ftw:project=<project id>
ftw:task=<task id>
```

Do not add those identifiers to individual field ways. They describe the editing
workflow rather than the real-world field, and OSM editors may remove workflow-like
feature tags. The changeset is the durable campaign receipt.

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

OSM data can be improved, modified, or deleted by any editor acting under normal OSM
rules. Deletion does not erase element history, and the campaign extractor preserves
the geometry originally submitted in the tagged changeset. Treat the original
changeset geometry as the label receipt, and a current OSM lookup as a separate
"latest map state" product.

Use **Review task before upload** to surface local geometry warnings, then inspect
coverage and ambiguity. **Mark task reviewed — no fields visible** records an
explicit local decision for an empty task; the mapper must still set the actual task
status in Tasking Manager.

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

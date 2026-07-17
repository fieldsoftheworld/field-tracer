type NodeRecord = { id: string; lon: number; lat: number };
type FieldRecord = {
  type: "Feature";
  properties: { changeset: string; way_id: string; campaign: string; source: "original_changeset" };
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? undefined : Bun.argv[index + 1];
}

function values(name: string): string[] {
  return Bun.argv.flatMap((argument, index) => (argument === name ? [Bun.argv[index + 1]] : [])).filter(Boolean);
}

function attributes(fragment: string): Record<string, string> {
  return Object.fromEntries([...fragment.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function createdSection(xml: string): string {
  return xml.match(/<create>([\s\S]*?)<\/create>/)?.[1] ?? "";
}

export function fieldFeatures(xml: string, changeset: string, campaign: string): FieldRecord[] {
  const created = createdSection(xml);
  const nodes = new Map<string, NodeRecord>();
  for (const match of created.matchAll(/<node\b([^>]*?)\/?>(?:<\/node>)?/g)) {
    const attrs = attributes(match[1]);
    if (attrs.id && attrs.lon && attrs.lat)
      nodes.set(attrs.id, { id: attrs.id, lon: Number(attrs.lon), lat: Number(attrs.lat) });
  }
  const fields: FieldRecord[] = [];
  for (const match of created.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const attrs = attributes(match[1]);
    const contents = match[2];
    const isFarmland = /<tag\s+[^>]*k="landuse"[^>]*v="farmland"/.test(contents);
    if (!attrs.id || !isFarmland) continue;
    const coordinates = [...contents.matchAll(/<nd\s+[^>]*ref="([^"]+)"[^>]*\/>/g)]
      .map((node) => nodes.get(node[1]))
      .filter((node): node is NodeRecord => Boolean(node))
      .map((node) => [node.lon, node.lat]);
    if (coordinates.length < 3) continue;
    fields.push({
      type: "Feature",
      properties: { changeset, way_id: attrs.id, campaign, source: "original_changeset" },
      geometry: { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] },
    });
  }
  return fields;
}

export function campaignTag(xml: string): string | undefined {
  return xml.match(/<tag\s+[^>]*k="ftw:campaign"[^>]*v="([^"]+)"/)?.[1];
}

async function main(): Promise<void> {
  const campaign = option("--campaign");
  const output = option("--output") ?? "field-tracer-campaign.geojson";
  const changesets = values("--changeset");
  if (!campaign || !changesets.length) {
    throw new Error(
      "Usage: bun scripts/extract-campaign.ts --campaign <id> --changeset <id> [--changeset <id>] [--output file.geojson]",
    );
  }
  const features: FieldRecord[] = [];
  for (const changeset of changesets) {
    const metadata = await fetch(`https://www.openstreetmap.org/api/0.6/changeset/${changeset}`);
    if (!metadata.ok) throw new Error(`Could not read changeset ${changeset} metadata (${metadata.status}).`);
    if (campaignTag(await metadata.text()) !== campaign) {
      throw new Error(`Changeset ${changeset} is not tagged ftw:campaign=${campaign}.`);
    }
    const response = await fetch(`https://www.openstreetmap.org/api/0.6/changeset/${changeset}/download`);
    if (!response.ok) throw new Error(`Could not download changeset ${changeset} (${response.status}).`);
    features.push(...fieldFeatures(await response.text(), changeset, campaign));
  }
  await Bun.write(output, JSON.stringify({ type: "FeatureCollection", features }, null, 2));
  console.log(`Wrote ${features.length} original field polygon${features.length === 1 ? "" : "s"} to ${output}`);
}

if (import.meta.main) void main();

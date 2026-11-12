interface SpacecraftModel {
  slug: string;
  name: string;
  noradIds: readonly number[];
  spanMeters?: number;
}

export const spacecraftModels: readonly SpacecraftModel[] = [
  { slug: 'iss', name: 'International Space Station', noradIds: [25544], spanMeters: 109 },
  { slug: 'aqua', name: 'Aqua', noradIds: [27424], spanMeters: 16.7 },
  { slug: 'suomi-npp', name: 'Suomi NPP', noradIds: [37849], spanMeters: 9 },
];

export const spacecraftModelByNoradId = new Map(
  spacecraftModels.flatMap((model) => model.noradIds.map((id) => [id, model] as const)),
);

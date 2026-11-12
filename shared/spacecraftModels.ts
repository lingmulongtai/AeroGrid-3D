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
  { slug: 'aura', name: 'Aura', noradIds: [28376] },
  { slug: 'chandra', name: 'Chandra X-ray Observatory', noradIds: [25867] },
  { slug: 'fermi', name: 'Fermi Gamma-ray Space Telescope', noradIds: [33053] },
  { slug: 'gpm', name: 'Global Precipitation Measurement (GPM) Core Observatory', noradIds: [39574] },
  { slug: 'hinode', name: 'Hinode (Solar-B)', noradIds: [29479] },
  { slug: 'hubble', name: 'Hubble Space Telescope', noradIds: [20580] },
  { slug: 'icesat-2', name: 'ICESat-2', noradIds: [43613] },
  { slug: 'landsat-8', name: 'Landsat 8', noradIds: [39084] },
  { slug: 'mms', name: 'Magnetospheric Multiscale (MMS)', noradIds: [40482, 40483, 40484, 40485], spanMeters: 120 },
  { slug: 'oco-2', name: 'Orbiting Carbon Observatory (OCO-2)', noradIds: [40059] },
  { slug: 'polar', name: 'Polar', noradIds: [23802], spanMeters: 130 },
  { slug: 'sdo', name: 'Solar Dynamics Observatory (SDO)', noradIds: [36395] },
  { slug: 'sentinel-6', name: 'Sentinel-6 (Jason-CS)', noradIds: [46984, 66514] },
  { slug: 'sorce', name: 'Solar Radiation and Climate Experiment (SORCE)', noradIds: [27651] },
  { slug: 'swas', name: 'Submillimeter Wave Astronomy Satellite (SWAS)', noradIds: [25560] },
  { slug: 'tess', name: 'Transiting Exoplanet Survey Satellite (TESS)', noradIds: [43435] },
  { slug: 'themis', name: 'THEMIS', noradIds: [30580, 30797, 30798], spanMeters: 50 },
];

export const spacecraftModelByNoradId = new Map(
  spacecraftModels.flatMap((model) => model.noradIds.map((id) => [id, model] as const)),
);

import {
  BoundingSphere,
  BillboardCollection,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  HeadingPitchRoll,
  Material,
  Math as CesiumMath,
  Matrix4,
  PerInstanceColorAppearance,
  PointPrimitiveCollection,
  PolylineCollection,
  Primitive,
  PrimitiveCollection,
  PrimitiveType,
  Transforms,
  VerticalOrigin,
  type Viewer,
  type PointPrimitive,
} from 'cesium';
import type {FlightRecord} from '../../../shared/contracts';
import {MAJOR_AIRPORTS} from '../../data/airports';
import {
  getSatelliteOrbitPath,
  getSatellitePreview,
  type SatelliteCategory,
  type SatellitePreviewRecord,
} from '../../data/satellites';
import {getCategoryScale, getFlightColor} from '../../utils/flightUtils';
import {
  createAircraftMeshParts,
  createSatelliteMeshData,
  type ProceduralMeshData,
} from '../layers/modelGeometries';

export type FlightColorMode = 'altitude' | 'speed' | 'category';
export type AircraftLod = 'points' | 'billboards' | 'models';

export const AIRCRAFT_LOD_LIMITS = {
  modelMaximumHeight: 5_000_000,
  billboardMaximumHeight: 9_000_000,
  selectedModelMaximumHeight: 12_000_000,
} as const;

export function aircraftLodForHeight(cameraHeight: number): AircraftLod {
  if (cameraHeight <= AIRCRAFT_LOD_LIMITS.modelMaximumHeight) return 'models';
  if (cameraHeight <= AIRCRAFT_LOD_LIMITS.billboardMaximumHeight) return 'billboards';
  return 'points';
}

function polylineMaterial(color: Color) {
  return Material.fromType(Material.ColorType, {color});
}

function createGeometry(mesh: ProceduralMeshData) {
  const positions = new Float64Array(mesh.vertices);
  return new Geometry({
    attributes: {
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      normal: new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: new Float32Array(mesh.normals),
      }),
    } as GeometryAttributes,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  });
}

function modelMatrixForFlight(
  flight: FlightRecord,
  cameraHeight: number,
  emphasis = 1,
) {
  const position = Cartesian3.fromDegrees(
    flight.longitude,
    flight.latitude,
    Math.max(20, flight.altitude),
  );
  const verticalPitch = CesiumMath.toRadians(
    Math.max(-10, Math.min(10, flight.verticalRate * 1.15)),
  );
  const matrix = Transforms.headingPitchRollToFixedFrame(
    position,
    new HeadingPitchRoll(CesiumMath.toRadians(-flight.heading), verticalPitch, 0),
  );
  const [categoryScale] = getCategoryScale(flight.category);
  // A proportional screen-size scale preserves the recognizable airframe
  // silhouette while remaining deliberately stylized instead of pretending
  // to be physically sized at regional and orbital distances.
  const visibilityScale = Math.max(2.4, Math.min(420, cameraHeight / 7_500));
  Matrix4.multiplyByUniformScale(
    matrix,
    visibilityScale * Math.sqrt(categoryScale / 2) * emphasis,
    matrix,
  );
  return matrix;
}

function createAircraftPartPrimitive({
  flights,
  mesh,
  color,
  cameraHeight,
  flat = false,
  emphasis = 1,
}: {
  flights: FlightRecord[];
  mesh: ProceduralMeshData;
  color: Color | ((flight: FlightRecord) => Color);
  cameraHeight: number;
  flat?: boolean;
  emphasis?: number;
}) {
  const geometry = createGeometry(mesh);
  const instances = flights.map((flight) => new GeometryInstance({
    id: flight,
    geometry,
    modelMatrix: modelMatrixForFlight(flight, cameraHeight, emphasis),
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(
        typeof color === 'function' ? color(flight) : color,
      ),
    },
  }));

  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({
      closed: true,
      flat,
      translucent: false,
    }),
    allowPicking: true,
    asynchronous: false,
  });
}

function flightColor(flight: FlightRecord, colorMode: FlightColorMode) {
  const [red, green, blue] = getFlightColor(
    colorMode,
    flight.altitude,
    flight.velocity,
    flight.category,
  );
  return Color.fromBytes(red, green, blue, 255);
}

function airframeColor(flight: FlightRecord, colorMode: FlightColorMode) {
  // Keep the selected metric as a subtle livery tint instead of painting the
  // entire aircraft in a toy-like neon color.
  return Color.lerp(flightColor(flight, colorMode), Color.WHITE, 0.72, new Color());
}

function createAircraftModels(
  flights: FlightRecord[],
  colorMode: FlightColorMode,
  cameraHeight: number,
  emphasis = 1,
) {
  const collection = new PrimitiveCollection({destroyPrimitives: true});
  if (flights.length === 0) return collection;
  const parts = createAircraftMeshParts();
  collection.add(createAircraftPartPrimitive({
    flights,
    mesh: parts.airframe,
    color: (flight) => airframeColor(flight, colorMode),
    cameraHeight,
    emphasis,
  }));
  collection.add(createAircraftPartPrimitive({
    flights,
    mesh: parts.engines,
    color: Color.fromBytes(54, 64, 76, 255),
    cameraHeight,
    emphasis,
  }));
  collection.add(createAircraftPartPrimitive({
    flights,
    mesh: parts.glazing,
    color: Color.fromBytes(14, 45, 67, 255),
    cameraHeight,
    emphasis,
  }));
  collection.add(createAircraftPartPrimitive({
    flights,
    mesh: parts.portLight,
    color: Color.fromBytes(255, 55, 72, 255),
    cameraHeight,
    flat: true,
    emphasis,
  }));
  collection.add(createAircraftPartPrimitive({
    flights,
    mesh: parts.starboardLight,
    color: Color.fromBytes(54, 255, 157, 255),
    cameraHeight,
    flat: true,
    emphasis,
  }));
  return collection;
}

let aircraftMarker: HTMLCanvasElement | null = null;

function getAircraftMarker() {
  if (aircraftMarker) return aircraftMarker;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.translate(32, 32);
  context.shadowColor = 'rgba(0, 0, 0, .8)';
  context.shadowBlur = 5;
  context.fillStyle = '#fff';
  context.beginPath();
  context.moveTo(0, -28);
  context.bezierCurveTo(4, -23, 5, -13, 5, -6);
  context.lineTo(25, 8);
  context.lineTo(25, 13);
  context.lineTo(5, 7);
  context.lineTo(4, 20);
  context.lineTo(12, 26);
  context.lineTo(12, 29);
  context.lineTo(0, 25);
  context.lineTo(-12, 29);
  context.lineTo(-12, 26);
  context.lineTo(-4, 20);
  context.lineTo(-5, 7);
  context.lineTo(-25, 13);
  context.lineTo(-25, 8);
  context.lineTo(-5, -6);
  context.bezierCurveTo(-5, -13, -4, -23, 0, -28);
  context.fill();
  aircraftMarker = canvas;
  return canvas;
}

function addAircraftMarkers(
  collection: PrimitiveCollection,
  flights: FlightRecord[],
  colorMode: FlightColorMode,
  lod: Exclude<AircraftLod, 'models'>,
) {
  if (lod === 'points') {
    const points = new PointPrimitiveCollection();
    for (const flight of flights) {
      const [red, green, blue] = getFlightColor(
        colorMode,
        flight.altitude,
        flight.velocity,
        flight.category,
      );
      const [categoryScale] = getCategoryScale(flight.category);
      points.add({
        id: flight,
        position: Cartesian3.fromDegrees(flight.longitude, flight.latitude, Math.max(20, flight.altitude)),
        color: Color.fromBytes(red, green, blue, 245),
        outlineColor: Color.fromBytes(2, 8, 16, 225),
        outlineWidth: 1,
        pixelSize: 3.5 + Math.sqrt(categoryScale),
      });
    }
    collection.add(points);
    return;
  }

  const billboards = new BillboardCollection();
  const image = getAircraftMarker();
  for (const flight of flights) {
    const [red, green, blue] = getFlightColor(
      colorMode,
      flight.altitude,
      flight.velocity,
      flight.category,
    );
    const [categoryScale] = getCategoryScale(flight.category);
    const size = Math.round(18 + Math.sqrt(categoryScale) * 5);
    billboards.add({
      id: flight,
      image,
      position: Cartesian3.fromDegrees(flight.longitude, flight.latitude, Math.max(20, flight.altitude)),
      color: Color.fromBytes(red, green, blue, 245),
      width: size,
      height: size,
      rotation: CesiumMath.toRadians(-flight.heading),
      verticalOrigin: VerticalOrigin.CENTER,
      disableDepthTestDistance: 100_000,
    });
  }
  collection.add(billboards);
}

function nearestFlights(viewer: Viewer, flights: FlightRecord[], maximum: number) {
  const cameraPosition = viewer.camera.positionWC;
  return flights
    .map((flight) => ({
      flight,
      distance: Cartesian3.distance(
        cameraPosition,
        Cartesian3.fromDegrees(flight.longitude, flight.latitude, Math.max(20, flight.altitude)),
      ),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, maximum)
    .map(({flight}) => flight);
}

function addTrails(collection: PrimitiveCollection, flights: FlightRecord[]) {
  const trails = new PolylineCollection();
  for (const flight of flights) {
    if (flight.positionHistory.length < 2) continue;
    const [red, green, blue] = getFlightColor('altitude', flight.altitude, flight.velocity, flight.category);
    trails.add({
      positions: flight.positionHistory.map(([longitude, latitude, altitude]) =>
        Cartesian3.fromDegrees(longitude, latitude, Math.max(20, altitude))),
      width: 1.35,
      material: polylineMaterial(Color.fromBytes(red, green, blue, 110)),
    });
  }
  collection.add(trails);
}

function addAirports(collection: PrimitiveCollection, showLabels: boolean) {
  const points = new PointPrimitiveCollection();
  for (const airport of MAJOR_AIRPORTS) {
    points.add({
      id: {kind: 'airport', airport},
      position: Cartesian3.fromDegrees(airport.longitude, airport.latitude, 40),
      color: Color.fromBytes(114, 221, 255, 190),
      outlineColor: Color.fromBytes(3, 10, 20, 220),
      outlineWidth: 1,
      pixelSize: showLabels ? 6 : 4,
    });
  }
  collection.add(points);
}

function addSelection(collection: PrimitiveCollection, selectedFlight: FlightRecord) {
  const selection = new PointPrimitiveCollection();
  selection.add({
    position: Cartesian3.fromDegrees(
      selectedFlight.longitude,
      selectedFlight.latitude,
      Math.max(20, selectedFlight.altitude),
    ),
    color: Color.TRANSPARENT,
    outlineColor: Color.WHITE,
    outlineWidth: 3,
    pixelSize: 58,
    disableDepthTestDistance: 150_000,
  });
  collection.add(selection);
}

export function installSceneContent({
  viewer,
  flights,
  colorMode,
  showFlights,
  showTrails,
  showAirports,
  showLabels,
  cameraHeight,
  maximumDetailedAircraft,
  selectedFlightId,
}: {
  viewer: Viewer;
  flights: FlightRecord[];
  colorMode: FlightColorMode;
  showFlights: boolean;
  showTrails: boolean;
  showAirports: boolean;
  showLabels: boolean;
  cameraHeight: number;
  maximumDetailedAircraft: number;
  selectedFlightId: string | null;
}) {
  const collection = new PrimitiveCollection({destroyPrimitives: true});
  viewer.scene.primitives.add(collection);

  if (showTrails) addTrails(collection, flights);
  if (showFlights && flights.length > 0) {
    const unselectedFlights = selectedFlightId
      ? flights.filter((flight) => flight.id !== selectedFlightId)
      : flights;
    const lod = aircraftLodForHeight(cameraHeight);
    if (lod === 'models') {
      const modelLimit = cameraHeight < 200_000
        ? Math.min(36, maximumDetailedAircraft)
        : maximumDetailedAircraft;
      const nearby = nearestFlights(
        viewer,
        unselectedFlights,
        Math.max(120, modelLimit * 5),
      );
      const detailed = nearby.slice(0, modelLimit);
      const overview = nearby.slice(modelLimit);
      if (overview.length > 0) addAircraftMarkers(collection, overview, colorMode, 'points');
      collection.add(createAircraftModels(detailed, colorMode, cameraHeight));
    } else {
      // Preserve the complete dataset for search and selection, but keep the
      // orbital scene legible. Rendering every demo record at once turns the
      // globe into visual noise and wastes GPU fill rate.
      const visibleLimit = lod === 'billboards'
        ? Math.max(160, maximumDetailedAircraft * 4)
        : Math.max(420, maximumDetailedAircraft * 10);
      addAircraftMarkers(
        collection,
        nearestFlights(viewer, unselectedFlights, visibleLimit),
        colorMode,
        lod,
      );
    }
  }
  if (showAirports) addAirports(collection, showLabels);
  viewer.scene.requestRender();

  return () => {
    if (!viewer.isDestroyed() && viewer.scene.primitives.contains(collection)) {
      viewer.scene.primitives.remove(collection);
    }
  };
}

export function installFlightSelection(
  viewer: Viewer,
  selectedFlight: FlightRecord | null,
  colorMode: FlightColorMode,
  cameraHeight: number,
) {
  if (!selectedFlight) return () => undefined;
  const collection = new PrimitiveCollection({destroyPrimitives: true});
  viewer.scene.primitives.add(collection);
  if (cameraHeight < AIRCRAFT_LOD_LIMITS.selectedModelMaximumHeight) {
    collection.add(createAircraftModels([selectedFlight], colorMode, cameraHeight, 5.2));
  }
  addSelection(collection, selectedFlight);
  viewer.scene.requestRender();

  return () => {
    if (!viewer.isDestroyed() && viewer.scene.primitives.contains(collection)) {
      viewer.scene.primitives.remove(collection);
    }
  };
}

function satelliteColor(category: SatelliteCategory) {
  switch (category) {
    case 'station': return Color.fromBytes(255, 223, 148, 255);
    case 'earth-observation': return Color.fromBytes(113, 225, 255, 255);
    case 'navigation': return Color.fromBytes(174, 149, 255, 255);
    case 'communications': return Color.fromBytes(102, 255, 190, 255);
  }
}

function modelMatrixForSatellite(satellite: SatellitePreviewRecord, cameraHeight: number) {
  const position = Cartesian3.fromDegrees(
    satellite.longitude,
    satellite.latitude,
    satellite.altitude,
  );
  const matrix = Transforms.headingPitchRollToFixedFrame(
    position,
    new HeadingPitchRoll(CesiumMath.toRadians(-satellite.heading), 0, 0),
  );
  const scale = Math.max(120, Math.min(5_000, cameraHeight / 3_500));
  Matrix4.multiplyByUniformScale(matrix, scale, matrix);
  return matrix;
}

function createSatellitePrimitive(satellite: SatellitePreviewRecord, cameraHeight: number) {
  return new Primitive({
    geometryInstances: new GeometryInstance({
      id: {kind: 'satellite-preview', satellite},
      geometry: createGeometry(createSatelliteMeshData()),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(satelliteColor(satellite.category)),
      },
    }),
    appearance: new PerInstanceColorAppearance({
      closed: false,
      flat: false,
      translucent: false,
    }),
    modelMatrix: modelMatrixForSatellite(satellite, cameraHeight),
    allowPicking: true,
    asynchronous: false,
  });
}

export function installSatellitePreview(viewer: Viewer, cameraHeight: number) {
  const collection = new PrimitiveCollection({destroyPrimitives: true});
  const paths = new PolylineCollection();
  const points = new PointPrimitiveCollection();
  const epoch = Date.now();
  const satellites = getSatellitePreview(epoch);
  const models = new Map<string, Primitive>();
  const markers = new Map<string, PointPrimitive>();

  for (const satellite of satellites) {
    paths.add({
      positions: getSatelliteOrbitPath(satellite, epoch).map(([longitude, latitude, altitude]) =>
        Cartesian3.fromDegrees(longitude, latitude, altitude)),
      width: satellite.category === 'station' ? 1.1 : 0.65,
      material: polylineMaterial(satelliteColor(satellite.category).withAlpha(
        satellite.category === 'station' ? 0.34 : 0.14,
      )),
    });
    const model = createSatellitePrimitive(satellite, cameraHeight);
    models.set(satellite.id, model);
    collection.add(model);
    markers.set(satellite.id, points.add({
      position: Cartesian3.fromDegrees(satellite.longitude, satellite.latitude, satellite.altitude),
      color: satelliteColor(satellite.category),
      outlineColor: Color.fromBytes(2, 7, 14, 230),
      outlineWidth: 1,
      pixelSize: satellite.category === 'station' ? 4 : 2,
    }));
  }
  collection.add(paths);
  collection.add(points);
  viewer.scene.primitives.add(collection);
  viewer.scene.requestRender();

  const interval = window.setInterval(() => {
    if (viewer.isDestroyed()) return;
    for (const satellite of getSatellitePreview(Date.now())) {
      const model = models.get(satellite.id);
      if (model) model.modelMatrix = modelMatrixForSatellite(satellite, cameraHeight);
      const marker = markers.get(satellite.id);
      if (marker) {
        marker.position = Cartesian3.fromDegrees(
          satellite.longitude,
          satellite.latitude,
          satellite.altitude,
        );
      }
    }
    viewer.scene.requestRender();
  }, 1_000);

  return () => {
    window.clearInterval(interval);
    if (!viewer.isDestroyed() && viewer.scene.primitives.contains(collection)) {
      viewer.scene.primitives.remove(collection);
    }
  };
}

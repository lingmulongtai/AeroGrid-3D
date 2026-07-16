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
} from 'cesium';
import type {FlightRecord} from '../../../shared/contracts';
import {MAJOR_AIRPORTS} from '../../data/airports';
import {getCategoryScale, getFlightColor} from '../../utils/flightUtils';
import {createAircraftMeshData} from '../layers/modelGeometries';

export type FlightColorMode = 'altitude' | 'speed' | 'category';

function createAircraftGeometry() {
  const {vertices, normals} = createAircraftMeshData();
  const positions = new Float64Array(vertices);
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
        values: new Float32Array(normals),
      }),
    } as GeometryAttributes,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  });
}

function modelMatrixForFlight(flight: FlightRecord, cameraHeight: number) {
  const position = Cartesian3.fromDegrees(flight.longitude, flight.latitude, Math.max(20, flight.altitude));
  const verticalPitch = CesiumMath.toRadians(Math.max(-10, Math.min(10, flight.verticalRate * 1.15)));
  const matrix = Transforms.headingPitchRollToFixedFrame(
    position,
    new HeadingPitchRoll(CesiumMath.toRadians(-flight.heading), verticalPitch, 0),
  );
  const [categoryScale] = getCategoryScale(flight.category);
  const visibilityScale = Math.max(1, Math.min(250, cameraHeight / 95_000));
  Matrix4.multiplyByUniformScale(matrix, visibilityScale * Math.sqrt(categoryScale / 2), matrix);
  return matrix;
}

function createAircraftPrimitive(
  flights: FlightRecord[],
  colorMode: FlightColorMode,
  cameraHeight: number,
) {
  const geometry = createAircraftGeometry();
  const instances = flights.map((flight) => {
    const [red, green, blue] = getFlightColor(
      colorMode,
      flight.altitude,
      flight.velocity,
      flight.category,
    );
    return new GeometryInstance({
      id: flight,
      geometry,
      modelMatrix: modelMatrixForFlight(flight, cameraHeight),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(Color.fromBytes(red, green, blue, 255)),
      },
    });
  });

  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({
      closed: true,
      flat: false,
      translucent: false,
    }),
    allowPicking: true,
    // This is a custom in-memory mesh rather than one of Cesium's worker-backed
    // geometry types, so it must be combined on the render thread.
    asynchronous: false,
  });
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
  cameraHeight: number,
) {
  if (cameraHeight > 4_000_000) {
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
        disableDepthTestDistance: 2_000_000,
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
      disableDepthTestDistance: 2_000_000,
    });
  }
  collection.add(billboards);
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
      material: Color.fromBytes(red, green, blue, 110),
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
      disableDepthTestDistance: 3_000_000,
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
    pixelSize: 28,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
}: {
  viewer: Viewer;
  flights: FlightRecord[];
  colorMode: FlightColorMode;
  showFlights: boolean;
  showTrails: boolean;
  showAirports: boolean;
  showLabels: boolean;
  cameraHeight: number;
}) {
  const collection = new PrimitiveCollection({destroyPrimitives: true});
  viewer.scene.primitives.add(collection);

  if (showTrails) addTrails(collection, flights);
  if (showFlights && flights.length > 0) {
    addAircraftMarkers(collection, flights, colorMode, cameraHeight);
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
  // Switch from the screen-space overview marker to the detailed 3D airframe
  // only when it is large enough to read. Building mesh geometry in orbital
  // view wastes GPU time without adding visible detail.
  if (cameraHeight < 2_000_000) {
    collection.add(createAircraftPrimitive([selectedFlight], colorMode, cameraHeight));
  }
  addSelection(collection, selectedFlight);
  viewer.scene.requestRender();

  return () => {
    if (!viewer.isDestroyed() && viewer.scene.primitives.contains(collection)) {
      viewer.scene.primitives.remove(collection);
    }
  };
}

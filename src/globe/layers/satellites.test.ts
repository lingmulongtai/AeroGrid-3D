import { BufferGeometry, Group, Line, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildConstellation } from '../../data/satellites';
import * as satelliteModels from '../satelliteModels';
import { SatelliteLayer } from './satellites';

describe('satellite trail visibility', () => {
  it('toggles both recent trails and the selected orbit without hiding stations', () => {
    const layer = new SatelliteLayer();
    layer.setConstellation(buildConstellation(2));
    layer.selectedId = 'iss';
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 20_000);
    const update = () => layer.update(Date.UTC(2026, 9, 13), 0, camera, new Vector3(), 1000);
    update();
    const trails = layer.group.children.find((child) => child instanceof LineSegments)!;
    const orbit = layer.group.children.find((child) => child instanceof Line && !(child instanceof LineSegments))!;
    expect(trails.visible).toBe(true);
    expect(orbit.visible).toBe(true);
    layer.showTrails = false;
    update();
    expect(trails.visible).toBe(false);
    expect(orbit.visible).toBe(false);
    expect(layer.pickIds).toContain('iss');
    layer.showTrails = true;
    update();
    expect(orbit.visible).toBe(true);
    layer.dispose();
  });
});

it('releases obsolete detailed models when selection or visibility changes', async () => {
  const issModel = new Group();
  const aquaModel = new Group();
  const issDisposed = vi.fn();
  const aquaDisposed = vi.fn();
  for (const [model, listener] of [[issModel, issDisposed], [aquaModel, aquaDisposed]] as const) {
    const geometry = new BufferGeometry();
    geometry.addEventListener('dispose', listener);
    model.add(new Mesh(geometry, new MeshStandardMaterial()));
  }
  let finishIss!: (model: Group) => void;
  const pendingIss = new Promise<Group>((resolve) => { finishIss = resolve; });
  const loader = vi.spyOn(satelliteModels, 'loadSatelliteModel')
    .mockReturnValueOnce(pendingIss)
    .mockResolvedValueOnce(aquaModel);
  const layer = new SatelliteLayer();
  try {
    const [iss] = buildConstellation(1);
    layer.setConstellation([iss, { ...iss, id: 'norad-27424', model: 'satellite' }]);
    const camera = new PerspectiveCamera();
    const update = () => layer.update(Date.UTC(2026, 9, 13), 0, camera, new Vector3(), 1000);

    layer.selectedId = iss.id;
    update();
    layer.selectedId = 'norad-27424';
    update();
    await Promise.resolve();
    expect(aquaModel.parent).not.toBeNull();

    finishIss(issModel);
    await Promise.resolve();
    expect(issModel.parent).toBeNull();
    expect(issDisposed).toHaveBeenCalledOnce();
    expect(aquaDisposed).not.toHaveBeenCalled();

    layer.visible = false;
    update();
    expect(aquaModel.parent).toBeNull();
    expect(aquaDisposed).toHaveBeenCalledOnce();
  } finally {
    layer.dispose();
    loader.mockRestore();
  }
});

import { _GlobeView as GlobeView, _GlobeViewport as GlobeViewport } from '@deck.gl/core';
import { Matrix4 } from '@math.gl/core';

const DEG_TO_RAD = Math.PI / 180;

class TiltedGlobeViewport extends GlobeViewport {
  constructor(opts: any = {}) {
    super(opts);

    const pitch = Number(opts.pitch ?? 0);
    const bearing = Number(opts.bearing ?? 0);
    if (Math.abs(pitch) < 0.01 && Math.abs(bearing) < 0.01) return;

    const viewMatrix = new Matrix4(this.viewMatrixUncentered);
    viewMatrix.rotateZ(bearing * DEG_TO_RAD);
    viewMatrix.rotateX(-pitch * DEG_TO_RAD);

    (this as any)._initMatrices({
      ...opts,
      viewMatrix,
      projectionMatrix: this.projectionMatrix,
      focalDistance: this.focalDistance,
    });
  }
}

export class TiltedGlobeView extends GlobeView {
  getViewportType() {
    return TiltedGlobeViewport;
  }
}

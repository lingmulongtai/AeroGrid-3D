import { PerspectiveCamera, Vector3 } from 'three';
import { EARTH_RADIUS_KM } from './geo';

export interface ScreenPoint {
  x: number;
  y: number;
  depth: number;
}

const projected = new Vector3();

/** Projects a world point to CSS pixels; null when off-screen or hidden by the Earth. */
export function projectVisible(point: Vector3, camera: PerspectiveCamera, width: number, height: number, margin = 0): ScreenPoint | null {
  const c = camera.position;
  const dx = point.x - c.x;
  const dy = point.y - c.y;
  const dz = point.z - c.z;
  const distance = Math.hypot(dx, dy, dz);
  const b = (c.x * dx + c.y * dy + c.z * dz) / distance;
  const cc = c.lengthSq() - EARTH_RADIUS_KM * EARTH_RADIUS_KM;
  const disc = b * b - cc;
  if (disc > 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < distance - 0.05) return null;
  }
  projected.copy(point).project(camera);
  if (projected.z > 1 || projected.z < -1) return null;
  const x = (projected.x + 1) * 0.5 * width;
  const y = (1 - projected.y) * 0.5 * height;
  if (x < -margin || y < -margin || x > width + margin || y > height + margin) return null;
  return { x, y, depth: distance };
}

export interface LabelRequest {
  text: string;
  sub?: string;
  x: number;
  y: number;
  priority: number;
  color: string;
  kind: 'airport' | 'aircraft' | 'satellite' | 'station';
}

export interface Highlight {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  color: string;
  pulse: boolean;
}

export class LabelOverlay {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private ratio = 1;

  constructor(parent: HTMLElement) {
    this.canvas.className = 'globe-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d')!;
  }

  resize(width: number, height: number, ratio: number) {
    this.width = width;
    this.height = height;
    this.ratio = Math.min(2, ratio);
    this.canvas.width = Math.round(width * this.ratio);
    this.canvas.height = Math.round(height * this.ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  draw(labels: LabelRequest[], highlights: Highlight[], hover: { x: number; y: number } | null, time: number) {
    const ctx = this.context;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.textBaseline = 'middle';

    const cell = 18;
    const columns = Math.ceil(this.width / cell) + 1;
    const occupied = new Uint8Array(columns * (Math.ceil(this.height / cell) + 1));
    const reserve = (x: number, y: number, w: number, h: number) => {
      const x0 = Math.max(0, Math.floor(x / cell));
      const x1 = Math.floor((x + w) / cell);
      const y0 = Math.max(0, Math.floor(y / cell));
      const y1 = Math.floor((y + h) / cell);
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          if (occupied[gy * columns + gx]) return false;
        }
      }
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) occupied[gy * columns + gx] = 1;
      }
      return true;
    };

    for (const highlight of highlights) reserve(highlight.x + 14, highlight.y - 22, 160, 40);

    labels.sort((a, b) => b.priority - a.priority);
    for (const label of labels) {
      const font = label.kind === 'airport' ? '600 10px Inter, ui-sans-serif, sans-serif' : '650 10.5px Inter, ui-sans-serif, sans-serif';
      ctx.font = font;
      const width = ctx.measureText(label.text).width;
      const x = label.x + (label.kind === 'airport' ? 8 : 10);
      const y = label.y - (label.kind === 'airport' ? 0 : 8);
      if (!reserve(x - 2, y - 7, width + 4, 14)) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2, 6, 14, 0.85)';
      ctx.strokeText(label.text, x, y);
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, x, y);
    }

    if (hover) {
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    for (const highlight of highlights) {
      const pulse = highlight.pulse ? (Math.sin(time * 4) + 1) / 2 : 0;
      ctx.beginPath();
      ctx.arc(highlight.x, highlight.y, 15 + pulse * 5, 0, Math.PI * 2);
      ctx.strokeStyle = highlight.color;
      ctx.globalAlpha = 0.95 - pulse * 0.45;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(highlight.x + Math.cos(angle) * 21, highlight.y + Math.sin(angle) * 21);
        ctx.lineTo(highlight.x + Math.cos(angle) * 26, highlight.y + Math.sin(angle) * 26);
        ctx.stroke();
      }
      const boxX = highlight.x + 30;
      const boxY = highlight.y - 21;
      ctx.font = '700 11px Inter, ui-sans-serif, sans-serif';
      const titleWidth = ctx.measureText(highlight.title).width;
      ctx.font = '500 9.5px Inter, ui-sans-serif, sans-serif';
      const subWidth = ctx.measureText(highlight.subtitle).width;
      const boxWidth = Math.max(titleWidth, subWidth) + 18;
      ctx.fillStyle = 'rgba(5, 11, 20, 0.82)';
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, 38, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = highlight.color;
      ctx.fillRect(boxX, boxY + 8, 2, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 11px Inter, ui-sans-serif, sans-serif';
      ctx.fillText(highlight.title, boxX + 10, boxY + 13);
      ctx.fillStyle = 'rgba(190, 205, 222, 0.9)';
      ctx.font = '500 9.5px Inter, ui-sans-serif, sans-serif';
      ctx.fillText(highlight.subtitle, boxX + 10, boxY + 27);
    }
  }

  dispose() {
    this.canvas.remove();
  }
}

import { useCallback, useMemo, useRef } from 'react';

export type GlobeViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
};

type DragCtx = {
  mode: 'tilt' | 'pan3d' | 'rotate';
  startX: number;
  startY: number;
  start: GlobeViewState;
};

const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat));
const clampPitch = (pitch: number) => Math.max(0, Math.min(70, pitch));

export function useAdvancedGlobeCamera(
  viewState: GlobeViewState,
  setViewState: (updater: (prev: GlobeViewState) => GlobeViewState) => void,
) {
  const dragRef = useRef<DragCtx | null>(null);

  const onDragStart = useCallback((info: any) => {
    const e = info?.srcEvent as MouseEvent | undefined;
    if (!e?.ctrlKey && !e?.altKey && !e?.shiftKey) {
      dragRef.current = null;
      return;
    }

    const mode: DragCtx['mode'] = e.ctrlKey ? 'tilt' : e.altKey ? 'rotate' : 'pan3d';
    e.preventDefault?.();
    dragRef.current = {
      mode,
      startX: info?.x ?? 0,
      startY: info?.y ?? 0,
      start: { ...viewState },
    };
  }, [viewState]);

  const onDrag = useCallback((info: any) => {
    if (!dragRef.current) return;
    (info?.srcEvent as MouseEvent | undefined)?.preventDefault?.();
    const d = dragRef.current;
    const dx = (info?.x ?? 0) - d.startX;
    const dy = (info?.y ?? 0) - d.startY;

    setViewState((prev) => {
      if (d.mode === 'pan3d') {
        const scale = 0.08 / Math.max(prev.zoom, 0.5);
        return {
          ...prev,
          longitude: d.start.longitude - dx * scale,
          latitude: clampLat(d.start.latitude + dy * scale),
          transitionDuration: 0,
        };
      }

      if (d.mode === 'tilt') {
        return {
          ...prev,
          bearing: d.start.bearing + dx * 0.22,
          pitch: clampPitch(d.start.pitch - dy * 0.22),
          transitionDuration: 0,
        };
      }

      if (d.mode === 'rotate') {
        return {
          ...prev,
          bearing: d.start.bearing + dx * 0.25,
          pitch: clampPitch(d.start.pitch + dy * 0.2),
          transitionDuration: 0,
        };
      }

      return prev;
    });
  }, [setViewState]);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((info: any) => {
    const e = info?.srcEvent as WheelEvent | undefined;
    e?.preventDefault?.();

    const delta = Math.sign(e?.deltaY ?? 0);

    setViewState((prev) => ({
      ...prev,
      zoom: Math.max(0.5, Math.min(12, prev.zoom - delta * 0.18)),
      transitionDuration: 120,
    }));
  }, [setViewState]);

  const isCustomDragging = useCallback(() => dragRef.current !== null, []);

  return useMemo(
    () => ({ onDragStart, onDrag, onDragEnd, onWheel, isCustomDragging }),
    [isCustomDragging, onDragStart, onDrag, onDragEnd, onWheel],
  );
}

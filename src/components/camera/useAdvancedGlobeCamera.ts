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
  mode: 'pan3d' | 'rotate' | 'orbit';
  startX: number;
  startY: number;
  start: GlobeViewState;
};

const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat));

export function useAdvancedGlobeCamera(
  viewState: GlobeViewState,
  setViewState: (updater: (prev: GlobeViewState) => GlobeViewState) => void,
) {
  const dragRef = useRef<DragCtx | null>(null);

  const onDragStart = useCallback((info: any) => {
    const e = info?.srcEvent as MouseEvent | undefined;
    const mode: DragCtx['mode'] = e?.ctrlKey ? 'pan3d' : e?.altKey ? 'rotate' : 'orbit';
    dragRef.current = {
      mode,
      startX: info?.x ?? 0,
      startY: info?.y ?? 0,
      start: { ...viewState },
    };
  }, [viewState]);

  const onDrag = useCallback((info: any) => {
    if (!dragRef.current) return;
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

      if (d.mode === 'rotate') {
        return {
          ...prev,
          bearing: d.start.bearing + dx * 0.25,
          pitch: Math.max(-85, Math.min(85, d.start.pitch + dy * 0.2)),
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

  return useMemo(
    () => ({ onDragStart, onDrag, onDragEnd, onWheel }),
    [onDragStart, onDrag, onDragEnd, onWheel],
  );
}

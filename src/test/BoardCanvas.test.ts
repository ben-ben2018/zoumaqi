import { describe, expect, it } from 'vitest';

import { getCanvasRenderMetrics } from '../components/BoardCanvas';

describe('getCanvasRenderMetrics', () => {
  it('scales the backing canvas to match the displayed size and device pixel ratio', () => {
    const metrics = getCanvasRenderMetrics(732, 222, 1098, 333, 2);

    expect(metrics.pixelWidth).toBe(2196);
    expect(metrics.pixelHeight).toBe(666);
    expect(metrics.scaleX).toBe(1.5);
    expect(metrics.scaleY).toBe(1.5);
    expect(metrics.devicePixelRatio).toBe(2);
  });

  it('guards against zero-sized measurements', () => {
    const metrics = getCanvasRenderMetrics(732, 222, 0, 0, 0);

    expect(metrics.cssWidth).toBe(1);
    expect(metrics.cssHeight).toBe(1);
    expect(metrics.pixelWidth).toBe(1);
    expect(metrics.pixelHeight).toBe(1);
    expect(metrics.devicePixelRatio).toBe(1);
  });
});

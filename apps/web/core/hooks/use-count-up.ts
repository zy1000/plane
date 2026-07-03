import { useEffect, useRef, useState } from "react";

type TUseCountUpOptions = {
  decimals?: number;
  duration?: number;
  enabled?: boolean;
  resetKey?: string | number;
  start?: number;
};

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3);

export const useCountUp = (targetValue: number, options: TUseCountUpOptions = {}) => {
  const { decimals = 0, duration = 1400, enabled = true, resetKey, start = 0 } = options;
  const target = Number.isFinite(targetValue) ? targetValue : 0;
  const [value, setValue] = useState(start);
  const frame = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setValue(start);
      return;
    }

    if (typeof window === "undefined" || duration <= 0) {
      setValue(target);
      return;
    }

    const precision = 10 ** decimals;
    const startedAt = performance.now();
    setValue(start);

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const nextValue = start + (target - start) * easeOutCubic(progress);
      setValue(Math.round(nextValue * precision) / precision);

      if (progress < 1) frame.current = window.requestAnimationFrame(tick);
    };

    frame.current = window.requestAnimationFrame(tick);

    return () => {
      if (frame.current) window.cancelAnimationFrame(frame.current);
    };
  }, [decimals, duration, enabled, resetKey, start, target]);

  return value;
};

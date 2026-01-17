import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { EChartsOption } from "echarts";
import { cn } from "@plane/utils";

type ReactEChartsCoreType = React.ComponentType<{
  echarts: any;
  option: EChartsOption;
  style?: CSSProperties;
  className?: string;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  showLoading?: boolean;
  onEvents?: Record<string, (params: any) => void>;
}>;

export type EChartProps = {
  option: EChartsOption;
  className?: string;
  style?: CSSProperties;
  loading?: boolean;
  onEvents?: Record<string, (params: any) => void>;
};

export function EChart({ option, className, style, loading, onEvents }: EChartProps) {
  const [EChartsComponent, setEChartsComponent] = useState<ReactEChartsCoreType | null>(null);
  const [echarts, setEcharts] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ default: ReactEChartsCore }, { default: echartsInstance }] = await Promise.all([
        import("echarts-for-react/lib/core"),
        import("./echarts-bundle"),
      ]);
      if (cancelled) return;
      setEChartsComponent(() => ReactEChartsCore as unknown as ReactEChartsCoreType);
      setEcharts(echartsInstance);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const mergedStyle = useMemo<CSSProperties>(() => ({ height: "100%", width: "100%", ...style }), [style]);

  if (!EChartsComponent || !echarts) {
    return <div className={cn("h-full w-full animate-pulse rounded bg-custom-background-90", className)} style={mergedStyle} />;
  }

  return (
    <EChartsComponent
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      showLoading={!!loading}
      onEvents={onEvents}
      className={className}
      style={mergedStyle}
    />
  );
}


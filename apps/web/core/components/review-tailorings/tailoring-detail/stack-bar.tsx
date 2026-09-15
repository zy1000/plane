import { cn } from "@plane/utils";

/**
 * 保留 / 裁剪 / 待补原因三段堆叠条。标题区、阶段行共用。
 * `cut` 含 `missing`：裁掉但没写原因的那部分单独涂成琥珀色。
 */
export const StackBar = ({
  kept,
  cut,
  missing,
  className,
}: {
  kept: number;
  cut: number;
  missing: number;
  className?: string;
}) => {
  const total = kept + cut;
  const width = (value: number) => ({ width: `${total > 0 ? (value / total) * 100 : 0}%` });
  const cutWithReason = Math.max(cut - missing, 0);
  return (
    <span className={cn("flex shrink-0 gap-px overflow-hidden rounded-full bg-layer-3", className)} aria-hidden>
      {kept > 0 && <span className="h-full min-w-0.5 bg-accent-primary" style={width(kept)} />}
      {cutWithReason > 0 && (
        <span className="h-full min-w-0.5 bg-(--text-color-placeholder)" style={width(cutWithReason)} />
      )}
      {missing > 0 && <span className="h-full min-w-0.5 bg-warning-primary" style={width(missing)} />}
    </span>
  );
};

import type { FC } from "react";
import { cn } from "@plane/utils";

export const DEFECT_PRESET_PARAM = "preset";

export type TDefectPreset = "all" | "open" | "mine" | "mine_open" | "mine_done";

const VALID_PRESETS: TDefectPreset[] = ["all", "open", "mine", "mine_open", "mine_done"];

/** 把 URL 中的 preset 值规整为受支持的预设，默认「全部」。 */
export const getDefectPreset = (value: string | null | undefined): TDefectPreset =>
  value && VALID_PRESETS.includes(value as TDefectPreset) ? (value as TDefectPreset) : "all";

export const isMinePreset = (preset: TDefectPreset): boolean =>
  preset === "mine" || preset === "mine_open" || preset === "mine_done";

const PRIMARY_SEGMENTS: { key: TDefectPreset; label: string }[] = [
  { key: "all", label: "全部缺陷" },
  { key: "open", label: "待处理" },
];

const MINE_SEGMENTS: { key: TDefectPreset; label: string }[] = [
  { key: "mine", label: "全部" },
  { key: "mine_open", label: "待处理" },
  { key: "mine_done", label: "已解决" },
];

type Props = {
  value: TDefectPreset;
  onChange: (preset: TDefectPreset) => void;
  variant?: "content" | "header";
};

export const DefectQuickFilterBar: FC<Props> = ({ value, onChange, variant = "content" }) => {
  const mineActive = isMinePreset(value);
  const segmentBase = "h-7 rounded-md px-3 text-body-xs-medium transition-colors";
  const activeClass = "bg-surface-1 text-primary shadow-sm";
  const inactiveClass = "text-secondary hover:text-primary";
  const containerClass =
    variant === "header"
      ? "flex shrink-0 flex-wrap items-center gap-2"
      : "flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle bg-surface-1 px-4 py-2 lg:px-6";

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-1 rounded-lg bg-surface-2/50 p-0.5">
        {PRIMARY_SEGMENTS.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={() => onChange(segment.key)}
            className={cn(segmentBase, value === segment.key ? activeClass : inactiveClass)}
          >
            {segment.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange("mine")}
          className={cn(segmentBase, mineActive ? activeClass : inactiveClass)}
        >
          我负责的
        </button>
      </div>

      {mineActive ? (
        <div className="flex items-center gap-1 rounded-lg bg-surface-2/50 p-0.5">
          <span className="pl-1.5 pr-0.5 text-[11px] text-placeholder">我的</span>
          {MINE_SEGMENTS.map((segment) => (
            <button
              key={segment.key}
              type="button"
              onClick={() => onChange(segment.key)}
              className={cn(segmentBase, value === segment.key ? activeClass : inactiveClass)}
            >
              {segment.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

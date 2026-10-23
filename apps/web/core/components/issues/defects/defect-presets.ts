export const DEFECT_PRESET_PARAM = "preset";

export type TDefectPreset =
  | "all"
  | "open"
  | "assigned"
  | "reported"
  | "to_verify"
  | "pending_reject"
  | "reopen"
  | "rejected"
  | "closed";

export type TDefectPresetOption = { key: TDefectPreset; label: string };

/** 缺陷页左侧快捷筛选，数组顺序即展示顺序 */
export const DEFECT_PRESETS: TDefectPresetOption[] = [
  { key: "all", label: "全部缺陷" },
  { key: "open", label: "未解决" },
  { key: "reopen", label: "重新打开" },
  { key: "assigned", label: "指派给我" },
  { key: "reported", label: "我提交的" },
  { key: "to_verify", label: "待我验证" },
  { key: "rejected", label: "已驳回" },
  { key: "pending_reject", label: "待确认驳回" },
  { key: "closed", label: "已关闭" },
];

/**
 * 按状态名解析的三个预设。名字来自缺陷类型的默认状态集，
 * 后端 defect-quick-counts 端点用同一组名字计数。
 */
export const DEFECT_PRESET_STATE_NAMES: Partial<Record<TDefectPreset, string>> = {
  to_verify: "Fixed",
  pending_reject: "Pending-Reject",
  reopen: "Reopen",
};

const VALID_PRESETS = new Set<string>(DEFECT_PRESETS.map((preset) => preset.key));

/** 旧版 URL 里「我负责的」系列统一落到「指派给我」 */
const LEGACY_PRESETS: Record<string, TDefectPreset> = {
  mine: "assigned",
  mine_open: "assigned",
  mine_done: "assigned",
};

/** 把 URL 中的 preset 值规整为受支持的预设，默认「全部」。 */
export const getDefectPreset = (value: string | null | undefined): TDefectPreset => {
  if (!value) return "all";
  if (VALID_PRESETS.has(value)) return value as TDefectPreset;
  return LEGACY_PRESETS[value] ?? "all";
};

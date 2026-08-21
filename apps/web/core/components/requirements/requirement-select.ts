import { v4 as uuidv4 } from "uuid";
import type {
  TRequirementField,
  TRequirementFieldDraft,
  TRequirementSelectMode,
  TRequirementSelectOption,
} from "@plane/types";

type TSelectableField = Pick<TRequirementField | TRequirementFieldDraft, "config">;

export const getRequirementSelectMode = (field: TSelectableField): TRequirementSelectMode =>
  field.config.selection_mode === "multiple" ? "multiple" : "single";

export const getRequirementSelectOptions = (field: TSelectableField): TRequirementSelectOption[] => {
  const options = field.config.options;
  if (!Array.isArray(options)) return [];
  return options.filter((option): option is TRequirementSelectOption =>
    Boolean(option && typeof option.id === "string" && typeof option.label === "string")
  );
};

export const getRequirementSelectLabel = (field: TSelectableField, optionId: string): string | undefined =>
  getRequirementSelectOptions(field).find((option) => option.id === optionId)?.label;

export const hasValidRequirementSelectOptions = (field: TSelectableField): boolean => {
  const options = getRequirementSelectOptions(field);
  if (!options.length || options.some((option) => !option.label.trim())) return false;
  const ids = options.map((option) => option.id);
  const labels = options.map((option) => option.label.trim().toLocaleLowerCase());
  return ids.length === new Set(ids).size && labels.length === new Set(labels).size;
};

/** 选项名的比较键：与 hasValidRequirementSelectOptions 的去重口径保持一致 */
const optionKey = (label: string) => label.trim().toLocaleLowerCase();

/** 把「一行一个」的文本解析成选项名数组：按行拆、trim、丢掉空行 */
export const parseRequirementSelectOptionLabels = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/** 返回第一个重复的选项名（忽略大小写），没有重复时返回 undefined */
export const findDuplicateRequirementSelectLabel = (labels: string[]): string | undefined => {
  const seen = new Set<string>();
  for (const label of labels) {
    const key = optionKey(label);
    if (seen.has(key)) return label;
    seen.add(key);
  }
  return undefined;
};

/**
 * 按选项名复用已有选项的 id —— 名字没改的行保持同一个 id，
 * 已经选了这些选项的需求数据才不会失效（与「修改名称不影响已有数据」的承诺一致）。
 * 名字对不上的行视为新选项，重新生成 uuid。
 */
export const mergeRequirementSelectOptions = (
  existing: TRequirementSelectOption[],
  labels: string[]
): TRequirementSelectOption[] => {
  const idByLabel = new Map<string, string>();
  existing.forEach((option) => {
    const key = optionKey(option.label);
    if (!idByLabel.has(key)) idByLabel.set(key, option.id);
  });
  return labels.map((label) => ({ id: idByLabel.get(optionKey(label)) ?? uuidv4(), label }));
};

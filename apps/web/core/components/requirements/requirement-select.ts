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

import { useMemo, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { FilterHeader } from "@/components/issues/issue-layouts/filters";
import { REQUIREMENT_BUILTIN_COLUMNS } from "@/components/requirements/requirement-builtin-fields";
import { COLUMN_LABEL_KEYS, TOGGLEABLE_COLUMNS, type TProjectRequirementColumnKey } from "./project-requirements-columns";

type TProps = {
  hiddenColumns: TProjectRequirementColumnKey[];
  onToggle: (key: TProjectRequirementColumnKey) => void;
};

export const ProjectRequirementDisplayProperties = ({ hiddenColumns, onToggle }: TProps) => {
  const { t } = useTranslation();
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const builtinByKey = useMemo(
    () => Object.fromEntries(REQUIREMENT_BUILTIN_COLUMNS.map((column) => [column.key, column])),
    []
  );

  return (
    <>
      <FilterHeader
        title={t("issue.display.properties.label")}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled((value) => !value)}
      />
      {previewEnabled && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {TOGGLEABLE_COLUMNS.map((key) => {
            const own = COLUMN_LABEL_KEYS[key];
            const builtin = builtinByKey[key];
            const label = own ? t(own) : builtin ? t(builtin.labelKey) : key;
            const isVisible = !hiddenColumns.includes(key);
            return (
              <button
                key={key}
                type="button"
                className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                  isVisible
                    ? "border-accent-strong bg-accent-primary text-on-color"
                    : "border-subtle hover:bg-layer-1"
                }`}
                onClick={() => onToggle(key)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};

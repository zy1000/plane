import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import { FilterHeader } from "@/components/issues/issue-layouts/filters";

type TDisplayColumn = {
  id: string;
  name: string;
};

type TProps = {
  columns: TDisplayColumn[];
  hiddenIds: string[];
  onToggle: (id: string) => void;
};

export const RequirementDisplayProperties = ({ columns, hiddenIds, onToggle }: TProps) => {
  const { t } = useTranslation();
  const [previewEnabled, setPreviewEnabled] = useState(true);

  return (
    <div className="w-full px-2.5 py-2">
      <FilterHeader
        title={t("issue.display.properties.label")}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled((value) => !value)}
      />
      {previewEnabled && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {columns.map((column) => {
            const isVisible = !hiddenIds.includes(column.id);
            return (
              <button
                key={column.id}
                type="button"
                className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                  isVisible
                    ? "border-accent-strong bg-accent-primary text-on-color"
                    : "border-subtle hover:bg-layer-1"
                }`}
                onClick={() => onToggle(column.id)}
              >
                {column.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

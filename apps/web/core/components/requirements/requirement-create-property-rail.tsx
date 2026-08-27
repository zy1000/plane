import { Check } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementBuiltinValues } from "@plane/types";
import { cn } from "@plane/utils";
import { RequirementModuleDropdown } from "./module-tree/requirement-module-dropdown";
import { BuiltinCellEditor } from "./requirement-builtin-fields";
import type { TResolvedBuiltinEntry } from "./requirement-builtin-layout";

export type TCreateRequiredEntry = { key: string; label: string; missing: boolean };

type TProps = {
  propertyColumns: TResolvedBuiltinEntry[];
  builtin: TRequirementBuiltinValues;
  onChange: (patch: Partial<TRequirementBuiltinValues>) => void;
  parentScope: { workspaceSlug: string; productId?: string; libraryId?: string };
  moduleId: string | null;
  moduleName: string | null;
  onModuleChange: (moduleId: string | null, moduleName: string | null) => void;
  requiredEntries: TCreateRequiredEntry[];
  touched: ReadonlySet<string>;
};

/**
 * 建行弹窗右栏：属性竖排 + 底部待完成清单。
 * 空态用灰字点名还差什么；只有「碰过又留空」时清单才变红。
 */
export const RequirementCreatePropertyRail = ({
  propertyColumns,
  builtin,
  onChange,
  parentScope,
  moduleId,
  moduleName,
  onModuleChange,
  requiredEntries,
  touched,
}: TProps) => {
  const { t } = useTranslation();
  const pending = requiredEntries.filter((entry) => entry.missing);
  const alarmed = pending.some((entry) => touched.has(entry.key));

  return (
    <aside className="flex min-h-0 w-full flex-col border-t-[0.5px] border-subtle bg-layer-1 md:w-[17.5rem] md:shrink-0 md:border-t-0 md:border-l-[0.5px]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-2">
        <h4 className="mb-2 text-12 font-semibold text-secondary">{t("requirement_grid.data.properties_rail")}</h4>
        <div className="flex items-center justify-between gap-3 border-b-[0.5px] border-subtle py-2">
          <span className="shrink-0 text-12 text-secondary">{t("requirement_modules.column")}</span>
          <div className="flex min-w-0 max-w-[58%] justify-end">
            <RequirementModuleDropdown
              workspaceSlug={parentScope.workspaceSlug}
              productId={parentScope.productId}
              libraryId={parentScope.libraryId}
              value={moduleId}
              valueName={moduleName}
              onChange={onModuleChange}
              placeholder={t("requirement_grid.data.parent_none")}
              buttonClassName="h-7 w-auto min-w-0 rounded-none !border-0 bg-transparent px-2 hover:bg-layer-transparent-hover"
              buttonTextClassName={moduleId ? "text-12 text-primary" : "text-12 text-placeholder"}
            />
          </div>
        </div>
        {propertyColumns.map((column) => (
          <div
            key={column.key}
            className="flex items-center justify-between gap-3 border-b-[0.5px] border-subtle py-2"
          >
            <span className="shrink-0 text-12 text-secondary">{t(column.column.labelKey)}</span>
            <div className="flex min-w-0 max-w-[58%] justify-end">
              <BuiltinCellEditor
                variant="rail"
                columnKey={column.key}
                values={builtin}
                onChange={onChange}
                parentScope={parentScope}
              />
            </div>
          </div>
        ))}
      </div>
      <div
        aria-live="polite"
        className={cn(
          "flex items-start gap-1.5 px-4 pt-2 pb-4 text-12 leading-5",
          pending.length === 0 ? "text-success-primary" : alarmed ? "text-danger-secondary" : "text-secondary"
        )}
      >
        {pending.length === 0 ? (
          <>
            <Check className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("requirement_grid.data.required_done")}</span>
          </>
        ) : (
          <>
            <span aria-hidden className="mt-px w-3.5 shrink-0 text-center">
              ○
            </span>
            <span>
              {t("requirement_grid.data.pending_prefix")}
              {pending.map((entry) => entry.label).join(t("requirement_grid.data.required_separator"))}
            </span>
          </>
        )}
      </div>
    </aside>
  );
};

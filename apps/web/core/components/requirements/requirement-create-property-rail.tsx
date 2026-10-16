import { Folder } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementBuiltinValues, TRequirementPriority } from "@plane/types";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import {
  MemberValueButton,
  PROPERTY_VALUE_CLASS,
  PropertyRailGroup,
  PropertyRailRow,
} from "@/components/common/form-modal";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { RequirementModuleDropdown } from "./module-tree/requirement-module-dropdown";
import type { TResolvedBuiltinEntry } from "./requirement-builtin-layout";
import { RequirementParentDropdown } from "./requirement-parent-dropdown";

export type TCreateRequiredEntry = { key: string; label: string; missing: boolean };

type TProps = {
  propertyColumns: TResolvedBuiltinEntry[];
  builtin: TRequirementBuiltinValues;
  onChange: (patch: Partial<TRequirementBuiltinValues>) => void;
  parentScope: { workspaceSlug: string; productId?: string; libraryId?: string };
  moduleId: string | null;
  moduleName: string | null;
  onModuleChange: (moduleId: string | null, moduleName: string | null) => void;
};

/** 「计划」组的内置列；父需求单独进「归属」组 */
const PLAN_KEYS = new Set(["priority", "assignee_id", "start_date", "target_date"]);

/**
 * 建行弹窗右栏：「归属」（模块、父需求）+「计划」（优先级、负责人、起止日期）两组属性，一行一项。
 * 与产品 / 项目弹窗同一套属性栏（common/form-modal）：值平时是一行字，悬停出底色，空值灰字「未设置」。
 * 列是否出现、计划组内的顺序仍按需求类型的内置字段布局走（标准库会藏掉未纳入的列）。
 */
export const RequirementCreatePropertyRail = ({
  propertyColumns,
  builtin,
  onChange,
  parentScope,
  moduleId,
  moduleName,
  onModuleChange,
}: TProps) => {
  const { t, currentLocale } = useTranslation();
  const unset = t("requirement_grid.data.unset");
  const dateToken = currentLocale.toLowerCase().startsWith("zh") ? "yyyy-MM-dd" : undefined;
  const parentColumn = propertyColumns.find((column) => column.key === "parent_id");
  const planColumns = propertyColumns.filter((column) => PLAN_KEYS.has(column.key));

  const renderPlanValue = (key: string) => {
    if (key === "priority") {
      const isNone = !builtin.priority || builtin.priority === "none";
      return (
        <PriorityDropdown
          value={isNone ? null : builtin.priority}
          placeholder={unset}
          hideIcon={isNone}
          onChange={(next) => onChange({ priority: next as TRequirementPriority })}
          buttonVariant="transparent-with-text"
          buttonClassName={cn(PROPERTY_VALUE_CLASS, isNone && "text-placeholder")}
          buttonContainerClassName="w-full text-left"
        />
      );
    }
    if (key === "assignee_id") {
      return (
        <MemberDropdown
          multiple={false}
          value={builtin.assignee_id}
          onChange={(memberId) => onChange({ assignee_id: memberId })}
          buttonVariant="transparent-with-text"
          className="w-full"
          buttonContainerClassName="text-left"
          button={<MemberValueButton userIds={builtin.assignee_id ? [builtin.assignee_id] : []} placeholder={unset} />}
        />
      );
    }
    // 起止日期互为边界，让下拉自己挡掉倒挂的选择
    const isStart = key === "start_date";
    const value = isStart ? builtin.start_date : builtin.target_date;
    return (
      <DateDropdown
        value={getDate(value)}
        onChange={(date) =>
          onChange({ [isStart ? "start_date" : "target_date"]: date ? (renderFormattedPayloadDate(date) ?? null) : null })
        }
        minDate={!isStart && builtin.start_date ? new Date(builtin.start_date) : undefined}
        maxDate={isStart && builtin.target_date ? new Date(builtin.target_date) : undefined}
        buttonVariant="transparent-with-text"
        hideIcon
        isClearable
        placeholder={unset}
        formatToken={dateToken}
        className="w-full"
        buttonContainerClassName="w-full text-left"
        buttonClassName={cn("group tabular-nums", PROPERTY_VALUE_CLASS)}
        labelClassName={value ? "text-14 font-normal" : "text-14 font-normal text-placeholder"}
        clearIconClassName="hidden size-3 group-hover:block"
      />
    );
  };

  return (
    <aside
      data-modal-wheel-scroll
      className="vertical-scrollbar scrollbar-sm flex min-w-0 flex-col gap-5 border-subtle bg-surface-2 px-6 pt-5.5 pb-5 max-md:border-t md:w-[340px] md:shrink-0 md:overflow-y-auto md:border-l"
    >
      <PropertyRailGroup title={t("requirement_grid.data.rail_group_belong")}>
        <PropertyRailRow icon={Folder} label={t("requirement_modules.column")} className="min-h-10">
          <RequirementModuleDropdown
            workspaceSlug={parentScope.workspaceSlug}
            productId={parentScope.productId}
            libraryId={parentScope.libraryId}
            value={moduleId}
            valueName={moduleName}
            onChange={onModuleChange}
            placeholder={unset}
            buttonClassName={PROPERTY_VALUE_CLASS}
          />
        </PropertyRailRow>
        {parentColumn && (
          <PropertyRailRow icon={parentColumn.column.icon} label={t(parentColumn.column.labelKey)} className="min-h-10">
            <RequirementParentDropdown
              value={builtin.parent_id}
              onChange={(parentId) => onChange({ parent_id: parentId })}
              placeholder={unset}
              buttonClassName={PROPERTY_VALUE_CLASS}
              buttonTextClassName={builtin.parent_id ? "text-primary" : "text-placeholder"}
              {...parentScope}
            />
          </PropertyRailRow>
        )}
      </PropertyRailGroup>

      {planColumns.length > 0 && (
        <>
          <div className="h-px shrink-0 bg-layer-3" aria-hidden />
          <PropertyRailGroup title={t("requirement_grid.data.rail_group_plan")}>
            {planColumns.map((column) => (
              <PropertyRailRow
                key={column.key}
                icon={column.column.icon}
                label={t(column.column.labelKey)}
                className="min-h-10"
              >
                {renderPlanValue(column.key)}
              </PropertyRailRow>
            ))}
          </PropertyRailGroup>
        </>
      )}
    </aside>
  );
};

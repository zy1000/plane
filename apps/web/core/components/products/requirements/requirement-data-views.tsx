"use client";

import { useCallback, useMemo, useRef } from "react";
import { Layers, Table2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementDetail, TRequirementTypeSchema } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 产品需求是需求类型的集合，数据页因此按类型分视图：
 * - 0 个类型 -> 空态，引导去导入或手动录入
 * - 1 个类型 -> 不出切换器，直接平铺该需求类型的全部字段（就是标准库页今天的样子）
 * - N 个类型 -> 默认视图（标题/描述/所属类型，只读）+ 每个类型一个视图
 */
export type TRequirementDataView = { kind: "default" } | { kind: "requirementType"; requirementTypeId: string };

export const DEFAULT_VIEW_KEY = "default";

export const getViewKey = (view: TRequirementDataView) =>
  view.kind === "default" ? DEFAULT_VIEW_KEY : view.requirementTypeId;

/** 由配置里的 requirementTypes[] 推导出当前视图，并把非法的 ?view= 收敛回默认视图。 */
export const resolveRequirementDataView = (
  requirementTypes: TRequirementTypeSchema[],
  requestedKey: string | null
): TRequirementDataView => {
  if (requirementTypes.length === 1) return { kind: "requirementType", requirementTypeId: requirementTypes[0].id };
  if (requestedKey && requestedKey !== DEFAULT_VIEW_KEY && requirementTypes.some((item) => item.id === requestedKey)) {
    return { kind: "requirementType", requirementTypeId: requestedKey };
  }
  return { kind: "default" };
};

type TSwitcherProps = {
  requirementTypes: TRequirementTypeSchema[];
  activeKey: string;
  disabled?: boolean;
  onChange: (view: TRequirementDataView) => void;
};

/** 视图切换器。只在多类型时渲染 —— 单类型没有可切的东西。 */
export const RequirementDataViewSwitcher = ({ requirementTypes, activeKey, disabled, onChange }: TSwitcherProps) => {
  const { t } = useTranslation();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const views = useMemo(
    () => [
      { key: DEFAULT_VIEW_KEY, label: t("workspace_products.requirements.data.views.default"), icon: Layers },
      ...requirementTypes.map((requirementType) => ({ key: requirementType.id, label: requirementType.name, icon: Table2 })),
    ],
    [t, requirementTypes]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + offset + views.length) % views.length;
      tabRefs.current[nextIndex]?.focus();
    },
    [views.length]
  );

  if (requirementTypes.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label={t("workspace_products.requirements.data.views.label")}
      className="flex items-center gap-1 overflow-x-auto"
    >
      {views.map((view, index) => {
        const isActive = view.key === activeKey;
        const Icon = view.icon;
        return (
          <button
            key={view.key}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() =>
              onChange(view.key === DEFAULT_VIEW_KEY ? { kind: "default" } : { kind: "requirementType", requirementTypeId: view.key })
            }
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-12 font-medium transition-colors",
              isActive ? "bg-layer-2 text-primary" : "text-secondary hover:bg-layer-1 hover:text-primary",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="max-w-[160px] truncate">{view.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/** 默认视图里「标题/描述」两列的取值：各类型的字段 UUID 不同，得按行的类型查。 */
export const getBuiltinValue = (
  detail: TRequirementDetail,
  requirementTypes: TRequirementTypeSchema[],
  key: "title" | "description"
) => {
  const fieldId = requirementTypes.find((requirementType) => requirementType.id === detail.requirement_type_id)?.builtin_field_ids?.[key];
  return fieldId ? detail.data[fieldId] : null;
};

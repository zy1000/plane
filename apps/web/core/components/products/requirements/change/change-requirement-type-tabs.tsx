/**
 * 评审页的类型视图切换器。
 *
 * 产品需求是多个类型的拼接：每行明细只属于一个类型，字段定义也各自归属需求类型。把所有
 * 类型的字段并集成一张表，结果是每行只填得满自己那几列、其余全是空洞的超宽表格，而且
 * 各需求类型都有内置的标题/描述，表头会出现多组同名列。所以这里把类型提为第一级维度：
 * 切类型 = 换一套表头和数据集。
 *
 * 徽标里的计数只算明细行（字段定义组不分页，另有分节展示）。单类型需求不渲染。
 * 变更/对比视图给三态计数，版本快照没有「变更」概念，改用 total 显示行数。
 */
import { useCallback, useRef } from "react";
import { useTranslation } from "@plane/i18n";
import type { TLogoProps } from "@plane/types";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";

export type TChangeRequirementTypeTab = {
  id: string;
  /** 需求类型已被删除时为空串 */
  name: string;
  logo_props?: Partial<TLogoProps>;
  created_count?: number;
  updated_count?: number;
  deleted_count?: number;
  /** 快照视图用：该需求类型的行数 */
  total?: number;
};

type TProps = {
  requirementTypes: TChangeRequirementTypeTab[];
  activeRequirementTypeId: string;
  onChange: (requirementTypeId: string) => void;
};

const COUNT_TONES = [
  { key: "created_count", marker: "+", className: "text-success-primary" },
  { key: "updated_count", marker: "~", className: "text-warning-primary" },
  { key: "deleted_count", marker: "−", className: "text-danger-primary" },
] as const;

export function ChangeRequirementTypeTabs({ requirementTypes, activeRequirementTypeId, onChange }: TProps) {
  const { t } = useTranslation();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + offset + requirementTypes.length) % requirementTypes.length;
      tabRefs.current[nextIndex]?.focus();
    },
    [requirementTypes.length]
  );

  if (requirementTypes.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label={t("workspace_products.requirements.change.requirement_types.label")}
      className="flex min-w-0 items-center gap-1 overflow-x-auto"
    >
      {requirementTypes.map((requirementType, index) => {
        const isActive = requirementType.id === activeRequirementTypeId;
        return (
          <button
            key={requirementType.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onChange(requirementType.id)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-12 font-medium transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong",
              isActive ? "bg-layer-2 text-primary" : "text-secondary hover:bg-layer-1 hover:text-primary"
            )}
          >
            <TypeIcon iconProps={requirementType.logo_props?.icon} className="size-3.5" iconClassName="size-3.5" />
            <span className="max-w-[160px] truncate">
              {requirementType.name || t("workspace_products.requirements.change.requirement_types.untitled")}
            </span>
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              {requirementType.total !== undefined ? (
                <span className="text-11 text-tertiary">{requirementType.total}</span>
              ) : (
                COUNT_TONES.map(({ key, marker, className }) =>
                  (requirementType[key] ?? 0) > 0 ? (
                    <span key={key} className={cn("text-11", className)}>
                      {marker}
                      {requirementType[key]}
                    </span>
                  ) : null
                )
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

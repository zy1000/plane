/**
 * 需求类型筛选下拉。
 *
 * 类型是产品之下的第二层分面（禅道那一层是"模块"，Plane 的需求没有模块维度，最接近
 * 的分面就是需求类型）。做成下拉而不是页签：类型数量不可控，一个产品挂七八个类型时
 * 页签会把阶段条挤到换行。
 */
import type { FC } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementTypeSchema } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";

export const TYPE_PARAM = "type";

/** 非法/当前作用域下不存在的类型 id 回落「全部」。分面未到位时放行，同产品那支 */
export const getTypeFromParam = (
  value: string | null | undefined,
  requirementTypes: TRequirementTypeSchema[] | undefined
): string | undefined => {
  if (!value) return undefined;
  if (!requirementTypes?.length) return value;
  return requirementTypes.some((item) => item.id === value) ? value : undefined;
};

type TProps = {
  requirementTypes: TRequirementTypeSchema[];
  counts: Record<string, number> | undefined;
  value: string | undefined;
  onChange: (requirementTypeId: string | undefined) => void;
};

export const ProjectRequirementTypeFilter: FC<TProps> = ({
  requirementTypes,
  counts,
  value,
  onChange,
}) => {
  const { t } = useTranslation();

  /*
   * 只有一种类型时这个下拉没有可选项，纯占地方 —— 但**筛选还生效着的时候绝不能藏**，
   * 否则用户会看到一个被过滤过的列表，却找不到是谁在过滤、也没法撤销。
   * （切产品会让类型集合变小，这个组合很容易出现。）
   */
  if (requirementTypes.length < 2 && !value) return null;

  const activeType = requirementTypes.find((item) => item.id === value);
  // 选中的类型已经不在当前作用域里：显式说它无效，而不是伪装成「全部类型」
  const activeLabel = value
    ? (activeType?.name ?? t("project_requirements.unknown_type"))
    : t("project_requirements.all_types");

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-12 text-tertiary">{t("requirement_detail.requirement_type")}</span>
      <CustomMenu
        customButton={
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-medium text-primary hover:bg-layer-transparent-hover">
            <span className="max-w-40 truncate">{activeLabel}</span>
            <ChevronDown className="size-3 shrink-0 text-tertiary" />
          </span>
        }
        placement="bottom-start"
        closeOnSelect
      >
        <CustomMenu.MenuItem onClick={() => onChange(undefined)}>
          <span className={cn("text-13", value === undefined && "font-medium text-accent-primary")}>
            {t("project_requirements.all_types")}
          </span>
        </CustomMenu.MenuItem>
        {requirementTypes.map((requirementType) => (
          <CustomMenu.MenuItem key={requirementType.id} onClick={() => onChange(requirementType.id)}>
            <span className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "truncate text-13",
                  value === requirementType.id && "font-medium text-accent-primary"
                )}
              >
                {requirementType.name}
              </span>
              <span className="shrink-0 tabular-nums text-11 text-placeholder">
                {counts?.[requirementType.id] ?? 0}
              </span>
            </span>
          </CustomMenu.MenuItem>
        ))}
      </CustomMenu>
    </div>
  );
};

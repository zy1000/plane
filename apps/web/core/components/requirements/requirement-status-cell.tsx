/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 需求级交付状态的胶囊 + 下拉。产品网格 / 详情页 / 项目需求网格 / 迭代与发布范围页
 * 共用同一个组件 —— 状态是需求本体上的一列，跨项目共享一份，哪一侧改都是同一个值。
 *
 * 状态是**人工维护**的，五值任意方向可改（closed 选回任意非 closed 值即重开），所以
 * 这里没有「推导依据」tooltip、没有派生锁。有 onChange 才是下拉，不传恒只读 ——
 * 容器列表、无权限的行、diff / 版本快照都走只读这一条。
 *
 * 放在 requirements/（中立目录）而不是 projects/requirements/：产品侧与项目侧都往下游
 * 依赖，避免横向跨目录引用。
 */
import { useTranslation } from "@plane/i18n";
import type { TRequirementItemStatus } from "@plane/types";
import { REQUIREMENT_STATUSES } from "@plane/types";
import { CustomSelect, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";

/**
 * 配色跟着「越靠后越接近完成」走；closed 用比 not_started 更退场的中性色 + 删除线，
 * 否则一屏灰胶囊里「没开始」和「已关闭」分不出来。
 * pill = 密集网格里的着色胶囊；dot = chip 变体 / 筛选 chip 上的色点。
 */
export const REQUIREMENT_STATUS_STYLE: Record<TRequirementItemStatus, { pill: string; dot: string }> = {
  not_started: { pill: "bg-layer-3 text-secondary", dot: "bg-tertiary" },
  projected: { pill: "bg-accent-subtle text-accent-primary", dot: "bg-accent-primary" },
  in_progress: { pill: "bg-warning-subtle text-warning-primary", dot: "bg-warning-primary" },
  released: { pill: "bg-success-subtle text-success-primary", dot: "bg-success-primary" },
  closed: { pill: "bg-layer-3 text-tertiary line-through", dot: "bg-tertiary" },
};

/** 枚举外的值（未清库残留的旧值等）兜底用的中性样式，别让 STYLE[status] 取到 undefined */
const FALLBACK_STYLE = { pill: "bg-layer-3 text-tertiary", dot: "bg-tertiary" };

export const getRequirementStatusStyle = (status: string) =>
  (REQUIREMENT_STATUS_STYLE as Record<string, { pill: string; dot: string }>)[status] ?? FALLBACK_STYLE;

export const isRequirementClosed = (row: { status: TRequirementItemStatus | string } | null | undefined) =>
  row?.status === "closed";

/**
 * 内容能不能编辑的合流判定：页面级写权限 + 不在评审中 + 未关闭。
 * 网格行、详情抽屉、整页详情三处共用，别各写一遍。
 * 注意：状态下拉**不**走这个判定 —— closed 行要能重开，只看页面级写权限。
 */
export const canEditRequirementContent = (
  row: { is_locked: boolean; status: TRequirementItemStatus | string } | null | undefined,
  canEdit: boolean
) => Boolean(canEdit && row && !row.is_locked && !isRequirementClosed(row));

/**
 * pill = 密集网格里的着色胶囊。
 * chip = 与工作项行右侧 DropdownButton（border-with-text）同壳：
 * h-5 / rounded-sm / border-[0.5px] border-strong / px-1.5 / caption，色点承担差异。
 * 用在「一行工作项/需求」并排出现的地方（迭代 / 发布范围页、详情属性条）。
 */
export type TRequirementStatusVariant = "pill" | "chip";

type TProps = {
  status: TRequirementItemStatus | string;
  /** 传了才是下拉；不传恒只读 */
  onChange?: (status: TRequirementItemStatus) => void;
  /** 提交中等临时禁用 */
  disabled?: boolean;
  variant?: TRequirementStatusVariant;
  /** chip 变体默认带色点；工作项详情「关联需求」与用例 tag 对齐时关掉 */
  showDot?: boolean;
  className?: string;
};

export const RequirementStatusCell = ({
  status,
  onChange,
  disabled = false,
  variant = "pill",
  showDot = true,
  className,
}: TProps) => {
  const { t } = useTranslation();
  const style = getRequirementStatusStyle(status);
  const isKnown = (REQUIREMENT_STATUSES as string[]).includes(status);
  const label = isKnown ? t(`requirement_fields.statuses.${status}`) : status;
  const tooltipContent = isRequirementClosed({ status }) ? t("requirement_detail.closed_hint") : label;

  const pill =
    variant === "chip" ? (
      <span
        className={cn(
          "inline-flex h-5 min-w-0 max-w-full items-center whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-md-medium text-secondary",
          showDot ? "gap-1.5" : "justify-center",
          className
        )}
      >
        {showDot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />}
        <span className={cn("truncate", isRequirementClosed({ status }) && "line-through text-tertiary")}>{label}</span>
      </span>
    ) : (
      <span
        className={cn(
          "inline-flex h-5 min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded px-1.5 text-11 font-medium",
          style.pill,
          className
        )}
      >
        <span className="truncate">{label}</span>
      </span>
    );

  if (!onChange || disabled)
    return (
      <Tooltip tooltipContent={tooltipContent} position="top">
        {pill}
      </Tooltip>
    );

  return (
    <CustomSelect
      customButton={
        <Tooltip tooltipContent={tooltipContent} position="top">
          <span className="cursor-pointer">{pill}</span>
        </Tooltip>
      }
      value={status}
      onChange={(next: TRequirementItemStatus) => {
        if (next !== status) onChange(next);
      }}
      maxHeight="lg"
    >
      {REQUIREMENT_STATUSES.map((option) => (
        <CustomSelect.Option key={option} value={option}>
          <div className="flex items-center gap-2">
            <span
              className={cn("inline-flex h-4 w-1 shrink-0 rounded-full", REQUIREMENT_STATUS_STYLE[option].pill)}
              aria-hidden
            />
            {t(`requirement_fields.statuses.${option}`)}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
};

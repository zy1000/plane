import { Link } from "react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TDevMode } from "@plane/types";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { DEV_MODE_I18N, DEV_MODE_ICON_BUTTON } from "./dev-modes-grid";

/**
 * 列表用卡片而不是表格：一个工作区通常只有三五个模式，卡片能把图标、描述、
 * 阶段数 / 节点数 / 在用项目数和九个组件开关一眼看全。关掉的组件用删除线灰 chip 表示。
 */
export function DevModeCard({
  workspaceSlug,
  devMode,
  canEdit,
  onEdit,
  onDelete,
}: {
  workspaceSlug: string;
  devMode: TDevMode;
  canEdit: boolean;
  onEdit: (devMode: TDevMode) => void;
  onDelete: (devMode: TDevMode) => void;
}) {
  const { t } = useTranslation();
  const isSystem = devMode.is_system;
  // 预置模式不可删；被项目引用的也不可删（批次 3 起 project_count 才会 > 0）
  const canDelete = canEdit && !isSystem && devMode.project_count === 0;

  return (
    <div className="group relative flex min-h-52 flex-col gap-3.5 rounded-lg border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong">
      <Link
        to={`/${workspaceSlug}/templates/dev-modes/${devMode.id}`}
        className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong"
        aria-label={devMode.name}
      />

      {canEdit && (
        <span className="absolute right-3 top-3 z-10 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Tooltip tooltipContent={t(`${DEV_MODE_I18N}.card.edit`)} position="top">
            <button type="button" className={DEV_MODE_ICON_BUTTON} onClick={() => onEdit(devMode)}>
              <Pencil className="size-3.5" strokeWidth={2} />
            </button>
          </Tooltip>
          <Tooltip
            tooltipContent={t(
              isSystem
                ? `${DEV_MODE_I18N}.card.delete_preset_blocked`
                : devMode.project_count > 0
                  ? `${DEV_MODE_I18N}.card.delete_in_use_blocked`
                  : `${DEV_MODE_I18N}.card.delete`
            )}
            position="top"
          >
            <button
              type="button"
              className={cn(DEV_MODE_ICON_BUTTON, "hover:bg-danger-subtle hover:text-danger-primary")}
              disabled={!canDelete}
              onClick={() => onDelete(devMode)}
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
            </button>
          </Tooltip>
        </span>
      )}

      <div className="pointer-events-none flex items-start gap-3">
        <TypeIcon iconProps={devMode.icon_props?.icon} className="size-10 rounded-[9px]" iconClassName="size-5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-14 font-semibold text-primary">{devMode.name}</h3>
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center rounded px-2 text-11 font-medium",
                isSystem
                  ? "border border-subtle bg-surface-2 text-secondary"
                  : "border border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
              )}
            >
              {t(isSystem ? `${DEV_MODE_I18N}.card.preset` : `${DEV_MODE_I18N}.card.custom`)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-12 leading-5 text-secondary">
            {devMode.description || t(`${DEV_MODE_I18N}.card.no_description`)}
          </p>
        </div>
      </div>

      <div className="pointer-events-none flex flex-wrap gap-x-4 gap-y-1 text-11 text-tertiary">
        <span>
          <b className="mr-1 text-13 font-semibold tabular-nums text-primary">{devMode.stage_count}</b>
          {t(`${DEV_MODE_I18N}.card.stages`)}
        </span>
        <span>
          <b className="mr-1 text-13 font-semibold tabular-nums text-primary">{devMode.template_count}</b>
          {t(`${DEV_MODE_I18N}.card.templates`)}
        </span>
        <span>
          <b className="mr-1 text-13 font-semibold tabular-nums text-primary">{devMode.project_count}</b>
          {t(`${DEV_MODE_I18N}.card.projects`)}
        </span>
      </div>

      <div className="pointer-events-none mt-auto flex flex-wrap gap-1.5">
        {DEV_MODE_FEATURE_KEYS.map((key) => {
          const isOn = devMode.features?.[key];
          return (
            <span
              key={key}
              className={cn(
                "inline-flex h-[22px] items-center rounded px-2 text-11 font-medium",
                isOn
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "border border-subtle text-disabled line-through"
              )}
            >
              {t(`${DEV_MODE_I18N}.features.${key}`)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

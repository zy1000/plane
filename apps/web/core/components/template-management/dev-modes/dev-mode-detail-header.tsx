import { Briefcase, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevMode } from "@plane/types";
import { DEFAULT_DEV_MODE_NAME } from "@plane/types";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { MoreMenu } from "@/components/project-issue-types/root";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/**
 * 模式页身份头（方案 A）：图标、名称、预置 / 默认标签、描述，右侧在用项目数与编辑 / 删除。
 * 原来的顶栏面包屑撤掉了 —— 左栏已经说明「在哪个模式里」。
 */
export function DevModeDetailHeader({
  devMode,
  canEdit,
  onEdit,
  onDelete,
}: {
  devMode: TDevMode;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const isDefault = devMode.is_system && devMode.name === DEFAULT_DEV_MODE_NAME;
  const deleteBlockedReason = devMode.is_system
    ? t(`${DEV_MODE_I18N}.card.delete_preset_blocked`)
    : devMode.project_count > 0
      ? t(`${DEV_MODE_I18N}.card.delete_in_use_blocked`)
      : null;

  return (
    <div className="flex items-start gap-3.5 px-7 pt-5">
      <TypeIcon iconProps={devMode.icon_props?.icon} className="size-11 rounded-[11px]" iconClassName="size-[22px]" />
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-20 font-semibold leading-[30px] text-primary">
          <span className="truncate">{devMode.name}</span>
          <span
            className={cn(
              "inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-12 font-medium",
              isDefault ? "bg-accent-subtle text-accent-primary" : "bg-layer-1 text-secondary"
            )}
          >
            {isDefault ? "默认" : t(devMode.is_system ? `${DEV_MODE_I18N}.card.preset` : `${DEV_MODE_I18N}.card.custom`)}
          </span>
        </h1>
        <p className="mt-0.5 max-w-3xl truncate text-13 text-secondary">
          {devMode.description || t(`${DEV_MODE_I18N}.card.no_description`)}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="mr-1.5 flex items-center gap-1.5 text-13 text-secondary">
          <Briefcase className="size-3.5" />
          <b className="font-semibold tabular-nums text-primary">{devMode.project_count}</b> 个项目在用
        </span>
        {canEdit && (
          <>
            <Button variant="secondary" onClick={onEdit}>
              <Pencil className="size-3.5" />
              编辑信息
            </Button>
            <MoreMenu
              items={[
                {
                  label: deleteBlockedReason ?? t(`${DEV_MODE_I18N}.card.delete`),
                  icon: <Trash2 className="size-3.5" />,
                  tone: "danger",
                  disabled: Boolean(deleteBlockedReason),
                  onClick: onDelete,
                },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

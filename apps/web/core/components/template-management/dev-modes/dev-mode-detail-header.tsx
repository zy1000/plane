import { useTranslation } from "@plane/i18n";
import type { TDevMode } from "@plane/types";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/**
 * 详情页头部：只做模式身份 + 三个数字。
 *
 * 组件开关从这里挪进了自己的子页 —— 横在头部与阶段表之间既挤，也堵死了往模式下
 * 加内容的路。编辑按钮在顶栏右侧，不占头部。
 */
export function DevModeDetailHeader({ devMode }: { devMode: TDevMode }) {
  const { t } = useTranslation();

  const stats = [
    { key: "stages", value: devMode.stage_count },
    { key: "templates", value: devMode.template_count },
    { key: "projects", value: devMode.project_count },
  ];

  return (
    <div className="flex items-start gap-3.5 px-6 pt-5">
      <TypeIcon iconProps={devMode.icon_props?.icon} className="size-12 rounded-xl" iconClassName="size-6" />
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-20 font-semibold text-primary">
          {devMode.name}
          <span
            className={cn(
              "inline-flex h-5 items-center rounded px-2 text-11 font-medium",
              devMode.is_system
                ? "border border-subtle bg-surface-2 text-secondary"
                : "border border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
            )}
          >
            {t(devMode.is_system ? `${DEV_MODE_I18N}.card.preset` : `${DEV_MODE_I18N}.card.custom`)}
          </span>
        </h1>
        <p className="mt-1 max-w-4xl text-13 leading-5 text-secondary">
          {devMode.description || t(`${DEV_MODE_I18N}.card.no_description`)}
          {devMode.is_system && ` ${t(`${DEV_MODE_I18N}.detail.preset_hint`)}`}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-tertiary">
          {stats.map((stat, index) => (
            <span key={stat.key} className="flex items-center gap-3">
              {index > 0 && <span className="text-placeholder">·</span>}
              <span>
                <b className="mr-1 text-14 font-semibold tabular-nums text-primary">{stat.value}</b>
                {t(`${DEV_MODE_I18N}.card.${stat.key}`)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

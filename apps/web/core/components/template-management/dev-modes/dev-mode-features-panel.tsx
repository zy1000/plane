import { observer } from "mobx-react";
import {
  ClipboardCheck,
  Inbox,
  LayoutGrid,
  ListTodo,
  Eye,
  FileText,
  RefreshCw,
  Rocket,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDevModeFeatureKey } from "@plane/types";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { useTemplatePermissions } from "../permissions";
import { useDevModeDetailContext } from "./context";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/** 九个组件各自的图标。名称与说明走 i18n，这里只管长相。 */
const FEATURE_ICONS: Record<TDevModeFeatureKey, LucideIcon> = {
  cycle_view: RefreshCw,
  module_view: LayoutGrid,
  release_view: Rocket,
  issue_views_view: Eye,
  page_view: FileText,
  intake_view: Inbox,
  is_time_tracking_enabled: Timer,
  is_issue_type_enabled: ListTodo,
  review_view: ClipboardCheck,
};

/**
 * 「组件开关」子页：九个组件各一张卡，切换即保存。
 *
 * 卡片而不是一行开关 —— 每个组件配一句「它在项目里管什么」，光看名字分不清的
 * （收件箱 / 视图 / 页面）才有解释的地方；关掉的卡整体变灰，一眼看出哪些没开。
 */
export const DevModeFeaturesPanel = observer(function DevModeFeaturesPanel() {
  const { t } = useTranslation();
  const { workspaceSlug, devMode, isMutating, updateDevMode } = useDevModeDetailContext();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);

  if (!devMode) return null;

  const onCount = DEV_MODE_FEATURE_KEYS.filter((key) => devMode.features?.[key]).length;

  const handleToggle = (key: TDevModeFeatureKey, next: boolean) => {
    void updateDevMode({ features: { ...devMode.features, [key]: next } })
      .then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.features_updated`) }))
      .catch(() => setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.errors.generic`) }));
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-14 font-semibold text-primary">{t(`${DEV_MODE_I18N}.detail.features_title`)}</h2>
          <p className="mt-1 max-w-4xl text-12 leading-5 text-tertiary">
            {t(`${DEV_MODE_I18N}.features_panel.description`)}
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap pt-1 text-12 text-tertiary">
          <b className="text-14 font-semibold tabular-nums text-primary">{onCount}</b>
          {t(`${DEV_MODE_I18N}.features_panel.enabled_of`, { total: DEV_MODE_FEATURE_KEYS.length })}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DEV_MODE_FEATURE_KEYS.map((key) => {
          const isOn = Boolean(devMode.features?.[key]);
          const Icon = FEATURE_ICONS[key];
          return (
            <div
              key={key}
              className={cn(
                "flex min-h-28 flex-col gap-2.5 rounded-lg border border-subtle p-4",
                isOn ? "bg-surface-1" : "bg-surface-2"
              )}
            >
              <div className="flex items-start justify-between gap-2.5">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg bg-layer-1",
                    isOn ? "text-secondary" : "text-placeholder"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <ToggleSwitch
                  size="sm"
                  label={t(`${DEV_MODE_I18N}.features.${key}`)}
                  disabled={!canManageDevModes || isMutating}
                  value={isOn}
                  onChange={(next) => handleToggle(key, next)}
                />
              </div>
              <h3 className={cn("text-14 font-semibold", isOn ? "text-primary" : "text-tertiary")}>
                {t(`${DEV_MODE_I18N}.features.${key}`)}
              </h3>
              <p className={cn("text-12 leading-5", isOn ? "text-secondary" : "text-placeholder")}>
                {t(`${DEV_MODE_I18N}.feature_hints.${key}`)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
});

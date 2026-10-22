import { observer } from "mobx-react";
import { ClipboardCheck, Eye, FileText, Inbox, LayoutGrid, ListTodo, RefreshCw, Rocket, Timer } from "lucide-react";
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

/** 九个组件各自的图标。名称走 i18n，这里只管长相。 */
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

/** 「组件」页：九张卡片 3 × 3，一张卡一个组件（图标 + 名称 + 开关），切换即保存。模式是上限，项目只能在开启的组件里再自行关闭。 */
export const DevModeFeaturesPanel = observer(function DevModeFeaturesPanel() {
  const { t } = useTranslation();
  const { workspaceSlug, devMode, isMutating, updateDevMode } = useDevModeDetailContext();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);

  if (!devMode) return null;

  const handleToggle = (key: TDevModeFeatureKey, next: boolean) => {
    void updateDevMode({ features: { ...devMode.features, [key]: next } })
      .then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.features_updated`) }))
      .catch(() => setToast({ type: TOAST_TYPE.ERROR, title: t(`${DEV_MODE_I18N}.errors.generic`) }));
  };

  return (
    <div className="grid grid-cols-3 gap-4 px-7 py-6">
      {DEV_MODE_FEATURE_KEYS.map((key) => {
        const isOn = Boolean(devMode.features?.[key]);
        const Icon = FEATURE_ICONS[key];
        const label = t(`${DEV_MODE_I18N}.features.${key}`);
        return (
          <div
            key={key}
            className={cn(
              "flex h-28 items-center gap-4 rounded-xl border px-[22px]",
              isOn ? "border-subtle bg-surface-1" : "border-subtle bg-layer-1"
            )}
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-[11px]",
                isOn ? "bg-accent-subtle text-accent-primary" : "bg-layer-2 text-placeholder"
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className={cn("min-w-0 flex-1 truncate text-16", isOn ? "font-semibold text-primary" : "font-medium text-tertiary")}>
              {label}
            </span>
            <ToggleSwitch
              size="sm"
              label={label}
              disabled={!canManageDevModes || isMutating}
              value={isOn}
              onChange={(next) => handleToggle(key, next)}
            />
          </div>
        );
      })}
    </div>
  );
});

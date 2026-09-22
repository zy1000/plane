import { useTranslation } from "@plane/i18n";
import type { TDevModeFeatureKey, TDevModeFeatures } from "@plane/types";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/**
 * 九个组件开关。详情页头部的开关条与表单弹窗共用这一份 —— 两个地方都是同一组语义，
 * 长得不一样只会让人以为它们管的不是一回事。
 *
 * `layout`: `row` 给详情页（一行流式排开），`grid` 给弹窗（两列）。
 */
export function DevModeFeatureToggles({
  features,
  disabled,
  layout = "row",
  onChange,
}: {
  features: TDevModeFeatures;
  disabled?: boolean;
  layout?: "row" | "grid";
  onChange: (key: TDevModeFeatureKey, value: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        layout === "grid"
          ? "grid grid-cols-2 gap-x-5 gap-y-2 rounded-md border border-subtle bg-surface-2 px-3.5 py-3"
          : "flex flex-wrap items-center gap-x-5 gap-y-2"
      )}
    >
      {DEV_MODE_FEATURE_KEYS.map((key) => {
        const isOn = features[key];
        const label = t(`${DEV_MODE_I18N}.features.${key}`);
        return (
          <span
            key={key}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap text-13",
              layout === "grid" && "justify-between",
              isOn ? "font-medium text-primary" : "text-tertiary"
            )}
          >
            {layout === "grid" && label}
            <ToggleSwitch
              size="sm"
              label={label}
              disabled={disabled}
              value={isOn}
              onChange={(value) => onChange(key, value)}
            />
            {layout === "row" && label}
          </span>
        );
      })}
    </div>
  );
}

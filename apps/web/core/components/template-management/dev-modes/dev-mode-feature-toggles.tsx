import { useTranslation } from "@plane/i18n";
import type { TDevModeFeatureKey, TDevModeFeatures } from "@plane/types";
import { DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/**
 * 新建 / 编辑模式弹窗里的九个组件开关，两列紧凑排布。
 *
 * 详情页的开关不走这里 —— 那边是「组件开关」子页的卡片（`dev-mode-features-panel.tsx`），
 * 有图标和一句说明，尺寸和信息量都不一样，硬凑成一个组件只会两边都别扭。
 */
export function DevModeFeatureToggles({
  features,
  disabled,
  onChange,
}: {
  features: TDevModeFeatures;
  disabled?: boolean;
  onChange: (key: TDevModeFeatureKey, value: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2 rounded-md border border-subtle bg-surface-2 px-3.5 py-3">
      {DEV_MODE_FEATURE_KEYS.map((key) => {
        const isOn = features[key];
        const label = t(`${DEV_MODE_I18N}.features.${key}`);
        return (
          <span
            key={key}
            className={cn(
              "flex items-center justify-between gap-2 whitespace-nowrap text-13",
              isOn ? "font-medium text-primary" : "text-tertiary"
            )}
          >
            {label}
            <ToggleSwitch
              size="sm"
              label={label}
              disabled={disabled}
              value={isOn}
              onChange={(value) => onChange(key, value)}
            />
          </span>
        );
      })}
    </div>
  );
}

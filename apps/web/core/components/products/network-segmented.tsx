/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { GlobeIcon, LockIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProductNetwork } from "@plane/types";
import { cn } from "@plane/utils";

/** 可见性（公开 / 私有）分段开关，弹窗身份区用。与 ProjectNetworkSegmented 同一套视觉，但走产品自己的文案 */
const CHOICES: { key: TProductNetwork; icon: typeof GlobeIcon; labelKey: string; descriptionKey: string }[] = [
  {
    key: 2,
    icon: GlobeIcon,
    labelKey: "workspace_products.visibility.public",
    descriptionKey: "workspace_products.visibility.public_description",
  },
  {
    key: 0,
    icon: LockIcon,
    labelKey: "workspace_products.visibility.private",
    descriptionKey: "workspace_products.visibility.private_description",
  },
];

type Props = {
  value: TProductNetwork;
  onChange: (value: TProductNetwork) => void;
  disabled?: boolean;
  isMobile?: boolean;
  className?: string;
};

export function ProductNetworkSegmented(props: Props) {
  const { value, onChange, disabled = false, isMobile = false, className } = props;
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t("workspace_products.fields.visibility")}
      className={cn("inline-flex gap-0.5 rounded-lg border border-subtle-1 bg-layer-1 p-[3px]", className)}
    >
      {CHOICES.map(({ key, icon: Icon, labelKey, descriptionKey }) => {
        const active = key === value;
        return (
          <Tooltip key={key} tooltipContent={t(descriptionKey)} isMobile={isMobile} position="bottom">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(key)}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-md border px-2.5 text-12 font-medium transition-colors",
                active
                  ? "border-subtle-1 bg-surface-1 text-primary shadow-raised-200"
                  : "border-transparent text-secondary hover:text-primary",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <Icon className="size-3" />
              {t(labelKey)}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

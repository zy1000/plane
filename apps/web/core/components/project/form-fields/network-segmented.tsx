/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import { NETWORK_CHOICES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { ProjectNetworkIcon } from "@/components/project/project-network-icon";
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  control: Control<TProject>;
  disabled?: boolean;
  tabIndex?: number;
  isMobile?: boolean;
  className?: string;
};

/** 可见性（私有 / 公开）的分段开关，创建弹窗身份区用；设置页仍是 ProjectNetworkField 下拉 */
export function ProjectNetworkSegmented(props: Props) {
  const { control, disabled = false, tabIndex, isMobile = false, className } = props;
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name="network"
      render={({ field: { value, onChange } }) => (
        <div
          role="radiogroup"
          aria-label={t("workspace_projects.fields.network")}
          className={cn("inline-flex gap-0.5 rounded-lg border border-subtle-1 bg-layer-1 p-[3px]", className)}
        >
          {NETWORK_CHOICES.map((network) => {
            const active = network.key === value;
            return (
              <Tooltip key={network.key} tooltipContent={t(network.description)} isMobile={isMobile} position="bottom">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  tabIndex={tabIndex}
                  onClick={() => onChange(network.key)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-md border px-2.5 text-12 font-medium transition-colors",
                    active
                      ? "border-subtle-1 bg-surface-1 text-primary shadow-raised-200"
                      : "border-transparent text-secondary hover:text-primary",
                    disabled && "cursor-not-allowed opacity-60"
                  )}
                >
                  <ProjectNetworkIcon iconKey={network.iconKey} className="size-3" />
                  {t(network.i18n_label)}
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}
    />
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Lock } from "lucide-react";
import { Link } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TDevModeLite } from "@plane/types";
// components
import { TypeIcon } from "@/components/common/type-icon-picker";
import { devModeFeaturesPath } from "@/components/template-management/dev-modes/routes";

type Props = {
  devMode: TDevModeLite;
  workspaceSlug: string;
};

/**
 * 「当前研发模式不支持」的说明条，挂在被模式关掉的功能开关下面。
 *
 * 只说明为什么开关是灰的，并把人指回模式的组件开关页 —— 项目这边改不了，
 * 要放开只能去模板中心改模式。
 */
export function ProjectSettingsDevModeFeatureLock({ devMode, workspaceSlug }: Props) {
  const { t } = useTranslation();

  return (
    // span 而不是 div：调用方把它塞在 <p> 里（SettingsBoxedControlItem 的 description）
    <span className="mt-2.5 flex w-fit flex-wrap items-center gap-1.5 rounded-md border border-warning-subtle bg-warning-subtle px-2.5 py-1.5 text-caption-md-medium text-warning-primary">
      <Lock className="size-3.5 shrink-0" />
      <span>{t("project_settings.features.not_supported_by_dev_mode")}</span>
      <TypeIcon iconProps={devMode.icon_props?.icon} className="size-4 rounded" iconClassName="size-2.5" />
      <span>{devMode.name}</span>
      <Link to={devModeFeaturesPath(workspaceSlug, devMode.id)} className="font-normal underline underline-offset-2">
        {t("project_settings.features.view_dev_mode")}
      </Link>
    </span>
  );
}

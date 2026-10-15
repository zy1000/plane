/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

/** 表单 id：保存条在 <form> 之外，按钮靠 form 属性提交 */
export const PROJECT_SETTINGS_FORM_ID = "project-settings-general-form";

type Props = {
  /** 改了几个字段 */
  count: number;
  isSaving: boolean;
  onDiscard: () => void;
};

/**
 * 有改动时从内容区底部浮出的保存条：「N 处修改未保存 · 放弃 / 保存更改」。
 * sticky 贴在设置页滚动容器的底部，滚到最末时回到文档流里（危险操作区之后）。
 */
export function ProjectSettingsSaveBar(props: Props) {
  const { count, isSaving, onDiscard } = props;
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none sticky bottom-5 z-10 mt-6 flex justify-center">
      <div className="pointer-events-auto flex h-15 w-full max-w-150 animate-fade-in items-center gap-2.5 rounded-[14px] border border-subtle bg-surface-1 pr-3 pl-5.5 shadow-[0_20px_48px_-12px_rgba(20,30,45,0.28),0_2px_8px_rgba(20,30,45,0.08)]">
        <span className="size-2 shrink-0 rounded-full bg-accent-primary ring-[3px] ring-accent-subtle" aria-hidden="true" />
        <span className="text-14 font-medium text-primary">{t("project_settings.general.unsaved_changes", { count })}</span>
        <span className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xl"
            className="h-9.5 px-4 text-14"
            onClick={onDiscard}
            disabled={isSaving}
          >
            {t("project_settings.general.discard")}
          </Button>
          <Button
            type="submit"
            form={PROJECT_SETTINGS_FORM_ID}
            variant="primary"
            size="xl"
            className="h-9.5 px-4.5 text-14 font-semibold"
            loading={isSaving}
          >
            {t("project_settings.general.save_changes")}
          </Button>
        </span>
      </div>
    </div>
  );
}

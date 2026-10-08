/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertCircle, Check } from "lucide-react";
import { useTranslation } from "@plane/i18n";

type Props = {
  filled: number;
  total: number;
  /** 表单上有标红的字段（点过保存后才会有） */
  hasErrors: boolean;
};

/** 弹窗页脚左侧的必填进度：还没提交过是「必填 x / N」+ 细进度条；有错是红字；填齐了是绿勾 */
export function RequiredStatus(props: Props) {
  const { filled, total, hasErrors } = props;
  const { t } = useTranslation();
  const missing = total - filled;

  if (hasErrors) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-13 font-medium text-danger-primary">
        <AlertCircle className="size-4.5 shrink-0" />
        <span className="truncate">
          {missing > 0 ? t("modal_form.required_missing", { count: missing }) : t("modal_form.fix_errors")}
        </span>
      </span>
    );
  }
  if (missing === 0) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-13 text-secondary">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success-primary text-on-color">
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span className="truncate">{t("modal_form.required_done")}</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-13 text-secondary">
      <span className="shrink-0">
        {t("modal_form.required_label")} <b className="font-semibold text-primary tabular-nums">{filled}</b>
        <span className="tabular-nums"> / {total}</span>
      </span>
      <span className="h-1 w-18 shrink-0 overflow-hidden rounded-full bg-layer-3">
        <span
          className="block h-full rounded-full bg-accent-primary transition-[width]"
          style={{ width: `${(filled / total) * 100}%` }}
        />
      </span>
    </span>
  );
}

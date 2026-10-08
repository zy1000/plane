/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertCircle, Check, Pencil } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";

type Props = {
  mode: "create" | "edit" | "view";
  requiredFilled: number;
  requiredTotal: number;
  /** 表单上有标红的字段（点过保存后才会有） */
  hasErrors: boolean;
  isSaving: boolean;
  primaryLabel: string;
  onCancel: () => void;
  onSave: () => void;
  /** 查看态且有权限时才传：右下角换成「编辑」 */
  onEdit?: () => void;
};

/** 左侧必填进度：还没提交过是「必填 x / 13」+ 细进度条；有错是红字；填齐了是绿勾 */
function RequiredStatus(props: Pick<Props, "requiredFilled" | "requiredTotal" | "hasErrors">) {
  const { requiredFilled, requiredTotal, hasErrors } = props;
  const { t } = useTranslation();
  const missing = requiredTotal - requiredFilled;

  if (hasErrors) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-13 font-medium text-danger-primary">
        <AlertCircle className="size-4.5 shrink-0" />
        <span className="truncate">
          {missing > 0
            ? t("workspace_products.create.required_missing", { count: missing })
            : t("workspace_products.create.fix_errors")}
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
        <span className="truncate">{t("workspace_products.create.required_done")}</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-13 text-secondary">
      <span className="shrink-0">
        {t("workspace_products.create.required_label")}{" "}
        <b className="font-semibold text-primary tabular-nums">{requiredFilled}</b>
        <span className="tabular-nums"> / {requiredTotal}</span>
      </span>
      <span className="h-1 w-18 shrink-0 overflow-hidden rounded-full bg-layer-3">
        <span
          className="block h-full rounded-full bg-accent-primary transition-[width]"
          style={{ width: `${(requiredFilled / requiredTotal) * 100}%` }}
        />
      </span>
    </span>
  );
}

export function ProductModalFooter(props: Props) {
  const { mode, requiredFilled, requiredTotal, hasErrors, isSaving, primaryLabel, onCancel, onSave, onEdit } = props;
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-subtle px-7 py-3.5 md:pl-9">
      {mode !== "view" ? (
        <RequiredStatus requiredFilled={requiredFilled} requiredTotal={requiredTotal} hasErrors={hasErrors} />
      ) : null}
      <div className="ml-auto flex shrink-0 gap-2.5">
        <Button variant="secondary" size="lg" onClick={onCancel} disabled={isSaving}>
          {mode === "view" ? t("close") : t("cancel")}
        </Button>
        {mode === "view" ? (
          onEdit ? (
            <Button variant="primary" size="lg" onClick={onEdit}>
              <Pencil className="size-3.5" /> {t("workspace_products.actions.edit")}
            </Button>
          ) : null
        ) : (
          <Button variant="primary" size="lg" onClick={onSave} loading={isSaving}>
            {primaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

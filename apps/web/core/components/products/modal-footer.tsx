/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Pencil } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { RequiredStatus } from "@/components/common/form-modal";

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

export function ProductModalFooter(props: Props) {
  const { mode, requiredFilled, requiredTotal, hasErrors, isSaving, primaryLabel, onCancel, onSave, onEdit } = props;
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-subtle px-7 py-3.5 md:pl-9">
      {mode !== "view" ? <RequiredStatus filled={requiredFilled} total={requiredTotal} hasErrors={hasErrors} /> : null}
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

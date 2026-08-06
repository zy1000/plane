/**
 * 提交评审：填变更原因 + 列出这次提交的需求。
 *
 * 单条与批量共用 —— 单条就是列表里只有一条。列出标题是必要的：per-requirement 审批之后
 * 一次可以提交多条，不列出来用户无法确认自己勾对了。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirement } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";

export function SubmitReviewModal({
  isOpen,
  isSubmitting,
  requirements,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  /** null 表示这一条不在当前页（跨页选中），只显示占位 */
  requirements: (TRequirement | null)[];
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) setReason("");
  }, [isOpen]);

  const visible = requirements.filter((item): item is TRequirement => Boolean(item));

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">
          {t("workspace_products.requirements.approval.submit.title", { count: requirements.length })}
        </h2>
        <p className="mt-1 text-12 leading-5 text-secondary">
          {t("workspace_products.requirements.approval.submit.description")}
        </p>

        {visible.length > 0 && (
          <div className="vertical-scrollbar scrollbar-sm mt-4 max-h-40 overflow-y-auto rounded-md border border-subtle">
            {visible.map((requirement) => (
              <div
                key={requirement.id}
                className="flex items-center gap-2 border-b border-subtle px-3 py-2 last:border-b-0"
              >
                <span className="shrink-0">
                  <BuiltinCellValue columnKey="status" values={requirement} />
                </span>
                <span className="min-w-0 flex-1 truncate text-12 text-primary">
                  {requirement.title || t("requirement_detail.untitled")}
                </span>
                {requirement.approved_version !== null && (
                  <span className="shrink-0 text-11 text-tertiary tabular-nums">v{requirement.approved_version}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-2 block text-12 font-medium text-primary">
            {t("workspace_products.requirements.approval.submit.reason")}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={2000}
            autoFocus
            className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-12 leading-5 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_products.requirements.approval.submit.reason_placeholder")}
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={() => onSubmit(reason.trim())}>
            {t("workspace_products.requirements.approval.submit.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}

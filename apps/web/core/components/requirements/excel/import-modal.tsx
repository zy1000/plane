"use client";

/**
 * 需求 Excel 导入弹窗（两步向导）：上传 → 校验预览（可勾选）→ 确认导入。
 *
 * 产品需求页与标准库条目页共用这一个弹窗，差别只是传进来的 `scope` / `entityId`。
 * 头部的三步指示里「完成」不会真的停留：导入成功即关窗 + toast。
 */

import React from "react";
import { message } from "antd";
import { ArrowRight, Check, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementExcelImportResponse, TRequirementExcelScope } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useRequirementExcelExport, useRequirementExcelImport } from "@/hooks/store/use-requirement-excel";
import { RequirementExcelStepUpload } from "./step-upload";
import { RequirementExcelStepValidate } from "./step-validate";

type TProps = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  scope: TRequirementExcelScope;
  entityId: string;
  /** 类型视图下的那一个需求类型；默认视图不传 */
  requirementTypeIds?: string[];
  onImported?: (response: TRequirementExcelImportResponse) => void | Promise<void>;
};

const STEP_KEYS = [
  "requirement_excel.modal.step_upload",
  "requirement_excel.modal.step_validate",
  "requirement_excel.modal.step_done",
] as const;

export function RequirementExcelImportModal({
  isOpen,
  onClose,
  workspaceSlug,
  scope,
  entityId,
  requirementTypeIds,
  onImported,
}: TProps) {
  const { t } = useTranslation();
  const { isDownloadingTemplate, downloadTemplate } = useRequirementExcelExport({
    workspaceSlug,
    scope,
    entityId,
    requirementTypeIds,
  });
  const {
    step,
    file,
    validation,
    selectedRowKeys,
    isValidating,
    isImporting,
    error,
    setStep,
    pickFile,
    setSelectedRowKeys,
    validate,
    confirmImport,
  } = useRequirementExcelImport({ isOpen, workspaceSlug, scope, entityId, onImported });

  const handleDownloadTemplate = async () => {
    try {
      await downloadTemplate();
    } catch (requestError: any) {
      message.error(requestError?.error ?? t("requirement_excel.template.failed"));
    }
  };

  const handleImport = async () => {
    const response = await confirmImport();
    if (!response) return;
    message.success(
      t("requirement_excel.toast.imported", {
        created: response.created_count,
        updated: response.updated_count,
      })
    );
    onClose();
  };

  const activeStep = step === "upload" ? 0 : 1;

  return (
    /* 不传 handleClose：点遮罩 / Esc 不关窗，选好的文件和校验结果不会因误触丢掉（与原先 maskClosable=false 一致） */
    <ModalCore
      isOpen={isOpen}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXXL}
      // 预览步的表格要多两列说明，比上传步宽一档
      className={step === "upload" ? "sm:max-w-[760px]" : "sm:max-w-[920px]"}
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-subtle px-6 py-4">
          <h2 className="shrink-0 text-16 font-semibold text-primary">{t("requirement_excel.modal.title")}</h2>
          <ol className="ml-10 flex w-[360px] min-w-0 items-center">
            {STEP_KEYS.map((key, index) => {
              const isActive = index === activeStep;
              const isDone = index < activeStep;
              return (
                <React.Fragment key={key}>
                  {index > 0 && <li aria-hidden className="mx-3 h-px min-w-4 flex-1 bg-layer-3" />}
                  <li
                    className={`flex shrink-0 items-center gap-2 text-13 whitespace-nowrap ${
                      isActive ? "font-semibold text-primary" : "text-tertiary"
                    }`}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "grid size-[22px] place-items-center rounded-full text-12 font-semibold",
                        isActive
                          ? "bg-accent-primary text-on-color"
                          : isDone
                            ? "bg-accent-subtle text-accent-primary"
                            : "bg-layer-1 text-tertiary"
                      )}
                    >
                      {isDone ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                    </span>
                    {t(key)}
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
          <button
            type="button"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            onClick={onClose}
            aria-label={t("close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === "upload" ? (
            <RequirementExcelStepUpload
              file={file}
              isDownloadingTemplate={isDownloadingTemplate}
              onDownloadTemplate={() => void handleDownloadTemplate()}
              onPickFile={pickFile}
              error={error}
            />
          ) : (
            <RequirementExcelStepValidate
              validation={validation}
              selectedRowKeys={selectedRowKeys}
              onSelectionChange={setSelectedRowKeys}
              error={error}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-6 py-3.5">
          {step === "validate" && (
            <Button variant="secondary" size="xl" className="mr-auto" onClick={() => setStep("upload")} disabled={isImporting}>
              {t("requirement_excel.modal.back")}
            </Button>
          )}
          <Button variant="secondary" size="xl" onClick={onClose}>
            {t("cancel")}
          </Button>
          {step === "upload" ? (
            <Button
              variant="primary"
              size="xl"
              disabled={!file}
              loading={isValidating}
              onClick={() => void validate()}
              appendIcon={<ArrowRight />}
            >
              {t("requirement_excel.modal.next_validate")}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="xl"
              disabled={selectedRowKeys.length === 0}
              loading={isImporting}
              onClick={() => void handleImport()}
            >
              {t("requirement_excel.modal.confirm")}
            </Button>
          )}
        </div>
      </div>
    </ModalCore>
  );
}

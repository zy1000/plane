"use client";

/**
 * 需求 Excel 导入弹窗（两步向导）：上传 → 校验预览（可勾选）→ 确认导入。
 *
 * 产品需求页与标准库条目页共用这一个弹窗，差别只是传进来的 `scope` / `entityId`。
 */

import React from "react";
import { Button, Modal, message } from "antd";
import { useTranslation } from "@plane/i18n";
import type { TRequirementExcelImportResponse, TRequirementExcelScope } from "@plane/types";
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

  const footer = (
    <div className="flex w-full items-center justify-between">
      <Button onClick={onClose}>{t("cancel")}</Button>
      <div className="flex items-center gap-2">
        {step === "validate" && (
          <Button onClick={() => setStep("upload")} disabled={isImporting}>
            {t("requirement_excel.modal.back")}
          </Button>
        )}
        {step === "upload" ? (
          <Button type="primary" disabled={!file} loading={isValidating} onClick={() => void validate()}>
            {t("requirement_excel.modal.next")}
          </Button>
        ) : (
          <Button
            type="primary"
            disabled={selectedRowKeys.length === 0}
            loading={isImporting}
            onClick={() => void handleImport()}
          >
            {t("requirement_excel.modal.confirm")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      title={t("requirement_excel.modal.title")}
      footer={footer}
      width={920}
      destroyOnHidden
      maskClosable={false}
    >
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
    </Modal>
  );
}

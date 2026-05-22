"use client";

/**
 * 工作项 Excel 导入弹窗（两步向导）。
 *
 * Step 1 上传 + 字段映射 → 校验
 * Step 2 校验结果 + 行级勾选 → 真正导入
 *
 * 行为细节封装在 `useImportIssues` 中；本组件只负责布局和按钮编排。
 */

import React from "react";
import { Button, Modal } from "antd";
import { StepUpload } from "./step-upload";
import { StepValidate } from "./step-validate";
import { useImportIssues } from "./use-import-issues";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  onSuccess?: () => void | Promise<void>;
};

export function ImportIssuesModal({ isOpen, onClose, workspaceSlug, projectId, onSuccess }: Props) {
  const {
    fileInputRef,
    step,
    file,
    inspect,
    mapping,
    mappingError,
    validation,
    selectedRowKeys,
    downloadingTemplate,
    inspecting,
    validating,
    importing,
    passedRowKeys,
    openPicker,
    handleFileChange,
    downloadTemplate,
    updateMapping,
    handleValidate,
    handleImport,
    setSelectedRowKeys,
    setStep,
  } = useImportIssues({ isOpen, workspaceSlug, projectId, onSuccess, onClose });

  const canValidate = !!file && !mappingError && !inspecting && !validating;
  const canImport =
    selectedRowKeys.length > 0 &&
    !importing &&
    selectedRowKeys.every((row) => passedRowKeys.has(row));

  const footer = (
    <div className="flex w-full items-center justify-between">
      <Button onClick={onClose}>取消</Button>
      <div className="flex items-center gap-2">
        {step === "validate" && (
          <Button onClick={() => setStep("upload")} disabled={validating || importing}>
            上一步
          </Button>
        )}
        {step === "upload" && (
          <Button type="primary" onClick={handleValidate} disabled={!canValidate} loading={validating}>
            下一步
          </Button>
        )}
        {step === "validate" && (
          <Button type="primary" onClick={handleImport} disabled={!canImport} loading={importing}>
            开始导入
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      title="导入工作项"
      footer={footer}
      width={920}
      destroyOnClose
      maskClosable={false}
    >
      {step === "upload" ? (
        <StepUpload
          file={file}
          inspect={inspect}
          mapping={mapping}
          inspecting={inspecting}
          downloadingTemplate={downloadingTemplate}
          fileInputRef={fileInputRef}
          onOpenPicker={openPicker}
          onFileChange={handleFileChange}
          onDownloadTemplate={downloadTemplate}
          onMappingChange={updateMapping}
        />
      ) : (
        <StepValidate
          validation={validation}
          selectedRowKeys={selectedRowKeys}
          passedRowKeys={passedRowKeys}
          onSelectionChange={setSelectedRowKeys}
        />
      )}
    </Modal>
  );
}

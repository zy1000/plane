"use client";

import React from "react";
import { message } from "antd";
import { CaseService } from "@/services/qa/case.service";
import { ModulePickerModal } from "./module-picker-modal";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  repositoryId: string;
  selectedCaseIds: string[];
  onSuccess: () => void;
};

const caseService = new CaseService();

export const MoveCaseModal: React.FC<Props> = ({
  isOpen,
  handleClose,
  workspaceSlug,
  repositoryId,
  selectedCaseIds,
  onSuccess,
}) => {
  const handleConfirm = async (moduleId: string | null) => {
    if (!moduleId) return;
    if (selectedCaseIds.length === 0) {
      message.warning("未选择任何用例");
      return;
    }
    try {
      await caseService.updateCaseModule(workspaceSlug, selectedCaseIds, moduleId);
      message.success("移动成功");
      onSuccess();
      handleClose();
    } catch (error) {
      console.error("移动用例失败:", error);
      message.error("移动用例失败");
    }
  };

  return (
    <ModulePickerModal
      isOpen={isOpen}
      title="移动到模块"
      handleClose={handleClose}
      workspaceSlug={workspaceSlug}
      repositoryId={repositoryId}
      onConfirm={handleConfirm}
    />
  );
};

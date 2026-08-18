"use client";

/**
 * 需求 Excel 出入口。
 *
 * 两个挂载点都把导入 / 导出做成一级按钮。产品需求页的「导入」还要容纳
 * 「从标准库导入」，所以那边自己组菜单；标准库条目页直接放两个按钮。
 * 共用一份 `useRequirementExcelActions`。下载导入模板只在导入弹窗里。
 */

import { useCallback, useState } from "react";
import { message } from "antd";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementExcelImportResponse, TRequirementExcelScope, TRequirementFilter } from "@plane/types";
import {
  getRequirementExcelErrorMessage,
  useRequirementExcelExport,
} from "@/hooks/store/use-requirement-excel";
import { RequirementExcelImportModal } from "./import-modal";

export type TRequirementExcelActionsArgs = {
  workspaceSlug: string;
  scope: TRequirementExcelScope;
  entityId: string;
  /** 导出跟随当前视图：所见即所得 */
  search?: string;
  filters?: TRequirementFilter[];
  requirementTypeIds?: string[];
  disabled?: boolean;
  onImported?: (response: TRequirementExcelImportResponse) => void | Promise<void>;
};

export const useRequirementExcelActions = (args: TRequirementExcelActionsArgs) => {
  const { t } = useTranslation();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { isExporting, exportExcel } = useRequirementExcelExport(args);

  const handleExport = useCallback(async () => {
    try {
      await exportExcel();
    } catch (error) {
      message.error(getRequirementExcelErrorMessage(error, t("requirement_excel.export.failed")));
    }
  }, [exportExcel, t]);

  return {
    isImportOpen,
    openImport: () => setIsImportOpen(true),
    closeImport: () => setIsImportOpen(false),
    isExporting,
    handleExport,
  };
};

/** 标准库条目页：导入、导出两个按钮 + 导入弹窗。 */
export function RequirementExcelMenu(args: TRequirementExcelActionsArgs) {
  const { t } = useTranslation();
  const actions = useRequirementExcelActions(args);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="lg" disabled={args.disabled} onClick={actions.openImport}>
          {t("common.import")}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={args.disabled || actions.isExporting}
          onClick={() => void actions.handleExport()}
        >
          {t("export")}
        </Button>
      </div>
      <RequirementExcelImportModal
        isOpen={actions.isImportOpen}
        onClose={actions.closeImport}
        workspaceSlug={args.workspaceSlug}
        scope={args.scope}
        entityId={args.entityId}
        requirementTypeIds={args.requirementTypeIds}
        onImported={args.onImported}
      />
    </>
  );
}

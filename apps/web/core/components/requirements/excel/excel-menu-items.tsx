"use client";

/**
 * 需求 Excel 出入口的菜单项与独立菜单。
 *
 * 两个挂载点长得不一样：产品需求页把这三项并进已有的「录入 / 从标准库导入」下拉，
 * 标准库条目页没有这样的下拉，需要一个自带按钮的独立菜单。所以这里同时导出
 * 「只有菜单项」和「菜单 + 弹窗一体」两种形态，共用一份 `useRequirementExcelActions`。
 */

import { useCallback, useState } from "react";
import { message } from "antd";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CustomMenu } from "@plane/ui";
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
  const { isExporting, isDownloadingTemplate, exportExcel, downloadTemplate } = useRequirementExcelExport(args);

  const handleExport = useCallback(async () => {
    try {
      await exportExcel();
    } catch (error) {
      message.error(getRequirementExcelErrorMessage(error, t("requirement_excel.export.failed")));
    }
  }, [exportExcel, t]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      await downloadTemplate();
    } catch (error) {
      message.error(getRequirementExcelErrorMessage(error, t("requirement_excel.template.failed")));
    }
  }, [downloadTemplate, t]);

  return {
    isImportOpen,
    openImport: () => setIsImportOpen(true),
    closeImport: () => setIsImportOpen(false),
    isExporting,
    isDownloadingTemplate,
    handleExport,
    handleDownloadTemplate,
  };
};

type TMenuItemsProps = {
  isExporting: boolean;
  isDownloadingTemplate: boolean;
  disabled?: boolean;
  onExport: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
};

/** 三个菜单项。调用方自己负责把 RequirementExcelImportModal 挂在菜单之外。 */
export function RequirementExcelMenuItems({
  isExporting,
  isDownloadingTemplate,
  disabled,
  onExport,
  onImport,
  onDownloadTemplate,
}: TMenuItemsProps) {
  const { t } = useTranslation();
  return (
    <>
      <CustomMenu.MenuItem onClick={onImport} disabled={disabled}>
        <span className="flex items-center gap-2">
          <Upload className="size-3.5" />
          {t("requirement_excel.menu.import")}
        </span>
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={onExport} disabled={disabled || isExporting}>
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="size-3.5" />
          {t("requirement_excel.menu.export")}
        </span>
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={onDownloadTemplate} disabled={disabled || isDownloadingTemplate}>
        <span className="flex items-center gap-2">
          <Download className="size-3.5" />
          {t("requirement_excel.menu.template")}
        </span>
      </CustomMenu.MenuItem>
    </>
  );
}

/** 自带按钮的独立菜单 + 弹窗。标准库条目页用这个。 */
export function RequirementExcelMenu(args: TRequirementExcelActionsArgs) {
  const { t } = useTranslation();
  const actions = useRequirementExcelActions(args);

  return (
    <>
      <CustomMenu
        placement="bottom-end"
        closeOnSelect
        maxHeight="lg"
        customButtonClassName="flex h-7 items-center gap-1 rounded-md border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none hover:bg-layer-transparent-hover"
        customButton={
          <span className="flex items-center gap-1">
            <FileSpreadsheet className="size-3.5" />
            {t("requirement_excel.menu.label")}
          </span>
        }
        ariaLabel={t("requirement_excel.menu.label")}
      >
        <RequirementExcelMenuItems
          isExporting={actions.isExporting}
          isDownloadingTemplate={actions.isDownloadingTemplate}
          disabled={args.disabled}
          onExport={() => void actions.handleExport()}
          onImport={actions.openImport}
          onDownloadTemplate={() => void actions.handleDownloadTemplate()}
        />
      </CustomMenu>
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

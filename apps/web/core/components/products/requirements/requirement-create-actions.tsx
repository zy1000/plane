import { ChevronDown, Download, Plus, Upload } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button, getButtonStyling } from "@plane/propel/button";
import { CustomMenu } from "@plane/ui";
import type { TRequirementExcelImportResponse, TRequirementFilter } from "@plane/types";
import { cn } from "@plane/utils";
import { RequirementExcelImportModal, useRequirementExcelActions } from "@/components/requirements/excel";
import { REQUIREMENT_TOOLBAR_BUTTON_CLASS } from "@/components/requirements/requirement-data-toolbar";

type TRequirementCreateActionsProps = {
  onManualEntry: () => void;
  onImport: () => void;
  /** 没有「查看需求标准库」时不给「从标准库导入」入口（后端同样 403） */
  canImportFromLibrary?: boolean;
  onImportPrefetch?: () => void;
  /** Excel 出入口。给了才渲染导入菜单里的 Excel 项，以及导出按钮 */
  excel?: {
    workspaceSlug: string;
    productId: string;
    search?: string;
    filters?: TRequirementFilter[];
    /** 类型视图下的那一个需求类型；默认视图不传，导出按类型分 Sheet 导全部 */
    requirementTypeIds?: string[];
    onImported?: (response: TRequirementExcelImportResponse) => void | Promise<void>;
  };
};

/**
 * 「导入」「导出」「添加需求」三个一级按钮，主按钮放最右。
 * 导入有标准库 / Excel 两条路，收进同一个「导入」按钮，避免四个按钮并排。
 */
export function RequirementCreateActions({
  onManualEntry,
  onImport,
  canImportFromLibrary = true,
  onImportPrefetch,
  excel,
}: TRequirementCreateActionsProps) {
  const { t } = useTranslation();
  const excelActions = useRequirementExcelActions({
    workspaceSlug: excel?.workspaceSlug ?? "",
    scope: "product",
    entityId: excel?.productId ?? "",
    search: excel?.search,
    filters: excel?.filters,
    requirementTypeIds: excel?.requirementTypeIds,
    onImported: excel?.onImported,
  });

  return (
    <div className="flex items-center gap-2" onMouseEnter={onImportPrefetch} onFocus={onImportPrefetch}>
      {excel ? (
        <CustomMenu
          placement="bottom-end"
          closeOnSelect
          maxHeight="lg"
          customButtonClassName={cn(getButtonStyling("secondary", "xl"), REQUIREMENT_TOOLBAR_BUTTON_CLASS)}
          customButton={
            <>
              <Upload className="size-[15px] shrink-0" />
              {t("common.import")}
              <ChevronDown className="size-3.5 shrink-0 text-placeholder" />
            </>
          }
          ariaLabel={t("common.import")}
        >
          {canImportFromLibrary && (
            <CustomMenu.MenuItem onClick={onImport}>
              {t("workspace_products.requirements.data.import_from_library_full")}
            </CustomMenu.MenuItem>
          )}
          <CustomMenu.MenuItem onClick={excelActions.openImport}>
            {t("requirement_excel.menu.import")}
          </CustomMenu.MenuItem>
        </CustomMenu>
      ) : (
        canImportFromLibrary && (
          <Button variant="secondary" size="xl" className={REQUIREMENT_TOOLBAR_BUTTON_CLASS} onClick={onImport}>
            <Upload className="size-[15px] shrink-0" />
            {t("common.import")}
          </Button>
        )
      )}
      {excel && (
        <>
          <Button
            variant="secondary"
            size="xl"
            className={REQUIREMENT_TOOLBAR_BUTTON_CLASS}
            disabled={excelActions.isExporting}
            onClick={() => void excelActions.handleExport()}
          >
            <Download className="size-[15px] shrink-0" />
            {t("export")}
          </Button>
          <RequirementExcelImportModal
            isOpen={excelActions.isImportOpen}
            onClose={excelActions.closeImport}
            workspaceSlug={excel.workspaceSlug}
            scope="product"
            entityId={excel.productId}
            requirementTypeIds={excel.requirementTypeIds}
            onImported={excel.onImported}
          />
        </>
      )}
      <Button variant="primary" size="xl" className={REQUIREMENT_TOOLBAR_BUTTON_CLASS} onClick={onManualEntry}>
        <Plus className="size-[15px] shrink-0" />
        {t("requirement_grid.data.add")}
      </Button>
    </div>
  );
}

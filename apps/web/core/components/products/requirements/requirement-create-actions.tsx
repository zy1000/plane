import { useTranslation } from "@plane/i18n";
import { Button, getButtonStyling } from "@plane/propel/button";
import { CustomMenu } from "@plane/ui";
import type { TRequirementExcelImportResponse, TRequirementFilter } from "@plane/types";
import { RequirementExcelImportModal, useRequirementExcelActions } from "@/components/requirements/excel";

type TRequirementCreateActionsProps = {
  onManualEntry: () => void;
  onImport: () => void;
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
 * 「添加需求」「导入」「导出」三个一级按钮，排布与标准库条目页一致。
 * 导入有标准库 / Excel 两条路，收进同一个「导入」按钮，避免四个按钮并排。
 */
export function RequirementCreateActions({
  onManualEntry,
  onImport,
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
      <Button variant="primary" size="lg" onClick={onManualEntry}>
        {t("requirement_grid.data.add")}
      </Button>
      {excel ? (
        <CustomMenu
          placement="bottom-end"
          closeOnSelect
          maxHeight="lg"
          customButtonClassName={getButtonStyling("secondary", "lg")}
          customButton={<span>{t("common.import")}</span>}
          ariaLabel={t("common.import")}
        >
          <CustomMenu.MenuItem onClick={onImport}>
            {t("workspace_products.requirements.data.import_from_library_full")}
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={excelActions.openImport}>
            {t("requirement_excel.menu.import")}
          </CustomMenu.MenuItem>
        </CustomMenu>
      ) : (
        <Button variant="secondary" size="lg" onClick={onImport}>
          {t("common.import")}
        </Button>
      )}
      {excel && (
        <>
          <Button
            variant="secondary"
            size="lg"
            disabled={excelActions.isExporting}
            onClick={() => void excelActions.handleExport()}
          >
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
    </div>
  );
}

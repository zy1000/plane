import { ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CustomMenu } from "@plane/ui";
import type { TRequirementExcelImportResponse, TRequirementFilter } from "@plane/types";
import {
  RequirementExcelImportModal,
  RequirementExcelMenuItems,
  useRequirementExcelActions,
} from "@/components/requirements/excel";

type TRequirementCreateActionsProps = {
  onManualEntry: () => void;
  onImport: () => void;
  onImportPrefetch?: () => void;
  /** Excel 出入口。给了才渲染那三项 */
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
 * 「录入」为主操作；「从标准库导入」与 Excel 导入 / 导出收进右侧下拉，避免多个一级按钮
 * 抢注意力。
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
    <div className="inline-flex items-stretch" onMouseEnter={onImportPrefetch} onFocus={onImportPrefetch}>
      <Button variant="primary" size="lg" className="rounded-r-none" onClick={onManualEntry}>
        {t("workspace_products.requirements.data.manual_entry")}
      </Button>
      <CustomMenu
        placement="bottom-end"
        closeOnSelect
        maxHeight="lg"
        customButtonClassName="flex h-7 items-center rounded-l-none rounded-r-md border-l border-white/20 bg-accent-primary px-1.5 text-on-color outline-none hover:bg-accent-primary-hover active:bg-accent-primary-active disabled:bg-layer-disabled"
        customButton={
          <span className="grid place-items-center">
            <ChevronDown className="size-3.5" aria-hidden />
          </span>
        }
        ariaLabel={t("workspace_products.requirements.data.more_create_actions")}
      >
        <CustomMenu.MenuItem onClick={onImport}>
          {t("workspace_products.requirements.data.import_from_library_full")}
        </CustomMenu.MenuItem>
        {excel && (
          <RequirementExcelMenuItems
            isExporting={excelActions.isExporting}
            isDownloadingTemplate={excelActions.isDownloadingTemplate}
            onExport={() => void excelActions.handleExport()}
            onImport={excelActions.openImport}
            onDownloadTemplate={() => void excelActions.handleDownloadTemplate()}
          />
        )}
      </CustomMenu>
      {excel && (
        <RequirementExcelImportModal
          isOpen={excelActions.isImportOpen}
          onClose={excelActions.closeImport}
          workspaceSlug={excel.workspaceSlug}
          scope="product"
          entityId={excel.productId}
          requirementTypeIds={excel.requirementTypeIds}
          onImported={excel.onImported}
        />
      )}
    </div>
  );
}

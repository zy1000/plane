import { ChevronDown } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CustomMenu } from "@plane/ui";

type TRequirementCreateActionsProps = {
  onManualEntry: () => void;
  onImport: () => void;
  onImportPrefetch?: () => void;
};

/**
 * 「录入」为主操作；「从标准库导入」收进右侧下拉，避免两个一级按钮抢注意力。
 */
export function RequirementCreateActions({
  onManualEntry,
  onImport,
  onImportPrefetch,
}: TRequirementCreateActionsProps) {
  const { t } = useTranslation();

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
      </CustomMenu>
    </div>
  );
}

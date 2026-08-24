"use client";

import { Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TRequirementModulesStore } from "@/hooks/store/use-requirement-modules";
import { RequirementModuleTree } from "./module-tree";

type TProps = {
  store: TRequirementModulesStore;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
};

/**
 * 项目需求页左侧的只读模块树。
 *
 * 树来自「已关联需求所涉及的产品模块」（祖先闭包 + 子树计数），项目本身不落
 * 模块字段。单产品拍平直接展示；多产品按产品分组，组标题不可点击过滤。
 */
export const ProjectRequirementModuleSidebar = (props: TProps) => {
  const { store, selectedModuleId, onSelect } = props;
  const { t } = useTranslation();
  const groups = store.groups;
  const isAllActive = selectedModuleId === null;

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-subtle bg-surface-2 sm:flex">
      <div className="px-3 pt-3 pb-1.5 text-caption-sm-medium text-tertiary">
        {t("requirement_modules.sidebar_label")}
      </div>
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {/* 「全部需求」——不传 module_id 的口径，未挂靠模块的需求也在其中 */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors",
            isAllActive
              ? "bg-accent-primary/10 text-accent-primary"
              : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
          )}
        >
          <Layers className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">{t("requirement_modules.all")}</span>
          <span
            className={cn(
              "text-caption-sm-medium tabular-nums",
              isAllActive ? "text-accent-primary" : "text-placeholder"
            )}
          >
            {store.total}
          </span>
        </button>
        {groups.length === 0 && !store.isLoading && (
          <div className="text-caption-sm px-2 py-3 text-tertiary">{t("requirement_modules.empty")}</div>
        )}
        {groups.map((group) => (
          <div key={group.product_id} className="mt-1">
            {/* 多产品才显示组标题；组标题只是分隔，不参与过滤 */}
            {groups.length > 1 && (
              <div className="flex items-center justify-between gap-2 px-2 pt-2 pb-1">
                <span className="min-w-0 truncate text-caption-sm-medium text-tertiary">{group.product_name}</span>
                <span className="text-caption-sm-medium text-placeholder tabular-nums">{group.total}</span>
              </div>
            )}
            <RequirementModuleTree
              modules={group.modules}
              total={group.total}
              selectedModuleId={selectedModuleId}
              onSelect={onSelect}
              readonly
              showAllNode={false}
            />
          </div>
        ))}
      </div>
    </aside>
  );
};

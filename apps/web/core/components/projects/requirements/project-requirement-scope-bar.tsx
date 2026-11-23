import { Fragment } from "react";
import { useTranslation } from "@plane/i18n";
import type { TProductProject, TProjectRequirementModuleGroup, TRequirementModule } from "@plane/types";

type TProps = {
  groups: TProjectRequirementModuleGroup[];
  productLinks: TProductProject[];
  selectedProductId: string | null;
  selectedModuleId: string | null;
  totalCount: number;
  /** 列表加载中不显示条数，免得先闪一下「共 0 条」 */
  isLoading: boolean;
  onSelectModule: (moduleId: string | null) => void;
};

/** 选中模块的祖先链（含自己），找不到返回空 */
const findModuleTrail = (modules: TRequirementModule[], moduleId: string): TRequirementModule[] => {
  for (const item of modules) {
    if (item.id === moduleId) return [item];
    const trail = findModuleTrail(item.children ?? [], moduleId);
    if (trail.length) return [item, ...trail];
  }
  return [];
};

/**
 * 表格上方的范围行：左栏选了什么，这里就写什么（产品 / 模块路径 + 条数）。
 * 路径上的前几段可点，回到上一级。
 */
export const ProjectRequirementScopeBar = (props: TProps) => {
  const { groups, productLinks, selectedProductId, selectedModuleId, totalCount, isLoading, onSelectModule } = props;
  const { t } = useTranslation();

  const group = selectedProductId ? groups.find((item) => item.product_id === selectedProductId) : undefined;
  const link = selectedProductId ? productLinks.find((item) => item.product === selectedProductId) : undefined;
  const productName =
    group?.product_name || group?.product_identifier || link?.product_name || link?.product_identifier || "";
  const trail = group && selectedModuleId ? findModuleTrail(group.modules, selectedModuleId) : [];

  const crumbs: { key: string; label: string; onClick: () => void }[] = [];
  let title = t("requirement_modules.all");
  if (selectedProductId) {
    if (trail.length) {
      crumbs.push({
        key: selectedProductId,
        label: productName,
        onClick: () => onSelectModule(null),
      });
      trail.slice(0, -1).forEach((item) =>
        crumbs.push({ key: item.id, label: item.name, onClick: () => onSelectModule(item.id) })
      );
      title = trail[trail.length - 1].name;
    } else {
      title = productName;
    }
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-subtle px-page-x">
      <div className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb) => (
          <Fragment key={crumb.key}>
            <button
              type="button"
              onClick={crumb.onClick}
              className="max-w-[200px] shrink-0 truncate text-13 text-tertiary hover:text-primary"
            >
              {crumb.label}
            </button>
            <span aria-hidden className="text-13 text-placeholder">
              /
            </span>
          </Fragment>
        ))}
        <h2 className="truncate text-14 font-semibold text-primary">{title}</h2>
      </div>
      {!isLoading && (
        <span className="shrink-0 text-13 text-tertiary">
          {t("project_requirements.scope_count", { count: totalCount })}
        </span>
      )}
    </div>
  );
};

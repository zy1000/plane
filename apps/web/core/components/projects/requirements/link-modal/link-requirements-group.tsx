/**
 * 关联研发需求弹窗里的一个产品分组：组头（整组勾选 / 展开收起 / 已选数）+ 组内需求行 + 加载更多。
 * 行整行可点，与关联产品弹窗的表格同一套写法；勾选框只负责画，不单独接 onChange，避免点一次翻两次。
 */
import { ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TLogoProps, TRequirement } from "@plane/types";
import { Checkbox, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { REQUIREMENT_APPROVAL_PILL } from "@/components/products/requirements/approval/requirement-approval-cell";
import { ProductPickTile } from "@/components/projects/products/project-products-table";
import { RequirementStatusCell } from "@/components/requirements/requirement-status-cell";
import type { TLinkableGroupState } from "./use-linkable-requirement-groups";

export const LINK_ROW_GRID =
  "grid grid-cols-[1.125rem_7.75rem_minmax(0,1fr)_5.25rem_5.5rem] items-center gap-x-3.5 pr-5 pl-5";

export type TLinkGroupProduct = {
  id: string;
  name: string;
  identifier: string;
  logoProps: TLogoProps | null;
};

const LinkRequirementRow = ({
  row,
  typeName,
  isSelected,
  onToggle,
}: {
  row: TRequirement;
  typeName: string | undefined;
  isSelected: boolean;
  onToggle: (row: TRequirement) => void;
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      onClick={() => onToggle(row)}
      className={cn(
        LINK_ROW_GRID,
        "h-14.5 w-full border-b border-subtle text-left transition-colors",
        isSelected ? "bg-accent-primary/5 hover:bg-accent-primary/10" : "hover:bg-layer-transparent-hover"
      )}
    >
      <span className="pointer-events-none flex">
        <Checkbox checked={isSelected} readOnly tabIndex={-1} />
      </span>
      <span className="truncate font-mono text-12 font-semibold tracking-wide text-tertiary" title={row.display_id ?? ""}>
        {row.display_id ?? "—"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-14 font-medium text-primary" title={row.title}>
          {row.title || "—"}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-12 text-placeholder">
          {row.module_name && (
            <>
              <FolderOpen className="size-3 shrink-0" />
              <span className="truncate">{row.module_name}</span>
            </>
          )}
          {row.module_name && typeName && <span aria-hidden className="size-0.5 shrink-0 rounded-full bg-placeholder" />}
          {typeName && <span className="truncate">{typeName}</span>}
        </span>
      </span>
      <span className="flex min-w-0">
        <RequirementStatusCell status={row.status} />
      </span>
      <span className="flex min-w-0">
        <span
          className={cn(
            "inline-flex h-5 min-w-0 items-center rounded px-1.5 text-11 font-medium whitespace-nowrap",
            REQUIREMENT_APPROVAL_PILL[row.approval_state]
          )}
        >
          <span className="truncate">{t(`requirement_approval.state.${row.approval_state}`)}</span>
        </span>
      </span>
    </button>
  );
};

type TProps = {
  product: TLinkGroupProduct;
  total: number;
  selectedCount: number;
  isExpanded: boolean;
  /** 整组勾选时正在拉全组的行 */
  isSelecting: boolean;
  state: TLinkableGroupState | undefined;
  selectedIds: ReadonlySet<string>;
  typeNames: ReadonlyMap<string, string>;
  onToggleExpand: () => void;
  onToggleGroup: () => void;
  onToggleRow: (row: TRequirement) => void;
  onLoadMore: () => void;
};

export const LinkRequirementsGroup = (props: TProps) => {
  const {
    product,
    total,
    selectedCount,
    isExpanded,
    isSelecting,
    state,
    selectedIds,
    typeNames,
    onToggleExpand,
    onToggleGroup,
    onToggleRow,
    onLoadMore,
  } = props;
  const { t } = useTranslation();
  const isAllSelected = total > 0 && selectedCount >= total;
  const title = product.name || product.identifier;
  const remaining = total - (state?.rows.length ?? 0);

  return (
    <section>
      <div className="sticky top-9.5 z-[1] flex h-11.5 items-center gap-2.5 border-b border-subtle bg-layer-1 pr-5 pl-5">
        <button
          type="button"
          role="checkbox"
          aria-checked={isAllSelected ? true : selectedCount > 0 ? "mixed" : false}
          aria-label={t("project_requirements.linkable.select_group", { product: title })}
          disabled={isSelecting}
          onClick={onToggleGroup}
          className="flex shrink-0 disabled:cursor-wait"
        >
          <span className="pointer-events-none flex">
            <Checkbox checked={isAllSelected} indeterminate={!isAllSelected && selectedCount > 0} readOnly tabIndex={-1} />
          </span>
        </button>
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={onToggleExpand}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="size-3.75 shrink-0 text-tertiary" />
          ) : (
            <ChevronRight className="size-3.75 shrink-0 text-tertiary" />
          )}
          <ProductPickTile logoProps={product.logoProps} size="sm" />
          <span className="truncate text-14 font-semibold text-primary" title={title}>
            {title}
          </span>
          <span className="shrink-0 font-mono text-12 font-semibold tracking-wide text-placeholder">
            {product.identifier}
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 text-12 tabular-nums",
              selectedCount > 0 ? "font-medium text-accent-primary" : "text-tertiary"
            )}
          >
            {selectedCount > 0
              ? t("project_requirements.linkable.group_selected", { selected: selectedCount, total })
              : t("project_requirements.linkable.group_count", { count: total })}
          </span>
        </button>
      </div>

      {isExpanded && (
        <>
          {state?.rows.map((row) => (
            <LinkRequirementRow
              key={row.id}
              row={row}
              typeName={row.requirement_type_id ? typeNames.get(row.requirement_type_id) : undefined}
              isSelected={selectedIds.has(row.id)}
              onToggle={onToggleRow}
            />
          ))}
          {state?.isLoading && (
            <Loader className="space-y-1 px-5 py-2">
              <Loader.Item height="44px" />
              <Loader.Item height="44px" />
            </Loader>
          )}
          {state && !state.isLoading && (state.error || state.hasMore) && (
            <div className="flex h-11 items-center border-b border-subtle px-5 text-13">
              {state.error ? (
                <>
                  <span className="text-danger-primary">{t("project_requirements.linkable.load_failed")}</span>
                  <button type="button" onClick={onLoadMore} className="ml-3 font-medium text-accent-primary">
                    {t("retry")}
                  </button>
                </>
              ) : (
                <button type="button" onClick={onLoadMore} className="font-medium text-accent-primary">
                  {t("project_requirements.linkable.load_more", { count: Math.max(remaining, 0) })}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};

/**
 * 关联研发需求弹窗右侧的「已选」栏：按产品分组，可逐条移除、一键清空。
 * 还没关联本项目的产品组带「自动关联」—— 提交时服务端会把它们一并关联进来。
 */
import { ListChecks } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import type { TRequirement } from "@plane/types";
import { ProductPickTile } from "@/components/projects/products/project-products-table";
import type { TLinkGroupProduct } from "./link-requirements-group";

export const AutoLinkTag = () => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] border border-warning-subtle bg-warning-subtle px-1.5 text-11 font-semibold text-warning-primary">
      {t("project_requirements.linkable.auto_link_tag")}
    </span>
  );
};

export type TSelectedRailGroup = {
  product: TLinkGroupProduct;
  isLinked: boolean;
  rows: TRequirement[];
};

type TProps = {
  groups: TSelectedRailGroup[];
  count: number;
  onRemove: (requirementId: string) => void;
  onClear: () => void;
};

export const LinkRequirementsSelectedRail = ({ groups, count, onRemove, onClear }: TProps) => {
  const { t } = useTranslation();

  return (
    <aside className="flex min-h-0 flex-col border-subtle bg-surface-2 max-lg:border-t lg:border-l">
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-subtle px-5">
        <span className="text-14 font-semibold text-primary">{t("project_requirements.linkable.selected_panel")}</span>
        <span
          className={
            count > 0
              ? "inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-accent-primary px-1.5 text-12 font-semibold text-on-color tabular-nums"
              : "inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-layer-3 px-1.5 text-12 font-semibold text-tertiary tabular-nums"
          }
        >
          {count}
        </span>
        {count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-13 font-medium text-accent-primary hover:text-accent-secondary"
          >
            {t("project_requirements.linkable.clear")}
          </button>
        )}
      </div>

      <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {count === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 pb-10 text-center">
            <span className="grid size-11 place-items-center rounded-xl border border-subtle bg-surface-1 text-placeholder">
              <ListChecks className="size-5" />
            </span>
            <p className="mt-3.5 text-14 font-medium text-secondary">{t("project_requirements.linkable.selected_empty")}</p>
            <p className="mt-1.5 text-13 leading-5 text-tertiary">
              {t("project_requirements.linkable.selected_empty_hint")}
            </p>
          </div>
        ) : (
          groups.map(({ product, isLinked, rows }) => (
            <section key={product.id}>
              <h4 className="mx-2 mt-4 mb-2 flex items-center gap-2 text-12 font-semibold text-tertiary">
                <ProductPickTile logoProps={product.logoProps} size="xs" />
                <span className="truncate" title={product.name || product.identifier}>
                  {product.name || product.identifier}
                </span>
                {!isLinked && (
                  <span className="ml-auto">
                    <AutoLinkTag />
                  </span>
                )}
                <span className={isLinked ? "ml-auto font-medium text-placeholder" : "font-medium text-placeholder"}>
                  {rows.length}
                </span>
              </h4>
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="mb-1.5 flex items-center gap-2 rounded-[10px] border border-subtle bg-surface-1 py-2 pr-1.5 pl-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-11 font-semibold tracking-wide text-placeholder">
                      {row.display_id}
                    </span>
                    <span className="mt-0.5 block truncate text-13 font-medium text-primary" title={row.title}>
                      {row.title || "—"}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={t("project_requirements.linkable.remove", { title: row.title })}
                    onClick={() => onRemove(row.id)}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-placeholder hover:bg-layer-transparent-hover hover:text-primary"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
};

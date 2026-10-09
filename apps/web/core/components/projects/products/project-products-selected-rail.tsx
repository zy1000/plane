/**
 * 关联产品弹窗右侧的「已选产品」栏：本次新增 / 已关联 / 将解除 三组。
 * 表格默认按本项目代号筛选，代号不同的已关联产品在表格里看不到，在这里仍然看得见、能移除或撤销。
 */
import type { ReactNode } from "react";
import { Lock, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import type { TProductPickItem, TProductPickState } from "./picker-items";
import { ProductPickTile } from "./project-products-table";

type TRailEntry = { item: TProductPickItem; state: TProductPickState };

const RailItem = ({ item, state, onToggle }: TRailEntry & { onToggle: (productId: string) => void }) => {
  const { t } = useTranslation();
  const title = item.name || item.identifier;
  const isRemoved = state === "remove";

  let action: ReactNode;
  if (state === "locked") {
    action = (
      <Tooltip tooltipContent={t("project_products.locked_hint", { count: item.requirementCount })} position="left">
        <span className="grid size-7.5 shrink-0 place-items-center text-placeholder">
          <Lock className="size-3.75" />
        </span>
      </Tooltip>
    );
  } else if (isRemoved) {
    action = (
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-13 font-medium text-accent-primary hover:bg-layer-transparent-hover"
      >
        <Undo2 className="size-3.5" />
        {t("project_products.rail.undo")}
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        aria-label={t("project_products.rail.remove", { name: title })}
        onClick={() => onToggle(item.id)}
        className="grid size-7.5 shrink-0 place-items-center rounded-md text-placeholder hover:bg-layer-transparent-hover hover:text-primary"
      >
        <CloseIcon className="size-3.75" />
      </button>
    );
  }

  return (
    <div className="flex min-h-13 items-center gap-2.5">
      <span className={cn(isRemoved && "opacity-50 grayscale")}>
        <ProductPickTile logoProps={item.logoProps} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn("block truncate text-14 font-medium", isRemoved ? "text-placeholder line-through" : "text-primary")}
          title={title}
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate text-12 text-tertiary" title={item.code || undefined}>
          <span className="font-mono font-semibold tracking-wide text-secondary">{item.identifier}</span>
          {item.code ? ` · ${item.code}` : null}
        </span>
      </span>
      {action}
    </div>
  );
};

const RailGroup = ({
  title,
  entries,
  onToggle,
}: {
  title: string;
  entries: TRailEntry[];
  onToggle: (productId: string) => void;
}) => {
  if (entries.length === 0) return null;
  return (
    <section className="mt-4.5">
      <h4 className="mb-1 flex items-center gap-1.5 text-12 font-semibold tracking-wide text-tertiary">
        {title}
        <span className="text-placeholder tabular-nums">{entries.length}</span>
      </h4>
      {entries.map((entry) => (
        <RailItem key={entry.item.id} {...entry} onToggle={onToggle} />
      ))}
    </section>
  );
};

type TProps = {
  added: TRailEntry[];
  kept: TRailEntry[];
  removed: TRailEntry[];
  onToggle: (productId: string) => void;
  onClose: () => void;
};

export const ProjectProductsSelectedRail = ({ added, kept, removed, onToggle, onClose }: TProps) => {
  const { t } = useTranslation();
  const isEmpty = added.length + kept.length + removed.length === 0;

  return (
    <aside className="flex min-h-0 flex-col border-subtle bg-surface-2 max-lg:border-t lg:rounded-tr-2xl lg:border-l">
      <div className="flex shrink-0 items-center justify-between pt-5 pr-4 pl-6">
        <div className="flex items-baseline gap-2">
          <span className="text-16 font-semibold text-primary">{t("project_products.rail.title")}</span>
          <span className="text-15 font-semibold text-accent-primary tabular-nums">{added.length + kept.length}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
      <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto pr-4 pb-4 pl-6">
        {isEmpty ? (
          <p className="pt-8 text-center text-13 text-tertiary">{t("project_products.rail.empty")}</p>
        ) : (
          <>
            <RailGroup title={t("project_products.rail.added")} entries={added} onToggle={onToggle} />
            <RailGroup title={t("project_products.rail.kept")} entries={kept} onToggle={onToggle} />
            <RailGroup title={t("project_products.rail.removed")} entries={removed} onToggle={onToggle} />
          </>
        )}
      </div>
    </aside>
  );
};

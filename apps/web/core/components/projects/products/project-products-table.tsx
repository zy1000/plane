/**
 * 关联产品弹窗左侧的产品表格：勾选 / 产品 / 项目代号 / 开发编号 / 状态。
 * 整行可点；状态列直接写出这次会发生什么（新增 / 将解除），已有需求引用的已关联产品锁住不能取消。
 */
import { Lock, Package } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import type { TLogoProps } from "@plane/types";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductKindIcon, ProductSetTreeGuide } from "@/components/products/sets/product-set-tree";
import type { TProductPickItem, TProductPickState } from "./picker-items";
import { getProductPickState } from "./picker-items";

const ROW_GRID = "grid grid-cols-[1rem_minmax(0,1fr)_14rem_7rem_9rem] items-center gap-x-3.5 px-3.5";

const TILE_SIZE_CLASS = {
  md: "size-7.5 rounded-lg",
  sm: "size-7 rounded-md",
  xs: "size-5 rounded-[5px]",
} as const;

export const ProductPickTile = ({
  logoProps,
  size = "md",
}: {
  logoProps: TLogoProps | null;
  size?: keyof typeof TILE_SIZE_CLASS;
}) => (
  <span
    className={cn("grid shrink-0 place-items-center text-accent-primary", TILE_SIZE_CLASS[size])}
  >
    {logoProps?.in_use ? (
      <Logo logo={logoProps} size={size === "xs" ? 12 : 16} />
    ) : (
      <Package className={size === "xs" ? "size-3" : "size-4"} strokeWidth={1.8} />
    )}
  </span>
);

const ProductPickStatusBadge = ({ item, state }: { item: TProductPickItem; state: TProductPickState }) => {
  const { t } = useTranslation();
  if (state === "none") return null;
  const label =
    state === "locked"
      ? t("project_products.status.linked_with_requirements", { count: item.requirementCount })
      : state === "linked"
        ? t("project_products.status.linked")
        : state === "remove"
          ? t("project_products.status.will_remove")
          : t("project_products.status.new");
  return (
    <span
      className={cn(
        "inline-flex h-5.5 max-w-full items-center gap-1 rounded-md px-2 text-12 font-medium whitespace-nowrap",
        state === "new" && "bg-accent-subtle text-accent-primary",
        state === "remove" && "border border-danger-subtle bg-danger-subtle text-danger-primary",
        (state === "linked" || state === "locked") && "bg-layer-2 text-secondary"
      )}
    >
      {state === "locked" && <Lock className="size-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );
};

type TRowProps = {
  item: TProductPickItem;
  isSelected: boolean;
  onToggle: (productId: string) => void;
  /** 挂在产品集下面的子行：左侧缩进并画连线 */
  child?: { isLast: boolean };
};

const ProjectProductsTableRow = ({ item, isSelected, onToggle, child }: TRowProps) => {
  const { t } = useTranslation();
  const state = getProductPickState(item, isSelected);
  const isLocked = state === "locked";
  const title = item.name || item.identifier;

  const row = (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "locked" || state === "linked" || state === "new"}
      aria-disabled={isLocked}
      // 锁定行不用 disabled：disabled 按钮收不到悬停，提示就出不来
      onClick={() => {
        if (!isLocked) onToggle(item.id);
      }}
      className={cn(
        ROW_GRID,
        "relative h-14 w-full border-b text-left transition-colors",
        child && !child.isLast ? "border-transparent" : "border-subtle",
        isLocked && "cursor-default bg-accent-primary/5",
        (state === "linked" || state === "new") && "bg-accent-primary/5 hover:bg-accent-primary/10",
        state === "remove" && "bg-danger-subtle",
        state === "none" && "hover:bg-layer-transparent-hover"
      )}
    >
      {/* 勾选由整行承担，Checkbox 只负责画，不单独接 onChange，避免点一次翻两次 */}
      <span className="pointer-events-none flex">
        <Checkbox checked={state !== "remove" && state !== "none"} disabled={isLocked} readOnly tabIndex={-1} />
      </span>
      <span className={cn("flex min-w-0 items-center gap-2.5", child && "pl-7")}>
        {child && <ProductSetTreeGuide left={59} isLast={child.isLast} />}
        <ProductPickTile logoProps={item.logoProps} />
        <span className="truncate text-14 font-medium text-primary" title={title}>
          {title}
        </span>
      </span>
      <span className="truncate text-13 text-secondary" title={item.code || undefined}>
        {item.code || "—"}
      </span>
      <span className="truncate font-mono text-13 font-semibold tracking-wide text-primary" title={item.identifier}>
        {item.identifier}
      </span>
      <span className="flex min-w-0">
        <ProductPickStatusBadge item={item} state={state} />
      </span>
    </button>
  );

  if (!isLocked) return row;
  return (
    <Tooltip
      tooltipContent={t("project_products.locked_hint", { count: item.requirementCount })}
      position="top-start"
    >
      {row}
    </Tooltip>
  );
};

type TPickBlock =
  | { kind: "product"; item: TProductPickItem }
  | { kind: "set"; set: NonNullable<TProductPickItem["productSet"]>; items: TProductPickItem[] };

/**
 * 同一产品集的产品收成一块，挂在产品集组头下面（产品集本身另有「关联产品集」弹窗，这里不能勾）。
 * 块出现在组内第一个产品原本的位置，所以「已关联的排前面」的顺序大体不变
 */
const buildPickBlocks = (items: TProductPickItem[]): TPickBlock[] => {
  const blocks: TPickBlock[] = [];
  const setBlocks = new Map<string, Extract<TPickBlock, { kind: "set" }>>();
  for (const item of items) {
    if (!item.productSet) {
      blocks.push({ kind: "product", item });
      continue;
    }
    const existing = setBlocks.get(item.productSet.id);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const block = { kind: "set" as const, set: item.productSet, items: [item] };
    setBlocks.set(item.productSet.id, block);
    blocks.push(block);
  }
  return blocks;
};

type TProps = {
  items: TProductPickItem[];
  selectedIds: Set<string>;
  onToggle: (productId: string) => void;
};

export const ProjectProductsTable = ({ items, selectedIds, onToggle }: TProps) => {
  const { t } = useTranslation();

  return (
    <div className="min-w-[44rem]">
      <div
        className={cn(
          ROW_GRID,
          "sticky top-0 z-[1] h-9.5 border-b border-subtle bg-surface-1 text-12 font-medium text-tertiary"
        )}
      >
        <span />
        <span>{t("project_products.columns.product")}</span>
        <span>{t("project_products.columns.code")}</span>
        <span>{t("project_products.columns.identifier")}</span>
        <span>{t("project_products.columns.status")}</span>
      </div>
      {buildPickBlocks(items).map((block) =>
        block.kind === "product" ? (
          <ProjectProductsTableRow
            key={block.item.id}
            item={block.item}
            isSelected={selectedIds.has(block.item.id)}
            onToggle={onToggle}
          />
        ) : (
          <div key={`set-${block.set.id}`}>
            <div className={cn(ROW_GRID, "h-11 bg-layer-1/60 text-13")}>
              <span />
              <span className="flex min-w-0 items-center gap-2.5">
                <ProductKindIcon isSet className="size-7.5 rounded-lg" iconClassName="size-4" />
                <span className="truncate font-medium text-primary">{block.set.name}</span>
                {block.set.identifier && (
                  <span className="shrink-0 font-mono text-12 text-tertiary">{block.set.identifier}</span>
                )}
              </span>
            </div>
            {block.items.map((item, index) => (
              <ProjectProductsTableRow
                key={item.id}
                item={item}
                isSelected={selectedIds.has(item.id)}
                onToggle={onToggle}
                child={{ isLast: index === block.items.length - 1 }}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
};

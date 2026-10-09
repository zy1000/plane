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
    className={cn("grid shrink-0 place-items-center bg-accent-subtle text-accent-primary", TILE_SIZE_CLASS[size])}
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
};

const ProjectProductsTableRow = ({ item, isSelected, onToggle }: TRowProps) => {
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
        "h-14 w-full border-b border-subtle text-left transition-colors",
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
      <span className="flex min-w-0 items-center gap-2.5">
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
      {items.map((item) => (
        <ProjectProductsTableRow
          key={item.id}
          item={item}
          isSelected={selectedIds.has(item.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
};

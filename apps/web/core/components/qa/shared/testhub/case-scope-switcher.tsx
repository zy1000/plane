"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Library, Package, Search } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import type { TScopeProductGroup } from "./project-case-scope";

type TSelection = { productId: string; repositoryId?: string; repositoryName?: string };

type Props = {
  workspaceSlug: string;
  projectId: string;
  groups: TScopeProductGroup[];
  productId: string | null;
  /** repository：选到用例库（用例页）；product：只选产品（评审页） */
  mode: "repository" | "product";
  repositoryId?: string | null;
  loading?: boolean;
  onSelect: (next: TSelection) => void;
};

const matches = (text: string | undefined, query: string) => (text ?? "").toLowerCase().includes(query);

const IdentifierChip = ({ value }: { value: string }) =>
  value ? <span className="shrink-0 rounded bg-layer-1 px-1.5 py-px text-11 font-medium text-secondary">{value}</span> : null;

/**
 * 项目里看产品用例 / 评审时，左栏顶部的范围切换器：第一行产品、第二行用例库。
 * 下拉按产品分组列出各自的用例库，一次点击切到任意产品的任意库；只有一个可选项时不出下拉。
 */
export const CaseScopeSwitcher = ({
  workspaceSlug,
  projectId,
  groups,
  productId,
  mode,
  repositoryId,
  loading = false,
  onSelect,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const currentGroup = groups.find((group) => group.productId === productId);
  const currentRepository = currentGroup?.repositories.find((repository) => repository.id === repositoryId);

  const choiceCount =
    mode === "product" ? groups.length : groups.reduce((sum, group) => sum + Math.max(group.repositories.length, 1), 0);
  const isStatic = choiceCount <= 1;

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => {
        if (matches(group.productName, q) || matches(group.productIdentifier, q)) return group;
        if (mode === "product") return null;
        const repositories = group.repositories.filter((repository) => matches(repository.name, q));
        return repositories.length > 0 ? { ...group, repositories } : null;
      })
      .filter((group): group is TScopeProductGroup => group !== null);
  }, [groups, mode, query]);

  const pick = (next: TSelection) => {
    setIsOpen(false);
    setQuery("");
    onSelect(next);
  };

  const secondLine =
    mode === "repository"
      ? (currentRepository?.name ?? (loading ? "加载中…" : currentGroup?.failed ? "无查看权限" : "暂无用例库"))
      : null;

  const triggerBody = (
    <>
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[7px] bg-accent-subtle text-accent-primary">
        <Package className="size-[17px]" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-13 leading-[18px] font-semibold text-primary">
          {currentGroup?.productName ?? "选择产品"}
        </span>
        {secondLine !== null && <span className="truncate text-12 leading-[17px] text-secondary">{secondLine}</span>}
      </span>
    </>
  );

  const triggerClass = cn(
    "flex w-full items-center gap-2.5 rounded-lg border bg-surface-1 px-2.5 text-left transition-colors",
    mode === "repository" ? "h-[52px]" : "h-11"
  );

  if (isStatic) {
    return <div className={cn(triggerClass, "border-subtle")}>{triggerBody}</div>;
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setQuery("");
      }}
    >
      <Popover.Button
        aria-label="切换产品与用例库"
        className={cn(triggerClass, isOpen ? "border-accent-strong" : "border-subtle hover:border-strong")}
      >
        {triggerBody}
        <ChevronsUpDown className={cn("size-3.5 shrink-0", isOpen ? "text-accent-primary" : "text-tertiary")} />
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={6}
        positionerClassName="z-30"
        className="flex w-[328px] flex-col overflow-hidden rounded-[10px] border border-subtle bg-surface-1 shadow-overlay-200 outline-none"
      >
        <label className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle px-3 text-tertiary">
          <Search className="size-4 shrink-0" strokeWidth={1.75} />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === "repository" ? "搜索产品或用例库" : "搜索产品"}
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
          />
        </label>

        <div className="vertical-scrollbar scrollbar-sm max-h-[320px] overflow-y-auto py-1.5">
          {visibleGroups.length === 0 && <div className="px-3 py-3 text-13 text-tertiary">没有匹配项</div>}

          {mode === "product" &&
            visibleGroups.map((group) => {
              const selected = group.productId === productId;
              return (
                <button
                  key={group.productId}
                  type="button"
                  onClick={() => pick({ productId: group.productId })}
                  className={cn(
                    "mx-1.5 flex h-9 w-[calc(100%-12px)] items-center gap-2.5 rounded-md px-2 text-left text-13 text-primary",
                    selected ? "bg-accent-subtle font-medium" : "hover:bg-layer-transparent-hover"
                  )}
                >
                  <Package
                    className={cn("size-4 shrink-0", selected ? "text-accent-primary" : "text-tertiary")}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 flex-1 truncate">{group.productName}</span>
                  <IdentifierChip value={group.productIdentifier} />
                  <Check className={cn("size-4 shrink-0 text-accent-primary", !selected && "invisible")} />
                </button>
              );
            })}

          {mode === "repository" &&
            visibleGroups.map((group, index) => (
              <div key={group.productId} className={index > 0 ? "mt-1.5" : undefined}>
                <div className="flex h-[30px] items-center gap-2 px-3 text-12 font-medium text-secondary">
                  <span className="truncate">{group.productName}</span>
                  <IdentifierChip value={group.productIdentifier} />
                </div>
                {group.repositories.length === 0 && (
                  <div className="flex h-9 items-center px-3.5 text-13 text-placeholder">
                    {group.failed ? "无查看权限" : loading ? "加载中…" : "暂无用例库"}
                  </div>
                )}
                {group.repositories.map((repository) => {
                  const selected = group.productId === productId && repository.id === repositoryId;
                  return (
                    <button
                      key={repository.id}
                      type="button"
                      onClick={() =>
                        pick({
                          productId: group.productId,
                          repositoryId: repository.id,
                          repositoryName: repository.name,
                        })
                      }
                      className={cn(
                        "mx-1.5 flex h-9 w-[calc(100%-12px)] items-center gap-2.5 rounded-md px-2 text-left text-13 text-primary",
                        selected ? "bg-accent-subtle font-medium" : "hover:bg-layer-transparent-hover"
                      )}
                    >
                      <Library
                        className={cn("size-4 shrink-0", selected ? "text-accent-primary" : "text-tertiary")}
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 flex-1 truncate">{repository.name}</span>
                      {typeof repository.caseCount === "number" && (
                        <span className="shrink-0 text-12 font-normal text-secondary tabular-nums">
                          {repository.caseCount}
                        </span>
                      )}
                      <Check className={cn("size-4 shrink-0 text-accent-primary", !selected && "invisible")} />
                    </button>
                  );
                })}
              </div>
            ))}
        </div>

        <div className="flex h-[42px] shrink-0 items-center border-t border-subtle bg-layer-1 px-3.5">
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/products`}
            className="text-13 font-medium text-accent-primary hover:underline"
          >
            关联产品
          </Link>
        </div>
      </Popover.Panel>
    </Popover>
  );
};

type TProductSwitcherProps = {
  workspaceSlug: string;
  projectId: string;
  productId: string;
  onSelect: (productId: string) => void;
};

/** 只在项目已关联的产品之间切换（用例评审页：评审挂在产品下，没有用例库这一层） */
export const ProjectProductSwitcher = ({ workspaceSlug, projectId, productId, onSelect }: TProductSwitcherProps) => {
  const { links } = useProjectProducts({ workspaceSlug, projectId });
  const groups = useMemo<TScopeProductGroup[]>(
    () =>
      links.map((link) => ({
        productId: link.product,
        productName: link.product_name,
        productIdentifier: link.product_identifier ?? "",
        repositories: [],
        failed: false,
      })),
    [links]
  );

  return (
    <CaseScopeSwitcher
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      groups={groups}
      productId={productId}
      mode="product"
      onSelect={(next) => onSelect(next.productId)}
    />
  );
};

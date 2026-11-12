import { useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, Plus, Rows2, Search, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TIssueFieldLibraryItem } from "@plane/types";
import { CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { FIELD_KIND_FILTERS } from "@/components/project-issue-types/field-display";
import type { TLinkageIssueType } from "@/utils/field-linkage";
import { IssueFieldLibraryTable } from "./issue-field-library-table";

type Filter = "all" | "linked" | "unused";
type Kind = "all" | TIssueFieldLibraryItem["field_type"];
type Props = {
  fields: TIssueFieldLibraryItem[];
  /** 类型库里的类型：联动规则列要显示规则里的类型名 */
  issueTypes: TLinkageIssueType[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  canManage: boolean;
  onCreate: () => void;
  onEdit: (field: TIssueFieldLibraryItem) => void;
  onDelete: (field: TIssueFieldLibraryItem) => void;
  onRetry: () => void;
};
const hasLinkage = (field: TIssueFieldLibraryItem) => Boolean(field.linkage?.visibility || field.linkage?.options);
const isUnused = (field: TIssueFieldLibraryItem) => field.binding_count === 0 && !field.used_by?.length;

/** Presentation and local filters; fetching and mutations stay in the library hook. */
export function IssueFieldLibraryContent({
  fields,
  issueTypes,
  isLoading,
  hasLoaded,
  error,
  canManage,
  onCreate,
  onEdit,
  onDelete,
  onRetry,
}: Props) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(
    () => ({ all: fields.length, linked: fields.filter(hasLinkage).length, unused: fields.filter(isUnused).length }),
    [fields]
  );
  const visibleFields = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return fields.filter(
      (field) =>
        (filter === "all" || (filter === "linked" ? hasLinkage(field) : isUnused(field))) &&
        (kind === "all" || field.field_type === kind) &&
        (!keyword ||
          field.name.toLowerCase().includes(keyword) ||
          (field.description ?? "").toLowerCase().includes(keyword))
    );
  }, [fields, filter, kind, search]);
  const kindLabel = FIELD_KIND_FILTERS.find((item) => item.value === kind)?.label ?? "全部类型";
  const resetFilters = () => {
    setSearch("");
    setKind("all");
    setFilter("all");
  };
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "全部字段" },
    { id: "linked", label: "有联动" },
    { id: "unused", label: "未使用" },
  ];

  const renderBody = () => {
    if (isLoading && !hasLoaded)
      return (
        <Loader className="space-y-3" aria-label="正在加载字段">
          <Loader.Item height="44px" />
          {[0, 1, 2, 3].map((index) => (
            <Loader.Item key={index} height="72px" />
          ))}
        </Loader>
      );
    if (error && fields.length === 0)
      return (
        <div
          role="alert"
          className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-subtle p-6 text-center"
        >
          <AlertCircle className="size-7 text-danger-primary" />
          <h2 className="mt-3 text-14 font-medium text-primary">字段库加载失败</h2>
          <p className="mt-1 max-w-sm text-13 text-secondary">{error}</p>
          <Button className="mt-4" variant="secondary" size="xl" onClick={onRetry}>
            重试
          </Button>
        </div>
      );
    if (fields.length === 0)
      return (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-subtle p-6 text-center">
          <Rows2 className="size-7 text-secondary" />
          <h2 className="mt-3 text-14 font-medium text-primary">还没有通用字段</h2>
          <p className="mt-1 max-w-sm text-13 text-secondary">创建可在多个工作项类型中复用的字段，统一管理填写规则。</p>
          {canManage && (
            <Button className="mt-4" variant="primary" size="xl" onClick={onCreate}>
              <Plus className="size-4" />
              新建字段
            </Button>
          )}
        </div>
      );
    return (
      <IssueFieldLibraryTable
        fields={fields}
        issueTypes={issueTypes}
        visibleFields={visibleFields}
        canManage={canManage}
        onEdit={onEdit}
        onDelete={onDelete}
        onResetFilters={resetFilters}
      />
    );
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-24 leading-8 font-semibold text-primary">通用字段库</h1>
            {hasLoaded && (
              <span className="rounded-md bg-layer-1 px-2 py-0.5 text-14 text-secondary tabular-nums">
                {fields.length}
              </span>
            )}
          </div>
          <p className="mt-2 text-13 leading-5 text-secondary">统一维护字段定义，更新后同步到引用的工作项类型。</p>
        </div>
        {canManage && (
          <Button variant="primary" size="xl" className="h-9 shrink-0 gap-1.5 px-3" onClick={onCreate}>
            <Plus className="size-4" />
            新建字段
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-subtle">
        <div role="group" aria-label="字段范围" className="flex gap-5 sm:gap-6">
          {filters.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                "-mb-px flex h-12 items-center gap-2 border-b-2 px-0.5 text-14 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent-strong",
                filter === id
                  ? "border-accent-strong font-medium text-primary"
                  : "border-transparent text-secondary hover:text-primary"
              )}
            >
              {label}
              <span className={cn("rounded px-1 text-12 tabular-nums", filter === id && "bg-layer-1")}>
                {hasLoaded ? counts[id] : "—"}
              </span>
            </button>
          ))}
        </div>
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2.5 max-sm:w-full">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary" />
            <input
              type="search"
              aria-label="搜索字段名称或说明"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索名称或说明"
              className="h-9 w-full min-w-0 rounded-md border border-subtle bg-surface-1 pr-8 pl-9 text-13 text-primary outline-none placeholder:text-secondary focus:border-accent-strong [&::-webkit-search-cancel-button]:appearance-none"
            />
            {search && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-secondary hover:bg-layer-1-hover"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <CustomMenu
            ariaLabel="筛选字段类型"
            placement="bottom-end"
            customButton={
              <>
                <span>{kindLabel}</span>
                <ChevronDown className="size-3.5" />
              </>
            }
            customButtonClassName={cn(
              "inline-flex h-9 min-w-28 items-center justify-between gap-3 rounded-md border px-3 text-13",
              kind === "all"
                ? "border-subtle text-secondary hover:bg-layer-1-hover"
                : "border-accent-strong bg-accent-subtle text-accent-primary"
            )}
            optionsClassName="min-w-40 rounded-lg border-subtle p-1.5 shadow-overlay-200"
            portalElement={typeof document === "undefined" ? undefined : document.body}
            closeOnSelect
          >
            {[{ value: "all" as const, label: "全部类型" }, ...FIELD_KIND_FILTERS].map((item) => (
              <CustomMenu.MenuItem
                key={item.value}
                onClick={() => setKind(item.value)}
                className="flex items-center gap-2 px-2 py-1.5 text-13"
              >
                <span className="flex-1">{item.label}</span>
                {kind === item.value && <Check className="size-3.5 text-accent-primary" />}
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu>
        </div>
      </div>

      {renderBody()}
      {hasLoaded && !error && fields.length > 0 && (
        <span role="status" className="text-12 text-secondary">
          {visibleFields.length === fields.length
            ? `共 ${fields.length} 个字段`
            : `显示 ${visibleFields.length} / ${fields.length} 个字段`}
        </span>
      )}
    </div>
  );
}

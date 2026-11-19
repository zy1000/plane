import { useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, Rows3 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementFieldDefinition, TRequirementFieldType } from "@plane/types";
import { CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { ROOT_FIELD_TYPES } from "@/components/requirements/requirement-field-builder";
import { FieldLibrarySwitch } from "../field-library-header";
import type { TFieldLibrarySwitchItem } from "../field-library-header";
import { TemplatePageHeader, TemplatePageSearch, TemplatePageTabs } from "../template-page-header";
import { RequirementFieldLibraryTable } from "./requirement-field-library-table";

type Filter = "all" | "unused";
type Kind = "all" | TRequirementFieldType;
type Props = {
  fields: TRequirementFieldDefinition[];
  /** 页头「工作项 | 需求」开关的各项 */
  libraries: TFieldLibrarySwitchItem[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  canManage: boolean;
  onCreate: () => void;
  onEdit: (field: TRequirementFieldDefinition) => void;
  onDelete: (field: TRequirementFieldDefinition) => void;
  onRetry: () => void;
};

const isUnused = (field: TRequirementFieldDefinition) => field.used_by.length === 0;

/** 页头、范围页签、搜索与类型筛选；取数和增删改在字段库 hook 里。版式照工作项通用字段库 */
export function RequirementFieldLibraryContent({
  fields,
  libraries,
  isLoading,
  hasLoaded,
  error,
  canManage,
  onCreate,
  onEdit,
  onDelete,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => ({ all: fields.length, unused: fields.filter(isUnused).length }), [fields]);
  const visibleFields = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return fields.filter(
      (field) =>
        (filter === "all" || isUnused(field)) &&
        (kind === "all" || field.field_type === kind) &&
        (!keyword ||
          field.name.toLowerCase().includes(keyword) ||
          String(field.config.description ?? "")
            .toLowerCase()
            .includes(keyword))
    );
  }, [fields, filter, kind, search]);
  const kindOptions: { value: Kind; label: string }[] = [
    { value: "all", label: "全部类型" },
    ...ROOT_FIELD_TYPES.map((type) => ({ value: type, label: t(`requirement_fields.field_types.${type}`) })),
  ];
  const kindLabel = kindOptions.find((item) => item.value === kind)?.label ?? "全部类型";
  const resetFilters = () => {
    setSearch("");
    setKind("all");
    setFilter("all");
  };
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "全部字段" },
    { id: "unused", label: "未使用" },
  ];

  const renderBody = () => {
    if (isLoading && !hasLoaded)
      return (
        <Loader className="space-y-3" aria-label="正在加载字段">
          <Loader.Item height="40px" />
          {[0, 1, 2, 3].map((index) => (
            <Loader.Item key={index} height="52px" />
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
          <Rows3 className="size-7 text-secondary" />
          <h2 className="mt-3 text-14 font-medium text-primary">还没有通用字段</h2>
          <p className="mt-1 max-w-sm text-13 text-secondary">
            新建字段，或在需求类型的字段结构里把已有字段转为通用字段。
          </p>
          {canManage && (
            <Button className="mt-4" variant="primary" size="xl" onClick={onCreate}>
              新建字段
            </Button>
          )}
        </div>
      );
    return (
      <RequirementFieldLibraryTable
        visibleFields={visibleFields}
        canManage={canManage}
        onEdit={onEdit}
        onDelete={onDelete}
        onResetFilters={resetFilters}
      />
    );
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <TemplatePageHeader
        title="通用字段"
        bordered={false}
        after={<FieldLibrarySwitch activeKey="requirement" libraries={libraries} />}
      >
        <TemplatePageSearch value={search} onChange={setSearch} placeholder="搜索名称或说明" />
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
            "inline-flex h-8 min-w-28 items-center justify-between gap-3 rounded-md border px-3 text-13",
            kind === "all"
              ? "border-subtle text-secondary hover:bg-layer-1-hover"
              : "border-accent-strong bg-accent-subtle text-accent-primary"
          )}
          optionsClassName="min-w-40 rounded-lg border-subtle p-1.5 shadow-overlay-200"
          portalElement={typeof document === "undefined" ? undefined : document.body}
          closeOnSelect
        >
          {kindOptions.map((item) => (
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
        {canManage && (
          <Button variant="primary" size="xl" className="px-3" onClick={onCreate}>
            新建字段
          </Button>
        )}
      </TemplatePageHeader>
      <TemplatePageTabs
        ariaLabel="字段范围"
        tabs={filters.map(({ id, label }) => ({ key: id, label, count: hasLoaded ? counts[id] : undefined }))}
        activeKey={filter}
        onChange={setFilter}
      />

      <div className="flex flex-col gap-3 px-7 py-6">
        {renderBody()}
        {hasLoaded && !error && fields.length > 0 && (
          <span role="status" className="text-12 text-secondary">
            {visibleFields.length === fields.length
              ? `共 ${fields.length} 个字段`
              : `显示 ${visibleFields.length} / ${fields.length} 个字段`}
          </span>
        )}
      </div>
    </div>
  );
}

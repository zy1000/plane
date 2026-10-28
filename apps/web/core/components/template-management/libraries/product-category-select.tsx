import { Folder, Tags } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TProductCategory } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";

/** 「不选择」的哨兵值：CustomSearchSelect 的空串 / null 不好区分「没选」和「选了不选择」 */
const NONE = "__none__";

const FIELD_BOX = "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-surface-1 px-3 text-left text-13";

type TSelectProps = {
  categories: TProductCategory[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  disabled?: boolean;
  hasError?: boolean;
};

/** 创建标准库时选产品分类（非必填）：首项「不选择」，其余带「N 个模块」，可搜索 */
export function ProductCategorySelect({ categories, value, onChange, disabled = false, hasError = false }: TSelectProps) {
  const { t } = useTranslation();
  const selected = categories.find((category) => category.id === value) ?? null;

  const options = [
    {
      value: NONE,
      query: t("product_categories.picker.none"),
      content: <span className="truncate text-13 text-secondary">{t("product_categories.picker.none")}</span>,
    },
    ...categories.map((category) => ({
      value: category.id,
      query: category.name,
      content: (
        <span className="flex w-full items-center gap-2">
          <Tags className="size-3.5 shrink-0 text-accent-primary" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate text-13">{category.name}</span>
          <span className="shrink-0 text-11 text-tertiary">
            {t("product_categories.module_count", { count: category.modules.length })}
          </span>
        </span>
      ),
    })),
  ];

  return (
    <CustomSearchSelect
      value={value ?? NONE}
      onChange={(next: string) => onChange(next === NONE ? null : next)}
      options={options}
      disabled={disabled}
      className="w-full"
      customButtonClassName="w-full rounded-md"
      optionsClassName="w-72"
      noResultsMessage={t("product_categories.picker.empty")}
      customButton={
        <div
          className={cn(
            FIELD_BOX,
            hasError ? "border-danger-primary" : "border-subtle",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <Tags className="size-3.5 shrink-0 text-accent-primary" strokeWidth={1.75} />
              <span className="truncate text-primary">{selected.name}</span>
            </span>
          ) : (
            <span className="text-placeholder">{t("product_categories.picker.none")}</span>
          )}
          <ChevronDownIcon className="size-3.5 shrink-0 text-secondary" />
        </div>
      }
    />
  );
}

/** 编辑标准库时分类只读（创建后不可更换），与需求类型的只读框同款 */
export function ProductCategoryReadonly({ category }: { category: { id: string; name: string } | null }) {
  const { t } = useTranslation();
  return (
    <div className={cn(FIELD_BOX, "cursor-not-allowed justify-start border-subtle bg-layer-1 opacity-70")}>
      {category ? (
        <>
          <Tags className="size-3.5 shrink-0 text-accent-primary" strokeWidth={1.75} />
          <span className="truncate text-primary">{category.name}</span>
        </>
      ) : (
        <span className="text-placeholder">{t("product_categories.picker.unset")}</span>
      )}
    </div>
  );
}

/** 选中分类后预览库会自动带出的一级模块 */
export function ProductCategoryModulesPreview({ category }: { category: TProductCategory | null }) {
  const { t } = useTranslation();
  if (!category) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2 text-12 font-medium text-secondary">
        <span>{t("product_categories.modules_title")}</span>
        <span className="font-normal tabular-nums text-tertiary">{category.modules.length}</span>
      </div>
      {category.modules.length > 0 && (
        <div className="vertical-scrollbar scrollbar-sm flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-layer-1 p-3">
          {category.modules.map((module) => (
            <span
              key={module.id}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 text-13 text-primary"
            >
              <Folder className="size-[13px] shrink-0 text-tertiary" strokeWidth={1.75} />
              {module.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

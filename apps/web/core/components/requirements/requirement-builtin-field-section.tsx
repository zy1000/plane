import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import { REQUIREMENT_BUILTIN_COLUMNS } from "./requirement-builtin-fields";

/**
 * 字段结构页顶部的「内置字段」分组：只读、可折叠。
 *
 * 这些字段不是 RequirementField，而是需求行上的列（见 REQUIREMENT_BUILTIN_COLUMNS），
 * 每个需求类型天然就有，既不能改也不能删。放在这里是为了让人在配置字段时看得见
 * 完整的列构成 —— 否则新建的类型在这一页看起来是「一个字段都没有」，而实际录入
 * 时会冒出八列。
 *
 * 默认折叠：它们是不可变的参照信息，展开会把真正要编辑的自定义字段一直往下推。
 */
export function RequirementBuiltinFieldSection() {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-subtle bg-surface-1">
      <button
        type="button"
        onClick={() => setIsExpanded((previous) => !previous)}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-layer-transparent-hover motion-reduce:transition-none"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-secondary transition-transform duration-150 motion-reduce:transition-none",
            !isExpanded && "-rotate-90"
          )}
        />
        <Lock className="size-3.5 shrink-0 text-tertiary" />
        <span className="truncate text-13 font-medium text-primary">
          {t("requirement_fields.builtin.group_label")}
        </span>
        <span className="shrink-0 rounded bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">
          {t("requirement_fields.builtin.count", { count: REQUIREMENT_BUILTIN_COLUMNS.length })}
        </span>
        <span className="ml-auto hidden truncate text-11 text-tertiary sm:block">
          {t("requirement_fields.builtin.locked_hint")}
        </span>
      </button>

      {isExpanded && (
        <ul className="border-t border-subtle">
          {REQUIREMENT_BUILTIN_COLUMNS.map((column) => {
            const Icon = column.icon;
            return (
              <li
                key={column.key}
                className="flex items-center gap-2.5 border-b border-subtle px-3 py-2 last:border-b-0"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-layer-1 text-secondary">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-12 text-primary">{t(column.labelKey)}</span>
                {/* 执行期属性在标准库里不出现，这里标一下，免得以为库里也能预填 */}
                {!column.showInLibrary && (
                  <span className="shrink-0 rounded bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">
                    {t("requirement_fields.builtin.product_only")}
                  </span>
                )}
                <span className="shrink-0 text-11 text-secondary">{t(column.typeLabelKey)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

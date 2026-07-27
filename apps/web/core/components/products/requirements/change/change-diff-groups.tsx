/**
 * 「基本信息」与「字段定义」两组的卡片式 diff。
 *
 * 这两组不是表格数据且数据量天然很小（meta 六个键、字段通常几十个以内），所以直接
 * 内联在变更单详情响应里，卡片式展示。明细数据组走 detail-diff-grid.tsx。
 */
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementChangeItem,
  TRequirementMetaChangeSnapshot,
  TRequirementSchemaChangeSnapshot,
} from "@plane/types";
import { cn } from "@plane/utils";
import { CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL, DIFF_NEW_VALUE, DIFF_OLD_VALUE } from "./styles";

const SCHEMA_COMPARE_KEYS = ["name", "field_type", "is_required", "is_active", "default_value"] as const;

export function DiffGroupCard({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <section className="rounded-lg border border-subtle">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Chevron className="size-4 shrink-0 text-secondary" />
        <span className="text-14 font-semibold text-primary">{title}</span>
        {count > 0 ? (
          <span className="grid size-4 place-items-center rounded-full bg-layer-2 text-10 text-secondary">
            {count}
          </span>
        ) : (
          <span className="text-12 text-tertiary">{t("workspace_products.requirements.change.no_changes")}</span>
        )}
      </button>
      {isOpen && <div className="border-t border-subtle px-4 py-3">{children}</div>}
    </section>
  );
}

/** 复用同一套 diff 值格式化：布尔转是/否、数组用逗号连接、空值用破折号 */
const useValueFormatter = () => {
  const { t } = useTranslation();
  return (value: unknown): string => {
    if (value === null || value === undefined || value === "") {
      return t("workspace_products.requirements.change.empty_value");
    }
    if (typeof value === "boolean") {
      return t(value ? "workspace_products.requirements.change.yes" : "workspace_products.requirements.change.no");
    }
    if (Array.isArray(value)) {
      return value.length
        ? value.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ")
        : t("workspace_products.requirements.change.empty_value");
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
};

/** 基本信息组：三列表「字段 / 变更前 / 变更后」 */
export function MetaDiffTable({ items }: { items: TRequirementChangeItem[] }) {
  const { t } = useTranslation();
  const formatValue = useValueFormatter();

  return (
    <table className="w-full border-collapse text-left text-13">
      <thead className="bg-layer-1 text-12 font-medium text-secondary">
        <tr className="border-b border-subtle">
          <th className="w-1/3 px-3 py-2">{t("workspace_products.requirements.change.meta_columns.field")}</th>
          <th className="w-1/3 px-3 py-2">{t("workspace_products.requirements.change.meta_columns.before")}</th>
          <th className="w-1/3 px-3 py-2">{t("workspace_products.requirements.change.meta_columns.after")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const before = item.before_snapshot as TRequirementMetaChangeSnapshot | null;
          const after = item.proposed_snapshot as TRequirementMetaChangeSnapshot | null;
          const fieldKey = after?.field ?? before?.field ?? "";
          return (
            <tr key={item.id} className="border-b border-subtle last:border-b-0">
              <td className="px-3 py-2 text-primary">
                {t(`workspace_products.requirements.change.meta_fields.${fieldKey}`)}
              </td>
              <td className="bg-danger-subtle/40 px-3 py-2 text-primary">{formatValue(before?.value)}</td>
              <td className="bg-success-subtle/40 px-3 py-2 text-primary">{formatValue(after?.value)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 字段定义组：每项一行，修改项的属性值用「旧值红删除线 → 新值绿」 */
export function SchemaDiffList({ items }: { items: TRequirementChangeItem[] }) {
  const { t } = useTranslation();
  const formatValue = useValueFormatter();

  return (
    <ul className="divide-y divide-subtle">
      {items.map((item) => {
        const before = item.before_snapshot as TRequirementSchemaChangeSnapshot | null;
        const after = item.proposed_snapshot as TRequirementSchemaChangeSnapshot | null;
        const field = after ?? before;
        if (!field) return null;
        const isUpdate = item.change_type === "update" && before && after;

        return (
          <li key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={cn(CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL[item.change_type], "mt-0.5 shrink-0")}>
              {t(`workspace_products.requirements.change.change_type.${item.change_type}`)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-13 font-medium text-primary">
                {t("workspace_products.requirements.change.field_label", {
                  name: field.name,
                  type: t(`workspace_templates.requirements.field_types.${field.field_type}`),
                })}
                {field.parent_name && (
                  <span className="ml-1.5 text-11 text-tertiary">
                    {t("workspace_products.requirements.change.field_props.parent")}: {field.parent_name}
                  </span>
                )}
              </p>
              <dl className="mt-1 space-y-0.5 pl-3 text-12">
                {SCHEMA_COMPARE_KEYS.map((key) => {
                  const beforeValue = before?.[key];
                  const afterValue = after?.[key];
                  if (isUpdate && formatValue(beforeValue) === formatValue(afterValue)) return null;
                  if (!isUpdate && (afterValue ?? beforeValue) === undefined) return null;
                  return (
                    <div key={key} className="flex items-baseline gap-1.5">
                      <dt className="shrink-0 text-tertiary">
                        {t(`workspace_products.requirements.change.field_props.${key}`)}:
                      </dt>
                      <dd className="min-w-0 text-secondary">
                        {isUpdate ? (
                          <>
                            <span className={DIFF_OLD_VALUE}>{formatValue(beforeValue)}</span>
                            <span className="mx-1.5 text-tertiary">→</span>
                            <span className={DIFF_NEW_VALUE}>{formatValue(afterValue)}</span>
                          </>
                        ) : (
                          formatValue(item.change_type === "delete" ? beforeValue : afterValue)
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

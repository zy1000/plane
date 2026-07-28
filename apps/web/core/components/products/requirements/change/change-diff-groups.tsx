import { useMemo } from "react";
import { isEqual } from "lodash-es";
import { useTranslation } from "@plane/i18n";
import type {
  IUserLite,
  TRequirementChangeItem,
  TRequirementField,
  TRequirementMetaChangeSnapshot,
  TRequirementSchemaChangeSnapshot,
} from "@plane/types";
import { cn, sanitizeHTML } from "@plane/utils";
import { CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL, CHANGE_TYPE_ROW, DIFF_NEW_VALUE, DIFF_OLD_VALUE } from "./styles";

const SCHEMA_COMPARE_KEYS = [
  "name",
  "field_type",
  "is_required",
  "is_active",
  "position",
  "config",
  "default_value",
] as const;

type TSchemaCompareKey = (typeof SCHEMA_COMPARE_KEYS)[number];

const isEmptyValue = (value: unknown) => value === null || value === undefined || value === "";

function useMetaValueFormatter(members: IUserLite[]) {
  const { t } = useTranslation();
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  return (fieldKey: string, value: unknown): string => {
    if (isEmptyValue(value)) return t("workspace_products.requirements.change.empty_value");

    if (fieldKey === "description_html" && typeof value === "string") {
      return sanitizeHTML(value) || t("workspace_products.requirements.change.empty_value");
    }

    if (fieldKey === "owner_id" && typeof value === "string") {
      return membersById.get(value)?.display_name ?? value;
    }

    if (fieldKey === "approver_ids" && Array.isArray(value)) {
      if (!value.length) return t("workspace_products.requirements.change.empty_value");
      return value.map((id) => membersById.get(String(id))?.display_name ?? String(id)).join(", ");
    }

    if (fieldKey === "approval_type" && typeof value === "string") {
      return t(`workspace_templates.requirements.approval.${value}`);
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
}

type TMetaDiffTableProps = {
  items: TRequirementChangeItem[];
  members: IUserLite[];
};

/** 概览：以清晰的并列视图展示需求基本信息的前后差异。 */
export function MetaDiffTable({ items, members }: TMetaDiffTableProps) {
  const { t } = useTranslation();
  const formatValue = useMetaValueFormatter(members);

  const rows = items.map((item) => {
    const before = item.before_snapshot as TRequirementMetaChangeSnapshot | null;
    const after = item.proposed_snapshot as TRequirementMetaChangeSnapshot | null;
    const fieldKey = after?.field ?? before?.field ?? "";
    return {
      id: item.id,
      label: t(`workspace_products.requirements.change.meta_fields.${fieldKey}`),
      before: formatValue(fieldKey, before?.value),
      after: formatValue(fieldKey, after?.value),
    };
  });

  return (
    <section aria-labelledby="change-overview-title" className="min-w-0">
      <h2 id="change-overview-title" className="sr-only">
        {t("workspace_products.requirements.change.overview.title")}
      </h2>

      {rows.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-md border border-subtle md:block">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="bg-layer-1 text-12 font-medium text-secondary">
                <tr className="border-b border-subtle">
                  <th className="w-1/4 px-4 py-2.5">
                    {t("workspace_products.requirements.change.meta_columns.field")}
                  </th>
                  <th className="w-[37.5%] px-4 py-2.5">
                    {t("workspace_products.requirements.change.meta_columns.before")}
                  </th>
                  <th className="w-[37.5%] px-4 py-2.5">
                    {t("workspace_products.requirements.change.meta_columns.after")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-subtle last:border-b-0">
                    <th className="px-4 py-3 text-13 font-medium text-primary">{row.label}</th>
                    <td className="bg-danger-subtle/40 px-4 py-3 text-13 leading-5 text-danger-primary">
                      {row.before}
                    </td>
                    <td className="bg-success-subtle/40 px-4 py-3 text-13 leading-5 text-success-primary">
                      {row.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-subtle overflow-hidden rounded-md border border-subtle md:hidden">
            {rows.map((row) => (
              <div key={row.id} className="px-3 py-3">
                <p className="text-13 font-medium text-primary">{row.label}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded bg-danger-subtle/40 p-2">
                    <p className="text-12 text-danger-secondary">
                      {t("workspace_products.requirements.change.meta_columns.before")}
                    </p>
                    <p className="mt-1 text-13 leading-5 text-danger-primary">{row.before}</p>
                  </div>
                  <div className="rounded bg-success-subtle/40 p-2">
                    <p className="text-12 text-success-secondary">
                      {t("workspace_products.requirements.change.meta_columns.after")}
                    </p>
                    <p className="mt-1 text-13 leading-5 text-success-primary">{row.after}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-md border border-subtle px-4 py-10 text-center text-13 text-tertiary">
          {t("workspace_products.requirements.change.overview.empty")}
        </p>
      )}
    </section>
  );
}

const getConfigSummary = (
  config: TRequirementField["config"],
  t: (key: string, values?: Record<string, unknown>) => string
) => {
  const parts: string[] = [];
  if (config.selection_mode) {
    parts.push(
      t(
        config.selection_mode === "multiple"
          ? "workspace_templates.requirements.editor.builder.multiple_select"
          : "workspace_templates.requirements.editor.builder.single_select"
      )
    );
  }
  if (config.options?.length) {
    parts.push(
      `${t("workspace_products.requirements.change.field_props.options")}: ${config.options
        .map((option) => option.label)
        .join(", ")}`
    );
  }
  if (typeof config.placeholder === "string" && config.placeholder.trim()) {
    parts.push(`${t("workspace_templates.requirements.fields.placeholder")}: ${config.placeholder.trim()}`);
  }
  if (typeof config.description === "string" && config.description.trim()) {
    parts.push(`${t("workspace_templates.requirements.fields.description")}: ${config.description.trim()}`);
  }
  const extraConfig = Object.fromEntries(
    Object.entries(config).filter(
      ([key, value]) =>
        !["selection_mode", "options", "placeholder", "description"].includes(key) && !isEmptyValue(value)
    )
  );
  if (Object.keys(extraConfig).length > 0) parts.push(JSON.stringify(extraConfig));
  return parts;
};

/** 字段定义：按字段聚合属性差异，避免重复卡片抢占注意力。 */
export function SchemaDiffList({ items }: { items: TRequirementChangeItem[] }) {
  const { t } = useTranslation();

  const formatValue = (
    key: TSchemaCompareKey,
    value: unknown,
    snapshot: TRequirementSchemaChangeSnapshot | null
  ): string => {
    if (isEmptyValue(value)) return t("workspace_products.requirements.change.empty_value");
    if (key === "field_type" && typeof value === "string") {
      return t(`workspace_templates.requirements.field_types.${value}`);
    }
    if (key === "position" && typeof value === "number") {
      return t("workspace_products.requirements.change.field_position", { position: value });
    }
    if (key === "config" && typeof value === "object") {
      const parts = getConfigSummary(value as TRequirementField["config"], t);
      return parts.length ? parts.join(" · ") : t("workspace_products.requirements.change.empty_value");
    }
    if (key === "default_value" && snapshot?.field_type === "select") {
      const optionById = new Map((snapshot.config.options ?? []).map((option) => [option.id, option.label]));
      if (Array.isArray(value)) return value.map((item) => optionById.get(String(item)) ?? String(item)).join(", ");
      return optionById.get(String(value)) ?? String(value);
    }
    if (typeof value === "boolean") {
      return t(value ? "workspace_products.requirements.change.yes" : "workspace_products.requirements.change.no");
    }
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <section aria-labelledby="change-schema-title" className="min-w-0">
      <h2 id="change-schema-title" className="sr-only">
        {t("workspace_products.requirements.change.schema_review.title")}
      </h2>

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-subtle">
          <table className="w-full min-w-[680px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[40%]" />
              <col className="w-1/2" />
            </colgroup>
            <thead className="bg-layer-1 text-12 font-medium text-secondary">
              <tr className="border-b border-subtle">
                <th className="px-4 py-2.5">
                  {t("workspace_products.requirements.change.schema_review.columns.change")}
                </th>
                <th className="px-4 py-2.5">
                  {t("workspace_products.requirements.change.schema_review.columns.field")}
                </th>
                <th className="px-4 py-2.5">
                  {t("workspace_products.requirements.change.schema_review.columns.properties")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const before = item.before_snapshot as TRequirementSchemaChangeSnapshot | null;
                const after = item.proposed_snapshot as TRequirementSchemaChangeSnapshot | null;
                const field = after ?? before;
                if (!field) return null;
                const isUpdate = item.change_type === "update" && Boolean(before && after);
                const valueFor = (
                  snapshot: TRequirementSchemaChangeSnapshot | null,
                  key: TSchemaCompareKey
                ): unknown => {
                  if (key !== "position" || snapshot?.position !== undefined) return snapshot?.[key];
                  const sortOrder = snapshot?.sort_order;
                  if (typeof sortOrder !== "number") return undefined;
                  const legacyPosition = sortOrder / 1000;
                  return Number.isInteger(legacyPosition) ? legacyPosition : undefined;
                };
                const visibleKeys = SCHEMA_COMPARE_KEYS.filter((key) => {
                  if (!isUpdate) return key !== "name" && key !== "field_type";
                  return !isEqual(valueFor(before, key), valueFor(after, key));
                });

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "border-b border-subtle align-top last:border-b-0",
                      CHANGE_TYPE_ROW[item.change_type]
                    )}
                  >
                    <td className="px-4 py-4">
                      <span className={cn(CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL[item.change_type])}>
                        {t(`workspace_products.requirements.change.change_type.${item.change_type}`)}
                      </span>
                    </td>
                    <th className="px-4 py-4 font-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-13 font-semibold text-primary">{field.name}</span>
                        <span className="rounded bg-layer-2 px-1.5 py-0.5 text-11 text-secondary">
                          {t(`workspace_templates.requirements.field_types.${field.field_type}`)}
                        </span>
                      </div>
                      <p className="mt-1 text-12 text-tertiary">
                        {field.parent_name
                          ? t("workspace_products.requirements.change.schema_review.child_field", {
                              name: field.parent_name,
                            })
                          : t("workspace_products.requirements.change.schema_review.root_field")}
                      </p>
                    </th>
                    <td className="px-4 py-4">
                      {visibleKeys.length > 0 ? (
                        <dl className="space-y-1.5 text-13">
                          {visibleKeys.map((key) => {
                            const beforeValue = valueFor(before, key);
                            const afterValue = valueFor(after, key);
                            return (
                              <div key={key} className="flex min-w-0 items-baseline gap-2">
                                <dt className="w-20 shrink-0 text-tertiary">
                                  {t(`workspace_products.requirements.change.field_props.${key}`)}
                                </dt>
                                <dd className="min-w-0 text-secondary">
                                  {isUpdate ? (
                                    <>
                                      <span className={DIFF_OLD_VALUE}>{formatValue(key, beforeValue, before)}</span>
                                      <span className="mx-2 text-tertiary">→</span>
                                      <span className={DIFF_NEW_VALUE}>{formatValue(key, afterValue, after)}</span>
                                    </>
                                  ) : (
                                    <span className={item.change_type === "create" ? DIFF_NEW_VALUE : DIFF_OLD_VALUE}>
                                      {formatValue(
                                        key,
                                        item.change_type === "delete" ? beforeValue : afterValue,
                                        field
                                      )}
                                    </span>
                                  )}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      ) : (
                        <span className="text-12 text-tertiary">
                          {t("workspace_products.requirements.change.no_changes")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-md border border-subtle px-4 py-10 text-center text-13 text-tertiary">
          {t("workspace_products.requirements.change.schema_review.empty")}
        </p>
      )}
    </section>
  );
}

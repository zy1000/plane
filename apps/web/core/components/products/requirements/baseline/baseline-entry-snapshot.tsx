/**
 * 基线里一条需求被冻结的内容。
 *
 * 字段树取自 `fields_snapshot`（收录那一版当时的结构），不是今天的结构 —— 字段结构变更
 * 立即生效且不走审批，用今天的表头渲染一年前的快照会凭空多出空列、少掉已删字段。
 */
import { Fragment } from "react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementBaselineEntry, TRequirementField } from "@plane/types";
import { BuiltinCellValue, REQUIREMENT_BUILTIN_COLUMNS } from "@/components/requirements/requirement-builtin-fields";
import { getFormRows, LeafValue } from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";

const Empty = () => {
  const { t } = useTranslation();
  return <span className="text-13 text-placeholder">{t("workspace_products.requirements.change.empty_value")}</span>;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-subtle/60 px-3 py-2 last:border-b-0">
      <span className="w-40 shrink-0 text-11 text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 text-12 text-primary">{children}</span>
    </div>
  );
}

/** 子表单：一行一块，块内一字段一行 —— 竖排下这比横铺的表格好读 */
function FormField({
  field,
  entry,
  workspaceSlug,
}: {
  field: TRequirementField;
  entry: TRequirementBaselineEntry;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const rows = getFormRows(entry.snapshot.data, field.id);
  if (!rows.length) {
    return (
      <Row label={field.name}>
        <Empty />
      </Row>
    );
  }
  return (
    <Row label={field.name}>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded border border-subtle/70 p-2">
            <p className="mb-1 text-10 text-tertiary">
              {t("workspace_products.requirements.baseline.detail.sub_row", { index: index + 1 })}
            </p>
            {field.children.map((child) => (
              <div key={child.id} className="flex gap-2 py-0.5">
                <span className="w-28 shrink-0 text-11 text-tertiary">{child.name}</span>
                <span className="min-w-0 flex-1">
                  {row.values?.[child.id] === undefined ? (
                    <Empty />
                  ) : (
                    <LeafValue field={child} value={row.values[child.id]} workspaceSlug={workspaceSlug} />
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Row>
  );
}

export function BaselineEntrySnapshot({
  entry,
  workspaceSlug,
}: {
  entry: TRequirementBaselineEntry;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const fields = entry.fields_snapshot.filter((field) => field.is_active);
  const data = entry.snapshot.data;

  return (
    <div className="rounded-md border border-subtle bg-layer-1">
      {entry.display_id && (
        <Row label={t("requirements.identifier.column")}>
          <RequirementIdentifier displayId={entry.display_id} />
        </Row>
      )}
      {REQUIREMENT_BUILTIN_COLUMNS.map((column) => (
        <Row key={column.key} label={t(column.labelKey)}>
          <BuiltinCellValue columnKey={column.key} values={entry.snapshot} />
        </Row>
      ))}
      {fields.map((field) => (
        <Fragment key={field.id}>
          {field.field_type === "form" ? (
            <FormField field={field} entry={entry} workspaceSlug={workspaceSlug} />
          ) : (
            <Row label={field.name}>
              {data[field.id] === undefined || data[field.id] === null || data[field.id] === "" ? (
                <Empty />
              ) : (
                <LeafValue field={field} value={data[field.id]} workspaceSlug={workspaceSlug} />
              )}
            </Row>
          )}
        </Fragment>
      ))}
    </div>
  );
}

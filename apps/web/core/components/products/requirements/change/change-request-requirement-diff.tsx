/**
 * 单条需求的前后对比。
 *
 * 变更单现在通常只覆盖一两条需求，把它渲染成一行网格既要横滚又读不出重点 ——
 * 这里换成「一行一个字段」的竖排两栏：左边变更前，右边变更后。
 *
 * 只列**变了的**字段，未变的折在「显示全部字段」后面 —— 一条需求可能有几十个字段，
 * 铺开会把真正改动的那两三行淹掉。
 */
import { Fragment, useMemo, useState } from "react";
import { isEqual } from "lodash-es";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementBuiltinFieldConfig,
  TRequirementBuiltinKey,
  TRequirementDiffItem,
  TRequirementChangeSnapshot,
  TRequirementData,
  TRequirementField,
  TRequirementFormRow,
  TRequirementValue,
} from "@plane/types";
import { cn } from "@plane/utils";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";
import {
  mergeBuiltinAndFields,
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
  type TBuiltinColumnMeta,
} from "@/components/requirements/requirement-builtin-layout";
import { getFormRows, LeafValue } from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL, DIFF_NEW_VALUE, DIFF_OLD_VALUE } from "./styles";

type TProps = {
  item: TRequirementDiffItem;
  /** 该需求类型的字段树（不是全部类型的并集，否则会多出一堆空洞行） */
  fields: TRequirementField[];
  /** 该需求类型的内置字段布局；null 回退现状顺序（内置在前） */
  builtinLayout?: TRequirementBuiltinFieldConfig[] | null;
  workspaceSlug: string;
};

const EmptyValue = () => {
  const { t } = useTranslation();
  return (
    <span className="text-13 text-placeholder">
      {t("workspace_products.requirements.change.empty_value")}
    </span>
  );
};

/** 一侧的值。空值统一落到占位符，避免「没填」和「被清空」看起来一样 */
const SideValue = ({
  field,
  columnKey,
  value,
  workspaceSlug,
  tone,
}: {
  field?: TRequirementField;
  columnKey?: TRequirementBuiltinKey;
  value: TRequirementValue | undefined;
  workspaceSlug: string;
  tone?: "old" | "new";
}) => {
  const className = tone === "old" ? DIFF_OLD_VALUE : tone === "new" ? DIFF_NEW_VALUE : undefined;
  if (value === undefined || value === null || value === "") return <EmptyValue />;
  if (columnKey) {
    return (
      <span className={className}>
        <BuiltinCellValue columnKey={columnKey} values={{ [columnKey]: value } as never} />
      </span>
    );
  }
  if (!field) return <EmptyValue />;
  return <LeafValue field={field} value={value} workspaceSlug={workspaceSlug} className={className} />;
};

type TRow = {
  key: string;
  label: string;
  changed: boolean;
  before: TRequirementValue | undefined;
  after: TRequirementValue | undefined;
  field?: TRequirementField;
  columnKey?: TRequirementBuiltinKey;
};

const readValue = (snapshot: TRequirementChangeSnapshot | null, key: string, isBuiltin: boolean) => {
  if (!snapshot) return undefined;
  if (isBuiltin) return (snapshot as unknown as Record<string, TRequirementValue>)[key];
  return (snapshot.data ?? {})[key];
};

/**
 * 子表单按行 id 对齐：两侧都有的配对比较，只在一侧的算增/删。
 *
 * 行顺序算内容（能拖着排，改了要走变更），所以位置变了也得看得见：值没动只挪了位置的
 * 记成 moved，值和位置一起变的仍记 updated，另外一律带上前后序号供界面标出「n → m」。
 */
const alignFormRows = (before: TRequirementData, after: TRequirementData, formId: string) => {
  const beforeRows = getFormRows(before, formId);
  const afterRows = getFormRows(after, formId);
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
  const beforeIndexById = new Map(beforeRows.map((row, index) => [row.id, index]));
  const afterIds = new Set(afterRows.map((row) => row.id));
  const aligned: {
    key: string;
    state: "created" | "updated" | "deleted" | "moved" | "same";
    before?: TRequirementFormRow["values"];
    after?: TRequirementFormRow["values"];
    /** 只挪了位置也要显形；值同时变了的仍归 updated，位置照样标出来 */
    moved?: boolean;
    beforeIndex?: number;
    afterIndex?: number;
  }[] = afterRows.map((row, index) => {
    const previous = beforeById.get(row.id);
    if (!previous) return { key: row.id, state: "created" as const, after: row.values, afterIndex: index };
    const beforeIndex = beforeIndexById.get(row.id) ?? index;
    const moved = beforeIndex !== index;
    const changed = !isEqual(previous.values, row.values);
    return {
      key: row.id,
      state: changed ? ("updated" as const) : moved ? ("moved" as const) : ("same" as const),
      before: previous.values,
      after: row.values,
      moved,
      beforeIndex,
      afterIndex: index,
    };
  });
  beforeRows.forEach((row, index) => {
    if (afterIds.has(row.id)) return;
    aligned.push({ key: row.id, state: "deleted", before: row.values, beforeIndex: index });
  });
  return aligned;
};

export function ChangeRequestRequirementDiff({ item, fields, builtinLayout = null, workspaceSlug }: TProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const before = item.before_snapshot;
  const after = item.proposed_snapshot;
  const isCreate = item.change_type === "create";
  const isDelete = item.change_type === "delete";

  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);
  const scalarFields = useMemo(
    () => activeFields.filter((field) => field.field_type !== "form"),
    [activeFields]
  );
  const formFields = useMemo(
    () => activeFields.filter((field) => field.field_type === "form"),
    [activeFields]
  );

  const rows = useMemo<TRow[]>(() => {
    const builtinRow = (column: TBuiltinColumnMeta): TRow => {
      const beforeValue = readValue(before, column.key, true);
      const afterValue = readValue(after, column.key, true);
      return {
        key: column.key,
        label: t(column.labelKey),
        changed: !isEqual(beforeValue, afterValue),
        before: beforeValue,
        after: afterValue,
        columnKey: column.key,
      };
    };
    const customRow = (field: TRequirementField): TRow => {
      const beforeValue = readValue(before, field.id, false);
      const afterValue = readValue(after, field.id, false);
      return {
        key: field.id,
        label: field.name,
        changed: !isEqual(beforeValue, afterValue),
        before: beforeValue,
        after: afterValue,
        field,
      };
    };
    // 标题锁定最前，其余内置内容行与自定义标量行按类型布局交叉；
    // status 不算内容不进 diff（isContent=false），子表单行在下方单独渲染
    const merged = mergeBuiltinAndFields("product", builtinLayout, scalarFields).flatMap((descriptor) =>
      descriptor.kind === "builtin"
        ? descriptor.entry.column.isContent
          ? [builtinRow(descriptor.entry.column)]
          : []
        : [customRow(descriptor.field)]
    );
    return [builtinRow(REQUIREMENT_BUILTIN_TITLE_COLUMN), ...merged];
  }, [after, before, builtinLayout, scalarFields, t]);

  const changedCount = rows.filter((row) => row.changed).length;
  const visibleRows = showAll ? rows : rows.filter((row) => row.changed);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className={cn(CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL[item.change_type])}>
          {t(`workspace_products.requirements.change.change_type.${item.change_type}`)}
        </span>
        {/* 一张单里可能有十几条需求，编号是审批人唯一能拿去对照的稳定标识 */}
        <RequirementIdentifier displayId={item.display_id} size="sm" />
        <h3 className="min-w-0 truncate text-13 font-medium text-primary">
          {item.title || t("requirement_detail.untitled")}
        </h3>
        <span className="text-13 text-tertiary">{item.requirement_type_name}</span>
        {item.base_version !== null && (
          <span className="text-13 text-tertiary tabular-nums">
            {t("workspace_products.requirements.change.based_on_version", {
              version: item.base_version,
            })}
          </span>
        )}
        {!isCreate && !isDelete && (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="ml-auto text-13 text-accent-primary hover:underline"
          >
            {showAll
              ? t("workspace_products.requirements.change.show_changed_only", { count: changedCount })
              : t("workspace_products.requirements.change.show_all_fields", { count: rows.length })}
          </button>
        )}
      </header>

      <div className="overflow-hidden rounded-md border border-subtle">
        {/* 新增/删除只有一侧有内容，两栏表头会误导成「另一侧被清空」 */}
        {!isCreate && !isDelete && (
          <div className="grid grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b border-subtle bg-layer-1 px-3 py-1.5 text-13 font-medium text-secondary">
            <span>{t("workspace_products.requirements.change.field")}</span>
            <span>{t("workspace_products.requirements.change.before")}</span>
            <span>{t("workspace_products.requirements.change.after")}</span>
          </div>
        )}

        {visibleRows.length === 0 ? (
          <p className="px-3 py-4 text-13 text-placeholder">
            {t("workspace_products.requirements.change.no_field_changes")}
          </p>
        ) : (
          visibleRows.map((row) => (
            <div
              key={row.key}
              className={cn(
                "grid gap-x-3 border-b border-subtle px-3 py-2 text-13 last:border-b-0",
                isCreate || isDelete
                  ? "grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)]"
                  : "grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)_minmax(0,1fr)]",
                row.changed && !isCreate && !isDelete && "bg-warning-subtle/10"
              )}
            >
              <span className="text-13 text-tertiary">{row.label}</span>
              {isCreate ? (
                <SideValue
                  field={row.field}
                  columnKey={row.columnKey}
                  value={row.after}
                  workspaceSlug={workspaceSlug}
                  tone="new"
                />
              ) : isDelete ? (
                <SideValue
                  field={row.field}
                  columnKey={row.columnKey}
                  value={row.before}
                  workspaceSlug={workspaceSlug}
                  tone="old"
                />
              ) : (
                <>
                  <SideValue
                    field={row.field}
                    columnKey={row.columnKey}
                    value={row.before}
                    workspaceSlug={workspaceSlug}
                    tone={row.changed ? "old" : undefined}
                  />
                  <SideValue
                    field={row.field}
                    columnKey={row.columnKey}
                    value={row.after}
                    workspaceSlug={workspaceSlug}
                    tone={row.changed ? "new" : undefined}
                  />
                </>
              )}
            </div>
          ))
        )}
      </div>

      {formFields.map((form) => {
        const aligned = alignFormRows(before?.data ?? {}, after?.data ?? {}, form.id);
        const changedRows = aligned.filter((row) => row.state !== "same");
        if (!changedRows.length && !showAll) return null;
        const children = form.children.filter((child) => child.is_active);
        const shown = showAll ? aligned : changedRows;
        return (
          <div key={form.id} className="overflow-hidden rounded-md border border-subtle">
            <div className="flex items-center gap-2 bg-layer-1 px-3 py-1.5 text-13 font-medium text-primary">
              {form.name}
              <span className="text-13 font-normal text-tertiary">
                {t("workspace_products.requirements.change.subform_row_delta", {
                  before: getFormRows(before?.data ?? {}, form.id).length,
                  after: getFormRows(after?.data ?? {}, form.id).length,
                })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-full border-collapse text-left text-13">
                <thead>
                  <tr className="border-b border-subtle">
                    <th className="w-16 px-2 py-1.5 text-13 font-medium text-secondary" />
                    {children.map((child) => (
                      <th
                        key={child.id}
                        className="min-w-32 border-l border-subtle px-2.5 py-1.5 text-13 font-medium text-secondary"
                      >
                        {child.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.key} className="border-b border-subtle last:border-b-0">
                      <td className="px-2 py-1.5 align-top text-13 text-tertiary">
                        {t(`workspace_products.requirements.change.subform_state.${row.state}`)}
                        {row.moved && (
                          <span className="mt-0.5 block text-warning-primary tabular-nums">
                            {t("workspace_products.requirements.change.subform_row_moved", {
                              from: (row.beforeIndex ?? 0) + 1,
                              to: (row.afterIndex ?? 0) + 1,
                            })}
                          </span>
                        )}
                      </td>
                      {children.map((child) => {
                        const beforeValue = row.before?.[child.id];
                        const afterValue = row.after?.[child.id];
                        return (
                          <td
                            key={child.id}
                            className="border-l border-subtle px-2.5 py-1.5 align-top"
                          >
                            {row.state === "created" ? (
                              <SideValue
                                field={child}
                                value={afterValue}
                                workspaceSlug={workspaceSlug}
                                tone="new"
                              />
                            ) : row.state === "deleted" ? (
                              <SideValue
                                field={child}
                                value={beforeValue}
                                workspaceSlug={workspaceSlug}
                                tone="old"
                              />
                            ) : isEqual(beforeValue, afterValue) ? (
                              <SideValue field={child} value={afterValue} workspaceSlug={workspaceSlug} />
                            ) : (
                              <Fragment>
                                <SideValue
                                  field={child}
                                  value={beforeValue}
                                  workspaceSlug={workspaceSlug}
                                  tone="old"
                                />
                                <SideValue
                                  field={child}
                                  value={afterValue}
                                  workspaceSlug={workspaceSlug}
                                  tone="new"
                                />
                              </Fragment>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}

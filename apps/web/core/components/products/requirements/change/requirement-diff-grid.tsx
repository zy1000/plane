/**
 * 明细数据 diff。
 *
 * 直接长在现有明细网格的二级表头结构里（复用 RequirementGridHeader / LeafValue /
 * ChangedFieldCorner 与 getMaxFormRows 那套 rowSpan 排布），所以千行和十行走的是同
 * 一套渲染路径 —— 服务端每页 20/50/100 条变更项，不需要虚拟滚动。
 *
 * 三层 diff 的呈现：行级用首列 pill + 整行着色，行内字段级用「旧值红删除线 / 新值绿」
 * 上下堆叠 + 右上角角标，子表单行级按 row id 并集对齐后用 gutter 列打 + / − / ~ 标记。
 */
import { useCallback, useMemo } from "react";
import { isEqual } from "lodash-es";
import { useParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type {
  TRequirementBuiltinKey,
  TRequirementChangeItem,
  TRequirementChangeType,
  TRequirementChangeSnapshot,
  TRequirementData,
  TRequirementValue,
  TRequirementField,
} from "@plane/types";
import { CustomSelect, Loader, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  BuiltinCellValue,
  REQUIREMENT_CONTENT_BUILTIN_COLUMNS,
} from "@/components/requirements/requirement-builtin-fields";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import {
  ChangedFieldCorner,
  getFormRows,
  LeafValue,
  RequirementGridHeader,
} from "@/components/requirements/requirement-grid-shared";
import { ChangeRequirementTypeTabs, type TChangeRequirementTypeTab } from "./change-requirement-type-tabs";
import { CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL, CHANGE_TYPE_ROW, DIFF_NEW_VALUE, DIFF_OLD_VALUE } from "./styles";

const PER_PAGE_OPTIONS = [20, 50, 100];
const SEGMENTS: (TRequirementChangeType | undefined)[] = [undefined, "create", "update", "delete"];

type TSubRowState = "same" | "created" | "updated" | "deleted";

type TAlignedSubRow = {
  key: string;
  before?: TRequirementData;
  after?: TRequirementData;
  state: TSubRowState;
};

const SUB_ROW_MARKER: Record<TSubRowState, string> = {
  same: "",
  created: "+",
  updated: "~",
  deleted: "−",
};

const SUB_ROW_TONE: Record<TSubRowState, string> = {
  same: "",
  created: "bg-success-subtle/40",
  updated: "",
  deleted: "bg-danger-subtle/40",
};

const SUB_ROW_MARKER_TONE: Record<TSubRowState, string> = {
  same: "text-tertiary",
  created: "text-success-primary",
  updated: "text-warning-primary",
  deleted: "text-danger-primary",
};

/** 子表单行按 row id 并集对齐：两侧都有的配对，只在一侧的算增/删 */
const alignSubRows = (
  beforeData: TRequirementData,
  afterData: TRequirementData,
  formId: string
): TAlignedSubRow[] => {
  const beforeRows = getFormRows(beforeData, formId);
  const afterRows = getFormRows(afterData, formId);
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
  const afterIds = new Set(afterRows.map((row) => row.id));

  const aligned: TAlignedSubRow[] = afterRows.map((row) => {
    const previous = beforeById.get(row.id);
    if (!previous) return { key: row.id, after: row.values, state: "created" };
    return {
      key: row.id,
      before: previous.values,
      after: row.values,
      state: isEqual(previous.values, row.values) ? "same" : "updated",
    };
  });
  beforeRows.forEach((row) => {
    if (afterIds.has(row.id)) return;
    aligned.push({ key: row.id, before: row.values, state: "deleted" });
  });
  return aligned;
};

const EmptyValue = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={cn("text-13 text-placeholder", className)}>
      {t("workspace_products.requirements.change.empty_value")}
    </span>
  );
};

/** 单元格：新增行只出绿值、删除行只出红删除线值、修改单元格旧值在上新值在下 */
function DiffCell({
  field,
  changeType,
  before,
  after,
  workspaceSlug,
  valueClassName,
}: {
  field: TRequirementField;
  changeType: TRequirementChangeType;
  before: TRequirementValue | undefined;
  after: TRequirementValue | undefined;
  workspaceSlug: string;
  valueClassName?: string;
}) {
  if (changeType === "create") {
    return (
      <LeafValue
        field={field}
        value={after}
        workspaceSlug={workspaceSlug}
        className={cn(DIFF_NEW_VALUE, valueClassName)}
      />
    );
  }
  if (changeType === "delete") {
    return (
      <LeafValue
        field={field}
        value={before}
        workspaceSlug={workspaceSlug}
        className={cn(DIFF_OLD_VALUE, valueClassName)}
      />
    );
  }
  if (isEqual(before, after)) {
    return <LeafValue field={field} value={before} workspaceSlug={workspaceSlug} className={valueClassName} />;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {before === undefined || before === null || before === "" ? (
        <EmptyValue className={valueClassName} />
      ) : (
        <LeafValue
          field={field}
          value={before}
          workspaceSlug={workspaceSlug}
          className={cn(DIFF_OLD_VALUE, valueClassName)}
        />
      )}
      {after === undefined || after === null || after === "" ? (
        <EmptyValue className={valueClassName} />
      ) : (
        <LeafValue
          field={field}
          value={after}
          workspaceSlug={workspaceSlug}
          className={cn(DIFF_NEW_VALUE, valueClassName)}
        />
      )}
    </span>
  );
}

/** 内置列的 diff：与 DiffCell 同样的三态，只是渲染器换成 BuiltinCellValue */
function BuiltinDiffCell({
  columnKey,
  changeType,
  before,
  after,
  resolveParentTitle,
}: {
  columnKey: TRequirementBuiltinKey;
  changeType: TRequirementChangeType;
  before: TRequirementChangeSnapshot | null;
  after: TRequirementChangeSnapshot | null;
  resolveParentTitle: (parentId: string) => string | undefined;
}) {
  if (changeType === "create") {
    return <BuiltinCellValue columnKey={columnKey} values={{ ...after }} resolveParentTitle={resolveParentTitle} />;
  }
  if (changeType === "delete") {
    return <BuiltinCellValue columnKey={columnKey} values={{ ...before }} resolveParentTitle={resolveParentTitle} />;
  }
  if (isEqual(before?.[columnKey], after?.[columnKey])) {
    return <BuiltinCellValue columnKey={columnKey} values={{ ...before }} resolveParentTitle={resolveParentTitle} />;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className={DIFF_OLD_VALUE}>
        <BuiltinCellValue columnKey={columnKey} values={{ ...before }} resolveParentTitle={resolveParentTitle} />
      </span>
      <span className={DIFF_NEW_VALUE}>
        <BuiltinCellValue columnKey={columnKey} values={{ ...after }} resolveParentTitle={resolveParentTitle} />
      </span>
    </span>
  );
}

type TProps = {
  workspaceSlug: string;
  fields: TRequirementField[];
  /** 本次变更涉及的根字段 ID，「仅显示变化列」按它裁列 */
  changedFieldIds: string[];
  items: TRequirementChangeItem[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  changeType: TRequirementChangeType | undefined;
  changedColumnsOnly: boolean;
  /** 多类型需求才传：给满 2 个才出切换器，fields 已由调用方按类型裁好 */
  requirementTypes?: TChangeRequirementTypeTab[];
  activeRequirementTypeId?: string;
  onTemplateChange?: (requirementTypeId: string) => void;
  /** 仅变更详情页使用舒适密度；版本历史保持默认密度。 */
  density?: "default" | "comfortable";
  onChangeTypeChange: (value: TRequirementChangeType | undefined) => void;
  onChangedColumnsOnlyChange: (value: boolean) => void;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
};

export function RequirementDiffGrid(props: TProps) {
  const {
    workspaceSlug,
    fields,
    changedFieldIds,
    items,
    totalCount,
    isLoading,
    error,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    changeType,
    changedColumnsOnly,
    requirementTypes,
    activeRequirementTypeId,
    onTemplateChange,
    density = "default",
    onChangeTypeChange,
    onChangedColumnsOnlyChange,
    onPerPageChange,
    onCursorChange,
  } = props;
  const { t } = useTranslation();
  const isComfortable = density === "comfortable";
  const cellPaddingClass = isComfortable ? "py-3" : "py-2";
  const valueClassName = isComfortable ? "text-14" : undefined;

  const rootFields = useMemo(() => {
    const active = fields.filter((field) => field.is_active);
    if (!changedColumnsOnly || !changedFieldIds.length) return active;
    const changed = active.filter((field) => changedFieldIds.includes(field.id));
    // changedFieldIds 是跨类型的全集：当前需求类型一列都没命中时退回全列，别渲染出空表
    return changed.length ? changed : active;
  }, [changedColumnsOnly, changedFieldIds, fields]);
  const formFields = useMemo(() => rootFields.filter((field) => field.field_type === "form"), [rootFields]);

  // 父项列存的是 UUID：先用本页变更项自带的快照凑标题，剩下的批量取一次
  const { productId } = useParams();
  const snapshots = useMemo(
    () =>
      items.flatMap((item) =>
        [item.before_snapshot, item.proposed_snapshot].filter(
          (snapshot): snapshot is TRequirementChangeSnapshot => Boolean(snapshot)
        )
      ),
    [items]
  );
  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind: "product",
    entityId: productId ?? "",
    knownRows: snapshots,
    parentIds: useMemo(() => snapshots.map((snapshot) => snapshot.parent_id), [snapshots]),
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);
  // 内置列的 field_id 就是列名，与自定义字段共用 changedFieldIds 这一个维度
  const visibleBuiltinColumns = useMemo(() => {
    // 只列内容列：status 是交付进度，不该在变更单里被当成一处需要签字的改动
    if (!changedColumnsOnly || !changedFieldIds.length) return REQUIREMENT_CONTENT_BUILTIN_COLUMNS;
    return REQUIREMENT_CONTENT_BUILTIN_COLUMNS.filter((column) => changedFieldIds.includes(column.key));
  }, [changedColumnsOnly, changedFieldIds]);

  const currentPage = Number(prevCursor?.split(":")[1] ?? -1) + 2;
  const pageStart = (Math.max(currentPage, 1) - 1) * perPage + 1;

  const renderChangeItem = (item: TRequirementChangeItem) => {
    const before = item.before_snapshot as TRequirementChangeSnapshot | null;
    const after = item.proposed_snapshot as TRequirementChangeSnapshot | null;
    const beforeData = before?.data ?? {};
    const afterData = after?.data ?? {};
    const alignedByForm = new Map(
      formFields.map((form) => [form.id, alignSubRows(beforeData, afterData, form.id)] as const)
    );
    const totalRows = Math.max(1, ...Array.from(alignedByForm.values(), (aligned) => aligned.length));
    const rowToneClass = CHANGE_TYPE_ROW[item.change_type];
    const groupCellClass = "border-b border-b-subtle";

    return (
      <tbody key={item.id}>
        {Array.from({ length: totalRows }, (_, rowIndex) => {
          const isFirstRow = rowIndex === 0;
          return (
            <tr key={`${item.id}-${rowIndex}`} className={cn("bg-surface-1", rowToneClass)}>
              {isFirstRow && (
                <td
                  rowSpan={totalRows}
                  className={cn(
                    "w-20 border-r border-subtle px-2 text-center align-middle",
                    cellPaddingClass,
                    groupCellClass
                  )}
                >
                  <span className={cn(CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL[item.change_type])}>
                    {t(`workspace_products.requirements.change.change_type.${item.change_type}`)}
                  </span>
                </td>
              )}
              {isFirstRow &&
                visibleBuiltinColumns.map((column) => {
                  const hasChanged =
                    item.change_type === "update" && !isEqual(before?.[column.key], after?.[column.key]);
                  return (
                    <td
                      key={column.key}
                      rowSpan={totalRows}
                      className={cn(
                        "min-w-32 border-r border-subtle px-3 align-middle",
                        cellPaddingClass,
                        groupCellClass,
                        hasChanged && "relative bg-danger-subtle/40"
                      )}
                    >
                      <BuiltinDiffCell
                        columnKey={column.key}
                        changeType={item.change_type}
                        before={before}
                        after={after}
                        resolveParentTitle={resolveParentTitle}
                      />
                      {hasChanged && <ChangedFieldCorner />}
                    </td>
                  );
                })}
              {rootFields.flatMap((field) => {
                if (field.field_type !== "form") {
                  if (!isFirstRow) return [];
                  const hasChanged =
                    item.change_type === "update" && !isEqual(beforeData[field.id], afterData[field.id]);
                  return [
                    <td
                      key={field.id}
                      rowSpan={totalRows}
                      className={cn(
                        "min-w-40 border-r border-subtle px-3 align-middle",
                        cellPaddingClass,
                        groupCellClass,
                        hasChanged && "relative bg-danger-subtle/40"
                      )}
                    >
                      <DiffCell
                        field={field}
                        changeType={item.change_type}
                        before={beforeData[field.id]}
                        after={afterData[field.id]}
                        workspaceSlug={workspaceSlug}
                        valueClassName={valueClassName}
                      />
                      {hasChanged && <ChangedFieldCorner />}
                    </td>,
                  ];
                }

                const form = field;
                if (!form.children.length) {
                  return [
                    <td
                      key={`${form.id}-empty`}
                      className={cn(
                        "min-w-40 border-r border-subtle px-3 align-middle text-placeholder",
                        cellPaddingClass,
                        isComfortable ? "text-14" : "text-13",
                        groupCellClass
                      )}
                    >
                      {isFirstRow ? t("requirement_fields.fields.no_children") : null}
                    </td>,
                  ];
                }

                const subRow = alignedByForm.get(form.id)?.[rowIndex];
                const subState: TSubRowState = subRow?.state ?? "same";
                // 子行的增删只给该子表单区域着色，行级着色已经由 rowToneClass 处理
                const subToneClass = item.change_type === "update" ? SUB_ROW_TONE[subState] : "";
                const childCells = form.children.map((child) => {
                  const beforeValue = subRow?.before?.[child.id];
                  const afterValue = subRow?.after?.[child.id];
                  const hasChanged =
                    item.change_type === "update" && subState === "updated" && !isEqual(beforeValue, afterValue);
                  const cellChangeType: TRequirementChangeType =
                    item.change_type === "update" && subState === "created"
                      ? "create"
                      : item.change_type === "update" && subState === "deleted"
                        ? "delete"
                        : item.change_type;
                  return (
                    <td
                      key={`${form.id}-${child.id}`}
                      className={cn(
                        "min-w-40 border-r border-subtle px-3 align-middle",
                        cellPaddingClass,
                        groupCellClass,
                        subToneClass,
                        hasChanged && "relative bg-danger-subtle/40"
                      )}
                    >
                      {subRow ? (
                        <DiffCell
                          field={child}
                          changeType={cellChangeType}
                          before={beforeValue}
                          after={afterValue}
                          workspaceSlug={workspaceSlug}
                          valueClassName={valueClassName}
                        />
                      ) : null}
                      {hasChanged && <ChangedFieldCorner />}
                    </td>
                  );
                });
                return [
                  ...childCells,
                  <td
                    key={`${form.id}-gutter`}
                    className={cn(
                      "w-9 border-r border-subtle px-0.5 text-center align-middle font-medium",
                      cellPaddingClass,
                      isComfortable ? "text-14" : "text-13",
                      groupCellClass,
                      subToneClass,
                      SUB_ROW_MARKER_TONE[subState]
                    )}
                  >
                    {subRow ? SUB_ROW_MARKER[subState] : null}
                  </td>,
                ];
              })}
            </tr>
          );
        })}
      </tbody>
    );
  };

  const rangeLabel =
    totalCount > 0
      ? t("workspace_products.requirements.change.grid.range", {
          start: pageStart,
          end: Math.min(pageStart + items.length - 1, totalCount),
          total: totalCount,
        })
      : "";

  return (
    <section
      aria-labelledby="change-detail-title"
      className="flex min-w-0 flex-col overflow-hidden bg-surface-1"
    >
      <h2 id="change-detail-title" className="sr-only">
        {t("workspace_products.requirements.change.detail_review.title")}
      </h2>

      <div className={cn("border-b border-subtle bg-layer-1/40 px-3 py-2", isComfortable && "px-4")}>
        {requirementTypes && requirementTypes.length > 1 && activeRequirementTypeId && onTemplateChange && (
          <div className="mb-2 border-b border-subtle pb-2">
            <ChangeRequirementTypeTabs
              requirementTypes={requirementTypes}
              activeRequirementTypeId={activeRequirementTypeId}
              onChange={onTemplateChange}
            />
          </div>
        )}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3",
            isComfortable && "min-h-[34px]"
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-md border border-subtle p-0.5">
              {SEGMENTS.map((segment) => (
                <button
                  key={segment ?? "all"}
                  type="button"
                  onClick={() => onChangeTypeChange(segment)}
                  className={cn(
                    "rounded px-2.5 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong",
                    isComfortable ? "h-8 text-13" : "h-7 text-12",
                    changeType === segment
                      ? "bg-accent-subtle font-medium text-accent-primary"
                      : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                  )}
                >
                  {t(`workspace_products.requirements.change.filters.${segment ?? "all"}`)}
                </button>
              ))}
            </div>
            <div
              className={cn("flex min-h-8 items-center gap-2 text-secondary", isComfortable ? "text-13" : "text-12")}
            >
              <span>{t("workspace_products.requirements.change.filters.changed_only")}</span>
              <ToggleSwitch
                value={changedColumnsOnly}
                onChange={onChangedColumnsOnlyChange}
                label={t("workspace_products.requirements.change.filters.changed_only")}
                size="sm"
                className="focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-1"
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-4">
          <Loader className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Loader.Item key={index} height="44px" />
            ))}
          </Loader>
        </div>
      ) : error ? (
        <p className="px-4 py-6 text-13 text-danger-primary">{error}</p>
      ) : !items.length ? (
        <p className="px-4 py-10 text-center text-13 text-tertiary">
          {t("workspace_products.requirements.change.grid.empty")}
        </p>
      ) : (
        <div className="overflow-auto">
          <table
            className={cn("w-max min-w-full border-collapse text-left", isComfortable && "text-14 [&_thead_th]:py-3")}
          >
            <RequirementGridHeader
              rootFields={rootFields}
              showActionGutter
              leadingHeader={{
                className: cn(
                  "w-20 border-r border-subtle px-2 text-center text-primary",
                  isComfortable ? "py-3" : "py-2.5"
                ),
                content: t("workspace_products.requirements.change.grid.change"),
              }}
              builtinHeaders={visibleBuiltinColumns.map((column) => ({
                key: column.key,
                className: column.width,
                content: t(column.labelKey),
              }))}
            />
            {items.map(renderChangeItem)}
          </table>
        </div>
      )}

      <div
        className={cn(
          "flex items-center justify-between border-t border-subtle px-4 py-3 text-secondary",
          isComfortable ? "text-13" : "text-12"
        )}
      >
        <span className="tabular-nums">{rangeLabel}</span>
        <div className="flex items-center gap-2">
          <CustomSelect
            value={perPage}
            onChange={(value: number) => onPerPageChange(Number(value))}
            label={t("workspace_products.requirements.change.grid.per_page_value", { count: perPage })}
            buttonClassName="h-7 border-subtle px-1.5"
            maxHeight="sm"
          >
            {PER_PAGE_OPTIONS.map((value) => (
              <CustomSelect.Option key={value} value={value}>
                {t("workspace_products.requirements.change.grid.per_page_value", { count: value })}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <button
            type="button"
            disabled={!prevPageResults}
            onClick={() => onCursorChange(prevCursor)}
            className="grid size-7 place-items-center rounded-md border border-subtle transition-colors hover:bg-layer-transparent-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong disabled:opacity-40"
            aria-label={t("requirement_grid.pagination.previous_page")}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="tabular-nums">{Math.max(currentPage, 1)}</span>
          <button
            type="button"
            disabled={!nextPageResults}
            onClick={() => onCursorChange(nextCursor)}
            className="grid size-7 place-items-center rounded-md border border-subtle transition-colors hover:bg-layer-transparent-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong disabled:opacity-40"
            aria-label={t("requirement_grid.pagination.next_page")}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

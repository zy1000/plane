/**
 * 项目需求页的类型视图表格：选中某个需求类型后，这一类的字段排成列，格子直接改。
 *
 * 版式与产品需求页的类型视图（requirements/requirement-grid.tsx）一致 —— 编号 / 模块 / 标题
 * 左固定，内置列与自定义字段按类型布局交叉，子表单逐行展开、其余列 rowSpan 跨行。
 * 没有直接复用那张表：它假设整张表只属于一个产品，还带着建行、删行、提交评审、
 * 自有工具栏与筛选，项目页都用不上；这里只拿它的单元格编辑器与「改一格存一行」。
 *
 * 和产品页的两点不同：
 * 1. 一页可以横跨多个产品。能不能改按行看 —— 所属产品可编辑（editableProductIds）且
 *    不在评审中、未关闭；写入打这一行所属产品的 bulk-save，父项候选、附件归属也按行取产品。
 * 2. 项目侧特有的列（所属产品、工作项、审批）照旧显示；所属产品只在跨产品浏览时出现。
 */
import { type MouseEvent as ReactMouseEvent, useCallback, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, FolderOpenDot, Hash, Lock, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type {
  TProjectRequirement,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementField,
  TRequirementFormRow,
  TRequirementItemStatus,
  TRequirementTypeSchema,
  TRequirementValue,
} from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductChip } from "@/components/products/product-chip";
import { RequirementApprovalCell } from "@/components/products/requirements/approval/requirement-approval-cell";
import {
  BuiltinCellEditor,
  BuiltinCellValue,
  pickBuiltinValues,
} from "@/components/requirements/requirement-builtin-fields";
import {
  mergeBuiltinAndFields,
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
} from "@/components/requirements/requirement-builtin-layout";
import {
  FORM_GUTTER_COLUMN_WIDTH,
  FORM_ROW_NUMBER_COLUMN_WIDTH,
  getFormRows,
  getMaxFormRows,
  getRequirementColumnWidth,
  getRequirementRowKey,
  LeafEditor,
  LeafValue,
  MenuRowLabel,
  REQUIREMENT_GRID_BODY_CELL_CLASS,
  REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_CELL_EDITABLE_CLASS,
  REQUIREMENT_GRID_CELL_PAD_CLASS,
  REQUIREMENT_GRID_COLUMN_WIDTH,
  REQUIREMENT_GRID_HEADER_CELL_CLASS,
  REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS,
  REQUIREMENT_GRID_STICKY_BODY_CLASS,
  REQUIREMENT_GRID_STICKY_HEADER_CLASS,
  REQUIREMENT_GRID_TABLE_CLASS,
  RequirementGridHeader,
  RequirementGridHeaderLabel,
  RequirementGridHoverSelect,
  resolveRequirementTitleColumnWidth,
  useRequirementGridColumnResize,
} from "@/components/requirements/requirement-grid-shared";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { createEmptyRequirementData } from "@/components/requirements/requirement-row-data";
import {
  canEditRequirementContent,
  isRequirementClosed,
  RequirementStatusCell,
} from "@/components/requirements/requirement-status-cell";
import { SubformRowHandle } from "@/components/requirements/subform-row-handle";
import { useProgressiveRows } from "@/components/requirements/use-progressive-rows";
import { useRequirementAssetUploadByEntity } from "@/components/requirements/use-requirement-asset-upload";
import { useRequirementRowAutosave } from "@/components/requirements/use-requirement-row-autosave";
import { getSubformDropEdgeClass, moveFormRow, useSubformRowDnd } from "@/components/requirements/use-subform-row-dnd";
import { COLUMN_ICONS, COLUMN_LABEL_KEYS } from "./project-requirements-columns";

/** 首屏先画多少行（按子表单展开后的 tr 数估），其余在 transition 里补齐 —— 同产品类型视图 */
const FIRST_PAINT_ROW_BUDGET = 24;

type TProps = {
  workspaceSlug: string;
  /** 外层滚动容器的宽度：标题列吃掉剩余宽度要用。滚动容器归外壳，空态与这张表共用一个 */
  containerWidth: number;
  /** 子表单行菜单的 portal 宿主（挂在滚动容器外），避免 sticky 标题列把菜单盖住 */
  menuPortalEl: HTMLElement | null;
  requirementType: TRequirementTypeSchema;
  requirements: TProjectRequirement[];
  /** 「显示」里关掉的列：内置列 key / 字段 UUID / product · issues · approval */
  hiddenIds: string[];
  /** 跨产品浏览（左栏没选具体产品）时才出「所属产品」列 */
  showProductColumn: boolean;
  /** 关联管理权限：勾选（解除关联）与改状态共用 */
  canManage: boolean;
  selectedIds: string[];
  onToggleOne: (requirementId: string) => void;
  onToggleAll: () => void;
  /** 当前用户能改需求内容的产品 */
  editableProductIds: Set<string>;
  /** 存一行：打这一行所属产品的 bulk-save */
  onSaveRow: (productId: string, payload: TRequirementBatchSavePayload) => Promise<TRequirementBatchSaveResponse>;
  onOpenDetail: (requirementId: string) => void;
  onStatusChange?: (requirementId: string, status: TRequirementItemStatus) => void;
};

/** 这一行为什么不能改。null = 能改 */
const getReadOnlyReason = (requirement: TProjectRequirement, editableProductIds: Set<string>) => {
  if (!requirement.product_id || !editableProductIds.has(requirement.product_id)) {
    return `你没有「${requirement.product_name ?? "所属产品"}」的编辑权限，只能查看`;
  }
  if (requirement.is_locked) return "评审中，通过或撤回后才能修改";
  if (isRequirementClosed(requirement)) return "已关闭的需求不能修改";
  return null;
};

export const ProjectRequirementTypeTable = (props: TProps) => {
  const {
    workspaceSlug,
    containerWidth,
    menuPortalEl,
    requirementType,
    requirements,
    hiddenIds,
    showProductColumn: showProductColumnProp,
    canManage,
    selectedIds,
    onToggleOne,
    onToggleAll,
    editableProductIds,
    onSaveRow,
    onOpenDetail,
    onStatusChange,
  } = props;
  const { t } = useTranslation();
  /** 待确认删除的子表单行。改动即时落库、没有撤销，所以一律二次确认 */
  const [childRowToDelete, setChildRowToDelete] = useState<{
    requirementId: string;
    formId: string;
    rowId: string;
  } | null>(null);

  const requirementsById = useMemo(
    () => new Map(requirements.map((requirement) => [requirement.id, requirement])),
    [requirements]
  );

  // --- 保存：按行所属产品分发 ---------------------------------------------
  const saveRow = useCallback(
    (payload: TRequirementBatchSavePayload) => {
      const requirementId = payload.updates[0]?.id;
      const productId = requirementId ? requirementsById.get(requirementId)?.product_id : null;
      if (!productId) return Promise.reject({ error: "Unable to save this requirement." });
      return onSaveRow(productId, payload);
    },
    [onSaveRow, requirementsById]
  );
  const autosave = useRequirementRowAutosave({ requirements, onSave: saveRow });
  const uploadFor = useRequirementAssetUploadByEntity({ workspaceSlug });

  // --- 列 ----------------------------------------------------------------
  const isHidden = useCallback((id: string) => hiddenIds.includes(id), [hiddenIds]);
  const activeFields = useMemo(() => requirementType.fields.filter((field) => field.is_active), [requirementType]);
  // 保留类型里配置的字段顺序，只按显隐 / 停用过滤（子表单的子字段同理）
  const visibleRootFields = useMemo(
    () =>
      activeFields
        .filter((field) => !hiddenIds.includes(field.id))
        .map((field) =>
          field.field_type === "form"
            ? Object.assign({}, field, {
                children: field.children.filter((child) => child.is_active && !hiddenIds.includes(child.id)),
              })
            : field
        ),
    [activeFields, hiddenIds]
  );
  const formFields = visibleRootFields.filter((field) => field.field_type === "form");
  const orderedColumns = useMemo(
    () =>
      mergeBuiltinAndFields("product", requirementType.builtin_fields, visibleRootFields).filter(
        (descriptor) => descriptor.kind !== "builtin" || !hiddenIds.includes(descriptor.entry.key)
      ),
    [requirementType.builtin_fields, visibleRootFields, hiddenIds]
  );
  const showModuleColumn = !isHidden("module");
  const showProductColumn = showProductColumnProp && !isHidden("product");
  const showIssuesColumn = !isHidden("issues");
  const showApprovalColumn = !isHidden("approval");
  /** 子表单行首的序号 / 拖拽把手与末尾的 + ⋯：整页只读时收起 */
  const showActionGutter = requirements.some((requirement) => getReadOnlyReason(requirement, editableProductIds) === null);

  const { getWidth, startResize } = useRequirementGridColumnResize();

  const gutterWidth = formFields.reduce(
    (sum, field) =>
      field.children.length && showActionGutter ? sum + FORM_GUTTER_COLUMN_WIDTH + FORM_ROW_NUMBER_COLUMN_WIDTH : sum,
    0
  );
  const defaultNonTitleWidth =
    REQUIREMENT_GRID_COLUMN_WIDTH + // 编号
    (showModuleColumn ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
    (showProductColumn ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
    orderedColumns.reduce((sum, descriptor) => {
      if (descriptor.kind === "builtin") return sum + getRequirementColumnWidth(descriptor.entry.key);
      const field = descriptor.field;
      if (field.field_type !== "form" || !field.children.length) return sum + REQUIREMENT_GRID_COLUMN_WIDTH;
      return sum + field.children.length * REQUIREMENT_GRID_COLUMN_WIDTH;
    }, 0) +
    gutterWidth +
    (showIssuesColumn ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
    (showApprovalColumn ? REQUIREMENT_GRID_COLUMN_WIDTH : 0);
  const defaultTitleColumnWidth = resolveRequirementTitleColumnWidth(containerWidth, defaultNonTitleWidth);
  const columnSnapshot = useMemo(() => {
    const snapshot: Record<string, number> = {
      display_id: REQUIREMENT_GRID_COLUMN_WIDTH,
      title: defaultTitleColumnWidth,
    };
    if (showModuleColumn) snapshot.module = REQUIREMENT_GRID_COLUMN_WIDTH;
    if (showProductColumn) snapshot.product = REQUIREMENT_GRID_COLUMN_WIDTH;
    orderedColumns.forEach((descriptor) => {
      if (descriptor.kind === "builtin") {
        snapshot[descriptor.entry.key] = getRequirementColumnWidth(descriptor.entry.key);
        return;
      }
      const field = descriptor.field;
      if (field.field_type !== "form" || !field.children.length) {
        snapshot[field.id] = REQUIREMENT_GRID_COLUMN_WIDTH;
        return;
      }
      field.children.forEach((child) => {
        snapshot[child.id] = REQUIREMENT_GRID_COLUMN_WIDTH;
      });
    });
    if (showIssuesColumn) snapshot.issues = REQUIREMENT_GRID_COLUMN_WIDTH;
    if (showApprovalColumn) snapshot.approval = REQUIREMENT_GRID_COLUMN_WIDTH;
    return snapshot;
  }, [defaultTitleColumnWidth, orderedColumns, showApprovalColumn, showIssuesColumn, showModuleColumn, showProductColumn]);
  const displayIdWidth = getWidth("display_id", REQUIREMENT_GRID_COLUMN_WIDTH);
  const moduleWidth = showModuleColumn ? getWidth("module", REQUIREMENT_GRID_COLUMN_WIDTH) : 0;
  const titleColumnWidth = getWidth("title", defaultTitleColumnWidth);
  const tableWidth =
    Object.entries(columnSnapshot).reduce((sum, [key, width]) => sum + getWidth(key, width), 0) + gutterWidth;
  const moduleStickyLeft = displayIdWidth;
  const titleStickyLeft = displayIdWidth + moduleWidth;

  /** 父项标题只从本页已有的行里解析 —— 跨产品补齐要按产品发 N 次请求，同「全部」视图 */
  const resolveParentTitle = useCallback(
    (parentId: string) => requirementsById.get(parentId)?.title,
    [requirementsById]
  );

  // --- 写 ------------------------------------------------------------------
  const setRootValue = (requirementId: string, fieldId: string, value: TRequirementValue) =>
    autosave.updateData(requirementId, (data) => ({ ...data, [fieldId]: value }));

  const setChildValue = (requirementId: string, formId: string, rowId: string, childId: string, value: TRequirementValue) =>
    autosave.updateData(requirementId, (data) => ({
      ...data,
      [formId]: getFormRows(data, formId).map((row) =>
        row.id === rowId ? Object.assign({}, row, { values: { ...row.values, [childId]: value } }) : row
      ),
    }));

  const insertFormRow = (requirementId: string, form: TRequirementField, index?: number) =>
    autosave.updateData(requirementId, (data) => {
      const rows = [...getFormRows(data, form.id)];
      const row: TRequirementFormRow = { id: uuidv4(), values: createEmptyRequirementData(form.children) };
      rows.splice(index ?? rows.length, 0, row);
      return { ...data, [form.id]: rows };
    });

  const confirmDeleteFormRow = () => {
    if (!childRowToDelete) return;
    const { requirementId, formId, rowId } = childRowToDelete;
    autosave.updateData(requirementId, (data) => ({
      ...data,
      [formId]: getFormRows(data, formId).filter((row) => row.id !== rowId),
    }));
    setChildRowToDelete(null);
  };

  /** 子表单行拖拽重排。groupId 是 `${需求id}:${子表单id}`，同产品类型视图 */
  const { getRowRef, getDropRef, isDragging, dropEdgeOf } = useSubformRowDnd({
    onReorder: ({ groupId, sourceRowId, targetRowId, edge }) => {
      const [requirementId, formId] = groupId.split(":");
      const current = autosave.getRow(requirementId);
      if (!current) return;
      const rows = getFormRows(current.data, formId);
      const next = moveFormRow(rows, sourceRowId, targetRowId, edge);
      // 落在相邻那条边上等于没动，别发一次空保存去 bump version
      if (next === rows) return;
      autosave.updateData(requirementId, (data) => ({ ...data, [formId]: next }));
    },
  });

  // --- 行 ------------------------------------------------------------------
  const visibleRequirements = useProgressiveRows(requirements, {
    budget: FIRST_PAINT_ROW_BUDGET,
    weigh: (requirement) => Math.max(1, getMaxFormRows(requirement.data ?? {}, formFields)),
  });
  const allSelected = requirements.length > 0 && requirements.every((requirement) => selectedIds.includes(requirement.id));

  const renderRequirementRows = (requirement: TProjectRequirement) => {
    const key = requirement.id;
    const productId = requirement.product_id ?? "";
    const localRow = autosave.getRow(key);
    const saveState = autosave.getSaveState(key);
    // 本地值优先：正在保存中的改动还没回到 requirements 里
    const data = localRow?.data ?? requirement.data ?? {};
    const builtin = localRow?.builtin ?? pickBuiltinValues(requirement);
    const readOnlyReason = getReadOnlyReason(requirement, editableProductIds);
    const isRowEditable = readOnlyReason === null && canEditRequirementContent(requirement, true);
    const isSelected = selectedIds.includes(key);
    const parentScope = { workspaceSlug, productId };
    const uploadAsset = uploadFor(productId);
    const totalRows = Math.max(1, getMaxFormRows(data, formFields));
    // 行底色同产品类型视图：评审中 > 已关闭 > 保存失败 > 选中 > 正常
    const rowStateClass = requirement.is_locked
      ? requirement.pending_change_type === "delete"
        ? "bg-danger-subtle/25 opacity-70"
        : "bg-warning-subtle/20 opacity-80"
      : isRequirementClosed(requirement)
        ? "bg-surface-1 opacity-60 group-hover/requirement:bg-layer-transparent-hover"
        : saveState.error
          ? "bg-danger-subtle/25"
          : isSelected
            ? "bg-accent-primary/5 group-hover/requirement:bg-accent-primary/10"
            : "bg-surface-1 group-hover/requirement:bg-layer-transparent-hover";
    const groupCellClass = "transition-colors duration-150 motion-reduce:transition-none";
    const stickyStyle = (width: number, left: number) => ({ width, minWidth: width, maxWidth: width, left });

    return (
      <tbody key={key} className="group/requirement">
        {Array.from({ length: totalRows }, (_, rowIndex) => {
          const isFirstRow = rowIndex === 0;
          return (
            <tr
              key={getRequirementRowKey(key, data, formFields, rowIndex)}
              className={cn("group transition-colors duration-150 motion-reduce:transition-none", rowStateClass)}
            >
              {isFirstRow && (
                <td
                  rowSpan={totalRows}
                  className={cn("relative", REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS, REQUIREMENT_GRID_STICKY_BODY_CLASS, groupCellClass)}
                  style={stickyStyle(displayIdWidth, 0)}
                >
                  <div
                    className={cn(
                      "flex h-full w-full min-w-0 items-center gap-1.5",
                      canManage ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x",
                      rowStateClass
                    )}
                  >
                    {requirement.display_id ? (
                      <button
                        type="button"
                        onClick={() => onOpenDetail(key)}
                        className="min-w-0 truncate text-left hover:text-accent-primary"
                      >
                        <RequirementIdentifier displayId={requirement.display_id} size="md" />
                      </button>
                    ) : (
                      <span className="text-placeholder">—</span>
                    )}
                  </div>
                  {canManage && (
                    <RequirementGridHoverSelect
                      checked={isSelected}
                      onChange={() => onToggleOne(key)}
                      ariaLabel={t("requirement_grid.data.select_row")}
                      hoverGroup="requirement"
                    />
                  )}
                </td>
              )}
              {isFirstRow && showModuleColumn && (
                <td
                  rowSpan={totalRows}
                  className={cn(REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS, REQUIREMENT_GRID_STICKY_BODY_CLASS, groupCellClass)}
                  style={stickyStyle(moduleWidth, moduleStickyLeft)}
                >
                  <div className={cn("flex h-full w-full min-w-0 items-center px-page-x", rowStateClass)}>
                    {requirement.module_name ? (
                      <span className="min-w-0 truncate text-secondary" title={requirement.module_name}>
                        {requirement.module_name}
                      </span>
                    ) : (
                      <span className="text-placeholder">—</span>
                    )}
                  </div>
                </td>
              )}
              {isFirstRow && (
                <td
                  rowSpan={totalRows}
                  data-requirement-sticky-cell
                  className={cn("relative", REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS, REQUIREMENT_GRID_STICKY_BODY_CLASS, groupCellClass)}
                  style={stickyStyle(titleColumnWidth, titleStickyLeft)}
                >
                  <div
                    className={cn(
                      "flex h-full w-full min-w-0 items-center gap-1.5",
                      isRowEditable ? "pr-page-x" : "px-page-x",
                      rowStateClass,
                      isRowEditable && REQUIREMENT_GRID_CELL_EDITABLE_CLASS
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      {isRowEditable ? (
                        <BuiltinCellEditor
                          columnKey="title"
                          values={builtin}
                          onChange={(patch) => autosave.updateBuiltin(key, patch)}
                          parentScope={parentScope}
                          rowId={key}
                          deferTextCommit
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenDetail(key)}
                          className="block w-full truncate text-left font-medium hover:text-accent-primary"
                        >
                          <BuiltinCellValue columnKey="title" values={builtin} />
                        </button>
                      )}
                    </span>
                    {readOnlyReason && (
                      <Tooltip tooltipContent={readOnlyReason}>
                        <span className="grid size-5 shrink-0 place-items-center text-placeholder" aria-label={readOnlyReason}>
                          <Lock className="size-3.5" />
                        </span>
                      </Tooltip>
                    )}
                    {/* 这一行存失败了就把原因挂在标题格上，别让人以为已经存下去了 */}
                    {saveState.error && (
                      <span className="shrink-0 text-11 text-danger-primary" title={saveState.error}>
                        {t("requirement_grid.data.conflict")}
                      </span>
                    )}
                  </div>
                </td>
              )}
              {isFirstRow && showProductColumn && (
                <td rowSpan={totalRows} className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}>
                  {requirement.product_id ? (
                    <ProductChip
                      identifier={requirement.product_identifier}
                      name={requirement.product_name}
                      href={`/${workspaceSlug}/products/${requirement.product_id}/requirements`}
                      hideIcon
                      hideIdentifier
                    />
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                </td>
              )}
              {orderedColumns.flatMap((descriptor) => {
                if (descriptor.kind === "builtin") {
                  if (!isFirstRow) return [];
                  const column = descriptor.entry;
                  return [
                    <td
                      key={column.key}
                      rowSpan={totalRows}
                      className={cn(
                        REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                        groupCellClass,
                        isRowEditable && column.key !== "status" && REQUIREMENT_GRID_CELL_EDITABLE_CLASS
                      )}
                    >
                      {column.key === "status" ? (
                        // 需求级交付状态走项目端点，看关联管理权限；closed 行要能重开，不受行级只读影响
                        <div className={REQUIREMENT_GRID_CELL_PAD_CLASS}>
                          <RequirementStatusCell
                            status={requirement.status}
                            onChange={canManage && onStatusChange ? (next) => onStatusChange(key, next) : undefined}
                          />
                        </div>
                      ) : isRowEditable ? (
                        <BuiltinCellEditor
                          columnKey={column.key}
                          values={builtin}
                          onChange={(patch) => autosave.updateBuiltin(key, patch)}
                          parentScope={parentScope}
                          rowId={key}
                          deferTextCommit
                        />
                      ) : (
                        <div className={REQUIREMENT_GRID_CELL_PAD_CLASS}>
                          <BuiltinCellValue columnKey={column.key} values={builtin} resolveParentTitle={resolveParentTitle} />
                        </div>
                      )}
                    </td>,
                  ];
                }
                const field = descriptor.field;
                if (field.field_type !== "form") {
                  if (!isFirstRow) return [];
                  return [
                    <td
                      key={field.id}
                      rowSpan={totalRows}
                      className={cn(
                        REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                        groupCellClass,
                        isRowEditable && REQUIREMENT_GRID_CELL_EDITABLE_CLASS
                      )}
                    >
                      {isRowEditable ? (
                        <LeafEditor
                          field={field}
                          value={data[field.id]}
                          workspaceSlug={workspaceSlug}
                          entityId={productId}
                          onChange={(value) => setRootValue(key, field.id, value)}
                          onUpload={uploadAsset}
                          deferTextCommit
                        />
                      ) : (
                        <div className={REQUIREMENT_GRID_CELL_PAD_CLASS}>
                          <LeafValue field={field} value={data[field.id]} workspaceSlug={workspaceSlug} />
                        </div>
                      )}
                    </td>,
                  ];
                }

                const form = field;
                if (form.children.length === 0) {
                  return [
                    <td key={`${form.id}-empty`} className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, "text-placeholder", groupCellClass)}>
                      {isFirstRow ? t("requirement_fields.fields.no_children") : null}
                    </td>,
                  ];
                }
                const formRows = getFormRows(data, form.id);
                const row = formRows[rowIndex];
                // 「新增子行」挂在本组末行的沟槽上。组是空的时候末行就是第 0 行
                const isLastFormRow = rowIndex === Math.max(0, formRows.length - 1);
                const isRowDraggable = Boolean(row) && isRowEditable;
                const dragGroupId = `${key}:${form.id}`;
                const dragRowKey = `${dragGroupId}:${row?.id ?? ""}`;
                const dragCellClass = isRowDraggable
                  ? cn(getSubformDropEdgeClass(dropEdgeOf(dragRowKey)), isDragging(dragRowKey) && "opacity-40")
                  : "";
                const dragPayload = { groupId: dragGroupId, rowId: row?.id ?? "", rowKey: dragRowKey };
                const childCells = form.children.map((child) => (
                  <td
                    key={`${form.id}-${child.id}`}
                    ref={isRowDraggable ? getDropRef(`${dragRowKey}#${child.id}`, dragPayload) : undefined}
                    className={cn(
                      REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                      groupCellClass,
                      row && isRowEditable && REQUIREMENT_GRID_CELL_EDITABLE_CLASS,
                      dragCellClass
                    )}
                  >
                    {row ? (
                      isRowEditable ? (
                        <LeafEditor
                          field={child}
                          value={row.values[child.id]}
                          workspaceSlug={workspaceSlug}
                          entityId={productId}
                          onChange={(value) => setChildValue(key, form.id, row.id, child.id, value)}
                          onUpload={uploadAsset}
                          deferTextCommit
                        />
                      ) : (
                        <div className={REQUIREMENT_GRID_CELL_PAD_CLASS}>
                          <LeafValue field={child} value={row.values[child.id]} workspaceSlug={workspaceSlug} />
                        </div>
                      )
                    ) : null}
                  </td>
                ));
                if (!showActionGutter) return childCells;
                const handleCell = (
                  <td
                    key={`${form.id}-row-number`}
                    ref={isRowDraggable ? getRowRef(dragRowKey, dragPayload) : undefined}
                    className={cn(
                      REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                      "relative px-1 text-center tabular-nums",
                      isRowDraggable && "cursor-grab active:cursor-grabbing",
                      groupCellClass,
                      dragCellClass
                    )}
                  >
                    {row && (
                      <SubformRowHandle
                        index={rowIndex + 1}
                        label={t("requirement_grid.data.reorder_child")}
                        draggable={isRowDraggable}
                      />
                    )}
                  </td>
                );
                const gutterCell = (
                  <td
                    key={`${form.id}-gutter`}
                    ref={isRowDraggable ? getDropRef(`${dragRowKey}#gutter`, dragPayload) : undefined}
                    className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, "px-0.5 text-center", groupCellClass, dragCellClass)}
                  >
                    {isRowEditable ? (
                      <div className="flex items-center justify-center gap-0.5">
                        {/* 空组时常显 —— 那一排格子什么都没有，再藏进 hover 就没人找得到第一行怎么加 */}
                        {isLastFormRow && (
                          <button
                            type="button"
                            onClick={() => insertFormRow(key, form)}
                            aria-label={t("requirement_grid.data.add_child")}
                            title={t("requirement_grid.data.add_child")}
                            className={cn(
                              "grid size-6 shrink-0 place-items-center rounded transition-colors hover:bg-layer-transparent-hover hover:text-accent-primary motion-reduce:transition-none",
                              row
                                ? "text-tertiary opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                : "text-accent-primary"
                            )}
                          >
                            <Plus className="size-3.5" />
                          </button>
                        )}
                        {row ? (
                          <CustomMenu
                            ariaLabel={t("requirement_grid.data.child_actions")}
                            customButton={
                              <span className="grid size-6 place-items-center rounded text-tertiary opacity-0 transition-colors group-hover:opacity-100 focus-within:opacity-100 hover:bg-layer-transparent-hover hover:text-primary">
                                <MoreHorizontal className="size-3.5" />
                              </span>
                            }
                            placement="bottom-end"
                            portalElement={menuPortalEl}
                          >
                            <CustomMenu.MenuItem onClick={() => insertFormRow(key, form, rowIndex)}>
                              <MenuRowLabel icon={ArrowUpToLine} label={t("requirement_grid.data.insert_above")} />
                            </CustomMenu.MenuItem>
                            <CustomMenu.MenuItem onClick={() => insertFormRow(key, form, rowIndex + 1)}>
                              <MenuRowLabel icon={ArrowDownToLine} label={t("requirement_grid.data.insert_below")} />
                            </CustomMenu.MenuItem>
                            <CustomMenu.MenuItem
                              onClick={() => setChildRowToDelete({ requirementId: key, formId: form.id, rowId: row.id })}
                            >
                              <MenuRowLabel icon={Trash2} label={t("delete")} tone="danger" />
                            </CustomMenu.MenuItem>
                          </CustomMenu>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                );
                return [handleCell, ...childCells, gutterCell];
              })}
              {isFirstRow && showIssuesColumn && (
                <td rowSpan={totalRows} className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}>
                  <IssueProgress requirement={requirement} />
                </td>
              )}
              {isFirstRow && showApprovalColumn && (
                <td rowSpan={totalRows} className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}>
                  <RequirementApprovalCell requirement={requirement} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    );
  };

  const leadingHeaderClassName = cn("group/header relative", REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS, REQUIREMENT_GRID_STICKY_HEADER_CLASS);
  const stickyHeaderStyle = (width: number, left: number) => ({ width, minWidth: width, maxWidth: width, left });

  return (
    <>
      <table className={REQUIREMENT_GRID_TABLE_CLASS} style={{ width: tableWidth }}>
        <colgroup>
          <col style={{ width: displayIdWidth }} />
          {showModuleColumn && <col style={{ width: moduleWidth }} />}
          <col style={{ width: titleColumnWidth }} />
          {showProductColumn && <col style={{ width: getWidth("product", REQUIREMENT_GRID_COLUMN_WIDTH) }} />}
          {orderedColumns.flatMap((descriptor) => {
            if (descriptor.kind === "builtin") {
              const columnKey = descriptor.entry.key;
              return [<col key={columnKey} style={{ width: getWidth(columnKey, getRequirementColumnWidth(columnKey)) }} />];
            }
            const field = descriptor.field;
            return field.field_type !== "form" || !field.children.length
              ? [<col key={field.id} style={{ width: getWidth(field.id, REQUIREMENT_GRID_COLUMN_WIDTH) }} />]
              : [
                  ...(showActionGutter ? [<col key={`${field.id}-row-number`} style={{ width: FORM_ROW_NUMBER_COLUMN_WIDTH }} />] : []),
                  ...field.children.map((child) => (
                    <col key={child.id} style={{ width: getWidth(child.id, REQUIREMENT_GRID_COLUMN_WIDTH) }} />
                  )),
                  ...(showActionGutter ? [<col key={`${field.id}-gutter`} style={{ width: FORM_GUTTER_COLUMN_WIDTH }} />] : []),
                ];
          })}
          {showIssuesColumn && <col style={{ width: getWidth("issues", REQUIREMENT_GRID_COLUMN_WIDTH) }} />}
          {showApprovalColumn && <col style={{ width: getWidth("approval", REQUIREMENT_GRID_COLUMN_WIDTH) }} />}
        </colgroup>
        <RequirementGridHeader
          rootFields={visibleRootFields}
          showActionGutter={showActionGutter}
          showFormRowNumber={showActionGutter}
          leadingHeaders={[
            {
              key: "display-id",
              className: leadingHeaderClassName,
              style: stickyHeaderStyle(displayIdWidth, 0),
              onResize: (event: ReactMouseEvent<HTMLDivElement>) => startResize("display_id", columnSnapshot, event),
              content: (
                <>
                  <div
                    className={cn(
                      "flex h-full w-full min-w-0 items-center gap-1.5",
                      canManage ? REQUIREMENT_GRID_SELECT_HOST_PAD_CLASS : "px-page-x"
                    )}
                  >
                    <RequirementGridHeaderLabel icon={Hash} label={t("requirements.identifier.column")} />
                  </div>
                  {canManage && (
                    <RequirementGridHoverSelect
                      checked={allSelected}
                      indeterminate={!allSelected && selectedIds.length > 0}
                      disabled={!requirements.length}
                      onChange={onToggleAll}
                      ariaLabel={t("requirement_grid.data.select_all")}
                      hoverGroup="header"
                      forceVisible={selectedIds.length > 0}
                    />
                  )}
                </>
              ),
            },
            ...(showModuleColumn
              ? [
                  {
                    key: "module",
                    className: leadingHeaderClassName,
                    style: stickyHeaderStyle(moduleWidth, moduleStickyLeft),
                    onResize: (event: ReactMouseEvent<HTMLDivElement>) => startResize("module", columnSnapshot, event),
                    content: (
                      <div className="flex h-full w-full min-w-0 items-center gap-1.5 px-page-x">
                        <RequirementGridHeaderLabel icon={FolderOpenDot} label={t("requirement_modules.column")} />
                      </div>
                    ),
                  },
                ]
              : []),
            {
              key: "title",
              className: leadingHeaderClassName,
              style: stickyHeaderStyle(titleColumnWidth, titleStickyLeft),
              stickyCell: true,
              onResize: (event: ReactMouseEvent<HTMLDivElement>) => startResize("title", columnSnapshot, event),
              content: (
                <div className="flex h-full w-full min-w-0 items-center gap-1.5 px-page-x">
                  <RequirementGridHeaderLabel
                    icon={REQUIREMENT_BUILTIN_TITLE_COLUMN.icon}
                    label={t(REQUIREMENT_BUILTIN_TITLE_COLUMN.labelKey)}
                  />
                </div>
              ),
            },
          ]}
          builtinHeaders={
            showProductColumn
              ? [
                  {
                    key: "product",
                    content: <RequirementGridHeaderLabel icon={COLUMN_ICONS.product} label={t(COLUMN_LABEL_KEYS.product ?? "")} />,
                    onResize: (event: ReactMouseEvent<HTMLDivElement>) => startResize("product", columnSnapshot, event),
                  },
                ]
              : []
          }
          orderedColumns={orderedColumns.map((descriptor) =>
            descriptor.kind === "builtin"
              ? {
                  kind: "builtin" as const,
                  header: {
                    key: descriptor.entry.key,
                    content: (
                      <RequirementGridHeaderLabel
                        icon={descriptor.entry.column.icon}
                        label={t(descriptor.entry.column.labelKey)}
                      />
                    ),
                    onResize: (event: ReactMouseEvent<HTMLDivElement>) =>
                      startResize(descriptor.entry.key, columnSnapshot, event),
                  },
                }
              : descriptor
          )}
          extraHeaders={[
            ...(showIssuesColumn
              ? [
                  {
                    key: "issues",
                    className: REQUIREMENT_GRID_HEADER_CELL_CLASS,
                    content: <RequirementGridHeaderLabel icon={COLUMN_ICONS.issues} label={t(COLUMN_LABEL_KEYS.issues ?? "")} />,
                    onResize: (event: ReactMouseEvent<HTMLDivElement>) => startResize("issues", columnSnapshot, event),
                  },
                ]
              : []),
            ...(showApprovalColumn
              ? [
                  {
                    key: "approval",
                    className: REQUIREMENT_GRID_HEADER_CELL_CLASS,
                    content: <RequirementGridHeaderLabel icon={COLUMN_ICONS.approval} label={t(COLUMN_LABEL_KEYS.approval ?? "")} />,
                    onResize: (event: ReactMouseEvent<HTMLDivElement>) => startResize("approval", columnSnapshot, event),
                  },
                ]
              : []),
          ]}
          onFieldResize={(fieldId, event) => startResize(fieldId, columnSnapshot, event)}
        />
        {visibleRequirements.map(renderRequirementRows)}
      </table>

      <AlertModalCore
        isOpen={childRowToDelete !== null}
        handleClose={() => setChildRowToDelete(null)}
        handleSubmit={confirmDeleteFormRow}
        isSubmitting={false}
        title={t("requirement_grid.data.delete_child_title")}
        content={t("requirement_grid.data.delete_child_description")}
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
};

/** 关联工作项完成率，口径同「全部」视图：分母去掉已取消，全被取消时退回占位符 */
const IssueProgress = ({ requirement }: { requirement: TProjectRequirement }) => {
  if (!requirement.issue_count) return <span className="text-placeholder">—</span>;
  const effectiveCount = requirement.issue_count - requirement.cancelled_issue_count;
  const percent = effectiveCount > 0 ? `${Math.round((requirement.completed_issue_count / effectiveCount) * 100)}%` : "—";
  return (
    <span className="text-12 text-secondary">
      {requirement.completed_issue_count}/{effectiveCount} · {percent}
    </span>
  );
};

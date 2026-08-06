import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isEqual } from "lodash-es";
import { observer } from "mobx-react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Columns3,
  Copy,
  Maximize2,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { Pagination } from "antd";
import { v4 as uuidv4 } from "uuid";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, FilterAppliedIcon, FilterIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirement,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementBuiltinKey,
  TRequirementData,
  TRequirementFilter,
  TRequirementValue,
  TRequirementField,
  TRequirementFormRow,
} from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import {
  BuiltinCellEditor,
  BuiltinCellValue,
  createEmptyBuiltinValues,
  getBuiltinColumnsFor,
  pickBuiltinValues,
} from "./requirement-builtin-fields";
import {
  ChangedFieldCorner,
  getCurrentPageOffset,
  getRequirementRowKey,
  getFormColumnCount,
  getFormRows,
  getMaxFormRows,
  isEmptyRequirementValue,
  LeafEditor,
  LeafValue,
  MenuRowLabel,
  RequirementGridHeader,
} from "./requirement-grid-shared";
import { getRequirementSelectMode, getRequirementSelectOptions } from "./requirement-select";
import {
  createEmptyRequirementData,
  type TRequirementDraftRow,
  useRequirementGridEditor,
} from "./use-requirement-grid-editor";
import { useRequirementTitles } from "./use-requirement-titles";
import { RequirementApprovalCell } from "@/components/products/requirements/approval/requirement-approval-cell";
const SKELETON_ROW_KEYS = ["one", "two", "three", "four", "five", "six", "seven"];

type TProps = {
  workspaceSlug: string;
  /** 这批需求的归属：产品需求传 productId，标准库条目传 libraryId。附件也挂在它上面 */
  entityId: string;
  /** entityId 指的是哪种归属 —— 父项选择器要按它决定去哪个作用域检索候选行 */
  entityKind: "product" | "library";
  /**
   * 是否显示「变更 / 最后变更于」两列。只有受基线管辖的产品需求有这个概念，
   * 标准库条目创建即生效，没有「相对上一版」可言。
   */
  showApprovalColumn?: boolean;
  /** 打开这一行所在的变更单 */
  onOpenChangeRequest?: (changeRequestId: string) => void;
  /** 提交这几条需求进入评审；不传则不渲染提交入口（标准库不走审批） */
  onSubmitReview?: (requirementIds: string[]) => void;
  onWithdrawReview?: (changeRequestId: string) => void;
  readOnly?: boolean;
  /**
   * 新增行绑定到的需求类型。产品需求传当前视图的类型，标准库传 library.requirement_type_id。
   * 表格下方的「新增数据」因此永远挂在类型上，不会挂到标准库上。
   */
  createRequirementTypeId?: string;
  /**
   * 列显隐的存储命名空间后缀。产品需求按视图区分，否则不同类型视图会互相覆盖列配置。
   */
  columnStorageId?: string;
  fields: TRequirementField[];
  requirements: TRequirement[];
  totalCount: number;
  totalPages: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  search: string;
  filters: TRequirementFilter[];
  perPage: number;
  onSearchChange: (value: string) => void;
  onFiltersChange: (value: TRequirementFilter[]) => void;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
  onRefresh: () => Promise<unknown>;
  onBulkSave: (payload: TRequirementBatchSavePayload) => Promise<TRequirementBatchSaveResponse>;
  onEditingChange?: (isEditing: boolean) => void;
  /** 打开这一行的详情。不传则不渲染详情入口（标准库没有详情页） */
  onOpenDetail?: (requirementId: string) => void;
  /** When set, search/filter/display/edit (and bulk-edit actions) render into this host instead of the grid toolbar. */
  toolbarPortalEl?: HTMLElement | null;
};


export const RequirementGrid = observer(function RequirementGrid(props: TProps) {
  const {
    workspaceSlug,
    entityId,
    entityKind,
    showApprovalColumn = false,
    onOpenChangeRequest,
    onSubmitReview,
    onWithdrawReview,
    readOnly = false,
    createRequirementTypeId,
    columnStorageId,
    fields,
    requirements,
    totalCount,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    isLoading,
    isMutating,
    error,
    search,
    filters,
    perPage,
    onSearchChange,
    onFiltersChange,
    onPerPageChange,
    onCursorChange,
    onRefresh,
    onBulkSave,
    onEditingChange,
    onOpenDetail,
    toolbarPortalEl,
  } = props;
  const { t } = useTranslation();
  const { uploadEditorAsset } = useEditorAsset();
  const [searchInput, setSearchInput] = useState(search);
  const [isSearchOpen, setIsSearchOpen] = useState(() => search.trim().length > 0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [filterFieldId, setFilterFieldId] = useState("");
  const [filterOperator, setFilterOperator] = useState<TRequirementFilter["operator"]>("contains");
  const [filterValue, setFilterValue] = useState("");
  const storageKey = `requirement:columns:${workspaceSlug}:${entityId}${columnStorageId ? `:${columnStorageId}` : ""}`;
  // 标准库藏掉状态/负责人/起止日期四列 —— 模板里填了没意义，导入时也会被重置
  const builtinColumns = useMemo(() => getBuiltinColumnsFor(entityKind), [entityKind]);
  // 父项列存的是 UUID，只读态要换成标题；页内命中不发请求，跨页父项攒成一次批量取
  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind,
    entityId,
    knownRows: requirements,
    parentIds: useMemo(() => requirements.map((item) => item.parent_id), [requirements]),
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);
  // 父项只能在同一归属内选：产品需求找同产品的行，标准库条目找同库的条目
  const parentScope = useMemo(
    () =>
      entityKind === "product"
        ? { workspaceSlug, productId: entityId }
        : { workspaceSlug, libraryId: entityId },
    [entityKind, workspaceSlug, entityId]
  );
  const [hiddenFieldIds, setHiddenFieldIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);
  const editor = useRequirementGridEditor({
    requirements,
    fields: activeFields,
    workspaceSlug,
    createRequirementTypeId,
    discardMessage: t("requirement_grid.data.discard_all_confirm"),
    onSave: onBulkSave,
    onEditingChange,
  });
  const hasActiveFilters = filters.length > 0;

  const scheduleSearchChange = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => onSearchChange(value), 300);
    },
    [onSearchChange]
  );

  const clearSearch = useCallback(() => {
    setSearchInput("");
    if (searchTimer.current) clearTimeout(searchTimer.current);
    onSearchChange("");
    setIsSearchOpen(false);
  }, [onSearchChange]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const trimmedQuery = searchInput.trim();
      setSearchInput(trimmedQuery);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      onSearchChange(trimmedQuery);
      return;
    }
    if (event.key === "Escape") {
      if (searchInput.trim() !== "") {
        clearSearch();
      } else {
        setIsSearchOpen(false);
        searchInputRef.current?.blur();
      }
    }
  };

  useOutsideClickDetector(searchInputRef, () => {
    if (isSearchOpen && searchInput.trim() === "") setIsSearchOpen(false);
  });

  useEffect(() => {
    if (document.activeElement !== searchInputRef.current) setSearchInput(search);
    if (search.trim().length > 0) setIsSearchOpen(true);
  }, [search]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(hiddenFieldIds));
  }, [hiddenFieldIds, storageKey]);

  useEffect(() => {
    const visibleDetailIds = new Set(requirements.map((requirement) => requirement.id));
    setSelectedIds((current) => current.filter((id) => visibleDetailIds.has(id)));
  }, [requirements]);

  // Preserve configured root-field order; only filter visibility / inactive children.
  const visibleRootFields = useMemo(
    () =>
      activeFields
        .filter((field) => !hiddenFieldIds.includes(field.id))
        .map((field) =>
          field.field_type === "form"
            ? Object.assign({}, field, {
                children: field.children.filter((child) => child.is_active && !hiddenFieldIds.includes(child.id)),
              })
            : field
        ),
    [activeFields, hiddenFieldIds]
  );
  const formFields = visibleRootFields.filter((field) => field.field_type === "form");
  // The per-sub-record action gutter only carries controls while editing, so it collapses in read-only view.
  const showActionGutter = editor.isEditing;
  // Column count for the trailing "add record" affordance row; mirrors the header's column math.
  const totalColumnCount = useMemo(
    () =>
      1 + // leading checkbox column
      visibleRootFields.reduce(
        (sum, field) =>
          sum + (field.field_type === "form" ? getFormColumnCount(field, showActionGutter) : 1),
        0
      ) +
      (showApprovalColumn ? 1 : 0) + // 审批态
      1, // trailing actions column
    [showActionGutter, showApprovalColumn, visibleRootFields]
  );
  const filterableFields = useMemo(
    () =>
      activeFields.flatMap((field) =>
        field.field_type === "form" ? field.children.filter((child) => child.is_active) : [field]
      ),
    [activeFields]
  );
  const selectedFilterField = filterableFields.find((field) => field.id === filterFieldId);
  const selectedFilterOptions =
    selectedFilterField?.field_type === "select" ? getRequirementSelectOptions(selectedFilterField) : [];
  const filterRequiresValue = !["is_empty", "is_not_empty"].includes(filterOperator);

  const uploadAsset = useCallback(
    async (file: globalThis.File, imageOnly: boolean) => {
      if (imageOnly && !file.type.startsWith("image/")) throw new Error("Only images are supported.");
      const response = await uploadEditorAsset({
        blockId: uuidv4(),
        data: {
          entity_identifier: entityId,
          entity_type: EFileAssetType.REQUIREMENT_ATTACHMENT,
        },
        file,
        workspaceSlug,
      });
      editor.registerPendingAsset(response.asset_id);
      return {
        asset_id: response.asset_id,
        name: file.name,
        type: file.type,
        size: file.size,
      };
    },
    [editor, entityId, uploadEditorAsset, workspaceSlug]
  );

  const saveChanges = async () => {
    try {
      const response = await editor.saveChanges();
      if (!response) return;
      setSelectedIds([]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("requirement_grid.data.saved_all", {
          count: editor.changedCount,
        }),
      });
    } catch (requestError) {
      const payload = requestError as { code?: string; error?: string; data?: Record<string, string[]> };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          payload?.code === "REQUIREMENT_DETAIL_BATCH_CONFLICT" ||
          payload?.code === "REQUIREMENT_CONFIGURATION_CONFLICT"
            ? t("requirement_grid.data.conflict")
            : (payload?.error ?? t("workspace_templates.requirement_types.toast.failed")),
      });
    }
  };

  const setRootValue = (draftKey: string, fieldId: string, value: TRequirementValue) => {
    editor.updateRowData(draftKey, (data) => ({ ...data, [fieldId]: value }));
  };

  const setChildValue = (
    draftKey: string,
    formId: string,
    rowId: string,
    childId: string,
    value: TRequirementValue
  ) => {
    editor.updateRowData(draftKey, (data) => {
      const rows = getFormRows(data, formId).map((row) =>
        row.id === rowId ? Object.assign({}, row, { values: { ...row.values, [childId]: value } }) : row
      );
      return { ...data, [formId]: rows };
    });
  };

  const insertFormRow = (draftKey: string, form: TRequirementField, index?: number) => {
    editor.updateRowData(draftKey, (data) => {
      const rows = [...getFormRows(data, form.id)];
      const row: TRequirementFormRow = {
        id: uuidv4(),
        values: createEmptyRequirementData(form.children),
      };
      rows.splice(index ?? rows.length, 0, row);
      return { ...data, [form.id]: rows };
    });
  };

  const deleteFormRow = (draftKey: string, formId: string, rowId: string) => {
    editor.updateRowData(draftKey, (data) => {
      return {
        ...data,
        [formId]: getFormRows(data, formId).filter((row) => row.id !== rowId),
      };
    });
  };

  const handleDelete = (rowKeys: string[]) => {
    if (!rowKeys.length) return;
    editor.stageDelete(rowKeys);
    setSelectedIds((current) => current.filter((id) => !rowKeys.includes(id)));
  };

  const addFilter = () => {
    if (!filterFieldId) return;
    const nextFilter: TRequirementFilter = {
      field_id: filterFieldId,
      operator: filterOperator,
      ...(!["is_empty", "is_not_empty"].includes(filterOperator)
        ? {
            value: selectedFilterField?.field_type === "boolean" ? filterValue === "true" : filterValue,
          }
        : {}),
    };
    onFiltersChange([...filters.filter((item) => item.field_id !== filterFieldId), nextFilter]);
    setIsFilterOpen(false);
    setFilterValue("");
  };

  const renderRowActionMenu = (
    target: {
      beforeId?: string;
      afterId?: string;
      beforeKey?: string;
      afterKey?: string;
      copyData: TRequirementData;
    },
    deleteTarget: string,
    /** 已落库的行才有详情可开；暂存的新行还没有 id */
    detailTargetId?: string,
    /** 已落库的行本身，用来判定审批相关的入口 */
    detailRow?: TRequirement | null
  ) => (
    <div className="flex justify-center">
      <CustomMenu ellipsis placement="bottom-end" buttonClassName="text-tertiary hover:text-primary">
        <CustomMenu.MenuItem
          onClick={() =>
            editor.stageCreate(target.beforeKey ? { beforeKey: target.beforeKey } : { beforeId: target.beforeId })
          }
        >
          <MenuRowLabel icon={ArrowUpToLine} label={t("requirement_grid.data.insert_above")} />
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() =>
            editor.stageCreate(target.afterKey ? { afterKey: target.afterKey } : { afterId: target.afterId })
          }
        >
          <MenuRowLabel icon={ArrowDownToLine} label={t("requirement_grid.data.insert_below")} />
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() =>
            editor.stageCreate(
              target.afterKey
                ? { data: target.copyData, afterKey: target.afterKey, isCopy: true }
                : { data: target.copyData, afterId: target.afterId, isCopy: true }
            )
          }
        >
          <MenuRowLabel icon={Copy} label={t("requirement_grid.data.copy")} />
        </CustomMenu.MenuItem>
        {detailTargetId && onOpenDetail && (
          <CustomMenu.MenuItem onClick={() => onOpenDetail(detailTargetId)}>
            <MenuRowLabel icon={Maximize2} label={t("requirement_detail.open")} />
          </CustomMenu.MenuItem>
        )}
        {detailRow?.can_submit_review && onSubmitReview && (
          <CustomMenu.MenuItem onClick={() => onSubmitReview([detailRow.id])}>
            <MenuRowLabel icon={Send} label={t("requirement_approval.submit_review")} />
          </CustomMenu.MenuItem>
        )}
        {detailRow?.can_withdraw && detailRow.pending_change_request_id && onWithdrawReview && (
          <CustomMenu.MenuItem
            onClick={() => onWithdrawReview(detailRow.pending_change_request_id as string)}
          >
            <MenuRowLabel icon={Undo2} label={t("requirement_approval.withdraw_review")} />
          </CustomMenu.MenuItem>
        )}
        {detailRow?.pending_change_request_id && onOpenChangeRequest && (
          <CustomMenu.MenuItem
            onClick={() => onOpenChangeRequest(detailRow.pending_change_request_id as string)}
          >
            <MenuRowLabel icon={History} label={t("requirement_approval.view_change_request")} />
          </CustomMenu.MenuItem>
        )}
        {/* 评审中的行不能删；已通过审批的删除要走评审，所以文案变成「申请删除」 */}
        {!detailRow?.is_locked && (
          <CustomMenu.MenuItem
            onClick={() => {
              if (detailRow && detailRow.approved_version !== null && onSubmitReview) {
                onSubmitReview([detailRow.id]);
                return;
              }
              handleDelete([deleteTarget]);
            }}
          >
            <MenuRowLabel
              icon={Trash2}
              label={
                detailRow && detailRow.approved_version !== null
                  ? t("requirement_approval.request_delete")
                  : t("delete")
              }
              tone="danger"
            />
          </CustomMenu.MenuItem>
        )}
      </CustomMenu>
    </div>
  );

  const renderRequirementRows = (
    requirement: TRequirement | null,
    requirementDraft: TRequirementDraftRow | null,
    key: string
  ) => {
    const data = requirementDraft?.data ?? requirement?.data ?? {};
    const builtin = requirementDraft?.builtin ?? (requirement ? pickBuiltinValues(requirement) : createEmptyBuiltinValues());
    const isEditing = Boolean(requirementDraft);
    const isDeleted = Boolean(requirementDraft?.isDeleted);
    const isConflicted = Boolean(requirementDraft?.requirementId && editor.conflictIds.includes(requirementDraft.requirementId));
    const isChanged = Boolean(
      requirementDraft &&
      (requirementDraft.mode === "create" ||
        requirementDraft.isDeleted ||
        (requirementDraft.originalData !== undefined &&
          (!isEqual(requirementDraft.data, requirementDraft.originalData) ||
            !isEqual(requirementDraft.builtin, requirementDraft.originalBuiltin))))
    );
    // 评审中的行落回只读渲染器，零新增渲染路径
    const isRowEditable = isEditing && !isDeleted && !requirementDraft?.isLocked;
    const canAddChild = isRowEditable && formFields.some((form) => form.children.length > 0);
    const rawRowCount = getMaxFormRows(data, formFields);
    // In edit mode the "add child" affordance lives on its own trailing row, so an empty group needs no filler row.
    const dataRowCount = canAddChild ? rawRowCount : Math.max(1, rawRowCount);
    const totalRows = dataRowCount + (canAddChild ? 1 : 0);
    const rowStateClass = isDeleted
      ? "bg-danger-subtle/40"
      : requirementDraft?.isLocked
        ? // 评审中的行：删除待审用危险色，其余用警示色，都压低透明度表示「不可动」
          requirementDraft.pendingChangeType === "delete"
          ? "bg-danger-subtle/25 opacity-70"
          : "bg-warning-subtle/20 opacity-80"
        : isConflicted
          ? "bg-danger-subtle/25"
          : isChanged
            ? "bg-accent-subtle/30"
            : isEditing
              ? "bg-surface-1"
              : "bg-surface-1 group-hover/requirement:bg-accent-subtle/30";
    const groupCellClass = "border-b border-b-subtle transition-colors duration-150 motion-reduce:transition-none";
    const isRootFieldChanged = (fieldId: string) => {
      if (!requirementDraft || isDeleted) return false;
      const currentValue = requirementDraft.data[fieldId];
      if (requirementDraft.mode === "create") return !isEmptyRequirementValue(currentValue);
      return requirementDraft.originalData !== undefined && !isEqual(currentValue, requirementDraft.originalData[fieldId]);
    };
    const isBuiltinChanged = (columnKey: TRequirementBuiltinKey) => {
      if (!requirementDraft || isDeleted) return false;
      const currentValue = requirementDraft.builtin[columnKey];
      if (requirementDraft.mode === "create") return !isEmptyRequirementValue(currentValue as TRequirementValue);
      return (
        requirementDraft.originalBuiltin !== undefined &&
        !isEqual(currentValue, requirementDraft.originalBuiltin[columnKey])
      );
    };

    return (
      <tbody key={key} className="group/requirement">
        {Array.from({ length: totalRows }, (_, rowIndex) => {
          const isAdderRow = canAddChild && rowIndex === dataRowCount;
          const isFirstRow = rowIndex === 0;
          const renderKey = isAdderRow ? `${key}-adder` : getRequirementRowKey(key, data, formFields, rowIndex);
          return (
            <tr
              key={renderKey}
              className={cn("group transition-colors duration-150 motion-reduce:transition-none", rowStateClass)}
            >
              {isFirstRow && (
                <td
                  rowSpan={totalRows}
                  className={cn("w-12 border-r border-subtle px-1.5 py-2 text-center align-middle", groupCellClass)}
                >
                  {requirementDraft?.mode === "create" ? (
                    <span className="inline-flex items-center rounded bg-accent-subtle px-1.5 py-0.5 text-10 font-medium text-accent-primary">
                      {t(
                        requirementDraft.isCopy
                          ? "requirement_grid.data.copy_badge"
                          : "requirement_grid.data.new"
                      )}
                    </span>
                  ) : requirement && !readOnly ? (
                    <input
                      type="checkbox"
                      className="size-3.5 cursor-pointer"
                      checked={selectedIds.includes(requirement.id)}
                      disabled={isDeleted || readOnly}
                      onChange={(event) =>
                        setSelectedIds((current) =>
                          event.target.checked ? [...current, requirement.id] : current.filter((id) => id !== requirement.id)
                        )
                      }
                      aria-label={t("requirement_grid.data.select_row")}
                    />
                  ) : null}
                </td>
              )}
              {isFirstRow && showApprovalColumn && (
                <td
                  rowSpan={totalRows}
                  className={cn("w-24 border-r border-subtle px-2 py-2 text-center align-middle", groupCellClass)}
                >
                  <RequirementApprovalCell
                    requirement={requirement}
                    isStagedCreate={requirementDraft?.mode === "create"}
                    onOpenChangeRequest={onOpenChangeRequest}
                  />
                </td>
              )}
              {/* 内置列恒排在自定义字段之前，且永远是单列，跟着整组行 rowSpan */}
              {isFirstRow &&
                builtinColumns.map((column) => (
                  <td
                    key={column.key}
                    rowSpan={totalRows}
                    className={cn(
                      "min-w-32 border-r border-subtle px-3 py-2 align-middle",
                      groupCellClass,
                      isBuiltinChanged(column.key) && "relative"
                    )}
                  >
                    {isRowEditable ? (
                      <BuiltinCellEditor
                        columnKey={column.key}
                        values={builtin}
                        onChange={(patch) => editor.updateRowBuiltin(key, patch)}
                        parentScope={parentScope}
                        rowId={requirementDraft?.requirementId}
                      />
                    ) : column.key === "title" && requirement && onOpenDetail ? (
                      // 详情入口只挂在标题格上，且不劫持整行点击 —— 整行归内联编辑
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 flex-1 truncate">
                          <BuiltinCellValue columnKey={column.key} values={builtin} />
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenDetail(requirement.id)}
                          title={t("requirement_detail.open")}
                          className="grid size-6 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-layer-transparent-hover hover:text-primary"
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                      </span>
                    ) : (
                      <BuiltinCellValue
                        columnKey={column.key}
                        values={builtin}
                        resolveParentTitle={resolveParentTitle}
                      />
                    )}
                    {isBuiltinChanged(column.key) && <ChangedFieldCorner />}
                  </td>
                ))}
              {visibleRootFields.flatMap((field) => {
                if (field.field_type !== "form") {
                  if (!isFirstRow) return [];
                  return [
                    <td
                      key={field.id}
                      rowSpan={totalRows}
                      className={cn(
                        "min-w-40 border-r border-subtle px-3 py-2 align-middle",
                        groupCellClass,
                        isRootFieldChanged(field.id) && "relative"
                      )}
                    >
                      {isRowEditable ? (
                        <LeafEditor
                          field={field}
                          value={data[field.id]}
                          workspaceSlug={workspaceSlug}
                          onChange={(value) => setRootValue(key, field.id, value)}
                          onUpload={uploadAsset}
                          onRemoveAsset={editor.discardPendingAsset}
                        />
                      ) : (
                        <LeafValue field={field} value={data[field.id]} workspaceSlug={workspaceSlug} />
                      )}
                      {isRootFieldChanged(field.id) && <ChangedFieldCorner />}
                    </td>,
                  ];
                }

                const form = field;
                if (form.children.length === 0) {
                  return [
                    <td
                      key={`${form.id}-empty`}
                      className={cn(
                        "min-w-40 border-r border-subtle px-3 py-2 align-middle text-13 text-placeholder",
                        groupCellClass
                      )}
                    >
                      {isFirstRow ? t("requirement_fields.fields.no_children") : null}
                    </td>,
                  ];
                }
                if (isAdderRow) {
                  return [
                    <td
                      key={`${form.id}-adder`}
                      colSpan={form.children.length + 1}
                      className={cn("border-r border-subtle px-2 py-1.5 align-middle", groupCellClass)}
                    >
                      <button
                        type="button"
                        onClick={() => insertFormRow(key, form)}
                        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle px-2 text-13 font-medium text-accent-primary transition-colors duration-150 hover:border-accent-subtle hover:bg-accent-subtle motion-reduce:transition-none"
                      >
                        <Plus className="size-3.5" />
                        {t("requirement_grid.data.add_child")}
                      </button>
                    </td>,
                  ];
                }
                const row = getFormRows(data, form.id)[rowIndex];
                const originalRow = requirementDraft?.originalData
                  ? getFormRows(requirementDraft.originalData, form.id).find((item) => item.id === row?.id)
                  : undefined;
                const childCells = form.children.map((child) => {
                  const currentValue = row?.values[child.id];
                  const isChildFieldChanged = Boolean(
                    requirementDraft &&
                    !isDeleted &&
                    row &&
                    (originalRow
                      ? !isEqual(currentValue, originalRow.values[child.id])
                      : !isEmptyRequirementValue(currentValue))
                  );
                  return (
                    <td
                      key={`${form.id}-${child.id}`}
                      className={cn(
                        "min-w-40 border-r border-subtle px-3 py-2 align-middle",
                        groupCellClass,
                        isChildFieldChanged && "relative"
                      )}
                    >
                      {row ? (
                        isRowEditable ? (
                          <LeafEditor
                            field={child}
                            value={currentValue}
                            workspaceSlug={workspaceSlug}
                            onChange={(value) => setChildValue(key, form.id, row.id, child.id, value)}
                            onUpload={uploadAsset}
                            onRemoveAsset={editor.discardPendingAsset}
                          />
                        ) : (
                          <LeafValue field={child} value={currentValue} workspaceSlug={workspaceSlug} />
                        )
                      ) : null}
                      {isChildFieldChanged && <ChangedFieldCorner />}
                    </td>
                  );
                });
                if (!showActionGutter) return childCells;
                const gutterCell = (
                  <td
                    key={`${form.id}-gutter`}
                    className={cn("w-9 border-r border-subtle px-0.5 py-2 text-center align-middle", groupCellClass)}
                  >
                    {!isDeleted && row ? (
                      <div className="flex justify-center">
                        <CustomMenu
                          ariaLabel={t("requirement_grid.data.child_actions")}
                          customButton={
                            <span className="grid size-6 place-items-center rounded text-tertiary opacity-0 transition-colors group-hover:opacity-100 focus-within:opacity-100 hover:bg-layer-transparent-hover hover:text-primary">
                              <MoreHorizontal className="size-3.5" />
                            </span>
                          }
                          placement="bottom-end"
                        >
                          <CustomMenu.MenuItem onClick={() => insertFormRow(key, form, rowIndex)}>
                            <MenuRowLabel
                              icon={ArrowUpToLine}
                              label={t("requirement_grid.data.insert_above")}
                            />
                          </CustomMenu.MenuItem>
                          <CustomMenu.MenuItem onClick={() => insertFormRow(key, form, rowIndex + 1)}>
                            <MenuRowLabel
                              icon={ArrowDownToLine}
                              label={t("requirement_grid.data.insert_below")}
                            />
                          </CustomMenu.MenuItem>
                          <CustomMenu.MenuItem onClick={() => deleteFormRow(key, form.id, row.id)}>
                            <MenuRowLabel icon={Trash2} label={t("delete")} tone="danger" />
                          </CustomMenu.MenuItem>
                        </CustomMenu>
                      </div>
                    ) : null}
                  </td>
                );
                return [...childCells, gutterCell];
              })}

              {isFirstRow && (
                <td rowSpan={totalRows} className={cn("w-16 px-2 py-2 text-center align-middle", groupCellClass)}>
                  {isEditing && isDeleted ? (
                    <Button variant="secondary" size="sm" onClick={() => editor.undoDelete(key)}>
                      <Undo2 className="size-3.5" />
                      {t("requirement_grid.data.undo")}
                    </Button>
                  ) : isEditing ? (
                    renderRowActionMenu({ beforeKey: key, afterKey: key, copyData: data }, key)
                  ) : requirement ? (
                    renderRowActionMenu(
                      { beforeId: requirement.id, afterId: requirement.id, copyData: requirement.data },
                      requirement.id,
                      requirement.id,
                      requirement
                    )
                  ) : null}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    );
  };

  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const rowGroups = editor.isEditing
    ? editor.draftRows.map((draftRow) =>
        renderRequirementRows(
          draftRow.requirementId ? (requirementsById.get(draftRow.requirementId) ?? null) : null,
          draftRow,
          draftRow.key
        )
      )
    : requirements.map((requirement) => renderRequirementRows(requirement, null, requirement.id));
  const selectableRequirementIds = editor.isEditing
    ? editor.draftRows
        .filter((draftRow) => draftRow.mode === "update" && !draftRow.isDeleted && draftRow.requirementId)
        .map((draftRow) => draftRow.requirementId as string)
    : requirements.map((requirement) => requirement.id);
  const displayedTotalCount = editor.isEditing
    ? totalCount +
      editor.draftRows.filter((draftRow) => draftRow.mode === "create").length -
      editor.draftRows.filter((draftRow) => draftRow.mode === "update" && draftRow.isDeleted).length
    : totalCount;
  const currentPageOffset = getCurrentPageOffset(prevCursor, nextCursor, prevPageResults, nextPageResults);
  const pageItemCount = editor.isEditing ? editor.draftRows.length : requirements.length;
  const showSelectionActions = !readOnly && !editor.isEditing && selectedIds.length > 0;
  /** 可提交的选中行。撤回不做批量 —— 撤回作用在变更单上，一个选区可能跨多张单 */
  const submittableSelectedIds = useMemo(
    () =>
      selectedIds.filter((id) => requirements.find((item) => item.id === id)?.can_submit_review),
    [requirements, selectedIds]
  );
  /** 只有从未通过审批的草稿能直接删；已确认的走「申请删除」评审 */
  const deletableSelectedIds = useMemo(
    () =>
      selectedIds.filter((id) => {
        const row = requirements.find((item) => item.id === id);
        return row ? !row.is_locked && row.approved_version === null : false;
      }),
    [requirements, selectedIds]
  );
  const useExternalToolbar = Boolean(toolbarPortalEl);

  const toolbarActions: ReactNode = editor.isEditing ? (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-primary">
          <Pencil className="size-3.5" />
        </span>
        <span className="truncate text-12 font-medium text-primary">
          {t("requirement_grid.data.bulk_edit_mode")}
        </span>
        <span className="bg-border-subtle h-4 w-px shrink-0" />
        <span
          className="shrink-0 rounded-full bg-layer-2 px-2 py-0.5 text-10 font-medium text-secondary"
          aria-live="polite"
        >
          {t("requirement_grid.data.changed_count", { count: editor.changedCount })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" onClick={() => void editor.cancelEditing()} disabled={isMutating}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => void saveChanges()}
          loading={isMutating}
          disabled={!editor.isDirty || Boolean(editor.saveError && editor.conflictIds.length)}
        >
          <Save className="size-3.5" />
          {t("requirement_grid.data.save_changes")}
        </Button>
      </div>
    </>
  ) : showSelectionActions ? (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="px-1 text-12 font-medium text-primary tabular-nums" aria-live="polite">
        {t("requirement_grid.data.selected_count", { count: selectedIds.length })}
      </span>
      <Button variant="ghost" size="lg" onClick={() => setSelectedIds([])}>
        {t("requirement_grid.data.clear_selection")}
      </Button>
      {onSubmitReview && submittableSelectedIds.length > 0 && (
        <Button
          variant="primary"
          size="lg"
          onClick={() => onSubmitReview(submittableSelectedIds)}
          disabled={isMutating}
        >
          <Send className="size-3.5" />
          {t("requirement_approval.submit_review_count", { count: submittableSelectedIds.length })}
        </Button>
      )}
      <Button
        variant="error-outline"
        size="lg"
        onClick={() => handleDelete(deletableSelectedIds)}
        disabled={isMutating || deletableSelectedIds.length === 0}
      >
        <Trash2 className="size-3.5" />
        {t("delete")}
      </Button>
    </div>
  ) : (
    <>
      <div className="flex items-center">
        {!isSearchOpen && (
          <IconButton
            variant="ghost"
            size="lg"
            className="-mr-1"
            onClick={() => {
              setIsSearchOpen(true);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            icon={SearchIcon}
            aria-label={t("requirement_grid.data.search")}
          />
        )}
        <div
          className={cn(
            "ml-auto box-border flex h-7 w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
            {
              "w-30 border-subtle px-2.5 opacity-100 md:w-64": isSearchOpen,
            }
          )}
        >
          <SearchIcon className="h-3.5 w-3.5" />
          <input
            ref={searchInputRef}
            className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            placeholder={t("requirement_grid.data.search")}
            value={searchInput}
            onChange={(event) => {
              const value = event.target.value;
              setSearchInput(value);
              scheduleSearchChange(value);
            }}
            onKeyDown={handleSearchKeyDown}
          />
          {isSearchOpen && (
            <button type="button" className="grid place-items-center" onClick={clearSearch}>
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="relative">
        <IconButton
          size="lg"
          variant="secondary"
          icon={hasActiveFilters ? FilterAppliedIcon : FilterIcon}
          onClick={() => setIsFilterOpen((value) => !value)}
          aria-label={t("requirement_grid.data.filter")}
          className={cn({
            "border-accent-subtle-1 hover:border-accent-subtle-1 focus:border-accent-subtle-1 active:border-accent-subtle-1 border bg-accent-subtle text-accent-primary hover:bg-accent-subtle hover:text-accent-primary focus:bg-accent-subtle focus:text-accent-primary active:bg-accent-subtle active:text-accent-primary":
              hasActiveFilters,
            "bg-accent-subtle-hover hover:bg-accent-subtle-hover focus:bg-accent-subtle-hover active:bg-accent-subtle-hover":
              hasActiveFilters && isFilterOpen,
          })}
          iconClassName={cn({
            "text-accent-primary [&_path]:fill-current": hasActiveFilters,
          })}
        />
        {isFilterOpen && (
          <div className="absolute top-10 right-0 z-30 w-80 space-y-3 rounded-lg border border-subtle bg-surface-1 p-3 shadow-lg">
            <select
              value={filterFieldId}
              onChange={(event) => {
                setFilterFieldId(event.target.value);
                const field = filterableFields.find((item) => item.id === event.target.value);
                setFilterOperator(
                  field?.field_type === "text" || field?.field_type === "rich_text"
                    ? "contains"
                    : field?.field_type === "select" && getRequirementSelectMode(field) === "multiple"
                      ? "contains"
                      : field?.field_type === "attachment" || field?.field_type === "image"
                        ? "is_not_empty"
                        : "equals"
                );
                setFilterValue(
                  field?.field_type === "boolean"
                    ? "true"
                    : field?.field_type === "select"
                      ? (getRequirementSelectOptions(field)[0]?.id ?? "")
                      : ""
                );
              }}
              className="h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-12"
            >
              <option value="">{t("requirement_grid.data.select_field")}</option>
              {filterableFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterOperator}
                onChange={(event) => setFilterOperator(event.target.value as TRequirementFilter["operator"])}
                className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-12"
              >
                {(selectedFilterField?.field_type === "text" ||
                  selectedFilterField?.field_type === "rich_text" ||
                  (selectedFilterField?.field_type === "select" &&
                    getRequirementSelectMode(selectedFilterField) === "multiple")) && (
                  <option value="contains">{t("requirement_grid.filters.contains")}</option>
                )}
                {!["attachment", "image"].includes(selectedFilterField?.field_type ?? "") &&
                  !(
                    selectedFilterField?.field_type === "select" &&
                    getRequirementSelectMode(selectedFilterField) === "multiple"
                  ) && <option value="equals">{t("requirement_grid.filters.equals")}</option>}
                <option value="is_empty">{t("requirement_grid.filters.is_empty")}</option>
                <option value="is_not_empty">{t("requirement_grid.filters.is_not_empty")}</option>
              </select>
              {filterRequiresValue && selectedFilterField?.field_type === "select" ? (
                <select
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  className="h-8 min-w-0 rounded-md border border-subtle bg-surface-1 px-2 text-12"
                >
                  {selectedFilterOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : filterRequiresValue && selectedFilterField?.field_type === "member" ? (
                <MemberDropdown
                  multiple={false}
                  value={filterValue || null}
                  onChange={(memberId) => setFilterValue(memberId ?? "")}
                  buttonVariant="border-with-text"
                  buttonClassName="h-8 min-w-0 border !border-subtle bg-surface-1"
                  buttonContainerClassName="min-w-0"
                  placeholder={t("requirement_grid.data.select_member")}
                  showUserDetails
                />
              ) : filterRequiresValue && selectedFilterField?.field_type === "boolean" ? (
                <select
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-12"
                >
                  <option value="true">{t("requirement_grid.data.yes")}</option>
                  <option value="false">{t("requirement_grid.data.no")}</option>
                </select>
              ) : filterRequiresValue ? (
                <input
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  className="focus:border-accent-primary h-8 rounded-md border border-subtle bg-surface-1 px-2 text-12 outline-none"
                  placeholder={t("requirement_grid.data.filter_value")}
                />
              ) : null}
            </div>
            {filters.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filters.map((filter) => (
                  <button
                    key={filter.field_id}
                    type="button"
                    onClick={() => onFiltersChange(filters.filter((item) => item.field_id !== filter.field_id))}
                    className="rounded-md bg-layer-2 px-2 py-1 text-10 text-secondary"
                  >
                    {filterableFields.find((field) => field.id === filter.field_id)?.name ?? "—"} ×
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => onFiltersChange([])}>
                {t("reset")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={addFilter}
                disabled={!filterFieldId || (filterRequiresValue && !filterValue)}
              >
                {t("apply")}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="relative">
        <Button variant="secondary" size="lg" onClick={() => setIsColumnsOpen((value) => !value)}>
          {t("common.display")}
        </Button>
        {isColumnsOpen && (
          <div className="absolute top-10 right-0 z-30 max-h-80 w-64 overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-2 shadow-lg">
            {activeFields.map((field) => (
              <div key={field.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-12 hover:bg-layer-transparent-hover">
                  <input
                    type="checkbox"
                    checked={!hiddenFieldIds.includes(field.id)}
                    onChange={() =>
                      setHiddenFieldIds((current) =>
                        current.includes(field.id) ? current.filter((id) => id !== field.id) : [...current, field.id]
                      )
                    }
                  />
                  <span className="truncate">{field.name}</span>
                </label>
                {field.field_type === "form" &&
                  !hiddenFieldIds.includes(field.id) &&
                  field.children
                    .filter((child) => child.is_active)
                    .map((child) => (
                      <label
                        key={child.id}
                        className="ml-5 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-11 text-secondary hover:bg-layer-transparent-hover"
                      >
                        <input
                          type="checkbox"
                          checked={!hiddenFieldIds.includes(child.id)}
                          onChange={() =>
                            setHiddenFieldIds((current) =>
                              current.includes(child.id)
                                ? current.filter((id) => id !== child.id)
                                : [...current, child.id]
                            )
                          }
                        />
                        <span className="truncate">{child.name}</span>
                      </label>
                    ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {!readOnly && (
        <Button
          variant="primary"
          size="lg"
          onClick={editor.startEditing}
          disabled={isLoading || requirements.length === 0}
        >
          {t("edit")}
        </Button>
      )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
      {useExternalToolbar &&
        toolbarPortalEl &&
        createPortal(<div className="flex min-w-0 items-center gap-2">{toolbarActions}</div>, toolbarPortalEl)}
      {!useExternalToolbar && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-subtle bg-surface-1 px-4 py-2.5">
          <div
            className={cn("flex flex-wrap items-center gap-2", editor.isEditing ? "w-full justify-between" : "ml-auto")}
          >
            {toolbarActions}
          </div>
        </div>
      )}

      {editor.saveError && (
        <div
          className="flex items-center justify-between gap-3 border-b border-danger-subtle bg-danger-subtle px-4 py-2 text-11 text-danger-primary"
          role="alert"
        >
          <span>
            {editor.conflictIds.length ? t("requirement_grid.data.conflict") : editor.saveError}
          </span>
          {editor.conflictIds.length > 0 && (
            <button
              type="button"
              className="font-medium underline"
              onClick={() => {
                void (async () => {
                  if (await editor.cancelEditing()) await onRefresh();
                })();
              }}
            >
              {t("requirement_grid.data.reload_to_continue")}
            </button>
          )}
        </div>
      )}

      {filters.length > 0 && (
        <div className="flex gap-1 border-b border-subtle bg-surface-1 px-4 py-2">
          {filters.map((filter) => (
            <button
              type="button"
              key={filter.field_id}
              disabled={editor.isEditing}
              onClick={() => onFiltersChange(filters.filter((item) => item.field_id !== filter.field_id))}
              className="rounded-md bg-accent-subtle px-2 py-1 text-10 text-accent-primary disabled:cursor-default"
            >
              {filterableFields.find((field) => field.id === filter.field_id)?.name} ×
            </button>
          ))}
        </div>
      )}

      <div className="horizontal-scrollbar vertical-scrollbar scrollbar-lg min-h-0 flex-1 overflow-auto bg-surface-1">
        {isLoading ? (
          <div className="min-w-[960px] p-4">
            <Loader>
              <Loader.Item height="72px" />
              {SKELETON_ROW_KEYS.map((key) => (
                <Loader.Item key={key} height="52px" />
              ))}
            </Loader>
          </div>
        ) : error ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center">
            <div>
              <p className="text-13 font-medium text-primary">{t("workspace_templates.requirement_types.error.title")}</p>
              <p className="mt-1 text-12 text-secondary">{error}</p>
              <Button className="mt-3" variant="secondary" onClick={() => void onRefresh()}>
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : activeFields.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center">
            <div>
              <Columns3 className="mx-auto size-8 text-placeholder" />
              <p className="mt-2 text-13 font-medium text-primary">
                {t("requirement_grid.data.no_fields")}
              </p>
              <p className="mt-1 text-12 text-secondary">
                {t("requirement_grid.data.no_fields_description")}
              </p>
            </div>
          </div>
        ) : requirements.length === 0 && !editor.isEditing ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center">
            <div>
              <Plus className="mx-auto size-8 text-placeholder" />
              <p className="mt-2 text-13 font-medium text-primary">
                {t("requirement_grid.data.empty")}
              </p>
              {!readOnly && (
                <Button className="mt-3" variant="primary" onClick={() => editor.stageCreate()}>
                  {t("requirement_grid.data.add")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <table className="w-max min-w-full border-collapse text-left">
            <RequirementGridHeader
              rootFields={visibleRootFields}
              showActionGutter={showActionGutter}
              leadingHeader={{
                className: "w-12 border-r border-subtle px-1.5 py-2.5 text-center",
                content: (
                  <input
                    type="checkbox"
                    className="size-3.5 cursor-pointer"
                    disabled={readOnly}
                    checked={
                      selectableRequirementIds.length > 0 &&
                      selectableRequirementIds.every((requirementId) => selectedIds.includes(requirementId))
                    }
                    onChange={(event) => setSelectedIds(event.target.checked ? selectableRequirementIds : [])}
                    aria-label={t("requirement_grid.data.select_all")}
                  />
                ),
              }}
              builtinHeaders={[
                // 审批态排在最前 —— 每行都要扫一眼，不能放到要横滚才看得见的地方
                ...(showApprovalColumn
                  ? [
                      {
                        key: "approval-state",
                        className: "w-24 text-center",
                        content: t("requirement_approval.column"),
                      },
                    ]
                  : []),
                ...builtinColumns.map((column) => ({
                  key: column.key,
                  className: column.width,
                  content: t(column.labelKey),
                })),
              ]}
              trailingHeader={{
                className: "w-16 px-2 py-2.5 text-center text-primary",
                content: t("requirement_fields.fields.actions"),
              }}
            />
            {rowGroups}
            {!readOnly &&
              (editor.isEditing ? editor.draftRows.length > 0 : requirements.length > 0) && (
                <tbody>
                  <tr>
                    <td colSpan={totalColumnCount} className="border-b border-subtle px-3 py-2">
                      <button
                        type="button"
                        onClick={() => editor.stageCreate()}
                        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-13 font-medium text-accent-primary transition-colors duration-150 hover:border-accent-subtle hover:bg-accent-subtle motion-reduce:transition-none"
                      >
                        <Plus className="size-3.5" />
                        {t("requirement_grid.data.add")}
                      </button>
                    </td>
                  </tr>
                </tbody>
              )}
          </table>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-secondary">
            {displayedTotalCount > 0
              ? t("requirement_grid.data.range", {
                  start: currentPageOffset * perPage + 1,
                  end: Math.min(currentPageOffset * perPage + pageItemCount, displayedTotalCount),
                  total: displayedTotalCount,
                })
              : ""}
          </span>
        </div>
        <Pagination
          simple
          size="small"
          current={currentPageOffset + 1}
          pageSize={perPage}
          total={totalCount}
          showSizeChanger
          pageSizeOptions={["20", "50", "100"]}
          disabled={editor.isEditing}
          onChange={(page, pageSize) => {
            if (pageSize !== perPage) {
              onPerPageChange(pageSize);
              return;
            }
            onCursorChange(page <= 1 ? undefined : `${pageSize}:${page - 1}:0`);
          }}
          onShowSizeChange={(_page, pageSize) => onPerPageChange(pageSize)}
        />
      </div>
    </div>
  );
});

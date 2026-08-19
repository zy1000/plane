import {
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BookMarked,
  Columns3,
  Copy,
  Hash,
  Maximize2,
  History,
  MoreHorizontal,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { Pagination } from "antd";
import { v4 as uuidv4 } from "uuid";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirement,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementFilter,
  TRequirementItemStatus,
  TRequirementValue,
  TRequirementField,
  TRequirementFormRow,
} from "@plane/types";
import { AlertModalCore, Checkbox, CustomMenu, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import {
  collectRequirementGridFilterFields,
  useRequirementGridFilter,
  useRequirementGridFiltersConfig,
} from "@/components/requirements/filters";
import { RequirementDisplayProperties } from "@/components/requirements/requirement-display-properties";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import {
  BuiltinCellEditor,
  BuiltinCellValue,
  createEmptyBuiltinValues,
  getBuiltinColumnsFor,
  pickBuiltinValues,
} from "./requirement-builtin-fields";
import {
  FORM_GUTTER_COLUMN_WIDTH,
  getCurrentPageOffset,
  getRequirementColumnWidth,
  getRequirementRowKey,
  getFormColumnCount,
  getFormRows,
  getMaxFormRows,
  LeafEditor,
  LeafValue,
  MenuRowLabel,
  REQUIREMENT_GRID_BODY_CELL_CLASS,
  REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_COLUMN_WIDTH,
  REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
  REQUIREMENT_GRID_SELECT_COLUMN_STYLE,
  REQUIREMENT_GRID_SELECT_COLUMN_WIDTH,
  REQUIREMENT_GRID_STICKY_BODY_CLASS,
  REQUIREMENT_GRID_STICKY_HEADER_CLASS,
  REQUIREMENT_GRID_STICKY_SELECT_BODY_CLASS,
  REQUIREMENT_GRID_STICKY_SELECT_HEADER_CLASS,
  RequirementGridHeader,
  RequirementGridHeaderLabel,
  resolveRequirementTitleColumnWidth,
  useRequirementGridColumnResize,
  useRequirementGridScrollContainer,
} from "./requirement-grid-shared";
import { RequirementIdentifier } from "./requirement-identifier";
import { canEditRequirementContent, isRequirementClosed, RequirementStatusCell } from "./requirement-status-cell";
import { copyRequirementData, createEmptyRequirementData } from "./requirement-row-data";
import { RequirementCreateModal, type TRequirementCreateSeed } from "./requirement-create-modal";
import { useRequirementAssetUpload } from "./use-requirement-asset-upload";
import { useRequirementRowAutosave } from "./use-requirement-row-autosave";
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
  /** 打开这一行的详情抽屉。不传则编号不可点、也不渲染详情入口 */
  onOpenDetail?: (requirementId: string) => void;
  /**
   * 改需求级交付状态。走独立的状态端点、不进行内容 PATCH，所以不经 autosave；
   * 不传则状态格只读（标准库没有这一列，产品侧无写权限时也不传）。
   */
  onStatusChange?: (requirementId: string, status: TRequirementItemStatus) => void;
  /** When set, search/filter/display/edit (and bulk-edit actions) render into this host instead of the grid toolbar. */
  toolbarPortalEl?: HTMLElement | null;
  /** 页头已有独立的「添加需求」时关掉工具栏这份，避免并排两个主按钮 */
  hideToolbarAdd?: boolean;
};


/** 页头的「录入」要在类型视图里直接内联加一行，所以把 addRow 露出去 */
export type TRequirementGridHandle = { addRow: () => void };

export const RequirementGrid = observer(
  forwardRef<TRequirementGridHandle, TProps>(function RequirementGrid(props, ref) {
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
    onOpenDetail,
    onStatusChange,
    toolbarPortalEl,
    hideToolbarAdd = false,
  } = props;
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState(search);
  const [isSearchOpen, setIsSearchOpen] = useState(() => search.trim().length > 0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  /** 行 / 子表单菜单 portal 宿主，避免 sticky 标题列把菜单盖住 */
  const [menuPortalEl, setMenuPortalEl] = useState<HTMLDivElement | null>(null);
  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);
  /**
   * 已有行「改一格存一格」。原先是「点编辑 -> 攒草稿 -> 点保存更改」，整套暂存
   * （含离开页面拦截）随之退休。
   */
  const autosave = useRequirementRowAutosave({
    requirements,
    onSave: onBulkSave,
  });
  /** 打开建行弹窗；带 seed 表示复制行或插到指定位置。只在类型有必填字段时才用，见 addRow */
  const [createSeed, setCreateSeed] = useState<TRequirementCreateSeed | null>(null);
  /** 刚建出来的行：让光标自动落到它的标题上 */
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [isCreatingRow, setIsCreatingRow] = useState(false);
  /** 待确认删除的行。删除是即时的，没有撤销，所以一律二次确认 */
  const [idsToDelete, setIdsToDelete] = useState<string[]>([]);

  /**
   * 有必填字段的类型建不出空行：后端在 validate_requirement_data 里按
   * enforce_required=field.is_active 校验（serializers/requirement.py:629），
   * 空值直接 400。这种类型仍旧走弹窗，填齐了一次落库。
   */
  const requiresCreateModal = useMemo(() => activeFields.some((field) => field.is_required), [activeFields]);

  /**
   * 内联新增一行：直接建出来，随后它就是一条普通的自动保存行。
   *
   * 不做「表格里的本地草稿行」—— 那需要把 保存更改 / 取消 / 离开页面提醒 整套暂存
   * 机制再请回来，而这一整套刚刚才随「改一格存一格」退休。空行落库是合法的：
   * title 允许留空（RequirementBuiltinWriteSerializer 的 allow_blank=True），
   * 自定义字段只有标了必填才拦（那种类型走 requiresCreateModal 的弹窗）。
   */
  const addRow = useCallback(
    async (seed: TRequirementCreateSeed = {}) => {
      if (requiresCreateModal) {
        setCreateSeed(seed);
        return;
      }
      if (isCreatingRow) return;
      setIsCreatingRow(true);
      try {
        const response = await onBulkSave({
          creates: [
            {
              client_id: uuidv4(),
              data: seed.data ?? createEmptyRequirementData(activeFields),
              builtin: seed.builtin ?? createEmptyBuiltinValues(),
              ...(createRequirementTypeId ? { requirement_type_id: createRequirementTypeId } : {}),
              ...(seed.beforeId ? { before_id: seed.beforeId } : {}),
              ...(seed.afterId ? { after_id: seed.afterId } : {}),
            },
          ],
          updates: [],
          deletes: [],
        });
        const created = response.created?.[0]?.requirement;
        if (created) setFocusRowId(created.id);
      } catch (requestError) {
        const payload = requestError as { error?: string; detail?: string };
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? payload?.detail ?? t("workspace_products.requirements.toast.failed"),
        });
      } finally {
        setIsCreatingRow(false);
      }
    },
    [activeFields, createRequirementTypeId, isCreatingRow, onBulkSave, requiresCreateModal, t]
  );

  // 页头的「录入」在类型视图里直接走这条内联路径，不再绕类型选择器
  useImperativeHandle(ref, () => ({ addRow: () => void addRow() }), [addRow]);

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
  const customFilterFields = useMemo(() => collectRequirementGridFilterFields(activeFields), [activeFields]);
  const { configs: filterConfigs, areAllConfigsInitialized } = useRequirementGridFiltersConfig({
    workspaceSlug,
    entityKind,
    customFields: customFilterFields,
  });
  const filter = useRequirementGridFilter({
    areAllConfigsInitialized,
    configs: filterConfigs,
    initialFilters: filters,
    instanceKey: `${workspaceSlug}:${entityId}:${columnStorageId ?? entityKind}`,
    onFiltersChange,
  });
  const displayColumns = useMemo(
    () =>
      activeFields.flatMap((field) =>
        field.field_type === "form"
          ? [
              { id: field.id, name: field.name },
              ...field.children
                .filter((child) => child.is_active)
                .map((child) => ({ id: child.id, name: `${field.name} / ${child.name}` })),
            ]
          : [{ id: field.id, name: field.name }]
      ),
    [activeFields]
  );
  const toggleDisplayColumn = (id: string) =>
    setHiddenFieldIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const formFields = visibleRootFields.filter((field) => field.field_type === "form");
  // 子表单每组末尾的操作沟槽：只读视图里没有可点的东西，收起来
  const showActionGutter = !readOnly;

  /**
   * 列宽与列序：编号在最左并左固定，勾选框折进它；标题紧随其后、同样左固定
   * （left 等于编号列宽），吃掉容器剩余宽度，行操作折进标题列。其余列一律定宽。
   * 与项目需求网格一致。
   */
  const titleColumn = builtinColumns.find((column) => column.key === "title");
  const propertyBuiltinColumns = useMemo(
    () => builtinColumns.filter((column) => column.key !== "title"),
    [builtinColumns]
  );
  /** 描述紧跟标题；审批插在描述之后，其余内置列跟在审批后面 */
  const descriptionColumn = propertyBuiltinColumns.find((column) => column.key === "description_html");
  const remainingBuiltinColumns = useMemo(
    () => propertyBuiltinColumns.filter((column) => column.key !== "description_html"),
    [propertyBuiltinColumns]
  );
  const { setScrollContainer, containerWidth } = useRequirementGridScrollContainer();
  const { getWidth, startResize } = useRequirementGridColumnResize();

  /** 产品需求才有来源标准库编号；标准库条目本身只有自己的编号 */
  const showSourceColumn = entityKind === "product";

  const showSelectColumn = !readOnly;
  const selectColumnWidth = showSelectColumn ? REQUIREMENT_GRID_SELECT_COLUMN_WIDTH : 0;
  const defaultNonTitleColumnsWidth = useMemo(
    () =>
      selectColumnWidth +
      REQUIREMENT_GRID_COLUMN_WIDTH + // 编号
      (showSourceColumn ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
      (showApprovalColumn ? REQUIREMENT_GRID_COLUMN_WIDTH : 0) +
      propertyBuiltinColumns.reduce((sum, column) => sum + getRequirementColumnWidth(column.key), 0) +
      visibleRootFields.reduce((sum, field) => {
        if (field.field_type !== "form" || !field.children.length) return sum + REQUIREMENT_GRID_COLUMN_WIDTH;
        return (
          sum +
          field.children.length * REQUIREMENT_GRID_COLUMN_WIDTH +
          (showActionGutter ? FORM_GUTTER_COLUMN_WIDTH : 0)
        );
      }, 0),
    [propertyBuiltinColumns, selectColumnWidth, showActionGutter, showApprovalColumn, showSourceColumn, visibleRootFields]
  );
  const defaultTitleColumnWidth = resolveRequirementTitleColumnWidth(containerWidth, defaultNonTitleColumnsWidth);
  const columnSnapshot = useMemo(() => {
    const snapshot: Record<string, number> = {
      title: defaultTitleColumnWidth,
      display_id: REQUIREMENT_GRID_COLUMN_WIDTH,
    };
    if (showSourceColumn) snapshot.source_display_id = REQUIREMENT_GRID_COLUMN_WIDTH;
    if (showApprovalColumn) snapshot.approval = REQUIREMENT_GRID_COLUMN_WIDTH;
    propertyBuiltinColumns.forEach((column) => {
      snapshot[column.key] = getRequirementColumnWidth(column.key);
    });
    visibleRootFields.forEach((field) => {
      if (field.field_type !== "form" || !field.children.length) {
        snapshot[field.id] = REQUIREMENT_GRID_COLUMN_WIDTH;
        return;
      }
      field.children.forEach((child) => {
        snapshot[child.id] = REQUIREMENT_GRID_COLUMN_WIDTH;
      });
    });
    return snapshot;
  }, [
    defaultTitleColumnWidth,
    propertyBuiltinColumns,
    showApprovalColumn,
    showSourceColumn,
    visibleRootFields,
  ]);
  const titleColumnWidth = getWidth("title", defaultTitleColumnWidth);
  const displayIdWidth = getWidth("display_id", REQUIREMENT_GRID_COLUMN_WIDTH);
  const displayIdStickyLeft = selectColumnWidth;
  const titleStickyLeft = selectColumnWidth + displayIdWidth;
  const gutterWidth = visibleRootFields.reduce((sum, field) => {
    if (field.field_type === "form" && field.children.length && showActionGutter) {
      return sum + FORM_GUTTER_COLUMN_WIDTH;
    }
    return sum;
  }, 0);
  const nonTitleColumnsWidth =
    Object.entries(columnSnapshot)
      .filter(([key]) => key !== "title")
      .reduce((sum, [key, defaultWidth]) => sum + getWidth(key, defaultWidth), 0) + gutterWidth;
  const tableWidth = selectColumnWidth + titleColumnWidth + nonTitleColumnsWidth;

  // Column count for the trailing "add record" affordance row; mirrors the header's column math.
  const totalColumnCount = useMemo(
    () =>
      (showSelectColumn ? 1 : 0) + // 勾选列
      1 + // 编号列
      1 + // 标题列（左固定，行操作折在里面）
      (showSourceColumn ? 1 : 0) + // 标准库编号
      (showApprovalColumn ? 1 : 0) + // 审批态
      propertyBuiltinColumns.length +
      visibleRootFields.reduce(
        (sum, field) =>
          sum + (field.field_type === "form" ? getFormColumnCount(field, showActionGutter) : 1),
        0
      ),
    [propertyBuiltinColumns.length, showActionGutter, showApprovalColumn, showSelectColumn, showSourceColumn, visibleRootFields]
  );

  /*
   * 不登记「待提交资源」：单元格改动即时落库，传完就已经有归属了，没有「取消编辑
   * 要把孤儿删掉」这一步。弹窗建行仍要清理，那套逻辑在弹窗自己里。
   */
  const uploadAsset = useRequirementAssetUpload({ workspaceSlug, entityId });

  const setRootValue = (requirementId: string, fieldId: string, value: TRequirementValue) => {
    autosave.updateData(requirementId, (data) => ({ ...data, [fieldId]: value }));
  };

  const setChildValue = (
    requirementId: string,
    formId: string,
    rowId: string,
    childId: string,
    value: TRequirementValue
  ) => {
    autosave.updateData(requirementId, (data) => {
      const rows = getFormRows(data, formId).map((row) =>
        row.id === rowId ? Object.assign({}, row, { values: { ...row.values, [childId]: value } }) : row
      );
      return { ...data, [formId]: rows };
    });
  };

  const insertFormRow = (requirementId: string, form: TRequirementField, index?: number) => {
    autosave.updateData(requirementId, (data) => {
      const rows = [...getFormRows(data, form.id)];
      const row: TRequirementFormRow = {
        id: uuidv4(),
        values: createEmptyRequirementData(form.children),
      };
      rows.splice(index ?? rows.length, 0, row);
      return { ...data, [form.id]: rows };
    });
  };

  const deleteFormRow = (requirementId: string, formId: string, rowId: string) => {
    autosave.updateData(requirementId, (data) => {
      return {
        ...data,
        [formId]: getFormRows(data, formId).filter((row) => row.id !== rowId),
      };
    });
  };

  /**
   * 删除是即时的、没有撤销（原先是暂存 + 保存更改，有反悔余地），所以一律二次确认。
   * 走的仍是 bulk_save 的 deletes —— 它带 version，能挡住「别人刚改过这一行」。
   */
  const confirmDelete = async () => {
    const targets = idsToDelete
      .map((id) => ({ id, version: autosave.getRow(id)?.version }))
      .filter((item): item is { id: string; version: number } => typeof item.version === "number");
    if (!targets.length) return;
    try {
      // onBulkSave 内部对 deletes 已经重拉过一次，这里不用再来一遍
      await onBulkSave({ creates: [], updates: [], deletes: targets });
      setSelectedIds((current) => current.filter((id) => !idsToDelete.includes(id)));
      setIdsToDelete([]);
    } catch (requestError) {
      const payload = requestError as { code?: string; error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          payload?.code === "REQUIREMENT_BATCH_CONFLICT"
            ? t("requirement_grid.data.conflict")
            : (payload?.error ?? t("workspace_products.requirements.toast.failed")),
      });
      setIdsToDelete([]);
    }
  };

  /**
   * 行操作菜单。「插入 / 复制」不再往表格里插一行草稿，而是带着锚点打开建行弹窗
   * —— 后端建行强制校验必填字段，空草稿行在服务端落不了地（见 RequirementCreateModal）。
   *
   * portal 出滚动容器：标题列 sticky 会自建层叠上下文，菜单留在格内会被下面几行盖住。
   */
  const renderRowActionMenu = (requirement: TRequirement) => (
    <div className="flex justify-center">
      <CustomMenu
        ellipsis
        placement="bottom-end"
        buttonClassName="text-tertiary hover:text-primary"
        portalElement={menuPortalEl}
      >
        <CustomMenu.MenuItem onClick={() => void addRow({ beforeId: requirement.id })}>
          <MenuRowLabel icon={ArrowUpToLine} label={t("requirement_grid.data.insert_above")} />
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem onClick={() => void addRow({ afterId: requirement.id })}>
          <MenuRowLabel icon={ArrowDownToLine} label={t("requirement_grid.data.insert_below")} />
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() =>
            void addRow({
              // copyRequirementData 会给子表单每行重新分配 UUID，否则新旧两行的表单行 ID 会撞
              data: copyRequirementData(autosave.getRow(requirement.id)?.data ?? requirement.data, activeFields),
              builtin: autosave.getRow(requirement.id)?.builtin,
              afterId: requirement.id,
            })
          }
        >
          <MenuRowLabel icon={Copy} label={t("requirement_grid.data.copy")} />
        </CustomMenu.MenuItem>
        {onOpenDetail && (
          <CustomMenu.MenuItem onClick={() => onOpenDetail(requirement.id)}>
            <MenuRowLabel icon={Maximize2} label={t("requirement_detail.open")} />
          </CustomMenu.MenuItem>
        )}
        {requirement.can_submit_review && onSubmitReview && (
          <CustomMenu.MenuItem onClick={() => onSubmitReview([requirement.id])}>
            <MenuRowLabel icon={Send} label={t("requirement_approval.submit_review")} />
          </CustomMenu.MenuItem>
        )}
        {requirement.can_withdraw && requirement.pending_change_request_id && onWithdrawReview && (
          <CustomMenu.MenuItem
            onClick={() => onWithdrawReview(requirement.pending_change_request_id as string)}
          >
            <MenuRowLabel icon={Undo2} label={t("requirement_approval.withdraw_review")} />
          </CustomMenu.MenuItem>
        )}
        {requirement.pending_change_request_id && onOpenChangeRequest && (
          <CustomMenu.MenuItem
            onClick={() => onOpenChangeRequest(requirement.pending_change_request_id as string)}
          >
            <MenuRowLabel icon={History} label={t("requirement_approval.view_change_request")} />
          </CustomMenu.MenuItem>
        )}
        {/* 评审中的行不能删；已通过审批的删除要走评审，所以文案变成「申请删除」 */}
        {!requirement.is_locked && (
          <CustomMenu.MenuItem
            onClick={() => {
              if (requirement.approved_version !== null && onSubmitReview) {
                onSubmitReview([requirement.id]);
                return;
              }
              setIdsToDelete([requirement.id]);
            }}
          >
            <MenuRowLabel
              icon={Trash2}
              label={
                requirement.approved_version !== null
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

  const renderRequirementRows = (requirement: TRequirement) => {
    const key = requirement.id;
    const localRow = autosave.getRow(key);
    const saveState = autosave.getSaveState(key);
    // 本地值优先：正在保存中的改动还没回到 requirements 里
    const data = localRow?.data ?? requirement.data ?? {};
    const builtin = localRow?.builtin ?? pickBuiltinValues(requirement);
    const isConflicted = Boolean(saveState.error);
    /**
     * 评审中 / 已关闭的行落回只读渲染器，零新增渲染路径。is_locked 以服务端为准 —— 从
     * pending_change_request_id 反推会漏掉权限这一维；closed 由 canEditRequirementContent 合流。
     */
    const isRowEditable = canEditRequirementContent(requirement, !readOnly);
    const rawRowCount = getMaxFormRows(data, formFields);
    /*
     * 一条需求占多少行，只由子表单的数据行数决定。
     *
     * 「新增子行」原先独占一整行，于是每条有子表单的需求恒定多出 44px —— 一条需求
     * 3 行子数据就是 4×44=176px，前面所有列被 rowSpan 一起拉高，三条需求三种高度，
     * 表格失去等距。按钮已经挪进末行的操作沟槽（见下方 gutterCell）。
     */
    const totalRows = Math.max(1, rawRowCount);
    /*
     * 行底色：评审中（锁定）、已关闭（灰化）、保存失败、正常。锁色优先于关闭灰化 ——
     * 评审中是更强的「不可动」信号。原先还有「已改动 / 已删除」两种暂存态的着色 ——
     * 改动现在即时落库，删除即时执行，都不再有「停在表格里等保存」的中间状态。
     */
    const rowStateClass = requirement.is_locked
      ? // 评审中的行：删除待审用危险色，其余用警示色，都压低透明度表示「不可动」
        requirement.pending_change_type === "delete"
        ? "bg-danger-subtle/25 opacity-70"
        : "bg-warning-subtle/20 opacity-80"
      : isRequirementClosed(requirement)
        ? // 已关闭：内容只读、退场；状态格仍可点（重开），所以只压透明度不改底色
          "bg-surface-1 opacity-60 group-hover/requirement:bg-layer-transparent-hover"
        : isConflicted
          ? "bg-danger-subtle/25"
          : "bg-surface-1 group-hover/requirement:bg-layer-transparent-hover";
    const groupCellClass = "transition-colors duration-150 motion-reduce:transition-none";

    return (
      <tbody key={key} className="group/requirement">
        {Array.from({ length: totalRows }, (_, rowIndex) => {
          const isFirstRow = rowIndex === 0;
          const renderKey = getRequirementRowKey(key, data, formFields, rowIndex);
          return (
            <tr
              key={renderKey}
              className={cn("group transition-colors duration-150 motion-reduce:transition-none", rowStateClass)}
            >
              {/*
                勾选列最左固定。编号格跟在后面，标题格 left 等于勾选 + 编号列宽，
                横滚时三列一起钉住。左固定列底色必须不透明，行态着色铺在内层 div。
              */}
              {isFirstRow && showSelectColumn && (
                <td
                  rowSpan={totalRows}
                  className={cn(
                    REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_SELECT_BODY_CLASS,
                    groupCellClass
                  )}
                  style={REQUIREMENT_GRID_SELECT_COLUMN_STYLE}
                >
                  <div className={cn("flex h-full w-full items-center justify-center", rowStateClass)}>
                    <Checkbox
                      checked={selectedIds.includes(requirement.id)}
                      onChange={(event) =>
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...current, requirement.id]
                            : current.filter((id) => id !== requirement.id)
                        )
                      }
                      aria-label={t("requirement_grid.data.select_row")}
                      containerClassName={cn(
                        "pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100",
                        selectedIds.includes(requirement.id) && "pointer-events-auto opacity-100"
                      )}
                    />
                  </div>
                </td>
              )}
              {isFirstRow && (
                <td
                  rowSpan={totalRows}
                  className={cn(
                    REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_BODY_CLASS,
                    groupCellClass
                  )}
                  style={{
                    width: displayIdWidth,
                    minWidth: displayIdWidth,
                    maxWidth: displayIdWidth,
                    left: displayIdStickyLeft,
                  }}
                >
                  <div className={cn("flex h-full w-full min-w-0 items-center gap-1.5 px-page-x", rowStateClass)}>
                    {requirement.display_id ? (
                      onOpenDetail ? (
                        <button
                          type="button"
                          onClick={() => onOpenDetail(requirement.id)}
                          className="min-w-0 truncate text-left hover:text-accent-primary"
                        >
                          <RequirementIdentifier displayId={requirement.display_id} />
                        </button>
                      ) : (
                        <RequirementIdentifier displayId={requirement.display_id} />
                      )
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
                  className={cn(
                    "relative",
                    REQUIREMENT_GRID_BODY_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_BODY_CLASS,
                    groupCellClass
                  )}
                  style={{
                    width: titleColumnWidth,
                    minWidth: titleColumnWidth,
                    maxWidth: titleColumnWidth,
                    left: titleStickyLeft,
                  }}
                >
                  <div className={cn("flex h-full w-full min-w-0 items-center gap-1.5 px-page-x", rowStateClass)}>
                    <span className="min-w-0 flex-1">
                      {isRowEditable ? (
                        <BuiltinCellEditor
                          columnKey="title"
                          values={builtin}
                          onChange={(patch) => autosave.updateBuiltin(key, patch)}
                          parentScope={parentScope}
                          rowId={key}
                          deferTextCommit
                          // 刚内联建出来的行：光标直接落在标题上，接着就能敲
                          autoFocus={key === focusRowId}
                        />
                      ) : onOpenDetail ? (
                        // 只读行点标题开详情；可编辑行标题留给内联改字，详情走右侧小图标
                        <button
                          type="button"
                          onClick={() => onOpenDetail(requirement.id)}
                          className="block w-full truncate text-left hover:text-accent-primary"
                        >
                          <BuiltinCellValue columnKey="title" values={builtin} />
                        </button>
                      ) : (
                        <span className="block truncate">
                          <BuiltinCellValue columnKey="title" values={builtin} />
                        </span>
                      )}
                    </span>

                    {/* 可编辑时详情入口不劫持标题点击 —— 标题归内联编辑 */}
                    {onOpenDetail && (
                      <button
                        type="button"
                        onClick={() => onOpenDetail(requirement.id)}
                        title={t("requirement_detail.open")}
                        className="grid size-6 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-layer-transparent-hover hover:text-primary"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    )}
                    {!readOnly && (
                      <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {renderRowActionMenu(requirement)}
                      </span>
                    )}
                    {/* 这一行存失败了就把原因挂在标题格上，别让人以为已经存下去了 */}
                    {saveState.error && (
                      <span
                        className="shrink-0 text-11 text-danger-primary"
                        title={saveState.error}
                      >
                        {t("requirement_grid.data.conflict")}
                      </span>
                    )}
                  </div>
                </td>
              )}
              {/* 标准库编号：产品需求才有，紧跟标题，跟着整组行 rowSpan */}
              {isFirstRow && showSourceColumn && (
                <td
                  rowSpan={totalRows}
                  className={cn("truncate", REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}
                >
                  {requirement.source_display_id ? (
                    <RequirementIdentifier displayId={requirement.source_display_id} />
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                </td>
              )}
              {/* 内置列恒排在自定义字段之前，且永远是单列，跟着整组行 rowSpan */}
              {isFirstRow && descriptionColumn && (
                <td
                  key={descriptionColumn.key}
                  rowSpan={totalRows}
                  className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}
                >
                  {isRowEditable ? (
                    <BuiltinCellEditor
                      columnKey={descriptionColumn.key}
                      values={builtin}
                      onChange={(patch) => autosave.updateBuiltin(key, patch)}
                      parentScope={parentScope}
                      rowId={key}
                      deferTextCommit
                    />
                  ) : (
                    <BuiltinCellValue
                      columnKey={descriptionColumn.key}
                      values={builtin}
                      resolveParentTitle={resolveParentTitle}
                    />
                  )}
                </td>
              )}
              {isFirstRow && showApprovalColumn && (
                <td
                  rowSpan={totalRows}
                  className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}
                >
                  <RequirementApprovalCell requirement={requirement} onOpenChangeRequest={onOpenChangeRequest} />
                </td>
              )}
              {isFirstRow &&
                remainingBuiltinColumns.map((column) => (
                  <td
                    key={column.key}
                    rowSpan={totalRows}
                    className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}
                  >
                    {column.key === "status" ? (
                      /*
                       * 状态格绕开 readOnly/is_locked/closed 的行级只读判定：closed 行要能
                       * 重开、评审中也能改状态，只看页面级写权限（onStatusChange 有没有传）。
                       * 读 requirement.status 而不是 autosave 的 builtin.status —— dirty 行的
                       * 本地副本会停在旧值上，状态端点的结果只回灌到 requirements。
                       */
                      <RequirementStatusCell
                        status={requirement.status}
                        onChange={
                          !readOnly && onStatusChange ? (status) => onStatusChange(requirement.id, status) : undefined
                        }
                      />
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
                      <BuiltinCellValue
                        columnKey={column.key}
                        values={builtin}
                        resolveParentTitle={resolveParentTitle}
                      />
                    )}
                  </td>
                ))}
              {visibleRootFields.flatMap((field) => {
                if (field.field_type !== "form") {
                  if (!isFirstRow) return [];
                  return [
                    <td
                      key={field.id}
                      rowSpan={totalRows}
                      className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}
                    >
                      {isRowEditable ? (
                        <LeafEditor
                          field={field}
                          value={data[field.id]}
                          workspaceSlug={workspaceSlug}
                          entityId={entityId}
                          onChange={(value) => setRootValue(key, field.id, value)}
                          onUpload={uploadAsset}
                          deferTextCommit
                        />
                      ) : (
                        <LeafValue field={field} value={data[field.id]} workspaceSlug={workspaceSlug} />
                      )}
                    </td>,
                  ];
                }

                const form = field;
                if (form.children.length === 0) {
                  return [
                    <td
                      key={`${form.id}-empty`}
                      className={cn(
                        REQUIREMENT_GRID_BODY_CELL_CLASS,
                        "text-placeholder",
                        groupCellClass
                      )}
                    >
                      {isFirstRow ? t("requirement_fields.fields.no_children") : null}
                    </td>,
                  ];
                }
                const formRows = getFormRows(data, form.id);
                const row = formRows[rowIndex];
                // 「新增子行」挂在本组末行的沟槽上。组是空的时候末行就是第 0 行
                const isLastFormRow = rowIndex === Math.max(0, formRows.length - 1);
                const childCells = form.children.map((child) => {
                  const currentValue = row?.values[child.id];
                  return (
                    <td
                      key={`${form.id}-${child.id}`}
                      className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, groupCellClass)}
                    >
                      {row ? (
                        isRowEditable ? (
                          <LeafEditor
                            field={child}
                            value={currentValue}
                            workspaceSlug={workspaceSlug}
                            entityId={entityId}
                            onChange={(value) => setChildValue(key, form.id, row.id, child.id, value)}
                            onUpload={uploadAsset}
                            deferTextCommit
                          />
                        ) : (
                          <LeafValue field={child} value={currentValue} workspaceSlug={workspaceSlug} />
                        )
                      ) : null}
                    </td>
                  );
                });
                if (!showActionGutter) return childCells;
                const gutterCell = (
                  <td
                    key={`${form.id}-gutter`}
                    className={cn(REQUIREMENT_GRID_BODY_CELL_CLASS, "px-0.5 text-center", groupCellClass)}
                  >
                    {isRowEditable ? (
                      <div className="flex items-center justify-center gap-0.5">
                        {/* 「新增子行」挂末行。空组时常显 —— 那一排格子什么都没有，再藏进 hover 就没人找得到第一行怎么加 */}
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
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                );
                return [...childCells, gutterCell];
              })}
              {/* 行操作与撤销删除都折进了标题格，不再单独占一列 */}
            </tr>
          );
        })}
      </tbody>
    );
  };

  // 行永远来自服务端列表 —— 表格里不再有只存在于前端的草稿行
  const rowGroups = requirements.map((requirement) => renderRequirementRows(requirement));
  const selectableRequirementIds = requirements.map((requirement) => requirement.id);
  const displayedTotalCount = totalCount;
  const currentPageOffset = getCurrentPageOffset(prevCursor, nextCursor, prevPageResults, nextPageResults);
  const pageItemCount = requirements.length;
  const showSelectionActions = !readOnly && selectedIds.length > 0;
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

  const toolbarActions: ReactNode = showSelectionActions ? (
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
        onClick={() => setIdsToDelete(deletableSelectedIds)}
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
      <FiltersToggle filter={filter} />
      <FiltersDropdown title={t("common.display")} placement="bottom-end">
        <RequirementDisplayProperties
          columns={displayColumns}
          hiddenIds={hiddenFieldIds}
          onToggle={toggleDisplayColumn}
        />
      </FiltersDropdown>
      {/* 单元格已经常驻可编辑，不再有「进入编辑态」这一步；这里改成新增入口 */}
      {!readOnly && !hideToolbarAdd && (
        <Button variant="primary" size="lg" onClick={() => void addRow()} disabled={isLoading || isCreatingRow}>
          {t("requirement_grid.data.add")}
        </Button>
      )}
    </>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface-1">
      <div ref={setMenuPortalEl} className="requirement-grid-menu-portal" />
      {useExternalToolbar &&
        toolbarPortalEl &&
        createPortal(<div className="flex min-w-0 items-center gap-2">{toolbarActions}</div>, toolbarPortalEl)}
      {!useExternalToolbar && (
        <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-subtle bg-surface-1 px-4 py-2.5">
          <div
            className="ml-auto flex flex-wrap items-center gap-2"
          >
            {toolbarActions}
          </div>
        </div>
      )}

      <FiltersRow filter={filter} />

      <div
        ref={setScrollContainer}
        className="horizontal-scrollbar vertical-scrollbar scrollbar-lg min-h-0 min-w-0 flex-1 overflow-auto bg-surface-1"
      >
        {/*
          只有手上一行都没有时才让骨架屏顶掉表格。后台重拉（删除、新增、搜索、翻页、
          审批）时留着旧行：骨架只有 min-w-[960px]，比表格窄得多，一旦换上去浏览器就会
          把滚动容器的 scrollLeft 夹到 0，且表格回来后不会还原 —— 表现就是「一操作就闪
          一下并跳回最左」。切类型视图时 store 会先清空行，所以那里仍然走骨架屏。
        */}
        {isLoading && !requirements.length ? (
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
        ) : requirements.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center">
            <div>
              <Plus className="mx-auto size-8 text-placeholder" />
              <p className="mt-2 text-13 font-medium text-primary">
                {t("requirement_grid.data.empty")}
              </p>
              {!readOnly && (
                <Button className="mt-3" variant="primary" onClick={() => void addRow()} disabled={isCreatingRow}>
                  {t("requirement_grid.data.add")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <table
            className="table-fixed border-collapse bg-surface-1 text-left text-13"
            style={{ width: tableWidth }}
          >
            <colgroup>
              {showSelectColumn && <col style={{ width: selectColumnWidth }} />}
              <col style={{ width: displayIdWidth }} />
              <col style={{ width: titleColumnWidth }} />
              {showSourceColumn && (
                <col style={{ width: getWidth("source_display_id", REQUIREMENT_GRID_COLUMN_WIDTH) }} />
              )}
              {descriptionColumn && (
                <col
                  style={{
                    width: getWidth(descriptionColumn.key, getRequirementColumnWidth(descriptionColumn.key)),
                  }}
                />
              )}
              {showApprovalColumn && <col style={{ width: getWidth("approval", REQUIREMENT_GRID_COLUMN_WIDTH) }} />}
              {remainingBuiltinColumns.map((column) => (
                <col
                  key={column.key}
                  style={{ width: getWidth(column.key, getRequirementColumnWidth(column.key)) }}
                />
              ))}
              {visibleRootFields.flatMap((field) =>
                field.field_type !== "form" || !field.children.length
                  ? [<col key={field.id} style={{ width: getWidth(field.id, REQUIREMENT_GRID_COLUMN_WIDTH) }} />]
                  : [
                      ...field.children.map((child) => (
                        <col
                          key={child.id}
                          style={{ width: getWidth(child.id, REQUIREMENT_GRID_COLUMN_WIDTH) }}
                        />
                      )),
                      ...(showActionGutter
                        ? [<col key={`${field.id}-gutter`} style={{ width: FORM_GUTTER_COLUMN_WIDTH }} />]
                        : []),
                    ]
              )}
            </colgroup>
            <RequirementGridHeader
              rootFields={visibleRootFields}
              showActionGutter={showActionGutter}
              /*
               * 勾选列最左固定；编号 / 标题依次钉在后面。
               * 与项目需求网格、与「编号在标题前面」的阅读顺序一致。
               */
              leadingHeaders={[
                ...(showSelectColumn
                  ? [
                      {
                        key: "select",
                        className: cn(
                          "group/header relative",
                          REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                          REQUIREMENT_GRID_STICKY_SELECT_HEADER_CLASS
                        ),
                        style: REQUIREMENT_GRID_SELECT_COLUMN_STYLE,
                        content: (
                          <div className="flex h-full w-full items-center justify-center">
                            <Checkbox
                              checked={
                                selectableRequirementIds.length > 0 &&
                                selectableRequirementIds.every((requirementId) => selectedIds.includes(requirementId))
                              }
                              indeterminate={
                                selectedIds.length > 0 &&
                                !selectableRequirementIds.every((id) => selectedIds.includes(id))
                              }
                              disabled={!selectableRequirementIds.length}
                              onChange={(event) =>
                                setSelectedIds(event.target.checked ? selectableRequirementIds : [])
                              }
                              aria-label={t("requirement_grid.data.select_all")}
                              containerClassName={cn(
                                "pointer-events-none opacity-0 transition-opacity group-hover/header:pointer-events-auto group-hover/header:opacity-100",
                                selectedIds.length > 0 && "pointer-events-auto opacity-100"
                              )}
                            />
                          </div>
                        ),
                      },
                    ]
                  : []),
                {
                  key: "display-id",
                  className: cn(
                    "group/header relative",
                    REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_HEADER_CLASS
                  ),
                  style: {
                    width: displayIdWidth,
                    minWidth: displayIdWidth,
                    maxWidth: displayIdWidth,
                    left: displayIdStickyLeft,
                  },
                  onResize: (event) => startResize("display_id", columnSnapshot, event),
                  content: (
                    <div className="flex h-full w-full min-w-0 items-center gap-1.5 px-page-x">
                      <RequirementGridHeaderLabel
                        icon={Hash}
                        label={t("requirements.identifier.column")}
                      />
                    </div>
                  ),
                },
                {
                  key: "title",
                  className: cn(
                    "group/header relative",
                    REQUIREMENT_GRID_HEADER_CELL_FLUSH_CLASS,
                    REQUIREMENT_GRID_STICKY_HEADER_CLASS
                  ),
                  style: {
                    width: titleColumnWidth,
                    minWidth: titleColumnWidth,
                    maxWidth: titleColumnWidth,
                    left: titleStickyLeft,
                  },
                  stickyCell: true,
                  onResize: (event) => startResize("title", columnSnapshot, event),
                  content: (
                    <div className="flex h-full w-full min-w-0 items-center gap-1.5 px-page-x">
                      <RequirementGridHeaderLabel
                        icon={titleColumn?.icon}
                        label={t(titleColumn?.labelKey ?? "requirement_fields.builtin.title")}
                      />
                    </div>
                  ),
                },
              ]}
              builtinHeaders={[
                ...(showSourceColumn
                  ? [
                      {
                        key: "source-display-id",
                        content: (
                          <RequirementGridHeaderLabel
                            icon={BookMarked}
                            label={t("requirements.identifier.source_column")}
                          />
                        ),
                        onResize: (event) => startResize("source_display_id", columnSnapshot, event),
                      },
                    ]
                  : []),
                ...(descriptionColumn
                  ? [
                      {
                        key: descriptionColumn.key,
                        content: (
                          <RequirementGridHeaderLabel
                            icon={descriptionColumn.icon}
                            label={t(descriptionColumn.labelKey)}
                          />
                        ),
                        onResize: (event) => startResize(descriptionColumn.key, columnSnapshot, event),
                      },
                    ]
                  : []),
                // 审批紧跟描述 —— 每行都要扫一眼，不能放到要横滚才看得见的地方
                ...(showApprovalColumn
                  ? [
                      {
                        key: "approval-state",
                        className: "text-center",
                        content: (
                          <RequirementGridHeaderLabel
                            icon={ShieldCheck}
                            label={t("requirement_approval.column")}
                          />
                        ),
                        onResize: (event) => startResize("approval", columnSnapshot, event),
                      },
                    ]
                  : []),
                ...remainingBuiltinColumns.map((column) => ({
                  key: column.key,
                  content: <RequirementGridHeaderLabel icon={column.icon} label={t(column.labelKey)} />,
                  onResize: (event) => startResize(column.key, columnSnapshot, event),
                })),
              ]}
              onFieldResize={(fieldId, event) => startResize(fieldId, columnSnapshot, event)}
            />
            {rowGroups}
            {!readOnly &&
              requirements.length > 0 && (
                <tbody>
                  <tr>
                    {/*
                      整行横跨所有列，但按钮内容靠左 —— 表格宽于视口时居中的文案会
                      飘到屏幕外，只有横滚才看得见「新增记录」在哪。
                    */}
                    <td colSpan={totalColumnCount} className="border-b border-subtle px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void addRow()}
                        disabled={isCreatingRow}
                        className="inline-flex h-8 w-full items-center justify-start gap-1.5 rounded-md border border-dashed border-subtle px-page-x text-13 font-medium text-accent-primary transition-colors duration-150 hover:border-accent-subtle hover:bg-accent-subtle motion-reduce:transition-none"
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

      <RequirementCreateModal
        isOpen={createSeed !== null}
        workspaceSlug={workspaceSlug}
        entityId={entityId}
        entityKind={entityKind}
        requirementTypeId={createRequirementTypeId}
        fields={activeFields}
        seed={createSeed ?? undefined}
        onClose={() => setCreateSeed(null)}
        // onBulkSave 内部对 creates 已经重拉过一次，这里不用再来一遍
        onSave={onBulkSave}
        onUpload={uploadAsset}
      />

      <AlertModalCore
        isOpen={idsToDelete.length > 0}
        isSubmitting={isMutating}
        handleClose={() => setIdsToDelete([])}
        handleSubmit={() => void confirmDelete()}
        title={t(
          idsToDelete.length > 1
            ? "workspace_products.requirements.data.views.delete_many_title"
            : "workspace_products.requirements.data.views.delete_one_title"
        )}
        content={t(
          idsToDelete.length > 1
            ? "workspace_products.requirements.data.views.delete_many_description"
            : "workspace_products.requirements.data.views.delete_one_description",
          { count: idsToDelete.length }
        )}
        // AlertModalCore 的按钮默认是英文硬编码
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
  })
);

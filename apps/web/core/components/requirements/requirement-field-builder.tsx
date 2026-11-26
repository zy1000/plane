import { useEffect, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Copy,
  ExternalLink,
  GripVertical,
  Library,
  ListPlus,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirementFieldDraft,
  TRequirementFieldType,
  TRequirementSelectOption,
} from "@plane/types";
import { CustomMenu, Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  FIELD_ICONS,
  binEntryTarget,
  collectRecycleBinEntries,
  isRuleFieldType,
  moveFieldToBin,
  requirementFieldKey,
  restoreFieldFromBin,
  ruleSourceOptions,
  splitBuilderItems,
  splitFieldsByActive,
  type TRequirementBinEntry,
  type TRuleSourceOption,
} from "@/components/requirements/requirement-builder-items";
import { RequirementBuiltinFieldRow } from "@/components/requirements/requirement-builtin-field-row";
import {
  COMMON_FIELD_BADGE,
  COMMON_FIELD_DRAG_TYPE,
  RequirementCommonChildRows,
  RequirementCommonFieldCard,
  RequirementCommonFieldList,
  RequirementFieldSourceTabs,
  toBoundFieldDraft,
  type TRequirementCommonFieldsBinding,
} from "@/components/requirements/requirement-common-fields";
import { RequirementFieldRecycleBin } from "@/components/requirements/requirement-field-recycle-bin";
import {
  getRequirementSelectMode,
  getRequirementSelectOptions,
  hasValidRequirementSelectOptions,
} from "@/components/requirements/requirement-select";
import { RequirementSelectOptionsBulkModal } from "@/components/requirements/requirement-select-options-bulk-modal";
import {
  builderItemKey,
  type TRequirementBuilderItem,
} from "@/components/requirements/use-requirement-type-editor-state";

const MenuRowLabel = ({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  tone?: "default" | "danger";
}) => (
  <span className={cn("flex items-center gap-2", tone === "danger" && "text-danger-primary")}>
    <Icon className="size-3.5 shrink-0" />
    <span className="truncate">{label}</span>
  </span>
);

type TFieldSelection = {
  rootKey: string;
  childKey?: string;
};

type TFieldDropTarget =
  | {
      kind: "root";
    }
  | {
      kind: "child" | "invalid-child";
      rootKey: string;
    };

type TRequirementFieldBuilderProps = {
  /** 统一混排列表：7 个可排序内置字段 + 自定义字段，顺序即列序。编号/标题不在其中（锁定最前） */
  items: TRequirementBuilderItem[];
  onChange: (items: TRequirementBuilderItem[]) => void;
  /** 字段 id -> 有非空值的需求条数，回收站行与永久删除弹窗用 */
  fieldValueCounts?: Record<string, number>;
  /** 通用字段库：传了才有左栏的「字段类型 / 通用字段」切换；绑定字段的只读展示不依赖它 */
  commonFields?: TRequirementCommonFieldsBinding;
  sidebarHeader?: React.ReactNode;
  compactLayout?: boolean;
  title?: string;
  description?: string;
};

type TFieldLibraryProps = {
  compact?: boolean;
  onDragStart: (type: TRequirementFieldType) => void;
  onDragEnd: () => void;
  /** 回收站里的字段数；为 0 时入口置灰 */
  binCount: number;
  onOpenBin: () => void;
  /** 通用字段库；传了才有「字段类型 / 通用字段」切换 */
  common?: {
    definitions: TRequirementCommonFieldsBinding["definitions"];
    isLoading: boolean;
    /** 本类型已添加过的库字段 id */
    boundIds: Set<string>;
    onDragStart: (definitionId: string) => void;
    onOpenLibrary: () => void;
  };
};

type TFieldRowProps = {
  field: TRequirementFieldDraft;
  /** 正在编辑：整行原地换成 editor 里的内联表单 */
  isEditing: boolean;
  editor?: React.ReactNode;
  isChild?: boolean;
  hasSelectedChild?: boolean;
  isDropTarget?: boolean;
  isInvalidDropTarget?: boolean;
  onSelect: () => void;
  onInsert: (position: "above" | "below") => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** 绑定了通用字段：行上带标记，定义只读，不能复制 */
  isCommon?: boolean;
  /** 私有字段「转为通用字段」；不传不出菜单项 */
  onPromote?: () => void;
  /** 绑定字段「编辑通用字段」（去字段库）；不传不出菜单项 */
  onOpenLibrary?: () => void;
  /** 动态取值字段所跟随的取值规则字段名，显示在行尾的类型摘要里 */
  ruleSourceName?: string;
  children?: React.ReactNode;
};

type TFieldInlineFormProps = {
  field: TRequirementFieldDraft;
  isChild: boolean;
  /** 同级可选的规则来源（启用中的「取值规则」字段），动态取值字段的配置区用 */
  ruleSources: TRuleSourceOption[];
  onChange: (field: TRequirementFieldDraft) => void;
  /** 还原成展开时的样子 */
  onCancel: () => void;
  /** 收起，改动已经在草稿里了 */
  onDone: () => void;
};

/** 根字段可选的类型；通用字段库的编辑弹窗也用这份，两边能建的类型才一致 */
export const ROOT_FIELD_TYPES: TRequirementFieldType[] = [
  "text",
  "rich_text",
  "member",
  "select",
  "boolean",
  "rule",
  "rule_value",
  "attachment",
  "image",
  "form",
];
export const CHILD_FIELD_TYPES = ROOT_FIELD_TYPES.filter((type) => type !== "form");
/** 通用字段库能建的类型：取值规则 / 动态取值不进字段库（见 isRuleFieldType） */
export const LIBRARY_ROOT_FIELD_TYPES = ROOT_FIELD_TYPES.filter((type) => !isRuleFieldType(type));
export const LIBRARY_CHILD_FIELD_TYPES = CHILD_FIELD_TYPES.filter((type) => !isRuleFieldType(type));
const isChildFieldType = (type: TRequirementFieldType) => type !== "form";
const FIELD_LIBRARY_GROUPS: Array<{
  labelKey: string;
  types: TRequirementFieldType[];
}> = [
  {
    labelKey: "requirement_fields.builder.basic_fields",
    types: ["text", "rich_text", "member", "select", "boolean"],
  },
  {
    labelKey: "requirement_fields.builder.rule_fields",
    types: ["rule", "rule_value"],
  },
  {
    labelKey: "requirement_fields.builder.media_fields",
    types: ["attachment", "image"],
  },
  {
    labelKey: "requirement_fields.builder.structure_fields",
    types: ["form"],
  },
];

const FIELD_LIBRARY_DRAG_TYPE = "application/x-requirement-field-type";

const fieldKey = requirementFieldKey;
const getMenuPortalElement = () => (typeof document === "undefined" ? null : document.body);

const createSelectOptions = (labels: string[]): TRequirementSelectOption[] =>
  labels.map((label) => ({ id: uuidv4(), label }));

const createField = (
  type: TRequirementFieldType,
  name: string,
  selectOptionLabels: string[],
  /** 新字段所在那一级可选的规则来源；只有一个时动态取值直接跟它，省一次选择 */
  ruleSources: TRuleSourceOption[] = []
): TRequirementFieldDraft => ({
  client_id: uuidv4(),
  name,
  field_type: type,
  is_required: false,
  is_active: true,
  show_in_library: true,
  config:
    type === "select"
      ? {
          selection_mode: "single",
          options: createSelectOptions(selectOptionLabels),
        }
      : type === "rule_value"
        ? { on_violation: "block", ...(ruleSources.length === 1 ? { rule_field_id: ruleSources[0].key } : {}) }
        : {},
  default_value: null,
  children: [],
});

const duplicateField = (field: TRequirementFieldDraft, suffix: string): TRequirementFieldDraft => {
  const config =
    field.field_type === "select"
      ? {
          ...field.config,
          options: getRequirementSelectOptions(field).map((option) => Object.assign({}, option, { id: uuidv4() })),
        }
      : { ...field.config };
  return {
    ...field,
    id: undefined,
    client_id: uuidv4(),
    // 副本是私有字段，不继承通用字段的绑定
    library_field_id: null,
    // 副本没有 id、进不了回收站：本体的停用状态与停用的子字段都不复制
    is_active: true,
    name: `${field.name}${suffix}`,
    config,
    default_value: field.field_type === "select" ? (getRequirementSelectMode(field) === "multiple" ? [] : null) : null,
    children: field.children.filter((child) => child.is_active).map((child) => duplicateField(child, suffix)),
  };
};

/** 字段库底部的回收站入口：从这里拖出新字段，也从这里找回旧字段 */
function FieldLibraryBinEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={count === 0}
      className="group flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-12 font-medium text-primary transition-colors hover:bg-layer-transparent-hover disabled:cursor-default disabled:text-tertiary disabled:hover:bg-transparent"
    >
      <Archive className="size-4 shrink-0 text-secondary group-disabled:text-placeholder" />
      <span className="flex-1 truncate">{t("requirement_fields.recycle_bin.title")}</span>
      {count > 0 && (
        <span className="rounded-full bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">{count}</span>
      )}
    </button>
  );
}

function FieldLibrary(props: TFieldLibraryProps) {
  const { compact = false, onDragStart, onDragEnd, binCount, onOpenBin, common } = props;
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [source, setSource] = useState<"types" | "common">("types");
  const showCommon = Boolean(common) && source === "common";
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col px-4 py-4">
        <h2 className="mb-3 text-12 font-semibold text-primary">{t("requirement_fields.fields.add")}</h2>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {ROOT_FIELD_TYPES.map((type) => {
            const Icon = FIELD_ICONS[type];
            return (
              <div
                key={type}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(event) => {
                  onDragStart(type);
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(FIELD_LIBRARY_DRAG_TYPE, type);
                }}
                onDragEnd={onDragEnd}
                className="group flex h-9 w-full cursor-grab items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 text-left transition-colors duration-150 hover:border-strong hover:bg-layer-transparent-hover active:cursor-grabbing"
              >
                <Icon className="size-4 shrink-0 text-secondary" />
                <span className="truncate text-12 text-primary">
                  {t(`requirement_fields.field_types.${type}`)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 shrink-0 border-t border-subtle pt-3">
          <FieldLibraryBinEntry count={binCount} onOpen={onOpenBin} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-subtle px-4 py-4">
        <h2 className="text-14 font-semibold text-primary">
          {t("requirement_fields.builder.field_library")}
        </h2>
        {common && <RequirementFieldSourceTabs value={source} onChange={setSource} />}
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={showCommon ? "搜索通用字段" : t("requirement_fields.builder.search_fields")}
            className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {showCommon && common && (
          <RequirementCommonFieldList
            definitions={common.definitions}
            isLoading={common.isLoading}
            search={searchQuery}
            boundIds={common.boundIds}
            onDragStart={common.onDragStart}
            onDragEnd={onDragEnd}
          />
        )}
        {!showCommon &&
          FIELD_LIBRARY_GROUPS.map((group) => {
            const types = group.types.filter((type) =>
              t(`requirement_fields.field_types.${type}`).toLocaleLowerCase().includes(normalizedSearch)
            );
            if (types.length === 0) return null;
            return (
              <section key={group.labelKey} className="mb-5 last:mb-0">
                <h3 className="mb-2 px-1 text-11 font-medium text-secondary">{t(group.labelKey)}</h3>
                <div className="space-y-1.5">
                  {types.map((type) => {
                    const Icon = FIELD_ICONS[type];
                    return (
                      <div
                        key={type}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(event) => {
                          onDragStart(type);
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData(FIELD_LIBRARY_DRAG_TYPE, type);
                        }}
                        onDragEnd={onDragEnd}
                        className="group flex h-10 w-full cursor-grab items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 text-left transition-colors duration-150 hover:border-strong hover:bg-layer-transparent-hover active:cursor-grabbing"
                      >
                        <GripVertical className="size-3.5 shrink-0 text-placeholder group-hover:text-tertiary" />
                        <span className="grid size-6 shrink-0 place-items-center rounded border border-subtle bg-layer-1 text-secondary">
                          <Icon className="size-3.5" />
                        </span>
                        <span className="truncate text-12 font-medium text-primary">
                          {t(`requirement_fields.field_types.${type}`)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-subtle px-3 py-3">
        <div className="min-w-0 flex-1">
          <FieldLibraryBinEntry count={binCount} onOpen={onOpenBin} />
        </div>
        {common && (
          <button
            type="button"
            onClick={common.onOpenLibrary}
            className="shrink-0 rounded px-2 py-1 text-12 font-medium text-accent-primary hover:underline"
          >
            前往字段库
          </button>
        )}
      </div>
    </div>
  );
}

function RequirementFieldRow(props: TFieldRowProps) {
  const {
    field,
    isEditing,
    editor,
    isChild = false,
    hasSelectedChild = false,
    isDropTarget = false,
    isInvalidDropTarget = false,
    onSelect,
    onInsert,
    onDuplicate,
    onRemove,
    isCommon = false,
    onPromote,
    onOpenLibrary,
    ruleSourceName,
    children,
  } = props;
  const { t } = useTranslation();
  const isForm = field.field_type === "form" && !isChild;
  const canBin = Boolean(field.id);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const fieldTypeDescription =
    field.field_type === "select"
      ? t("requirement_fields.builder.selector_summary", {
          mode: t(
            `requirement_fields.builder.${
              getRequirementSelectMode(field) === "multiple" ? "multiple_select" : "single_select"
            }`
          ),
          count: getRequirementSelectOptions(field).length,
        })
      : field.field_type === "rule_value" && ruleSourceName
        ? t("requirement_fields.builder.rule_value_summary", { source: ruleSourceName })
        : t(`requirement_fields.field_types.${field.field_type}`);

  useEffect(() => {
    if (hasSelectedChild || isDropTarget || isInvalidDropTarget) setIsCollapsed(false);
  }, [hasSelectedChild, isDropTarget, isInvalidDropTarget]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-surface-1 transition",
        isInvalidDropTarget
          ? "border-danger-strong bg-danger-subtle/20"
          : isDropTarget
            ? "border-accent-strong bg-accent-subtle/30"
            : isEditing
              ? "border-accent-strong"
              : hasSelectedChild
                ? "border-accent-subtle"
                : "border-strong hover:border-accent-primary/40"
      )}
    >
      {/* 编辑态：整行原地换成两栏表单，与工作项属性的内联表单同构 */}
      {isEditing ? (
        <>
          {/* Draggable 找不到拖拽把手时会把整个元素变成可拖拽的（sortable/draggable.tsx:44），
              编辑态里那会让在输入框里拖选文字变成拖动字段。留一个不可见的把手把它钉住。 */}
          <span data-sortable-drag-handle className="hidden" aria-hidden />
          {editor}
        </>
      ) : (
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-layer-1-hover",
            isChild && "py-2"
          )}
        >
          <span
            data-sortable-drag-handle
            className="grid size-5 shrink-0 cursor-grab place-items-center text-tertiary active:cursor-grabbing"
          >
            <GripVertical className="size-4 pointer-events-none" />
          </span>
          {isForm && (
            <button
              type="button"
              onClick={() => setIsCollapsed((value) => !value)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-2 hover:text-primary"
              aria-expanded={!isCollapsed}
              aria-label={t(
                isCollapsed
                  ? "requirement_fields.builder.expand_form"
                  : "requirement_fields.builder.collapse_form"
              )}
            >
              <ChevronDown
                className={cn("size-4 transition-transform duration-150", isCollapsed && "-rotate-90")}
              />
            </button>
          )}
          <button
            type="button"
            onClick={onSelect}
            className="min-w-0 flex-1 truncate text-left font-medium text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
          >
            {field.name || t("requirement_fields.fields.untitled")}
            {field.is_required && (
              <span className="ml-1 font-normal text-secondary">({t("requirement_fields.fields.required")})</span>
            )}
            {isCommon && <span className={cn(COMMON_FIELD_BADGE, "ml-2 align-middle")}>通用字段</span>}
          </button>
          <span className="shrink-0 text-xs text-secondary">{fieldTypeDescription}</span>
          <CustomMenu
            customButton={
              <span
                className="grid size-7 place-items-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
                aria-label={t("requirement_fields.fields.actions")}
              >
                <MoreHorizontal className="size-4" />
              </span>
            }
            placement="bottom-end"
            portalElement={getMenuPortalElement()}
          >
            <CustomMenu.MenuItem onClick={onSelect}>
              <MenuRowLabel icon={Settings2} label={isCommon ? "查看" : t("edit")} />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => onInsert("above")}>
              <MenuRowLabel icon={ArrowUpToLine} label={t("requirement_fields.fields.insert_above")} />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => onInsert("below")}>
              <MenuRowLabel icon={ArrowDownToLine} label={t("requirement_fields.fields.insert_below")} />
            </CustomMenu.MenuItem>
            {/* 一个通用字段在一个类型里只能用一次，不提供复制 */}
            {!isCommon && (
              <CustomMenu.MenuItem onClick={onDuplicate}>
                <MenuRowLabel icon={Copy} label={t("requirement_fields.builder.duplicate_field")} />
              </CustomMenu.MenuItem>
            )}
            {onPromote && (
              <CustomMenu.MenuItem onClick={onPromote}>
                <MenuRowLabel icon={Library} label="转为通用字段" />
              </CustomMenu.MenuItem>
            )}
            {onOpenLibrary && (
              <CustomMenu.MenuItem onClick={onOpenLibrary}>
                <MenuRowLabel icon={ExternalLink} label="编辑通用字段" />
              </CustomMenu.MenuItem>
            )}
            {/* 保存过的字段进回收站（可恢复）；没保存过的没有值要保，直接删 */}
            <CustomMenu.MenuItem onClick={onRemove}>
              <MenuRowLabel
                icon={canBin ? Archive : Trash2}
                label={t(canBin ? "requirement_fields.builder.move_to_bin" : "requirement_fields.builder.delete_field")}
                tone={canBin ? "default" : "danger"}
              />
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
      )}
      {isForm && !isCollapsed && children}
    </div>
  );
}

/**
 * 字段的内联编辑表单：左栏是「这个字段是什么」（名称/说明/纳入标准库/必填），
 * 右栏是「怎么填」（类型、选项、占位符）。与工作项属性的内联表单同构。
 *
 * 改动直接写进草稿 —— 整页由顶部的「保存配置」统一提交，所以这里没有「更新」。
 * 「取消」还原到展开时的样子，「完成」只是收起。
 */
function FieldInlineForm(props: TFieldInlineFormProps) {
  const { field, isChild, ruleSources, onChange, onCancel, onDone } = props;
  const { t } = useTranslation();
  const availableTypes = isChild ? CHILD_FIELD_TYPES : ROOT_FIELD_TYPES;
  const [isBulkOptionsModalOpen, setIsBulkOptionsModalOpen] = useState(false);
  /*
   * 不进标准库的字段不能设必填 —— 标准库只按纳入库的字段校验，库条目天生不带它们，
   * 导入进来的行会卡在必填上再也存不动。后端在
   * RequirementFieldNodeWriteSerializer 里也拦一道，这里只是提前给出反馈。
   */
  const canBeRequired = field.show_in_library;
  const selectOptions = field.field_type === "select" ? getRequirementSelectOptions(field) : [];
  const hasValidSelectOptions = field.field_type !== "select" || hasValidRequirementSelectOptions(field);

  const defaultSelectOptionLabels = [
    t("requirement_fields.builder.default_option", { index: 1 }),
    t("requirement_fields.builder.default_option", { index: 2 }),
  ];

  /** 移出标准库时只摘掉当前字段的必填，子字段各自独立 */
  const toggleShowInLibrary = (next: boolean) => {
    onChange({
      ...field,
      show_in_library: next,
      ...(next ? {} : { is_required: false }),
    });
  };

  const updateType = (fieldType: TRequirementFieldType) => {
    const commonConfig = {
      ...(field.config.description ? { description: field.config.description } : {}),
      ...(field.config.placeholder ? { placeholder: field.config.placeholder } : {}),
    };
    onChange({
      ...field,
      field_type: fieldType,
      default_value: null,
      config:
        fieldType === "select"
          ? {
              ...commonConfig,
              selection_mode: "single",
              options: createSelectOptions(defaultSelectOptionLabels),
            }
          : fieldType === "rule_value"
            ? {
                ...commonConfig,
                on_violation: "block",
                // 同级只有一个取值规则字段时直接跟它，省一次选择
                ...(ruleSources.length === 1 ? { rule_field_id: ruleSources[0].key } : {}),
              }
            : commonConfig,
      children: fieldType === "form" ? field.children : [],
    });
  };

  const updateSelectOptions = (options: TRequirementSelectOption[]) => {
    if (field.field_type !== "select") return;
    onChange({
      ...field,
      config: {
        ...field.config,
        options,
      },
    });
  };

  const addSelectOption = () => {
    if (field.field_type !== "select") return;
    const existingLabels = new Set(selectOptions.map((option) => option.label.trim().toLocaleLowerCase()));
    let index = selectOptions.length + 1;
    let label = t("requirement_fields.builder.default_option", { index });
    while (existingLabels.has(label.toLocaleLowerCase())) {
      index += 1;
      label = t("requirement_fields.builder.default_option", { index });
    }
    updateSelectOptions([...selectOptions, { id: uuidv4(), label }]);
  };

  return (
    <div className="grid grid-cols-1 divide-y divide-subtle md:grid-cols-[1fr_360px] md:divide-x md:divide-y-0">
      {/* 左栏：这个字段是什么 */}
      <div className="flex min-h-32 flex-col p-4">
        <input
          value={field.name}
          autoFocus
          onChange={(event) => onChange({ ...field, name: event.target.value })}
          className="w-full bg-transparent text-16 font-normal text-secondary outline-none placeholder:text-placeholder"
          placeholder={t("requirement_fields.fields.field_name_placeholder")}
        />
        <textarea
          value={String(field.config.description ?? "")}
          onChange={(event) => onChange({ ...field, config: { ...field.config, description: event.target.value } })}
          className="mt-1 min-h-16 w-full resize-none bg-transparent text-13 leading-5 text-secondary outline-none placeholder:text-placeholder"
          placeholder={t("requirement_fields.builder.description_example")}
        />
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-subtle pt-3 text-12 text-secondary">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={field.show_in_library}
              onChange={(event) => toggleShowInLibrary(event.target.checked)}
              className="size-3.5 rounded border border-subtle accent-accent-primary"
            />
            {t("requirement_fields.builder.library_title")}
          </label>
          <label className={cn("flex items-center gap-2", !canBeRequired && "cursor-not-allowed text-disabled")}>
            <input
              type="checkbox"
              checked={field.is_required && canBeRequired}
              disabled={!canBeRequired}
              onChange={(event) => onChange({ ...field, is_required: event.target.checked })}
              className="size-3.5 rounded border border-subtle accent-accent-primary disabled:cursor-not-allowed"
            />
            {t("requirement_fields.builder.required_title")}
          </label>
          {!canBeRequired && (
            <span className="basis-full text-11 leading-4 text-tertiary">
              {t("requirement_fields.builder.required_library_only_hint")}
            </span>
          )}
        </div>
      </div>

      {/* 右栏：怎么填 */}
      <div className="flex min-h-0 flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="mb-1.5 block text-12 font-medium text-secondary">
              {t("requirement_fields.builder.field_type")}
            </span>
            <select
              value={field.field_type}
              onChange={(event) => updateType(event.target.value as TRequirementFieldType)}
              className="focus:border-accent-primary h-9 w-full appearance-none rounded-md border border-subtle bg-surface-1 pr-8 pl-3 text-12 text-primary outline-none"
            >
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {t(`requirement_fields.field_types.${type}`)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 bottom-3 size-3 -translate-y-px text-placeholder" />
          </label>
          {field.field_type === "select" && (
            <section className="overflow-hidden rounded-lg border border-subtle bg-layer-1/40">
              <div className="border-b border-subtle px-3 py-3">
                <p className="text-12 font-medium text-primary">
                  {t("requirement_fields.builder.selection_mode")}
                </p>
                <div className="mt-2 grid grid-cols-2 rounded-md bg-layer-3 p-0.5">
                  {(["single", "multiple"] as const).map((mode) => {
                    const isActive = getRequirementSelectMode(field) === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          onChange({
                            ...field,
                            config: { ...field.config, selection_mode: mode },
                            default_value: mode === "multiple" ? [] : null,
                          })
                        }
                        className={cn(
                          "h-7 rounded text-11 font-medium transition-colors",
                          isActive
                            ? "bg-surface-1 font-semibold text-accent-primary shadow-raised-100 ring-1 ring-accent-subtle"
                            : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                        )}
                      >
                        {t(
                          `requirement_fields.builder.${
                            mode === "multiple" ? "multiple_select" : "single_select"
                          }`
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-12 font-medium text-primary">
                      {t("requirement_fields.builder.selector_options")}
                    </p>
                    <p className="mt-0.5 text-10 text-secondary">
                      {t("requirement_fields.builder.selector_options_description")}
                    </p>
                  </div>
                  <span className="rounded bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">
                    {selectOptions.length}
                  </span>
                </div>
                <Sortable
                  id={`requirement-selector-options-${fieldKey(field)}`}
                  data={selectOptions}
                  keyExtractor={(option) => option.id}
                  containerClassName="mt-2"
                  onChange={updateSelectOptions}
                  render={(option, index) => (
                    <div className="group mb-1.5 flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 p-1.5 last:mb-0 focus-within:border-accent-strong">
                      <GripVertical className="size-3.5 shrink-0 cursor-grab text-placeholder active:cursor-grabbing" />
                      <span className="grid size-5 shrink-0 place-items-center rounded bg-layer-2 text-10 font-medium text-secondary">
                        {index + 1}
                      </span>
                      <input
                        value={option.label}
                        maxLength={255}
                        onChange={(event) =>
                          updateSelectOptions(
                            selectOptions.map((item) =>
                              item.id === option.id ? { ...item, label: event.target.value } : item
                            )
                          )
                        }
                        className="h-7 min-w-0 flex-1 bg-transparent px-1 text-12 text-primary outline-none"
                        aria-label={t("requirement_fields.builder.option_label", {
                          index: index + 1,
                        })}
                      />
                      <button
                        type="button"
                        disabled={selectOptions.length <= 1}
                        onClick={() => updateSelectOptions(selectOptions.filter((item) => item.id !== option.id))}
                        className="grid size-7 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger-primary focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                        aria-label={t("requirement_fields.builder.delete_option")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                />
                {!hasValidSelectOptions && (
                  <p className="mt-2 text-10 leading-4 text-danger-primary">
                    {t("requirement_fields.validation.selector_options")}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addSelectOption}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-11 font-medium text-accent-primary transition-colors hover:border-accent-subtle hover:bg-accent-subtle"
                  >
                    <Plus className="size-3.5" />
                    {t("requirement_fields.builder.add_option")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkOptionsModalOpen(true)}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-11 font-medium text-accent-primary transition-colors hover:border-accent-subtle hover:bg-accent-subtle"
                  >
                    <ListPlus className="size-3.5" />
                    {t("requirement_fields.builder.bulk_edit_options")}
                  </button>
                </div>
                <RequirementSelectOptionsBulkModal
                  isOpen={isBulkOptionsModalOpen}
                  onClose={() => setIsBulkOptionsModalOpen(false)}
                  options={selectOptions}
                  onApply={updateSelectOptions}
                />
              </div>
            </section>
          )}
          {field.field_type === "rule_value" && (
            <section className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-1/40 px-3 py-3">
              <label className="relative block">
                <span className="mb-1.5 block text-12 font-medium text-primary">
                  {t("requirement_fields.builder.rule_source")}
                </span>
                <select
                  // 来源被删或挪进回收站后，旧 id 已不在候选里：回到「请选择」，保存时会拦
                  value={
                    ruleSources.some((source) => source.key === field.config.rule_field_id)
                      ? String(field.config.rule_field_id)
                      : ""
                  }
                  onChange={(event) =>
                    onChange({ ...field, config: { ...field.config, rule_field_id: event.target.value } })
                  }
                  disabled={ruleSources.length === 0}
                  className="focus:border-accent-primary h-9 w-full appearance-none rounded-md border border-subtle bg-surface-1 pr-8 pl-3 text-12 text-primary outline-none disabled:cursor-not-allowed disabled:bg-layer-1 disabled:text-tertiary"
                >
                  <option value="" disabled>
                    {t(
                      ruleSources.length
                        ? "requirement_fields.builder.rule_source_placeholder"
                        : "requirement_fields.builder.rule_source_empty"
                    )}
                  </option>
                  {ruleSources.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.name || t("requirement_fields.fields.untitled")}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 bottom-3 size-3 -translate-y-px text-placeholder" />
              </label>
              <div>
                <p className="text-12 font-medium text-primary">{t("requirement_fields.builder.on_violation")}</p>
                <div className="mt-2 grid grid-cols-2 rounded-md bg-layer-3 p-0.5">
                  {(["block", "warn"] as const).map((mode) => {
                    const isActive = (field.config.on_violation === "warn" ? "warn" : "block") === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onChange({ ...field, config: { ...field.config, on_violation: mode } })}
                        className={cn(
                          "h-7 rounded text-11 font-medium transition-colors",
                          isActive
                            ? "bg-surface-1 font-semibold text-accent-primary shadow-raised-100 ring-1 ring-accent-subtle"
                            : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                        )}
                      >
                        {t(`requirement_fields.builder.on_violation_${mode}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
          <label className="block">
            <span className="mb-1.5 block text-12 font-medium text-secondary">
              {t("requirement_fields.fields.placeholder")}
            </span>
            <input
              value={String(field.config.placeholder ?? "")}
              onChange={(event) =>
                onChange({ ...field, config: { ...field.config, placeholder: event.target.value } })
              }
              disabled={field.field_type === "form" || field.field_type === "rule"}
              className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none disabled:cursor-not-allowed disabled:bg-layer-1 disabled:text-tertiary"
              placeholder={t("requirement_fields.builder.placeholder_example")}
            />
          </label>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-subtle pt-3">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={onDone}>
            {t("requirement_fields.builder.done_editing")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RequirementFieldBuilder(props: TRequirementFieldBuilderProps) {
  const {
    items,
    onChange,
    fieldValueCounts = {},
    commonFields,
    sidebarHeader,
    compactLayout = false,
    title,
    description,
  } = props;
  const { t } = useTranslation();
  // selection = 当前原地展开成表单的那个字段，同时只能有一个。内置行不可展开，不进 selection
  const [selection, setSelection] = useState<TFieldSelection | null>(null);
  // 展开那一刻的字段快照，「取消」还原用；isNew 的字段直接撤销掉这次新增
  const [editSnapshot, setEditSnapshot] = useState<{ field: TRequirementFieldDraft; isNew: boolean } | null>(null);
  const [draggedLibraryFieldType, setDraggedLibraryFieldType] = useState<TRequirementFieldType | null>(null);
  const [draggedCommonFieldId, setDraggedCommonFieldId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TFieldDropTarget | null>(null);
  const [isBinOpen, setIsBinOpen] = useState(false);

  // 回收站里的根字段恒在 items 尾部，主列表只渲染 active 段（见 requirement-builder-items.ts）
  const { active: activeItems, inactive: inactiveItems } = splitBuilderItems(items);
  const binEntries = collectRecycleBinEntries(items);
  const customFieldCount = activeItems.reduce((count, item) => (item.kind === "custom" ? count + 1 : count), 0);
  // 本类型已绑定的通用字段（回收站里的也算）：左栏据此置灰，一个通用字段只能添加一次
  const boundDefinitionIds = new Set(
    items.flatMap((item) => (item.kind === "custom" && item.field.library_field_id ? [item.field.library_field_id] : []))
  );
  /** 主列表的回写口：Sortable.onChange 给的是整个数组，回收站里的根字段要自己拼回尾部 */
  const commitActive = (nextActive: TRequirementBuilderItem[]) => onChange([...nextActive, ...inactiveItems]);
  const findCustomField = (rootKey: string) =>
    items.find(
      (item): item is Extract<TRequirementBuilderItem, { kind: "custom" }> =>
        item.kind === "custom" && fieldKey(item.field) === rootKey
    )?.field;
  /** 只改匹配 rootKey 的自定义项，内置项原样透传 */
  const mapCustomItem = (
    rootKey: string,
    update: (field: TRequirementFieldDraft) => TRequirementFieldDraft
  ): TRequirementBuilderItem[] =>
    items.map((item) =>
      item.kind === "custom" && fieldKey(item.field) === rootKey
        ? { ...item, field: update(item.field) }
        : item
    );

  const selectedRoot = selection ? findCustomField(selection.rootKey) : undefined;
  const selectedField =
    selectedRoot && selection?.childKey
      ? selectedRoot.children.find((field) => fieldKey(field) === selection.childKey)
      : selectedRoot;
  const defaultSelectOptionLabels = [
    t("requirement_fields.builder.default_option", { index: 1 }),
    t("requirement_fields.builder.default_option", { index: 2 }),
  ];

  // 被展开的字段没了（删除、切类型丢子字段）就收起，别让表单挂在空对象上
  useEffect(() => {
    if (selection && !selectedField) {
      setSelection(null);
      setEditSnapshot(null);
    }
  }, [selection, selectedField]);

  const openEditor = (next: TFieldSelection, field: TRequirementFieldDraft, isNew = false) => {
    setSelection(next);
    setEditSnapshot({ field, isNew });
  };

  const closeEditor = () => {
    setSelection(null);
    setEditSnapshot(null);
  };

  const writeField = (target: TFieldSelection, nextField: TRequirementFieldDraft) => {
    onChange(
      mapCustomItem(target.rootKey, (field) => {
        if (!target.childKey) return nextField;
        return {
          ...field,
          children: field.children.map((child) => (fieldKey(child) === target.childKey ? nextField : child)),
        };
      })
    );
  };

  const updateSelectedField = (nextField: TRequirementFieldDraft) => {
    if (!selection) return;
    writeField(selection, nextField);
  };

  /** 刚加的字段整个撤销，已有字段还原到展开时的样子 */
  const cancelEditing = () => {
    if (selection && editSnapshot) {
      if (editSnapshot.isNew) removeSelection(selection);
      else writeField(selection, editSnapshot.field);
    }
    closeEditor();
  };

  /** 与目标字段同级的那一组字段：根字段是全部自定义根字段，子字段是所在表单的子字段 */
  const siblingsOf = (target: TFieldSelection): TRequirementFieldDraft[] =>
    target.childKey
      ? (findCustomField(target.rootKey)?.children ?? [])
      : items.flatMap((item) => (item.kind === "custom" ? [item.field] : []));
  const ruleSourceNameOf = (target: TFieldSelection, field: TRequirementFieldDraft) =>
    field.field_type === "rule_value"
      ? ruleSourceOptions(siblingsOf(target)).find((source) => source.key === field.config.rule_field_id)?.name
      : undefined;

  const renderFieldEditor = (target: TFieldSelection, field: TRequirementFieldDraft) => (
    <FieldInlineForm
      field={field}
      isChild={Boolean(target.childKey)}
      // 自己不会是「取值规则」类型的候选（类型不同），不必排除
      ruleSources={ruleSourceOptions(siblingsOf(target))}
      onChange={updateSelectedField}
      onCancel={cancelEditing}
      onDone={closeEditor}
    />
  );

  /** 绑定了通用字段的根字段展开后是只读卡片：能改的只有「纳入标准库」 */
  const renderCommonFieldCard = (rootKey: string, field: TRequirementFieldDraft) => (
    <RequirementCommonFieldCard
      field={field}
      definition={commonFields?.definitions.find((item) => item.id === field.library_field_id)}
      onToggleShowInLibrary={(next) => writeField({ rootKey }, { ...field, show_in_library: next })}
      onCancel={cancelEditing}
      onDone={closeEditor}
      onOpenLibrary={() => commonFields?.onOpenLibrary(field.library_field_id ?? undefined)}
    />
  );

  /** index 是主列表（activeItems）里的下标 —— 新字段可以插在内置字段之间 */
  const insertRootField = (index: number, type: TRequirementFieldType) => {
    const nextField = createField(
      type,
      t(`requirement_fields.field_types.${type}`),
      defaultSelectOptionLabels,
      ruleSourceOptions(items.flatMap((item) => (item.kind === "custom" ? [item.field] : [])))
    );
    const nextItems = [...activeItems];
    nextItems.splice(index, 0, { kind: "custom", field: nextField });
    commitActive(nextItems);
    openEditor({ rootKey: fieldKey(nextField) }, nextField, true);
  };

  /** 从左栏拖进来的通用字段：定义取自库、本类型里只读，所以不展开编辑表单 */
  const insertCommonField = (index: number, definitionId: string) => {
    const definition = commonFields?.definitions.find((item) => item.id === definitionId);
    if (!definition || boundDefinitionIds.has(definitionId)) return;
    const name = definition.name.trim().toLocaleLowerCase();
    // 保存时后端按同一口径（不分大小写、含回收站）校验重名，这里提前说清楚
    if (items.some((item) => item.kind === "custom" && item.field.name.trim().toLocaleLowerCase() === name)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "无法添加",
        message: `本类型里已有名为「${definition.name}」的字段（含回收站），请先改名或删除。`,
      });
      return;
    }
    const nextItems = [...activeItems];
    nextItems.splice(index, 0, { kind: "custom", field: toBoundFieldDraft(definition) });
    commitActive(nextItems);
  };

  const insertChildField = (rootKey: string, index: number, type: TRequirementFieldType) => {
    const nextField = createField(
      type,
      t(`requirement_fields.field_types.${type}`),
      defaultSelectOptionLabels,
      ruleSourceOptions(findCustomField(rootKey)?.children ?? [])
    );
    onChange(
      mapCustomItem(rootKey, (field) => {
        const { active, inactive } = splitFieldsByActive(field.children);
        active.splice(index, 0, nextField);
        return { ...field, children: [...active, ...inactive] };
      })
    );
    openEditor({ rootKey, childKey: fieldKey(nextField) }, nextField, true);
  };

  const resetLibraryDrag = () => {
    setDraggedLibraryFieldType(null);
    setDraggedCommonFieldId(null);
    setDropTarget(null);
  };

  /**
   * 拖到表单上：只有「字段类型拖进私有表单」能落成子字段。另外三种情况在这里拦下并标成
   * 不可放置，不让事件冒泡到根列表 —— 冒泡的话松手会被悄悄加成末尾的一级字段：
   * 通用字段拖进任何表单（它只能作一级字段）、任何东西拖进绑定了通用字段的表单
   * （子字段由字段库维护）、表单拖进表单。
   */
  const handleChildFieldDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    rootKey: string,
    isCommonForm: boolean
  ) => {
    const dragTypes = event.dataTransfer.types;
    const isCommonDrag = dragTypes.includes(COMMON_FIELD_DRAG_TYPE);
    if (!isCommonDrag && !dragTypes.includes(FIELD_LIBRARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isCommonDrag && !isCommonForm && draggedLibraryFieldType && isChildFieldType(draggedLibraryFieldType)) {
      event.dataTransfer.dropEffect = "copy";
      setDropTarget({ kind: "child", rootKey });
      return;
    }
    event.dataTransfer.dropEffect = "none";
    setDropTarget({ kind: "invalid-child", rootKey });
  };

  const handleChildFieldDrop = (
    event: React.DragEvent<HTMLDivElement>,
    rootKey: string,
    childCount: number,
    isCommonForm: boolean
  ) => {
    const dragTypes = event.dataTransfer.types;
    const isCommonDrag = dragTypes.includes(COMMON_FIELD_DRAG_TYPE);
    if (!isCommonDrag && !dragTypes.includes(FIELD_LIBRARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isCommonDrag && !isCommonForm) {
      const fieldType = event.dataTransfer.getData(FIELD_LIBRARY_DRAG_TYPE) as TRequirementFieldType;
      if (isChildFieldType(fieldType)) insertChildField(rootKey, childCount, fieldType);
    }
    resetLibraryDrag();
  };

  const duplicateSelection = (targetSelection = selection) => {
    if (!targetSelection) return;
    const rootIndex = items.findIndex(
      (item) => item.kind === "custom" && fieldKey(item.field) === targetSelection.rootKey
    );
    if (rootIndex === -1) return;
    const rootItem = items[rootIndex] as Extract<TRequirementBuilderItem, { kind: "custom" }>;
    const root = rootItem.field;
    if (!targetSelection.childKey) {
      const duplicate = duplicateField(root, t("requirement_fields.builder.copy_suffix"));
      const nextItems = [...items];
      nextItems.splice(rootIndex + 1, 0, { kind: "custom", field: duplicate });
      onChange(nextItems);
      openEditor({ rootKey: fieldKey(duplicate) }, duplicate, true);
      return;
    }
    const childIndex = root.children.findIndex((field) => fieldKey(field) === targetSelection.childKey);
    if (childIndex === -1) return;
    const duplicate = duplicateField(
      root.children[childIndex],
      t("requirement_fields.builder.copy_suffix")
    );
    const nextChildren = [...root.children];
    nextChildren.splice(childIndex + 1, 0, duplicate);
    onChange(mapCustomItem(targetSelection.rootKey, (field) => ({ ...field, children: nextChildren })));
    openEditor({ rootKey: targetSelection.rootKey, childKey: fieldKey(duplicate) }, duplicate, true);
  };

  const removeSelection = (targetSelection = selection) => {
    if (!targetSelection) return;
    const root = findCustomField(targetSelection.rootKey);
    if (!root) return;
    if (targetSelection.childKey) {
      const nextChildren = root.children.filter((field) => fieldKey(field) !== targetSelection.childKey);
      onChange(mapCustomItem(targetSelection.rootKey, (field) => ({ ...field, children: nextChildren })));
      closeEditor();
      return;
    }
    onChange(
      items.filter((item) => item.kind !== "custom" || fieldKey(item.field) !== targetSelection.rootKey)
    );
    closeEditor();
  };

  /** 行菜单「删除」的统一入口：保存过的字段进回收站，没保存过的直接扔掉（没有值要保） */
  const discardSelection = (target: TFieldSelection) => {
    const root = findCustomField(target.rootKey);
    const field = target.childKey ? root?.children.find((child) => fieldKey(child) === target.childKey) : root;
    if (!field) return;
    if (!field.id) {
      removeSelection(target);
      return;
    }
    onChange(moveFieldToBin(items, target));
    // 字段还在 items 里，「选中项消失就收起」的 effect 不会触发，得自己收
    closeEditor();
  };

  const restoreBinEntry = (entry: TRequirementBinEntry) =>
    onChange(restoreFieldFromBin(items, binEntryTarget(entry)));
  /** 确认弹窗在回收站组件里弹；这里就是原来的硬删，保存时再由后端的数据丢失确认把关 */
  const deleteBinEntryForever = (entry: TRequirementBinEntry) => removeSelection(binEntryTarget(entry));

  const renderRootField = (field: TRequirementFieldDraft, rootIndex: number) => {
    const rootKey = fieldKey(field);
    const { active: activeChildren } = splitFieldsByActive(field.children);
    // 绑定了通用字段：定义与子字段整组取自库，本类型里只读
    const isCommon = Boolean(field.library_field_id);
    const isEditing = selection?.rootKey === rootKey && !selection.childKey;
    const hasSelectedChild = selection?.rootKey === rootKey && Boolean(selection.childKey);
    const isChildDropTarget = dropTarget?.kind === "child" && dropTarget.rootKey === rootKey;
    const isInvalidChildDropTarget = dropTarget?.kind === "invalid-child" && dropTarget.rootKey === rootKey;
    // 落不进这个表单时说明原因（判定见 handleChildFieldDragOver）
    const invalidDropNotice = isInvalidChildDropTarget && (
      <div className="mb-2 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-11 text-danger-primary">
        {draggedCommonFieldId
          ? "通用字段只能作为一级字段，不能放进表单。"
          : isCommon
            ? "该表单是通用字段，子字段在模板中心「通用字段」里统一维护。"
            : t("requirement_fields.builder.nested_form_not_supported")}
      </div>
    );
    return (
      <div
        onDragOver={(event) => {
          if (field.field_type === "form") handleChildFieldDragOver(event, rootKey, isCommon);
        }}
        onDrop={(event) => {
          if (field.field_type === "form") handleChildFieldDrop(event, rootKey, activeChildren.length, isCommon);
        }}
      >
        <RequirementFieldRow
          field={field}
          isEditing={isEditing}
          editor={
            isEditing
              ? isCommon
                ? renderCommonFieldCard(rootKey, field)
                : renderFieldEditor({ rootKey }, field)
              : undefined
          }
          hasSelectedChild={hasSelectedChild}
          isDropTarget={isChildDropTarget}
          isInvalidDropTarget={isInvalidChildDropTarget}
          onSelect={() => openEditor({ rootKey }, field)}
          onInsert={(position) => insertRootField(rootIndex + (position === "below" ? 1 : 0), "text")}
          onDuplicate={() => duplicateSelection({ rootKey })}
          onRemove={() => discardSelection({ rootKey })}
          isCommon={isCommon}
          ruleSourceName={ruleSourceNameOf({ rootKey }, field)}
          onPromote={
            !isCommon && field.id && commonFields?.onPromote && !isRuleFieldType(field.field_type)
              ? () => commonFields.onPromote?.(field)
              : undefined
          }
          onOpenLibrary={
            isCommon && commonFields
              ? () => commonFields.onOpenLibrary(field.library_field_id ?? undefined)
              : undefined
          }
        >
          {isCommon ? (
            <div
              className={cn(
                "border-t border-subtle bg-layer-1/50 px-3",
                compactLayout ? "py-2 sm:pl-7" : "py-3 sm:pl-9"
              )}
            >
              {invalidDropNotice}
              <RequirementCommonChildRows fields={activeChildren} />
            </div>
          ) : (
            <div
              className={cn("border-t border-subtle bg-layer-1/50 px-3", compactLayout ? "py-2 sm:pl-7" : "py-3 sm:pl-9")}
            >
              {invalidDropNotice}
              {activeChildren.length > 0 && (
                <Sortable
                  id={`requirement-form-${rootKey}`}
                  data={activeChildren}
                  keyExtractor={fieldKey}
                  containerClassName="mb-2 last:mb-0"
                  onChange={(children) =>
                    onChange(
                      mapCustomItem(rootKey, (item) => ({
                        ...item,
                        // 回收站里的子字段不在 Sortable 里，拼回尾部
                        children: [...children, ...item.children.filter((child) => !child.is_active)],
                      }))
                    )
                  }
                  render={(child, childIndex) => {
                    const childKey = fieldKey(child);
                    const isChildEditing = selection?.rootKey === rootKey && selection.childKey === childKey;
                    return (
                      <RequirementFieldRow
                        field={child}
                        isChild
                        isEditing={isChildEditing}
                        editor={isChildEditing ? renderFieldEditor({ rootKey, childKey }, child) : undefined}
                        ruleSourceName={ruleSourceNameOf({ rootKey, childKey }, child)}
                        onSelect={() => openEditor({ rootKey, childKey }, child)}
                        onInsert={(position) =>
                          insertChildField(rootKey, childIndex + (position === "below" ? 1 : 0), "text")
                        }
                        onDuplicate={() => duplicateSelection({ rootKey, childKey })}
                        onRemove={() => discardSelection({ rootKey, childKey })}
                      />
                    );
                  }}
                />
              )}
              <CustomMenu
                customButton={
                  <span
                    className={cn(
                      "mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-11 font-medium text-accent-primary hover:border-accent-subtle hover:bg-accent-subtle",
                      {
                        "mt-0": activeChildren.length === 0,
                        "border-accent-strong bg-accent-subtle": isChildDropTarget,
                      }
                    )}
                  >
                    <Plus className="size-3.5" />
                    {t(
                      isChildDropTarget
                        ? "requirement_fields.builder.child_drop_hint"
                        : "requirement_fields.fields.add_child"
                    )}
                  </span>
                }
                className="w-full"
                customButtonClassName="w-full"
                placement="bottom-start"
                optionsClassName="w-48"
                portalElement={getMenuPortalElement()}
              >
                {CHILD_FIELD_TYPES.map((type) => {
                  const Icon = FIELD_ICONS[type];
                  return (
                    <CustomMenu.MenuItem
                      key={type}
                      onClick={() => insertChildField(rootKey, activeChildren.length, type)}
                    >
                      <MenuRowLabel icon={Icon} label={t(`requirement_fields.field_types.${type}`)} />
                    </CustomMenu.MenuItem>
                  );
                })}
              </CustomMenu>
            </div>
          )}
        </RequirementFieldRow>
      </div>
    );
  };

  const libraryMenu = (
    <CustomMenu
      customButton={
        <Button variant="secondary">
          <Plus className="size-3.5" />
          {t("requirement_fields.fields.add")}
        </Button>
      }
      placement="bottom-end"
      optionsClassName="w-52"
      portalElement={getMenuPortalElement()}
    >
      {ROOT_FIELD_TYPES.map((type) => {
        const Icon = FIELD_ICONS[type];
        return (
          <CustomMenu.MenuItem key={type} onClick={() => insertRootField(activeItems.length, type)}>
            <MenuRowLabel icon={Icon} label={t(`requirement_fields.field_types.${type}`)} />
          </CustomMenu.MenuItem>
        );
      })}
      {/* 窄屏下左栏收起，还没添加的通用字段也从这个菜单加 */}
      {(commonFields?.definitions ?? [])
        .filter((definition) => !boundDefinitionIds.has(definition.id))
        .map((definition) => (
          <CustomMenu.MenuItem key={definition.id} onClick={() => insertCommonField(activeItems.length, definition.id)}>
            <MenuRowLabel icon={FIELD_ICONS[definition.field_type]} label={`通用字段 · ${definition.name}`} />
          </CustomMenu.MenuItem>
        ))}
      {/* 窄屏下字段库收进这个菜单，回收站入口也跟着进来 */}
      <CustomMenu.MenuItem onClick={() => setIsBinOpen(true)} disabled={binEntries.length === 0}>
        <MenuRowLabel
          icon={Archive}
          label={
            binEntries.length > 0
              ? `${t("requirement_fields.recycle_bin.title")} · ${binEntries.length}`
              : t("requirement_fields.recycle_bin.title")
          }
        />
      </CustomMenu.MenuItem>
    </CustomMenu>
  );

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-1">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-subtle bg-surface-1 xl:flex xl:flex-col",
          compactLayout ? "w-52" : "w-60"
        )}
      >
        {sidebarHeader}
        <div className="min-h-0 flex-1">
          <FieldLibrary
            compact={compactLayout}
            onDragStart={(type) => {
              setDraggedLibraryFieldType(type);
              setDropTarget(null);
            }}
            onDragEnd={resetLibraryDrag}
            binCount={binEntries.length}
            onOpenBin={() => setIsBinOpen(true)}
            common={
              commonFields && {
                definitions: commonFields.definitions,
                isLoading: commonFields.isLoading,
                boundIds: boundDefinitionIds,
                onDragStart: (definitionId) => {
                  setDraggedCommonFieldId(definitionId);
                  setDropTarget(null);
                },
                onOpenLibrary: () => commonFields.onOpenLibrary(),
              }
            }
          />
        </div>
      </aside>
      <main className={cn("flex min-w-0 flex-1 flex-col", compactLayout ? "bg-surface-1" : "bg-layer-1/40")}>
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-b border-subtle bg-surface-1",
            compactLayout ? "min-h-20 px-6 py-4" : "min-h-16 px-4 py-3 2xl:px-6"
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className={cn("font-semibold text-primary", compactLayout ? "text-20" : "text-14")}>
                {title ?? t("requirement_fields.builder.field_structure")}
              </h1>
              <span className="rounded bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">
                {customFieldCount}
              </span>
            </div>
            <p className="mt-0.5 truncate text-11 text-secondary">
              {description ?? t("requirement_fields.builder.field_structure_description")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="xl:hidden">{libraryMenu}</div>
          </div>
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            compactLayout ? "px-6 py-4 2xl:px-7" : "px-4 py-4 2xl:px-7 2xl:py-6"
          )}
          onDragOver={(event) => {
            const dragTypes = event.dataTransfer.types;
            if (!dragTypes.includes(FIELD_LIBRARY_DRAG_TYPE) && !dragTypes.includes(COMMON_FIELD_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropTarget({ kind: "root" });
          }}
          onDrop={(event) => {
            // 通用字段只能落成根字段；拖到表单上的情况在表单那一层就被拦下并提示了，走不到这里
            const commonFieldId = event.dataTransfer.getData(COMMON_FIELD_DRAG_TYPE);
            if (commonFieldId) {
              event.preventDefault();
              insertCommonField(activeItems.length, commonFieldId);
              resetLibraryDrag();
              return;
            }
            const fieldType = event.dataTransfer.getData(FIELD_LIBRARY_DRAG_TYPE) as TRequirementFieldType;
            if (!ROOT_FIELD_TYPES.includes(fieldType)) return;
            event.preventDefault();
            insertRootField(activeItems.length, fieldType);
            resetLibraryDrag();
          }}
        >
          <div className={cn("mx-auto w-full", compactLayout ? "max-w-3xl" : "max-w-4xl")}>
            {/* 编号 / 标题是必填的结构列（网格里左固定），锁定在最前：
                放在 Sortable 之外 ⇒ 天然不可拖动、也不可能成为落点 */}
            <div className="mb-3 space-y-3">
              <RequirementBuiltinFieldRow columnKey="code" pinned />
              <RequirementBuiltinFieldRow columnKey="title" pinned />
            </div>
            {/* 统一混排列表：内置字段与自定义字段交叉拖拽，顺序即网格列序 */}
            <Sortable
              id="requirement-root-fields"
              data={activeItems}
              keyExtractor={builderItemKey}
              containerClassName="mb-3 last:mb-0"
              onChange={commitActive}
              render={(item, index) =>
                item.kind === "builtin" ? (
                  <RequirementBuiltinFieldRow
                    columnKey={item.key}
                    showInLibrary={item.show_in_library}
                    onToggleShowInLibrary={(next) =>
                      onChange(
                        items.map((candidate) =>
                          candidate.kind === "builtin" && candidate.key === item.key
                            ? { ...candidate, show_in_library: next }
                            : candidate
                        )
                      )
                    }
                  />
                ) : (
                  renderRootField(item.field, index)
                )
              }
            />
            {customFieldCount === 0 && !draggedLibraryFieldType && !draggedCommonFieldId && (
              <div className="mt-3 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-subtle bg-surface-1 px-6 py-5 text-center">
                <p className="text-13 font-medium text-primary">{t("requirement_fields.fields.empty")}</p>
                <p className="text-11 leading-4 text-secondary">
                  {t("requirement_fields.builder.empty_description")}
                </p>
                <div className="mt-2 inline-flex xl:hidden">{libraryMenu}</div>
              </div>
            )}
            {(draggedLibraryFieldType || draggedCommonFieldId) && (
              <div
                className={cn(
                  "mt-3 flex h-12 items-center justify-center rounded-lg border border-dashed text-11 font-medium transition-colors",
                  dropTarget?.kind === "root"
                    ? "border-accent-strong bg-accent-subtle text-accent-primary"
                    : "border-subtle bg-surface-1 text-secondary"
                )}
              >
                {t("requirement_fields.builder.root_drop_hint")}
              </div>
            )}
          </div>
        </div>
      </main>
      <RequirementFieldRecycleBin
        isOpen={isBinOpen}
        onClose={() => setIsBinOpen(false)}
        entries={binEntries}
        valueCounts={fieldValueCounts}
        onRestore={restoreBinEntry}
        onDeleteForever={deleteBinEntryForever}
      />
    </div>
  );
}

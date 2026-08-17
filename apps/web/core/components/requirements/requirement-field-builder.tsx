import { useEffect, useState } from "react";
import {
  AlignLeft,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Copy,
  FileImage,
  FormInput,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ToggleLeft,
  Trash2,
  Type,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TRequirementFieldDraft,
  TRequirementFieldType,
  TRequirementSelectOption,
} from "@plane/types";
import { CustomMenu, Sortable } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementBuiltinFieldSection } from "@/components/requirements/requirement-builtin-field-section";
import {
  getRequirementSelectMode,
  getRequirementSelectOptions,
  hasValidRequirementSelectOptions,
} from "@/components/requirements/requirement-select";

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
  fields: TRequirementFieldDraft[];
  onChange: (fields: TRequirementFieldDraft[]) => void;
  sidebarHeader?: React.ReactNode;
  compactLayout?: boolean;
  title?: string;
  description?: string;
};

type TFieldLibraryProps = {
  compact?: boolean;
  onDragStart: (type: TRequirementFieldType) => void;
  onDragEnd: () => void;
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
  children?: React.ReactNode;
};

type TFieldInlineFormProps = {
  field: TRequirementFieldDraft;
  isChild: boolean;
  /** 这个字段实际进不进标准库：子字段跟着所属表单。不进库的字段不允许设必填 */
  effectiveShowInLibrary: boolean;
  onChange: (field: TRequirementFieldDraft) => void;
  /** 还原成展开时的样子 */
  onCancel: () => void;
  /** 收起，改动已经在草稿里了 */
  onDone: () => void;
};

const ROOT_FIELD_TYPES: TRequirementFieldType[] = [
  "text",
  "rich_text",
  "member",
  "select",
  "boolean",
  "attachment",
  "image",
  "form",
];
const CHILD_FIELD_TYPES = ROOT_FIELD_TYPES.filter((type) => type !== "form");
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
    labelKey: "requirement_fields.builder.media_fields",
    types: ["attachment", "image"],
  },
  {
    labelKey: "requirement_fields.builder.structure_fields",
    types: ["form"],
  },
];

export const FIELD_ICONS = {
  text: Type,
  member: UserRound,
  select: ListChecks,
  form: FormInput,
  rich_text: AlignLeft,
  attachment: Paperclip,
  image: FileImage,
  boolean: ToggleLeft,
} satisfies Record<TRequirementFieldType, typeof Type>;

const FIELD_LIBRARY_DRAG_TYPE = "application/x-requirement-field-type";

const fieldKey = (field: TRequirementFieldDraft) => field.id ?? field.client_id ?? "";
const getMenuPortalElement = () => (typeof document === "undefined" ? null : document.body);

const createSelectOptions = (labels: string[]): TRequirementSelectOption[] =>
  labels.map((label) => ({ id: uuidv4(), label }));

const createField = (
  type: TRequirementFieldType,
  name: string,
  selectOptionLabels: string[]
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
    name: `${field.name}${suffix}`,
    config,
    default_value: field.field_type === "select" ? (getRequirementSelectMode(field) === "multiple" ? [] : null) : null,
    children: field.children.map((child) => duplicateField(child, suffix)),
  };
};

function FieldLibrary(props: TFieldLibraryProps) {
  const { compact = false, onDragStart, onDragEnd } = props;
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
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
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-subtle px-4 py-4">
        <h2 className="text-14 font-semibold text-primary">
          {t("requirement_fields.builder.field_library")}
        </h2>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("requirement_fields.builder.search_fields")}
            className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {FIELD_LIBRARY_GROUPS.map((group) => {
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
    </div>
  );
}

/** 与工作项属性行同款的状态胶囊 */
const StatusBadge = ({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning";
}) => (
  <span
    className={cn("inline-flex shrink-0 items-center rounded px-2 py-0.5 text-11 font-medium", {
      "border border-subtle bg-surface-2 text-secondary": tone === "neutral",
      "bg-success-subtle/35 text-success-primary": tone === "success",
      "bg-warning-subtle/60 text-warning-primary": tone === "warning",
    })}
  >
    {children}
  </span>
);

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
    children,
  } = props;
  const { t } = useTranslation();
  const isForm = field.field_type === "form" && !isChild;
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
          </button>
          <span className="shrink-0 text-xs text-secondary">{fieldTypeDescription}</span>
          <StatusBadge tone={field.is_active ? "success" : "neutral"}>
            {t(field.is_active ? "requirement_fields.builder.enabled_badge" : "requirement_fields.inactive")}
          </StatusBadge>
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
              <MenuRowLabel icon={Settings2} label={t("edit")} />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => onInsert("above")}>
              <MenuRowLabel icon={ArrowUpToLine} label={t("requirement_fields.fields.insert_above")} />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => onInsert("below")}>
              <MenuRowLabel icon={ArrowDownToLine} label={t("requirement_fields.fields.insert_below")} />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={onDuplicate}>
              <MenuRowLabel icon={Copy} label={t("requirement_fields.builder.duplicate_field")} />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={onRemove}>
              <MenuRowLabel
                icon={Trash2}
                label={t("requirement_fields.builder.delete_field")}
                tone="danger"
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
 * 字段的内联编辑表单：左栏是「这个字段是什么」（名称/说明/必填/启用），
 * 右栏是「怎么填」（类型、选项、占位符）。与工作项属性的内联表单同构。
 *
 * 改动直接写进草稿 —— 整页由顶部的「保存配置」统一提交，所以这里没有「更新」。
 * 「取消」还原到展开时的样子，「完成」只是收起。
 */
function FieldInlineForm(props: TFieldInlineFormProps) {
  const { field, isChild, effectiveShowInLibrary, onChange, onCancel, onDone } = props;
  const { t } = useTranslation();
  const availableTypes = isChild ? CHILD_FIELD_TYPES : ROOT_FIELD_TYPES;
  /*
   * 不进标准库的字段不能设必填 —— 标准库只按纳入库的字段校验，库条目天生不带它们，
   * 导入进来的行会卡在必填上再也存不动。后端在
   * RequirementFieldNodeWriteSerializer 里也拦一道，这里只是提前给出反馈。
   */
  const canBeRequired = effectiveShowInLibrary;
  const selectOptions = field.field_type === "select" ? getRequirementSelectOptions(field) : [];
  const hasValidSelectOptions = field.field_type !== "select" || hasValidRequirementSelectOptions(field);

  const defaultSelectOptionLabels = [
    t("requirement_fields.builder.default_option", { index: 1 }),
    t("requirement_fields.builder.default_option", { index: 2 }),
  ];

  /** 移出标准库时把必填一并摘掉，连同子字段 —— 子字段跟着所属表单走 */
  const toggleShowInLibrary = (next: boolean) => {
    onChange({
      ...field,
      show_in_library: next,
      ...(next
        ? {}
        : {
            is_required: false,
            children: field.children.map((child) => ({ ...child, is_required: false })),
          }),
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
          <label className={cn("flex items-center gap-2", isChild && "cursor-not-allowed text-disabled")}>
            <input
              type="checkbox"
              checked={effectiveShowInLibrary}
              disabled={isChild}
              onChange={(event) => toggleShowInLibrary(event.target.checked)}
              className="size-3.5 rounded border border-subtle accent-accent-primary disabled:cursor-not-allowed"
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={field.is_active}
              onChange={(event) => onChange({ ...field, is_active: event.target.checked })}
              className="size-3.5 rounded border border-subtle accent-accent-primary"
            />
            {t("requirement_fields.builder.enabled_title")}
          </label>
          {isChild && (
            <span className="basis-full text-11 leading-4 text-tertiary">
              {t("requirement_fields.builder.library_inherited_hint")}
            </span>
          )}
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
                <div className="mt-2 grid grid-cols-2 rounded-md border border-subtle bg-surface-1 p-0.5">
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
                            ? "bg-layer-2 text-primary shadow-sm"
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
                <button
                  type="button"
                  onClick={addSelectOption}
                  className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-11 font-medium text-accent-primary transition-colors hover:border-accent-subtle hover:bg-accent-subtle"
                >
                  <Plus className="size-3.5" />
                  {t("requirement_fields.builder.add_option")}
                </button>
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
              disabled={field.field_type === "form"}
              className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none disabled:cursor-not-allowed disabled:bg-layer-1 disabled:text-tertiary"
              placeholder={t("requirement_fields.builder.placeholder_example")}
            />
          </label>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-subtle pt-3">
          <Button variant="neutral-primary" size="sm" onClick={onCancel}>
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
  const { fields, onChange, sidebarHeader, compactLayout = false, title, description } = props;
  const { t } = useTranslation();
  // selection = 当前原地展开成表单的那个字段，同时只能有一个
  const [selection, setSelection] = useState<TFieldSelection | null>(null);
  // 展开那一刻的字段快照，「取消」还原用；isNew 的字段直接撤销掉这次新增
  const [editSnapshot, setEditSnapshot] = useState<{ field: TRequirementFieldDraft; isNew: boolean } | null>(null);
  const [draggedLibraryFieldType, setDraggedLibraryFieldType] = useState<TRequirementFieldType | null>(null);
  const [dropTarget, setDropTarget] = useState<TFieldDropTarget | null>(null);

  const selectedRoot = selection ? fields.find((field) => fieldKey(field) === selection.rootKey) : undefined;
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
      fields.map((field) => {
        if (fieldKey(field) !== target.rootKey) return field;
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

  const renderFieldEditor = (target: TFieldSelection, field: TRequirementFieldDraft) => {
    // 子字段跟着所属表单走，「能不能设必填」也就得看根字段进不进标准库
    const root = fields.find((item) => fieldKey(item) === target.rootKey);
    const effectiveShowInLibrary = target.childKey ? (root?.show_in_library ?? true) : field.show_in_library;
    return (
      <FieldInlineForm
        field={field}
        isChild={Boolean(target.childKey)}
        effectiveShowInLibrary={effectiveShowInLibrary}
        onChange={updateSelectedField}
        onCancel={cancelEditing}
        onDone={closeEditor}
      />
    );
  };

  const insertRootField = (index: number, type: TRequirementFieldType) => {
    const nextField = createField(
      type,
      t(`requirement_fields.field_types.${type}`),
      defaultSelectOptionLabels
    );
    const nextFields = [...fields];
    nextFields.splice(index, 0, nextField);
    onChange(nextFields);
    openEditor({ rootKey: fieldKey(nextField) }, nextField, true);
  };

  const insertChildField = (rootKey: string, index: number, type: TRequirementFieldType) => {
    const nextField = createField(
      type,
      t(`requirement_fields.field_types.${type}`),
      defaultSelectOptionLabels
    );
    onChange(
      fields.map((field) => {
        if (fieldKey(field) !== rootKey) return field;
        const children = [...field.children];
        children.splice(index, 0, nextField);
        return { ...field, children };
      })
    );
    openEditor({ rootKey, childKey: fieldKey(nextField) }, nextField, true);
  };

  const resetLibraryDrag = () => {
    setDraggedLibraryFieldType(null);
    setDropTarget(null);
  };

  const handleChildFieldDragOver = (event: React.DragEvent<HTMLDivElement>, rootKey: string) => {
    if (!event.dataTransfer.types.includes(FIELD_LIBRARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    if (draggedLibraryFieldType && isChildFieldType(draggedLibraryFieldType)) {
      event.dataTransfer.dropEffect = "copy";
      setDropTarget({ kind: "child", rootKey });
      return;
    }
    event.dataTransfer.dropEffect = "none";
    setDropTarget({ kind: "invalid-child", rootKey });
  };

  const handleChildFieldDrop = (event: React.DragEvent<HTMLDivElement>, rootKey: string, childCount: number) => {
    if (!event.dataTransfer.types.includes(FIELD_LIBRARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    const fieldType = event.dataTransfer.getData(FIELD_LIBRARY_DRAG_TYPE) as TRequirementFieldType;
    if (isChildFieldType(fieldType)) insertChildField(rootKey, childCount, fieldType);
    resetLibraryDrag();
  };

  const duplicateSelection = (targetSelection = selection) => {
    if (!targetSelection) return;
    const rootIndex = fields.findIndex((field) => fieldKey(field) === targetSelection.rootKey);
    if (rootIndex === -1) return;
    const root = fields[rootIndex];
    if (!targetSelection.childKey) {
      const duplicate = duplicateField(root, t("requirement_fields.builder.copy_suffix"));
      const nextFields = [...fields];
      nextFields.splice(rootIndex + 1, 0, duplicate);
      onChange(nextFields);
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
    onChange(
      fields.map((field) =>
        fieldKey(field) === targetSelection.rootKey ? { ...field, children: nextChildren } : field
      )
    );
    openEditor({ rootKey: targetSelection.rootKey, childKey: fieldKey(duplicate) }, duplicate, true);
  };

  const removeSelection = (targetSelection = selection) => {
    if (!targetSelection) return;
    const rootIndex = fields.findIndex((field) => fieldKey(field) === targetSelection.rootKey);
    if (rootIndex === -1) return;
    const root = fields[rootIndex];
    if (targetSelection.childKey) {
      const nextChildren = root.children.filter((field) => fieldKey(field) !== targetSelection.childKey);
      onChange(
        fields.map((field) =>
          fieldKey(field) === targetSelection.rootKey ? { ...field, children: nextChildren } : field
        )
      );
      closeEditor();
      return;
    }
    onChange(fields.filter((field) => fieldKey(field) !== targetSelection.rootKey));
    closeEditor();
  };

  const renderRootField = (field: TRequirementFieldDraft, rootIndex: number) => {
    const rootKey = fieldKey(field);
    const isEditing = selection?.rootKey === rootKey && !selection.childKey;
    const hasSelectedChild = selection?.rootKey === rootKey && Boolean(selection.childKey);
    const isChildDropTarget = dropTarget?.kind === "child" && dropTarget.rootKey === rootKey;
    const isInvalidChildDropTarget = dropTarget?.kind === "invalid-child" && dropTarget.rootKey === rootKey;
    return (
      <div
        onDragOver={(event) => {
          if (field.field_type === "form") handleChildFieldDragOver(event, rootKey);
        }}
        onDrop={(event) => {
          if (field.field_type === "form") handleChildFieldDrop(event, rootKey, field.children.length);
        }}
      >
        <RequirementFieldRow
          field={field}
          isEditing={isEditing}
          editor={isEditing ? renderFieldEditor({ rootKey }, field) : undefined}
          hasSelectedChild={hasSelectedChild}
          isDropTarget={isChildDropTarget}
          isInvalidDropTarget={isInvalidChildDropTarget}
          onSelect={() => openEditor({ rootKey }, field)}
          onInsert={(position) => insertRootField(rootIndex + (position === "below" ? 1 : 0), "text")}
          onDuplicate={() => duplicateSelection({ rootKey })}
          onRemove={() => removeSelection({ rootKey })}
        >
          <div
            className={cn("border-t border-subtle bg-layer-1/50 px-3", compactLayout ? "py-2 sm:pl-7" : "py-3 sm:pl-9")}
          >
            {isInvalidChildDropTarget && (
              <div className="mb-2 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-11 text-danger-primary">
                {t("requirement_fields.builder.nested_form_not_supported")}
              </div>
            )}
            {field.children.length > 0 && (
              <Sortable
                id={`requirement-form-${rootKey}`}
                data={field.children}
                keyExtractor={fieldKey}
                containerClassName="mb-2 last:mb-0"
                onChange={(children) =>
                  onChange(fields.map((item) => (fieldKey(item) === rootKey ? { ...item, children } : item)))
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
                      onSelect={() => openEditor({ rootKey, childKey }, child)}
                      onInsert={(position) =>
                        insertChildField(rootKey, childIndex + (position === "below" ? 1 : 0), "text")
                      }
                      onDuplicate={() => duplicateSelection({ rootKey, childKey })}
                      onRemove={() => removeSelection({ rootKey, childKey })}
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
                      "mt-0": field.children.length === 0,
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
                    onClick={() => insertChildField(rootKey, field.children.length, type)}
                  >
                    <MenuRowLabel icon={Icon} label={t(`requirement_fields.field_types.${type}`)} />
                  </CustomMenu.MenuItem>
                );
              })}
            </CustomMenu>
          </div>
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
          <CustomMenu.MenuItem key={type} onClick={() => insertRootField(fields.length, type)}>
            <MenuRowLabel icon={Icon} label={t(`requirement_fields.field_types.${type}`)} />
          </CustomMenu.MenuItem>
        );
      })}
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
                {fields.length}
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
            if (!event.dataTransfer.types.includes(FIELD_LIBRARY_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropTarget({ kind: "root" });
          }}
          onDrop={(event) => {
            const fieldType = event.dataTransfer.getData(FIELD_LIBRARY_DRAG_TYPE) as TRequirementFieldType;
            if (!ROOT_FIELD_TYPES.includes(fieldType)) return;
            event.preventDefault();
            insertRootField(fields.length, fieldType);
            resetLibraryDrag();
          }}
        >
          <div className={cn("mx-auto w-full", compactLayout ? "max-w-3xl" : "max-w-4xl")}>
            {/* 内置列排在自定义字段之前，与网格的列序一致 */}
            <RequirementBuiltinFieldSection />
            {fields.length === 0 ? (
              <div
                className={cn(
                  "flex min-h-80 items-center justify-center rounded-lg border border-dashed bg-surface-1 px-6 text-center transition-colors",
                  dropTarget?.kind === "root" ? "border-accent-strong bg-accent-subtle/20" : "border-subtle"
                )}
              >
                <div>
                  <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                    <Plus className="size-5" />
                  </span>
                  <p className="mt-3 text-13 font-medium text-primary">
                    {t("requirement_fields.fields.empty")}
                  </p>
                  <p className="mt-1 text-11 leading-4 text-secondary">
                    {t("requirement_fields.builder.empty_description")}
                  </p>
                  <div className="mt-4 inline-flex xl:hidden">{libraryMenu}</div>
                </div>
              </div>
            ) : (
              <Sortable
                id="requirement-root-fields"
                data={fields}
                keyExtractor={fieldKey}
                containerClassName="mb-3 last:mb-0"
                onChange={onChange}
                render={renderRootField}
              />
            )}
            {draggedLibraryFieldType && fields.length > 0 && (
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
    </div>
  );
}

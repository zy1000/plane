import { useEffect, useRef, useState } from "react";
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
  PanelRightOpen,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ToggleLeft,
  Trash2,
  Type,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementFieldDraft, TRequirementFieldType, TRequirementSelectOption } from "@plane/types";
import { CustomMenu, Sortable, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  getRequirementSelectMode,
  getRequirementSelectOptions,
  hasValidRequirementSelectOptions,
} from "./requirement-select";

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
};

type TFieldLibraryProps = {
  onAdd: (type: TRequirementFieldType) => void;
  onDragStart: (type: TRequirementFieldType) => void;
  onDragEnd: () => void;
};

type TFieldRowProps = {
  field: TRequirementFieldDraft;
  isSelected: boolean;
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

type TFieldInspectorProps = {
  field: TRequirementFieldDraft | undefined;
  isChild: boolean;
  showClose?: boolean;
  onClose?: () => void;
  onChange: (field: TRequirementFieldDraft) => void;
  onDuplicate: () => void;
  onRemove: () => void;
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
    labelKey: "workspace_templates.requirements.editor.builder.basic_fields",
    types: ["text", "rich_text", "member", "select", "boolean"],
  },
  {
    labelKey: "workspace_templates.requirements.editor.builder.media_fields",
    types: ["attachment", "image"],
  },
  {
    labelKey: "workspace_templates.requirements.editor.builder.structure_fields",
    types: ["form"],
  },
];

const FIELD_ICONS = {
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
  const { onAdd, onDragStart, onDragEnd } = props;
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const draggedFieldTypeRef = useRef<TRequirementFieldType | null>(null);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-subtle px-4 py-4">
        <h2 className="text-14 font-semibold text-primary">
          {t("workspace_templates.requirements.editor.builder.field_library")}
        </h2>
        <p className="mt-1 text-11 leading-4 text-secondary">
          {t("workspace_templates.requirements.editor.builder.field_library_description")}
        </p>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("workspace_templates.requirements.editor.builder.search_fields")}
            className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {FIELD_LIBRARY_GROUPS.map((group) => {
          const types = group.types.filter((type) =>
            t(`workspace_templates.requirements.field_types.${type}`).toLocaleLowerCase().includes(normalizedSearch)
          );
          if (types.length === 0) return null;
          return (
            <section key={group.labelKey} className="mb-5 last:mb-0">
              <h3 className="mb-2 px-1 text-11 font-medium text-secondary">{t(group.labelKey)}</h3>
              <div className="space-y-1.5">
                {types.map((type) => {
                  const Icon = FIELD_ICONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        draggedFieldTypeRef.current = type;
                        onDragStart(type);
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(FIELD_LIBRARY_DRAG_TYPE, type);
                      }}
                      onDragEnd={() => {
                        onDragEnd();
                        window.setTimeout(() => {
                          draggedFieldTypeRef.current = null;
                        }, 0);
                      }}
                      onClick={() => {
                        if (draggedFieldTypeRef.current === type) return;
                        onAdd(type);
                      }}
                      className="group flex h-10 w-full cursor-grab items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 text-left transition-colors duration-150 hover:border-strong hover:bg-layer-transparent-hover active:cursor-grabbing"
                    >
                      <GripVertical className="size-3.5 shrink-0 text-placeholder group-hover:text-tertiary" />
                      <span className="grid size-6 shrink-0 place-items-center rounded border border-subtle bg-layer-1 text-secondary">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="truncate text-12 font-medium text-primary">
                        {t(`workspace_templates.requirements.field_types.${type}`)}
                      </span>
                      <Plus className="ml-auto size-3.5 shrink-0 text-placeholder opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
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

function FieldStateBadges({ field, isSelected }: { field: TRequirementFieldDraft; isSelected: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {field.is_required && (
        <span className="rounded bg-danger-subtle px-1.5 py-0.5 text-10 font-medium text-danger-primary">
          {t("workspace_templates.requirements.fields.required")}
        </span>
      )}
      <span
        className={cn(
          "hidden rounded px-1.5 py-0.5 text-10 font-medium sm:inline",
          field.is_active ? "bg-success-subtle text-success-primary" : "bg-layer-2 text-secondary"
        )}
      >
        {t(
          field.is_active
            ? "workspace_templates.requirements.editor.builder.enabled_badge"
            : "workspace_templates.requirements.inactive"
        )}
      </span>
      {isSelected && (
        <span className="hidden rounded bg-accent-subtle px-1.5 py-0.5 text-10 font-medium text-accent-primary 2xl:inline">
          {t("workspace_templates.requirements.editor.builder.configuring")}
        </span>
      )}
    </div>
  );
}

function RequirementFieldRow(props: TFieldRowProps) {
  const {
    field,
    isSelected,
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
  const Icon = FIELD_ICONS[field.field_type];
  const isForm = field.field_type === "form" && !isChild;
  const fieldTypeDescription =
    field.field_type === "select"
      ? t("workspace_templates.requirements.editor.builder.selector_summary", {
          mode: t(
            `workspace_templates.requirements.editor.builder.${
              getRequirementSelectMode(field) === "multiple" ? "multiple_select" : "single_select"
            }`
          ),
          count: getRequirementSelectOptions(field).length,
        })
      : t(`workspace_templates.requirements.field_types.${field.field_type}`);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-surface-1 transition-colors duration-150",
        isInvalidDropTarget
          ? "border-danger-strong bg-danger-subtle/20"
          : isDropTarget
            ? "border-accent-strong bg-accent-subtle/30"
            : isSelected
              ? "border-accent-strong bg-accent-subtle/20"
              : hasSelectedChild
                ? "border-accent-subtle"
                : "border-subtle hover:border-strong"
      )}
    >
      <div className={cn("flex min-h-14 items-center gap-2 px-3", { "min-h-12 rounded-md": isChild })}>
        <GripVertical className="size-4 shrink-0 cursor-grab text-placeholder active:cursor-grabbing" />
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md border border-subtle bg-layer-1 text-secondary",
              { "border-accent-subtle bg-surface-1 text-accent-primary": isSelected }
            )}
          >
            <Icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-13 font-medium text-primary">
              {field.name || t("workspace_templates.requirements.fields.untitled")}
            </span>
            <span className="mt-0.5 block truncate text-11 text-secondary">{fieldTypeDescription}</span>
          </span>
        </button>
        <FieldStateBadges field={field} isSelected={isSelected} />
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip tooltipContent={t("workspace_templates.requirements.editor.builder.duplicate_field")}>
            <button
              type="button"
              onClick={onDuplicate}
              className="grid size-7 place-items-center rounded-md text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-layer-2 hover:text-primary focus:opacity-100"
              aria-label={t("workspace_templates.requirements.editor.builder.duplicate_field")}
            >
              <Copy className="size-3.5" />
            </button>
          </Tooltip>
          <CustomMenu
            customButton={
              <button
                type="button"
                className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-2 hover:text-primary"
                aria-label={t("workspace_templates.requirements.fields.actions")}
              >
                <MoreHorizontal className="size-4" />
              </button>
            }
            placement="bottom-end"
            portalElement={getMenuPortalElement()}
          >
            <CustomMenu.MenuItem onClick={() => onInsert("above")}>
              <MenuRowLabel
                icon={ArrowUpToLine}
                label={t("workspace_templates.requirements.fields.insert_above")}
              />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => onInsert("below")}>
              <MenuRowLabel
                icon={ArrowDownToLine}
                label={t("workspace_templates.requirements.fields.insert_below")}
              />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={onDuplicate}>
              <MenuRowLabel
                icon={Copy}
                label={t("workspace_templates.requirements.editor.builder.duplicate_field")}
              />
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={onRemove}>
              <MenuRowLabel
                icon={Trash2}
                label={t("workspace_templates.requirements.editor.builder.delete_field")}
                tone="danger"
              />
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
      </div>
      {isForm && children}
    </div>
  );
}

function FieldInspector(props: TFieldInspectorProps) {
  const { field, isChild, showClose = false, onClose, onChange, onDuplicate, onRemove } = props;
  const { t } = useTranslation();
  const availableTypes = isChild ? CHILD_FIELD_TYPES : ROOT_FIELD_TYPES;
  const selectOptions = field?.field_type === "select" ? getRequirementSelectOptions(field) : [];
  const hasValidSelectOptions = field?.field_type !== "select" || hasValidRequirementSelectOptions(field);

  const defaultSelectOptionLabels = [
    t("workspace_templates.requirements.editor.builder.default_option", { index: 1 }),
    t("workspace_templates.requirements.editor.builder.default_option", { index: 2 }),
  ];

  const updateType = (fieldType: TRequirementFieldType) => {
    if (!field) return;
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
    if (!field || field.field_type !== "select") return;
    onChange({
      ...field,
      config: {
        ...field.config,
        options,
      },
    });
  };

  const addSelectOption = () => {
    if (!field || field.field_type !== "select") return;
    const existingLabels = new Set(selectOptions.map((option) => option.label.trim().toLocaleLowerCase()));
    let index = selectOptions.length + 1;
    let label = t("workspace_templates.requirements.editor.builder.default_option", { index });
    while (existingLabels.has(label.toLocaleLowerCase())) {
      index += 1;
      label = t("workspace_templates.requirements.editor.builder.default_option", { index });
    }
    updateSelectOptions([...selectOptions, { id: uuidv4(), label }]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-subtle px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Settings2 className="size-4 shrink-0 text-secondary" />
          <h2 className="truncate text-14 font-semibold text-primary">
            {t("workspace_templates.requirements.editor.builder.field_settings")}
          </h2>
        </div>
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label={t("close")}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {!field ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <span className="mx-auto grid size-10 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <Settings2 className="size-4" />
            </span>
            <p className="mt-3 text-13 font-medium text-primary">
              {t("workspace_templates.requirements.editor.builder.no_field_selected")}
            </p>
            <p className="mt-1 text-11 leading-4 text-secondary">
              {t("workspace_templates.requirements.editor.builder.no_field_selected_description")}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <label className="block">
              <span className="mb-1.5 block text-12 font-medium text-secondary">
                {t("workspace_templates.requirements.editor.builder.field_name")}
              </span>
              <input
                value={field.name}
                onChange={(event) => onChange({ ...field, name: event.target.value })}
                className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none"
                placeholder={t("workspace_templates.requirements.fields.field_name_placeholder")}
              />
            </label>
            <label className="relative block">
              <span className="mb-1.5 block text-12 font-medium text-secondary">
                {t("workspace_templates.requirements.editor.builder.field_type")}
              </span>
              <select
                value={field.field_type}
                onChange={(event) => updateType(event.target.value as TRequirementFieldType)}
                className="focus:border-accent-primary h-9 w-full appearance-none rounded-md border border-subtle bg-surface-1 pr-8 pl-3 text-12 text-primary outline-none"
              >
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`workspace_templates.requirements.field_types.${type}`)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 bottom-3 size-3 -translate-y-px text-placeholder" />
            </label>
            {field.field_type === "select" && (
              <section className="overflow-hidden rounded-lg border border-subtle bg-layer-1/40">
                <div className="border-b border-subtle px-3 py-3">
                  <p className="text-12 font-medium text-primary">
                    {t("workspace_templates.requirements.editor.builder.selection_mode")}
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
                            `workspace_templates.requirements.editor.builder.${
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
                        {t("workspace_templates.requirements.editor.builder.selector_options")}
                      </p>
                      <p className="mt-0.5 text-10 text-secondary">
                        {t("workspace_templates.requirements.editor.builder.selector_options_description")}
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
                          aria-label={t("workspace_templates.requirements.editor.builder.option_label", {
                            index: index + 1,
                          })}
                        />
                        <button
                          type="button"
                          disabled={selectOptions.length <= 1}
                          onClick={() => updateSelectOptions(selectOptions.filter((item) => item.id !== option.id))}
                          className="grid size-7 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger-primary focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                          aria-label={t("workspace_templates.requirements.editor.builder.delete_option")}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  />
                  {!hasValidSelectOptions && (
                    <p className="mt-2 text-10 leading-4 text-danger-primary">
                      {t("workspace_templates.requirements.validation.selector_options")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={addSelectOption}
                    className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-subtle text-11 font-medium text-accent-primary transition-colors hover:border-accent-subtle hover:bg-accent-subtle"
                  >
                    <Plus className="size-3.5" />
                    {t("workspace_templates.requirements.editor.builder.add_option")}
                  </button>
                </div>
              </section>
            )}
            <label className="block">
              <span className="mb-1.5 block text-12 font-medium text-secondary">
                {t("workspace_templates.requirements.fields.placeholder")}
              </span>
              <input
                value={String(field.config.placeholder ?? "")}
                onChange={(event) =>
                  onChange({ ...field, config: { ...field.config, placeholder: event.target.value } })
                }
                disabled={field.field_type === "form"}
                className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none disabled:cursor-not-allowed disabled:bg-layer-1 disabled:text-tertiary"
                placeholder={t("workspace_templates.requirements.editor.builder.placeholder_example")}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-12 font-medium text-secondary">
                {t("workspace_templates.requirements.fields.description")}
              </span>
              <textarea
                value={String(field.config.description ?? "")}
                onChange={(event) =>
                  onChange({ ...field, config: { ...field.config, description: event.target.value } })
                }
                rows={4}
                className="focus:border-accent-primary w-full resize-y rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 leading-5 text-primary outline-none"
                placeholder={t("workspace_templates.requirements.editor.builder.description_example")}
              />
            </label>
            <div className="divide-y divide-subtle rounded-lg border border-subtle">
              <div className="flex items-center justify-between gap-4 px-3 py-3">
                <div>
                  <p className="text-12 font-medium text-primary">
                    {t("workspace_templates.requirements.editor.builder.required_title")}
                  </p>
                  <p className="mt-0.5 text-10 leading-4 text-secondary">
                    {t("workspace_templates.requirements.editor.builder.required_description")}
                  </p>
                </div>
                <ToggleSwitch
                  value={field.is_required}
                  onChange={(value) => onChange({ ...field, is_required: value })}
                  size="sm"
                  label={t("workspace_templates.requirements.editor.builder.required_title")}
                />
              </div>
              <div className="flex items-center justify-between gap-4 px-3 py-3">
                <div>
                  <p className="text-12 font-medium text-primary">
                    {t("workspace_templates.requirements.editor.builder.enabled_title")}
                  </p>
                  <p className="mt-0.5 text-10 leading-4 text-secondary">
                    {t("workspace_templates.requirements.editor.builder.enabled_description")}
                  </p>
                </div>
                <ToggleSwitch
                  value={field.is_active}
                  onChange={(value) => onChange({ ...field, is_active: value })}
                  size="sm"
                  label={t("workspace_templates.requirements.editor.builder.enabled_title")}
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-subtle px-4 py-3">
            <Button variant="secondary" onClick={onDuplicate}>
              <Copy className="size-3.5" />
              {t("workspace_templates.requirements.editor.builder.duplicate_field")}
            </Button>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-12 font-medium text-danger-primary hover:bg-danger-subtle"
            >
              <Trash2 className="size-3.5" />
              {t("workspace_templates.requirements.editor.builder.delete_field")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function RequirementFieldBuilder(props: TRequirementFieldBuilderProps) {
  const { fields, onChange } = props;
  const { t } = useTranslation();
  const [selection, setSelection] = useState<TFieldSelection | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [draggedLibraryFieldType, setDraggedLibraryFieldType] = useState<TRequirementFieldType | null>(null);
  const [dropTarget, setDropTarget] = useState<TFieldDropTarget | null>(null);

  const selectedRoot = selection ? fields.find((field) => fieldKey(field) === selection.rootKey) : undefined;
  const selectedField =
    selectedRoot && selection?.childKey
      ? selectedRoot.children.find((field) => fieldKey(field) === selection.childKey)
      : selectedRoot;
  const defaultSelectOptionLabels = [
    t("workspace_templates.requirements.editor.builder.default_option", { index: 1 }),
    t("workspace_templates.requirements.editor.builder.default_option", { index: 2 }),
  ];

  useEffect(() => {
    if (fields.length === 0) {
      setSelection(null);
      return;
    }
    if (!selectedField) setSelection({ rootKey: fieldKey(fields[0]) });
  }, [fields, selectedField]);

  const updateSelectedField = (nextField: TRequirementFieldDraft) => {
    if (!selection) return;
    onChange(
      fields.map((field) => {
        if (fieldKey(field) !== selection.rootKey) return field;
        if (!selection.childKey) return nextField;
        return {
          ...field,
          children: field.children.map((child) => (fieldKey(child) === selection.childKey ? nextField : child)),
        };
      })
    );
  };

  const insertRootField = (index: number, type: TRequirementFieldType) => {
    const nextField = createField(
      type,
      t(`workspace_templates.requirements.field_types.${type}`),
      defaultSelectOptionLabels
    );
    const nextFields = [...fields];
    nextFields.splice(index, 0, nextField);
    onChange(nextFields);
    setSelection({ rootKey: fieldKey(nextField) });
  };

  const insertChildField = (rootKey: string, index: number, type: TRequirementFieldType) => {
    const nextField = createField(
      type,
      t(`workspace_templates.requirements.field_types.${type}`),
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
    setSelection({ rootKey, childKey: fieldKey(nextField) });
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
      const duplicate = duplicateField(root, t("workspace_templates.requirements.editor.builder.copy_suffix"));
      const nextFields = [...fields];
      nextFields.splice(rootIndex + 1, 0, duplicate);
      onChange(nextFields);
      setSelection({ rootKey: fieldKey(duplicate) });
      return;
    }
    const childIndex = root.children.findIndex((field) => fieldKey(field) === targetSelection.childKey);
    if (childIndex === -1) return;
    const duplicate = duplicateField(
      root.children[childIndex],
      t("workspace_templates.requirements.editor.builder.copy_suffix")
    );
    const nextChildren = [...root.children];
    nextChildren.splice(childIndex + 1, 0, duplicate);
    onChange(
      fields.map((field) =>
        fieldKey(field) === targetSelection.rootKey ? { ...field, children: nextChildren } : field
      )
    );
    setSelection({ rootKey: targetSelection.rootKey, childKey: fieldKey(duplicate) });
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
      setSelection({ rootKey: targetSelection.rootKey });
      return;
    }
    const nextFields = fields.filter((field) => fieldKey(field) !== targetSelection.rootKey);
    onChange(nextFields);
    const nextSelectedField = nextFields[Math.min(rootIndex, Math.max(nextFields.length - 1, 0))];
    setSelection(nextSelectedField ? { rootKey: fieldKey(nextSelectedField) } : null);
  };

  const renderRootField = (field: TRequirementFieldDraft, rootIndex: number) => {
    const rootKey = fieldKey(field);
    const isSelected = selection?.rootKey === rootKey && !selection.childKey;
    const hasSelectedChild = selection?.rootKey === rootKey && Boolean(selection.childKey);
    const isChildDropTarget = dropTarget?.kind === "child" && dropTarget.rootKey === rootKey;
    const isInvalidChildDropTarget = dropTarget?.kind === "invalid-child" && dropTarget.rootKey === rootKey;
    return (
      <div
        className="group"
        onDragOver={(event) => {
          if (field.field_type === "form") handleChildFieldDragOver(event, rootKey);
        }}
        onDrop={(event) => {
          if (field.field_type === "form") handleChildFieldDrop(event, rootKey, field.children.length);
        }}
      >
        <RequirementFieldRow
          field={field}
          isSelected={isSelected}
          hasSelectedChild={hasSelectedChild}
          isDropTarget={isChildDropTarget}
          isInvalidDropTarget={isInvalidChildDropTarget}
          onSelect={() => {
            setSelection({ rootKey });
            setIsInspectorOpen(true);
          }}
          onInsert={(position) => insertRootField(rootIndex + (position === "below" ? 1 : 0), "text")}
          onDuplicate={() => duplicateSelection({ rootKey })}
          onRemove={() => removeSelection({ rootKey })}
        >
          <div className="border-t border-subtle bg-layer-1/50 px-3 py-3 sm:pl-9">
            {isInvalidChildDropTarget && (
              <div className="mb-2 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-11 text-danger-primary">
                {t("workspace_templates.requirements.editor.builder.nested_form_not_supported")}
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
                  return (
                    <div className="group">
                      <RequirementFieldRow
                        field={child}
                        isChild
                        isSelected={selection?.rootKey === rootKey && selection.childKey === childKey}
                        onSelect={() => {
                          setSelection({ rootKey, childKey });
                          setIsInspectorOpen(true);
                        }}
                        onInsert={(position) =>
                          insertChildField(rootKey, childIndex + (position === "below" ? 1 : 0), "text")
                        }
                        onDuplicate={() => duplicateSelection({ rootKey, childKey })}
                        onRemove={() => removeSelection({ rootKey, childKey })}
                      />
                    </div>
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
                      ? "workspace_templates.requirements.editor.builder.child_drop_hint"
                      : "workspace_templates.requirements.fields.add_child"
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
                    <MenuRowLabel
                      icon={Icon}
                      label={t(`workspace_templates.requirements.field_types.${type}`)}
                    />
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
          {t("workspace_templates.requirements.fields.add")}
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
            <MenuRowLabel icon={Icon} label={t(`workspace_templates.requirements.field_types.${type}`)} />
          </CustomMenu.MenuItem>
        );
      })}
    </CustomMenu>
  );

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-surface-1">
      <aside className="hidden w-60 shrink-0 border-r border-subtle bg-surface-1 xl:block">
        <FieldLibrary
          onAdd={(type) => insertRootField(fields.length, type)}
          onDragStart={(type) => {
            setDraggedLibraryFieldType(type);
            setDropTarget(null);
          }}
          onDragEnd={resetLibraryDrag}
        />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col bg-layer-1/40">
        <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-subtle bg-surface-1 px-4 py-3 2xl:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-14 font-semibold text-primary">
                {t("workspace_templates.requirements.editor.builder.field_structure")}
              </h1>
              <span className="rounded bg-layer-2 px-1.5 py-0.5 text-10 font-medium text-secondary">
                {fields.length}
              </span>
            </div>
            <p className="mt-0.5 truncate text-11 text-secondary">
              {t("workspace_templates.requirements.editor.builder.field_structure_description")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="xl:hidden">{libraryMenu}</div>
            <Button
              variant="secondary"
              className="lg:hidden"
              onClick={() => setIsInspectorOpen(true)}
              disabled={!selectedField}
            >
              <PanelRightOpen className="size-3.5" />
              {t("workspace_templates.requirements.editor.builder.field_settings")}
            </Button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 2xl:px-7 2xl:py-6"
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
          <div className="mx-auto w-full max-w-4xl">
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
                    {t("workspace_templates.requirements.fields.empty")}
                  </p>
                  <p className="mt-1 text-11 leading-4 text-secondary">
                    {t("workspace_templates.requirements.editor.builder.empty_description")}
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
                {t("workspace_templates.requirements.editor.builder.root_drop_hint")}
              </div>
            )}
          </div>
        </div>
      </main>
      <aside className="hidden w-80 shrink-0 border-l border-subtle bg-surface-1 lg:block 2xl:w-[340px]">
        <FieldInspector
          field={selectedField}
          isChild={Boolean(selection?.childKey)}
          onChange={updateSelectedField}
          onDuplicate={() => duplicateSelection()}
          onRemove={() => removeSelection()}
        />
      </aside>
      {isInspectorOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-backdrop"
            onClick={() => setIsInspectorOpen(false)}
            aria-label={t("close")}
          />
          <aside className="absolute inset-y-0 right-0 w-full max-w-sm border-l border-subtle bg-surface-1 shadow-raised-300">
            <FieldInspector
              field={selectedField}
              isChild={Boolean(selection?.childKey)}
              showClose
              onClose={() => setIsInspectorOpen(false)}
              onChange={updateSelectedField}
              onDuplicate={() => duplicateSelection()}
              onRemove={() => {
                removeSelection();
                setIsInspectorOpen(false);
              }}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

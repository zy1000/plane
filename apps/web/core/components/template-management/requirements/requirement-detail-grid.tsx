import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  File,
  Filter,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirementAssetRef,
  TRequirementDetail,
  TRequirementDetailBatchSavePayload,
  TRequirementDetailBatchSaveResponse,
  TRequirementDetailData,
  TRequirementDetailFilter,
  TRequirementDetailValue,
  TRequirementField,
  TRequirementFormRow,
} from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Avatar, CustomMenu, CustomSelect, Loader, MultiSelectDropdown, ToggleSwitch } from "@plane/ui";
import type { TDropdownOption } from "@plane/ui";
import { getFileURL, stripAndTruncateHTML } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useMember } from "@/hooks/store/use-member";
import { getRequirementSelectLabel, getRequirementSelectMode, getRequirementSelectOptions } from "./requirement-select";
import {
  createEmptyRequirementDetailData,
  type TRequirementDetailDraftRow,
  useRequirementDetailGridEditor,
} from "./use-requirement-detail-grid-editor";
const SKELETON_ROW_KEYS = ["one", "two", "three", "four", "five", "six", "seven"];

type TProps = {
  workspaceSlug: string;
  templateId: string;
  expectedUpdatedAt?: string;
  fields: TRequirementField[];
  details: TRequirementDetail[];
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
  filters: TRequirementDetailFilter[];
  perPage: number;
  onSearchChange: (value: string) => void;
  onFiltersChange: (value: TRequirementDetailFilter[]) => void;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
  onRefresh: () => Promise<unknown>;
  onBulkSave: (payload: TRequirementDetailBatchSavePayload) => Promise<TRequirementDetailBatchSaveResponse>;
  onEditingChange?: (isEditing: boolean) => void;
};

const getFormRows = (data: TRequirementDetailData, fieldId: string): TRequirementFormRow[] => {
  const value = data[fieldId];
  return Array.isArray(value) ? (value as TRequirementFormRow[]) : [];
};

const getGroupHeight = (data: TRequirementDetailData, formFields: TRequirementField[]) =>
  Math.max(1, ...formFields.map((field) => getFormRows(data, field.id).length));

const getDetailRowKey = (
  detailKey: string,
  data: TRequirementDetailData,
  formFields: TRequirementField[],
  rowPosition: number
) =>
  `${detailKey}-${
    formFields
      .map((form) => getFormRows(data, form.id)[rowPosition]?.id)
      .filter(Boolean)
      .join("-") || "root"
  }`;

const RequirementMemberValue = observer(function RequirementMemberValue({ value }: { value: unknown }) {
  const { getUserDetails } = useMember();
  if (typeof value !== "string") return <span className="text-placeholder">—</span>;
  const member = getUserDetails(value);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <Avatar
        size="sm"
        name={member?.display_name ?? value}
        src={getFileURL(member?.avatar_url ?? "")}
        showTooltip={false}
      />
      <span className="max-w-28 truncate text-12 text-primary">{member?.display_name ?? value}</span>
    </span>
  );
});

const LeafValue = ({
  field,
  value,
  workspaceSlug,
}: {
  field: TRequirementField;
  value: TRequirementDetailValue | undefined;
  workspaceSlug: string;
}) => {
  const { t } = useTranslation();
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length))
    return <span className="text-placeholder">—</span>;
  if (field.field_type === "boolean") {
    return (
      <span
        className={
          value
            ? "inline-flex rounded-md bg-success-subtle px-2 py-0.5 text-11 text-success-primary"
            : "inline-flex rounded-md bg-layer-2 px-2 py-0.5 text-11 text-secondary"
        }
      >
        {t(value ? "workspace_templates.requirements.data.yes" : "workspace_templates.requirements.data.no")}
      </span>
    );
  }
  if (field.field_type === "select") {
    const selectedIds = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [value];
    const selectedOptions = selectedIds
      .map((optionId) => ({
        id: String(optionId),
        label: getRequirementSelectLabel(field, String(optionId)),
      }))
      .filter((option): option is { id: string; label: string } => Boolean(option.label));
    if (!selectedOptions.length) return <span className="text-placeholder">—</span>;
    return (
      <span className="flex max-w-64 flex-wrap gap-1">
        {selectedOptions.map((option) => (
          <span
            key={option.id}
            className="inline-flex max-w-44 items-center truncate rounded-md border border-subtle bg-layer-2 px-2 py-0.5 text-11 text-primary"
          >
            {option.label}
          </span>
        ))}
      </span>
    );
  }
  if (field.field_type === "member") return <RequirementMemberValue value={value} />;
  if (field.field_type === "attachment" || field.field_type === "image") {
    const assets = Array.isArray(value) ? (value as TRequirementAssetRef[]) : [];
    if (!assets.length) return <span className="text-placeholder">—</span>;
    return (
      <span className="flex max-w-48 flex-wrap gap-1">
        {assets.map((asset) => (
          <a
            key={asset.asset_id}
            href={`/api/assets/v2/workspaces/${workspaceSlug}/${asset.asset_id}/`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-44 items-center gap-1 rounded-md bg-layer-2 px-1.5 py-1 text-11 text-primary hover:text-accent-primary"
          >
            {field.field_type === "image" ? <ImageIcon className="size-3" /> : <File className="size-3" />}
            <span className="truncate">{asset.name}</span>
          </a>
        ))}
      </span>
    );
  }
  return (
    <span className="block max-w-64 text-12 leading-5 whitespace-pre-wrap text-primary">
      {field.field_type === "rich_text" ? stripAndTruncateHTML(String(value), 180) : String(value)}
    </span>
  );
};

const LeafEditor = ({
  field,
  value,
  onChange,
  onUpload,
  onRemoveAsset,
}: {
  field: TRequirementField;
  value: TRequirementDetailValue | undefined;
  onChange: (value: TRequirementDetailValue) => void;
  onUpload: (file: globalThis.File, imageOnly: boolean) => Promise<TRequirementAssetRef>;
  onRemoveAsset?: (assetId: string) => void;
}) => {
  const { t } = useTranslation();
  if (field.field_type === "boolean") {
    return <ToggleSwitch value={Boolean(value)} onChange={() => onChange(!value)} size="sm" />;
  }
  if (field.field_type === "select") {
    const options = getRequirementSelectOptions(field);
    const placeholder = field.config.placeholder ?? t("workspace_templates.requirements.data.select_option");
    if (getRequirementSelectMode(field) === "multiple") {
      const currentValue = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      const dropdownOptions: TDropdownOption[] = options.map((option) => ({
        value: option.id,
        data: option,
      }));
      return (
        <MultiSelectDropdown
          containerClassName="min-w-40"
          value={currentValue}
          onChange={(nextValue) => onChange(nextValue)}
          options={dropdownOptions}
          keyExtractor={(option) => option.value}
          renderItem={({ value: optionId, selected }) => (
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-12">
                {options.find((option) => option.id === optionId)?.label ?? optionId}
              </span>
              {selected && <Check className="size-3.5 shrink-0 text-accent-primary" />}
            </div>
          )}
          buttonContent={(_isOpen, selectedValue) => {
            const selectedIds = (selectedValue as string[] | undefined) ?? [];
            const labels = selectedIds
              .map((optionId) => options.find((option) => option.id === optionId)?.label)
              .filter(Boolean);
            return (
              <span className={labels.length ? "truncate text-12 text-primary" : "truncate text-12 text-placeholder"}>
                {labels.length ? labels.join(", ") : placeholder}
              </span>
            );
          }}
          buttonContainerClassName="h-8 w-full rounded-md border border-subtle bg-surface-1 px-2"
          optionsContainerClassName="w-60"
          disableSearch={options.length <= 8}
          disableSorting
        />
      );
    }

    const selectedId = typeof value === "string" ? value : null;
    const selectedOption = options.find((option) => option.id === selectedId);
    return (
      <CustomSelect
        value={selectedId}
        onChange={(nextValue: string | null) => onChange(nextValue)}
        label={
          <span className={selectedOption ? "truncate text-12 text-primary" : "truncate text-12 text-placeholder"}>
            {selectedOption?.label ?? placeholder}
          </span>
        }
        buttonClassName="h-8 min-w-40 border !border-subtle bg-surface-1 px-2"
        optionsClassName="w-60"
        input
      >
        {!field.is_required && (
          <CustomSelect.Option value={null}>
            <span className="text-secondary">{t("workspace_templates.requirements.data.clear_selection")}</span>
          </CustomSelect.Option>
        )}
        {options.map((option) => (
          <CustomSelect.Option key={option.id} value={option.id}>
            <span className="truncate">{option.label}</span>
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    );
  }
  if (field.field_type === "member") {
    return (
      <MemberDropdown
        multiple={false}
        value={typeof value === "string" ? value : null}
        onChange={(memberId) => onChange(memberId)}
        buttonVariant="border-with-text"
        buttonClassName="h-8 min-w-32 border !border-subtle bg-surface-1"
        placeholder={field.config.placeholder ?? t("workspace_templates.requirements.data.select_member")}
        showUserDetails
      />
    );
  }
  if (field.field_type === "attachment" || field.field_type === "image") {
    const assets = Array.isArray(value) ? (value as TRequirementAssetRef[]) : [];
    return (
      <div className="flex min-w-40 flex-col gap-1.5">
        {assets.map((asset) => (
          <span key={asset.asset_id} className="flex items-center gap-1 rounded-md bg-layer-2 px-1.5 py-1 text-11">
            <Paperclip className="size-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{asset.name}</span>
            <button
              type="button"
              className="text-secondary hover:text-danger-primary"
              onClick={() => {
                onRemoveAsset?.(asset.asset_id);
                onChange(assets.filter((item) => item.asset_id !== asset.asset_id));
              }}
              aria-label={t("delete")}
            >
              ×
            </button>
          </span>
        ))}
        <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-md border border-subtle bg-surface-1 px-2 text-11 text-secondary hover:bg-layer-transparent-hover">
          <Paperclip className="size-3" />
          {t(
            field.field_type === "image"
              ? "workspace_templates.requirements.data.upload_image"
              : "workspace_templates.requirements.data.upload_file"
          )}
          <input
            type="file"
            className="sr-only"
            accept={field.field_type === "image" ? "image/*" : undefined}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void onUpload(file, field.field_type === "image").then((asset) => onChange([...assets, asset]));
              event.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }
  if (field.field_type === "rich_text") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        className="focus:border-accent-primary min-h-16 w-full min-w-44 resize-y rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-12 text-primary outline-none"
        placeholder={field.config.placeholder}
      />
    );
  }
  return (
    <input
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      className="focus:border-accent-primary h-8 w-full min-w-32 rounded-md border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none"
      placeholder={field.config.placeholder}
    />
  );
};

export const RequirementDetailGrid = observer(function RequirementDetailGrid(props: TProps) {
  const {
    workspaceSlug,
    templateId,
    expectedUpdatedAt,
    fields,
    details,
    totalCount,
    totalPages,
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
  } = props;
  const { t } = useTranslation();
  const { uploadEditorAsset } = useEditorAsset();
  const [searchInput, setSearchInput] = useState(search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [filterFieldId, setFilterFieldId] = useState("");
  const [filterOperator, setFilterOperator] = useState<TRequirementDetailFilter["operator"]>("contains");
  const [filterValue, setFilterValue] = useState("");
  const storageKey = `requirement-template:columns:${workspaceSlug}:${templateId}`;
  const [hiddenFieldIds, setHiddenFieldIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);
  const editor = useRequirementDetailGridEditor({
    details,
    fields: activeFields,
    workspaceSlug,
    expectedUpdatedAt,
    discardMessage: t("workspace_templates.requirements.data.discard_all_confirm"),
    onSave: onBulkSave,
    onEditingChange,
  });

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(hiddenFieldIds));
  }, [hiddenFieldIds, storageKey]);

  useEffect(() => {
    const visibleDetailIds = new Set(details.map((detail) => detail.id));
    setSelectedIds((current) => current.filter((id) => visibleDetailIds.has(id)));
  }, [details]);

  const visibleRootFields = useMemo(
    () => activeFields.filter((field) => !hiddenFieldIds.includes(field.id)),
    [activeFields, hiddenFieldIds]
  );
  const normalFields = visibleRootFields.filter((field) => field.field_type !== "form");
  const formFields = visibleRootFields
    .filter((field) => field.field_type === "form")
    .map((field) =>
      Object.assign({}, field, {
        children: field.children.filter((child) => child.is_active && !hiddenFieldIds.includes(child.id)),
      })
    );
  const hasFormFields = formFields.length > 0;
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
          entity_identifier: templateId,
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
    [editor, templateId, uploadEditorAsset, workspaceSlug]
  );

  const saveChanges = async () => {
    try {
      const response = await editor.saveChanges();
      if (!response) return;
      setSelectedIds([]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_templates.requirements.data.saved_all", {
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
            ? t("workspace_templates.requirements.data.conflict")
            : (payload?.error ?? t("workspace_templates.requirements.toast.failed")),
      });
    }
  };

  const setRootValue = (draftKey: string, fieldId: string, value: TRequirementDetailValue) => {
    editor.updateRowData(draftKey, (data) => ({ ...data, [fieldId]: value }));
  };

  const setChildValue = (
    draftKey: string,
    formId: string,
    rowId: string,
    childId: string,
    value: TRequirementDetailValue
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
        values: createEmptyRequirementDetailData(form.children),
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
    const nextFilter: TRequirementDetailFilter = {
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

  const renderDetailRows = (
    detail: TRequirementDetail | null,
    detailDraft: TRequirementDetailDraftRow | null,
    key: string
  ) => {
    const data = detailDraft?.data ?? detail?.data ?? {};
    const groupHeight = getGroupHeight(data, formFields);
    const isEditing = Boolean(detailDraft);
    const isDeleted = Boolean(detailDraft?.isDeleted);
    const isConflicted = Boolean(detailDraft?.detailId && editor.conflictIds.includes(detailDraft.detailId));
    const subRows = Array.from({ length: groupHeight }, (_, position) => ({
      position,
      renderKey: getDetailRowKey(key, data, formFields, position),
    }));
    return subRows.map(({ position: subRowIndex, renderKey }) => (
      <tr
        key={renderKey}
        className={
          isDeleted
            ? "border-b border-danger-subtle bg-danger-subtle/30"
            : isConflicted
              ? "border-b border-danger-subtle bg-danger-subtle/20"
              : isEditing
                ? "border-b border-subtle bg-surface-1"
                : "border-b border-subtle hover:bg-layer-transparent-hover"
        }
      >
        {subRowIndex === 0 && (
          <td rowSpan={groupHeight} className="w-10 border-r border-subtle px-3 py-3 align-middle">
            {detailDraft?.mode === "create" ? (
              <span className="inline-flex rounded bg-accent-subtle px-1.5 py-0.5 text-[10px] font-medium text-accent-primary">
                {t(
                  detailDraft.isCopy
                    ? "workspace_templates.requirements.data.copy_badge"
                    : "workspace_templates.requirements.data.new"
                )}
              </span>
            ) : detail ? (
              <input
                type="checkbox"
                checked={selectedIds.includes(detail.id)}
                disabled={isDeleted}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked ? [...current, detail.id] : current.filter((id) => id !== detail.id)
                  )
                }
                aria-label={t("workspace_templates.requirements.data.select_row")}
              />
            ) : null}
          </td>
        )}
        {subRowIndex === 0 &&
          normalFields.map((field) => (
            <td key={field.id} rowSpan={groupHeight} className="min-w-40 border-r border-subtle px-3 py-3 align-middle">
              {isEditing && !isDeleted ? (
                <LeafEditor
                  field={field}
                  value={data[field.id]}
                  onChange={(value) => setRootValue(key, field.id, value)}
                  onUpload={uploadAsset}
                  onRemoveAsset={editor.discardPendingAsset}
                />
              ) : (
                <LeafValue field={field} value={data[field.id]} workspaceSlug={workspaceSlug} />
              )}
            </td>
          ))}
        {formFields.flatMap((form) => {
          const rows = getFormRows(data, form.id);
          const row = rows[subRowIndex];
          const children = form.children.length ? form.children : [null];
          return children.map((child, childIndex) => (
            <td
              key={`${form.id}-${child?.id ?? "empty"}`}
              className="min-w-40 border-r border-subtle px-2.5 py-2 align-middle"
            >
              {!child ? (
                <span className="text-11 text-placeholder">
                  {t("workspace_templates.requirements.fields.no_children")}
                </span>
              ) : row ? (
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    {isEditing && !isDeleted ? (
                      <LeafEditor
                        field={child}
                        value={row.values[child.id]}
                        onChange={(value) => setChildValue(key, form.id, row.id, child.id, value)}
                        onUpload={uploadAsset}
                        onRemoveAsset={editor.discardPendingAsset}
                      />
                    ) : (
                      <LeafValue field={child} value={row.values[child.id]} workspaceSlug={workspaceSlug} />
                    )}
                  </div>
                  {isEditing && !isDeleted && childIndex === children.length - 1 && (
                    <CustomMenu
                      customButton={
                        <button
                          type="button"
                          className="grid size-7 place-items-center rounded text-secondary hover:bg-layer-2"
                          aria-label={t("workspace_templates.requirements.data.child_actions")}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      }
                      placement="bottom-end"
                    >
                      <CustomMenu.MenuItem onClick={() => insertFormRow(key, form, subRowIndex)}>
                        {t("workspace_templates.requirements.data.insert_above")}
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => insertFormRow(key, form, subRowIndex + 1)}>
                        {t("workspace_templates.requirements.data.insert_below")}
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => deleteFormRow(key, form.id, row.id)}>
                        <Trash2 className="size-3.5" />
                        {t("delete")}
                      </CustomMenu.MenuItem>
                    </CustomMenu>
                  )}
                </div>
              ) : isEditing && !isDeleted && subRowIndex === 0 && childIndex === children.length - 1 ? (
                <button
                  type="button"
                  onClick={() => insertFormRow(key, form)}
                  className="inline-flex items-center gap-1 text-11 font-medium text-accent-primary"
                >
                  <Plus className="size-3" />
                  {t("workspace_templates.requirements.data.add_child")}
                </button>
              ) : (
                <span className="text-placeholder">—</span>
              )}
              {isEditing &&
                !isDeleted &&
                row &&
                subRowIndex === rows.length - 1 &&
                childIndex === children.length - 1 && (
                  <button
                    type="button"
                    onClick={() => insertFormRow(key, form)}
                    className="mt-1 inline-flex items-center gap-1 text-10 text-accent-primary"
                  >
                    <Plus className="size-3" />
                    {t("workspace_templates.requirements.data.add_child")}
                  </button>
                )}
            </td>
          ));
        })}
        {subRowIndex === 0 && (
          <td rowSpan={groupHeight} className="w-24 px-2 py-2 align-middle">
            {isEditing && isDeleted ? (
              <Button variant="secondary" size="sm" onClick={() => editor.undoDelete(key)}>
                <Undo2 className="size-3.5" />
                {t("workspace_templates.requirements.data.undo")}
              </Button>
            ) : isEditing ? (
              <CustomMenu ellipsis placement="bottom-end">
                <CustomMenu.MenuItem onClick={() => editor.stageCreate({ beforeKey: key })}>
                  {t("workspace_templates.requirements.data.insert_above")}
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => editor.stageCreate({ afterKey: key })}>
                  {t("workspace_templates.requirements.data.insert_below")}
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => editor.stageCreate({ data, afterKey: key, isCopy: true })}>
                  <Copy className="size-3.5" />
                  {t("workspace_templates.requirements.data.copy")}
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => handleDelete([key])}>
                  <Trash2 className="size-3.5" />
                  {t("delete")}
                </CustomMenu.MenuItem>
              </CustomMenu>
            ) : detail ? (
              <CustomMenu ellipsis placement="bottom-end">
                <CustomMenu.MenuItem onClick={() => editor.stageCreate({ beforeId: detail.id })}>
                  {t("workspace_templates.requirements.data.insert_above")}
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => editor.stageCreate({ afterId: detail.id })}>
                  {t("workspace_templates.requirements.data.insert_below")}
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem
                  onClick={() => editor.stageCreate({ data: detail.data, afterId: detail.id, isCopy: true })}
                >
                  <Copy className="size-3.5" />
                  {t("workspace_templates.requirements.data.copy")}
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => handleDelete([detail.id])}>
                  <Trash2 className="size-3.5" />
                  {t("delete")}
                </CustomMenu.MenuItem>
              </CustomMenu>
            ) : null}
          </td>
        )}
      </tr>
    ));
  };

  const detailsById = new Map(details.map((detail) => [detail.id, detail]));
  const rows = editor.isEditing
    ? editor.draftRows.flatMap((draftRow) =>
        renderDetailRows(
          draftRow.detailId ? (detailsById.get(draftRow.detailId) ?? null) : null,
          draftRow,
          draftRow.key
        )
      )
    : details.flatMap((detail) => renderDetailRows(detail, null, detail.id));
  const selectableDetailIds = editor.isEditing
    ? editor.draftRows
        .filter((draftRow) => draftRow.mode === "update" && !draftRow.isDeleted && draftRow.detailId)
        .map((draftRow) => draftRow.detailId as string)
    : details.map((detail) => detail.id);
  const displayedTotalCount = editor.isEditing
    ? totalCount +
      editor.draftRows.filter((draftRow) => draftRow.mode === "create").length -
      editor.draftRows.filter((draftRow) => draftRow.mode === "update" && draftRow.isDeleted).length
    : totalCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => editor.stageCreate()} disabled={isMutating}>
            <Plus className="size-4" />
            {t("workspace_templates.requirements.data.add")}
          </Button>
          {selectedIds.length > 0 && (
            <Button variant="secondary" onClick={() => handleDelete(selectedIds)} disabled={isMutating}>
              <Trash2 className="size-3.5" />
              {t("workspace_templates.requirements.data.delete_selected", { count: selectedIds.length })}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editor.isEditing ? (
            <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md bg-accent-subtle px-2 py-1">
              <span className="inline-flex items-center gap-1.5 px-1 text-12 font-medium text-accent-primary">
                <Pencil className="size-3.5" />
                {t("workspace_templates.requirements.data.bulk_edit_mode")}
              </span>
              <span className="h-4 w-px bg-accent-primary/20" />
              <span className="px-1 text-11 text-accent-primary" aria-live="polite">
                {t("workspace_templates.requirements.data.changed_count", { count: editor.changedCount })}
              </span>
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
                {t("workspace_templates.requirements.data.save_changes")}
              </Button>
            </div>
          ) : (
            <>
              <label className="relative block w-48 sm:w-60">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSearchInput(value);
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    searchTimer.current = setTimeout(() => onSearchChange(value), 300);
                  }}
                  placeholder={t("workspace_templates.requirements.data.search")}
                  className="focus:border-accent-primary h-8 w-full rounded-md border border-subtle bg-surface-1 pr-2 pl-8 text-12 text-primary outline-none placeholder:text-placeholder"
                />
              </label>
              <div className="relative">
                <Button variant="secondary" onClick={() => setIsFilterOpen((value) => !value)}>
                  <Filter className="size-3.5" />
                  {t("workspace_templates.requirements.data.filter")}
                  {filters.length > 0 && <span className="text-accent-primary">{filters.length}</span>}
                </Button>
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
                      <option value="">{t("workspace_templates.requirements.data.select_field")}</option>
                      {filterableFields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={filterOperator}
                        onChange={(event) =>
                          setFilterOperator(event.target.value as TRequirementDetailFilter["operator"])
                        }
                        className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-12"
                      >
                        {(selectedFilterField?.field_type === "text" ||
                          selectedFilterField?.field_type === "rich_text" ||
                          (selectedFilterField?.field_type === "select" &&
                            getRequirementSelectMode(selectedFilterField) === "multiple")) && (
                          <option value="contains">{t("workspace_templates.requirements.filters.contains")}</option>
                        )}
                        {!["attachment", "image"].includes(selectedFilterField?.field_type ?? "") &&
                          !(
                            selectedFilterField?.field_type === "select" &&
                            getRequirementSelectMode(selectedFilterField) === "multiple"
                          ) && <option value="equals">{t("workspace_templates.requirements.filters.equals")}</option>}
                        <option value="is_empty">{t("workspace_templates.requirements.filters.is_empty")}</option>
                        <option value="is_not_empty">
                          {t("workspace_templates.requirements.filters.is_not_empty")}
                        </option>
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
                          placeholder={t("workspace_templates.requirements.data.select_member")}
                          showUserDetails
                        />
                      ) : filterRequiresValue && selectedFilterField?.field_type === "boolean" ? (
                        <select
                          value={filterValue}
                          onChange={(event) => setFilterValue(event.target.value)}
                          className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-12"
                        >
                          <option value="true">{t("workspace_templates.requirements.data.yes")}</option>
                          <option value="false">{t("workspace_templates.requirements.data.no")}</option>
                        </select>
                      ) : filterRequiresValue ? (
                        <input
                          value={filterValue}
                          onChange={(event) => setFilterValue(event.target.value)}
                          className="focus:border-accent-primary h-8 rounded-md border border-subtle bg-surface-1 px-2 text-12 outline-none"
                          placeholder={t("workspace_templates.requirements.data.filter_value")}
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
                <Button variant="secondary" onClick={() => setIsColumnsOpen((value) => !value)}>
                  <Columns3 className="size-3.5" />
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
                                current.includes(field.id)
                                  ? current.filter((id) => id !== field.id)
                                  : [...current, field.id]
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
              <Button variant="secondary" onClick={() => void onRefresh()} disabled={isLoading}>
                <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="primary" onClick={editor.startEditing} disabled={isLoading || details.length === 0}>
                <Pencil className="size-3.5" />
                {t("workspace_templates.requirements.data.edit_data")}
              </Button>
            </>
          )}
        </div>
      </div>

      {editor.saveError && (
        <div
          className="flex items-center justify-between gap-3 border-b border-danger-subtle bg-danger-subtle px-4 py-2 text-11 text-danger-primary"
          role="alert"
        >
          <span>
            {editor.conflictIds.length ? t("workspace_templates.requirements.data.conflict") : editor.saveError}
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
              {t("workspace_templates.requirements.data.reload_to_continue")}
            </button>
          )}
        </div>
      )}

      {filters.length > 0 && (
        <div className="flex gap-1 border-b border-subtle px-4 py-2">
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

      <div className="horizontal-scrollbar vertical-scrollbar min-h-0 flex-1 overflow-auto">
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
              <p className="text-13 font-medium text-primary">{t("workspace_templates.requirements.error.title")}</p>
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
                {t("workspace_templates.requirements.data.no_fields")}
              </p>
              <p className="mt-1 text-12 text-secondary">
                {t("workspace_templates.requirements.data.no_fields_description")}
              </p>
            </div>
          </div>
        ) : details.length === 0 && !editor.isEditing ? (
          <div className="flex min-h-72 items-center justify-center p-6 text-center">
            <div>
              <Plus className="mx-auto size-8 text-placeholder" />
              <p className="mt-2 text-13 font-medium text-primary">
                {t("workspace_templates.requirements.data.empty")}
              </p>
              <Button className="mt-3" variant="primary" onClick={() => editor.stageCreate()}>
                {t("workspace_templates.requirements.data.add")}
              </Button>
            </div>
          </div>
        ) : (
          <table className="w-max min-w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-layer-1 text-11 font-medium text-secondary">
              <tr className="border-b border-subtle">
                <th rowSpan={hasFormFields ? 2 : 1} className="w-10 border-r border-subtle px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selectableDetailIds.length > 0 &&
                      selectableDetailIds.every((detailId) => selectedIds.includes(detailId))
                    }
                    onChange={(event) => setSelectedIds(event.target.checked ? selectableDetailIds : [])}
                    aria-label={t("workspace_templates.requirements.data.select_all")}
                  />
                </th>
                {normalFields.map((field) => (
                  <th
                    key={field.id}
                    rowSpan={hasFormFields ? 2 : 1}
                    className="min-w-40 border-r border-subtle px-3 py-2 align-middle"
                  >
                    {field.name}
                    {field.is_required && <span className="ml-1 text-danger-primary">*</span>}
                  </th>
                ))}
                {formFields.map((field) => (
                  <th
                    key={field.id}
                    colSpan={Math.max(1, field.children.length)}
                    className="border-r border-subtle px-3 py-2 text-center text-primary"
                  >
                    {field.name}
                    <span className="ml-1.5 rounded bg-accent-subtle px-1.5 py-0.5 text-[10px] text-accent-primary">
                      {t("workspace_templates.requirements.fields.repeatable")}
                    </span>
                  </th>
                ))}
                <th rowSpan={hasFormFields ? 2 : 1} className="w-24 px-3 py-2 text-center">
                  {t("workspace_templates.requirements.fields.actions")}
                </th>
              </tr>
              {hasFormFields && (
                <tr className="border-b border-subtle">
                  {formFields.flatMap((field) =>
                    field.children.length ? (
                      field.children.map((child) => (
                        <th key={child.id} className="min-w-40 border-r border-subtle px-3 py-2">
                          {child.name}
                          {child.is_required && <span className="ml-1 text-danger-primary">*</span>}
                        </th>
                      ))
                    ) : (
                      <th key={`${field.id}-empty`} className="min-w-40 border-r border-subtle px-3 py-2">
                        {t("workspace_templates.requirements.fields.no_children")}
                      </th>
                    )
                  )}
                </tr>
              )}
            </thead>
            <tbody>{rows}</tbody>
          </table>
        )}
      </div>

      <div className="flex h-12 shrink-0 items-center justify-between border-t border-subtle px-4 text-11 text-secondary">
        <div className="flex items-center gap-3">
          <span>{t("workspace_templates.requirements.data.total", { count: displayedTotalCount })}</span>
          <select
            value={perPage}
            disabled={editor.isEditing}
            onChange={(event) => onPerPageChange(Number(event.target.value))}
            className="h-7 rounded-md border border-subtle bg-surface-1 px-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {[20, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value} / {t("workspace_templates.requirements.data.page")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={editor.isEditing || !prevPageResults}
            onClick={() => onCursorChange(prevCursor)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span>{totalPages || 1}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={editor.isEditing || !nextPageResults}
            onClick={() => onCursorChange(nextCursor)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
});

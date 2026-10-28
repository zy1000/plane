/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { useParams } from "react-router";
import { ChevronDown, GripVertical, Layers, Library, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import {
  AlertModalCore,
  Button,
  EModalPosition,
  EModalWidth,
  Input,
  ModalCore,
  TextArea,
  ToggleSwitch,
} from "@plane/ui";
// components
import {
  getRandomTypeIconOption,
  getTypeIconOption,
  TypeIcon,
  TypeIconPicker,
  toTypeIconProps,
} from "@/components/common/type-icon-picker";
import type { TTypeIconOption } from "@/components/common/type-icon-picker";
import { SettingsHeading } from "@/components/settings/heading";
import { useTemplatePermissions } from "@/components/template-management/permissions";
import { IssueTypeCategorySelect } from "@/components/workspace/settings/issue-type-categories/issue-type-category-select";
// hooks
import { useIssueTypeCategories } from "@/hooks/store/use-issue-type-categories";
import { useIssueTypeLibrary } from "@/hooks/store/use-issue-type-library";
import {
  bindLibraryFieldsToIssueType,
  useProjectIssueTypeFields,
} from "@/hooks/store/use-project-issue-type-fields";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useAppRouter } from "@/hooks/use-app-router";
import { useIssueConfigPermission } from "@/hooks/use-issue-config-permission";
import { projectIssueTypesCache } from "@/services/project/project-issue-type.service";
import type {
  TIssueType,
  TTypeExtraField,
  TTypeExtraFieldPayload,
} from "@/services/project/project-issue-type.service";
// local imports
import { buildFieldPayload, DEFAULT_FIELD_FORM, fieldToFormState, getFieldRowLabel, InlineFieldForm } from "./field-form";
import type { TFieldFormState, TFieldPayloadBase } from "./field-form";
import { LibraryFieldPickerModal } from "./library-field-picker-modal";

export { getFieldRowLabel, getFieldTypeOption } from "./field-form";
export type { TFieldPayloadBase } from "./field-form";

/** 与 ModalCore 离场动画（duration-200）对齐，关闭后再清空编辑态，避免关闭过程中闪成「创建」表单 */
const WORK_ITEM_TYPE_MODAL_LEAVE_MS = 220;

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;
  if ("msg" in error && typeof error.msg === "string") return error.msg;
  if ("detail" in error && typeof error.detail === "string") return error.detail;

  const [firstValue] = Object.values(error as Record<string, unknown>);
  if (typeof firstValue === "string") return firstValue;
  if (Array.isArray(firstValue) && typeof firstValue[0] === "string") return firstValue[0];

  return fallback;
};

const StatusBadge = ({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "danger" | "blue" | "success";
}) => {
  const toneClassName = {
    neutral: "border border-subtle bg-surface-2 text-secondary",
    danger: "border-0 bg-danger-subtle/35 text-danger-primary",
    blue: "border border-accent-primary/30 bg-accent-primary/10 text-accent-primary",
    success: "border-0 bg-success-subtle/35 text-success-primary",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
};

export type TMoreMenuItem = {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
};

export function MoreMenu({ items, title = "更多操作" }: { items: TMoreMenuItem[]; title?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-end",
    strategy: "fixed",
    modifiers: [
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "offset", options: { offset: [0, 4] } },
    ],
  });

  useOutsideClickDetector(containerRef, () => setIsOpen(false), true);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={setReferenceElement}
        type="button"
        className="rounded-md p-1.5 text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        title={title}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
            data-prevent-outside-click
            className="z-50 min-w-36 overflow-hidden rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-200"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                  item.tone === "danger"
                    ? "text-danger-primary hover:bg-danger-subtle"
                    : "text-primary hover:bg-layer-1-hover"
                } ${item.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => {
                  if (item.disabled) return;
                  setIsOpen(false);
                  item.onClick();
                }}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

export const WorkItemTypeIcon = ({ issueType, className = "" }: { issueType?: Partial<TIssueType>; className?: string }) => (
  <TypeIcon iconProps={issueType?.logo_props?.icon} className={className} />
);

type TDeleteTarget = { kind: "issueType"; issueType: TIssueType } | { kind: "field"; field: TTypeExtraField };

/**
 * 某个工作项类型的属性列表：一行一个属性（名称 / 类型 / 状态 / 更多），编辑与新建都在列表里就地展开表单。
 * 项目设置「工作项类型」展开后的属性区与模板中心工作项页的「属性」分段共用这一份。
 *
 * 绑定了通用字段库的行（library_field_id 非空）只读：不进行内表单，只能「去字段库」或「移除」（走 onRequestDelete）。
 * 「从字段库添加」要知道工作区与作用域：项目设置显式传入；模板中心不传时取 URL 里的工作区 + 工作区类型库的作用域。
 */
export const IssueTypeFieldList = observer(function IssueTypeFieldList({
  issueTypeId,
  fields,
  isLoading,
  canEdit,
  hideTitle = false,
  workspaceSlug: workspaceSlugProp,
  scopeKey: scopeKeyProp,
  issueType: issueTypeProp,
  onCreate,
  onUpdate,
  onRequestDelete,
}: {
  issueTypeId: string;
  /** 只含这个类型的属性 */
  fields: TTypeExtraField[];
  isLoading: boolean;
  canEdit: boolean;
  /** 外面已经有「属性」标题时不再重复 */
  hideTitle?: boolean;
  /** 不传取路由参数 */
  workspaceSlug?: string;
  /** 项目 id 或方案作用域键（同 useProjectIssueTypeFields 的第二个参数）；不传取工作区类型库 */
  scopeKey?: string;
  /** 「从字段库添加」弹窗标题旁的类型标签；不传从类型缓存里找 */
  issueType?: Pick<TIssueType, "name" | "logo_props">;
  onCreate: (payload: TTypeExtraFieldPayload) => Promise<unknown>;
  onUpdate: (fieldId: string, payload: TFieldPayloadBase) => Promise<unknown>;
  onRequestDelete: (field: TTypeExtraField) => void;
}) {
  const { workspaceSlug: routeWorkspaceSlug } = useParams();
  const router = useAppRouter();
  const workspaceSlug = workspaceSlugProp ?? routeWorkspaceSlug?.toString();
  // 显式传了作用域、或本来就不能改时不去拉类型库
  const { scopeKey: libraryScopeKey } = useIssueTypeLibrary(scopeKeyProp || !canEdit ? undefined : workspaceSlug);
  const scopeKey = scopeKeyProp ?? libraryScopeKey;
  const { canViewDevModes } = useTemplatePermissions(workspaceSlug);
  // 字段库读接口要研发模式 view 权限，没有就不给入口
  const canAddFromLibrary = canEdit && canViewDevModes && Boolean(workspaceSlug && scopeKey);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingField, setEditingField] = useState<TTypeExtraField | undefined>();
  const [fieldForm, setFieldForm] = useState<TFieldFormState>(DEFAULT_FIELD_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inlineFormRef = useRef<HTMLDivElement>(null);
  const isFormOpen = isAdding || Boolean(editingField);

  const resetFieldForm = () => {
    setIsAdding(false);
    setEditingField(undefined);
    setFieldForm(DEFAULT_FIELD_FORM);
  };

  const openCreateFieldForm = () => {
    if (!canEdit) return;
    setIsAdding(true);
    setEditingField(undefined);
    setFieldForm(DEFAULT_FIELD_FORM);
  };

  const openEditFieldForm = (field: TTypeExtraField) => {
    if (!canEdit || field.library_field_id) return;
    setIsAdding(false);
    setEditingField(field);
    setFieldForm(fieldToFormState(field));
  };

  useEffect(() => {
    if (!isFormOpen) return;
    inlineFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isFormOpen]);

  // 正在编辑的属性被删掉了：收起表单
  useEffect(() => {
    if (editingField && !fields.some((field) => field.id === editingField.id)) resetFieldForm();
  }, [editingField, fields]);

  const handleSubmitField = async () => {
    if (!canEdit) return;
    if (!fieldForm.name.trim()) return;

    const built = buildFieldPayload(fieldForm);
    if ("error" in built) {
      setToast({ type: TOAST_TYPE.ERROR, title: "校验失败", message: built.error });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingField) {
        await onUpdate(editingField.id, built.payload);
      } else {
        await onCreate({ issue_type_id: issueTypeId, ...built.payload });
      }
      resetFieldForm();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: editingField ? "更新失败" : "创建失败",
        message: getApiErrorMessage(
          error,
          editingField ? "无法更新自定义属性，请稍后重试。" : "无法创建自定义属性，请检查名称是否重复。"
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const libraryPicker =
    canAddFromLibrary && workspaceSlug && scopeKey ? (
      <LibraryFieldPickerModal
        isOpen={isPickerOpen}
        workspaceSlug={workspaceSlug}
        issueType={issueTypeProp ?? projectIssueTypesCache.get(scopeKey)?.[issueTypeId]}
        typeFields={fields}
        onClose={() => setIsPickerOpen(false)}
        onSubmit={(libraryFieldIds) =>
          bindLibraryFieldsToIssueType(workspaceSlug, scopeKey, issueTypeId, libraryFieldIds)
        }
      />
    ) : null;

  // 弹窗挂在固定位置：绑定成功后列表从空态切到有内容，弹窗不能跟着卸载重挂
  if (!isFormOpen && fields.length === 0) {
    return (
      <>
        <div className="mb-3 flex w-full flex-col items-center justify-center rounded-md bg-surface-1 py-10 text-center">
          <div className="border-accent-primary/40 flex size-14 items-center justify-center rounded-lg border bg-accent-primary/10 text-accent-primary">
            <Layers className="size-7" strokeWidth={2} />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-primary">添加自定义属性</h3>
          <p className="mt-1 text-sm text-secondary">您为此工作项类型添加的新属性将显示在此处。</p>
          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="neutral-primary"
              size="sm"
              prependIcon={<Plus className="size-3" />}
              onClick={openCreateFieldForm}
              disabled={!canEdit}
            >
              添加新属性
            </Button>
            {canAddFromLibrary && (
              <Button variant="neutral-primary" size="sm" onClick={() => setIsPickerOpen(true)}>
                从字段库添加
              </Button>
            )}
          </div>
          {isLoading && <p className="mt-2 text-xs text-secondary">正在同步属性...</p>}
        </div>
        {libraryPicker}
      </>
    );
  }

  return (
    <>
      <div className="p-4">
        {!hideTitle && <div className="mb-3 text-sm font-medium text-primary">属性</div>}

        <div className="mb-4 space-y-2">
          {fields.map((field) => {
            if (editingField?.id === field.id) {
              return (
                <div key={field.id} ref={inlineFormRef}>
                  <InlineFieldForm
                    form={fieldForm}
                    isSubmitting={isSubmitting}
                    submitLabel="更新"
                    fieldTypeLocked
                    onChange={setFieldForm}
                    onCancel={resetFieldForm}
                    onSubmit={() => void handleSubmitField()}
                  />
                </div>
              );
            }
            const isLibraryField = Boolean(field.library_field_id);
            return (
              <div
                key={field.id}
                className="hover:border-primary/40 flex items-center gap-3 rounded-md border border-strong px-3 py-2.5 text-sm transition hover:bg-layer-1-hover"
              >
                <GripVertical className="size-4 shrink-0 text-tertiary" />
                <span className="min-w-0 flex-1 truncate font-medium text-primary">{field.name}</span>
                <span className="text-xs text-secondary">{getFieldRowLabel(field)}</span>
                {isLibraryField ? <StatusBadge tone="blue">字段库</StatusBadge> : <StatusBadge>本类型</StatusBadge>}
                {field.is_active === false ? (
                  <StatusBadge tone="danger">已禁用</StatusBadge>
                ) : (
                  <StatusBadge tone="success">活动</StatusBadge>
                )}
                <MoreMenu
                  items={
                    isLibraryField
                      ? [
                          {
                            label: "去字段库",
                            icon: <Library className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />,
                            disabled: !workspaceSlug,
                            onClick: () => router.push(`/${workspaceSlug}/templates/issue-fields`),
                          },
                          {
                            label: "移除",
                            disabled: !canEdit,
                            tone: "danger",
                            icon: <Trash2 className="size-3.5 shrink-0" strokeWidth={2} />,
                            onClick: () => onRequestDelete(field),
                          },
                        ]
                      : [
                          {
                            label: "编辑",
                            icon: <Pencil className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />,
                            disabled: !canEdit,
                            onClick: () => openEditFieldForm(field),
                          },
                          {
                            label: "删除",
                            disabled: !canEdit,
                            tone: "danger",
                            icon: <Trash2 className="size-3.5 shrink-0" strokeWidth={2} />,
                            onClick: () => onRequestDelete(field),
                          },
                        ]
                  }
                />
              </div>
            );
          })}
          {isAdding && (
            <div ref={inlineFormRef}>
              <InlineFieldForm
                form={fieldForm}
                isSubmitting={isSubmitting}
                submitLabel="创建"
                onChange={setFieldForm}
                onCancel={resetFieldForm}
                onSubmit={() => void handleSubmitField()}
              />
            </div>
          )}
        </div>

        {!isFormOpen && (
          <div className="flex items-center gap-2">
            <Button
              variant="neutral-primary"
              size="sm"
              prependIcon={<Plus className="size-3" />}
              onClick={openCreateFieldForm}
              disabled={!canEdit}
            >
              添加新属性
            </Button>
            {canAddFromLibrary && (
              <Button variant="neutral-primary" size="sm" onClick={() => setIsPickerOpen(true)}>
                从字段库添加
              </Button>
            )}
          </div>
        )}
        {isLoading && <p className="mt-2 text-xs text-secondary">正在同步属性...</p>}
      </div>
      {libraryPicker}
    </>
  );
});

export function WorkItemTypeModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  editingIssueType,
  workspaceSlug,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<TIssueType>) => Promise<void>;
  editingIssueType?: TIssueType | null;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [iconOption, setIconOption] = useState<TTypeIconOption>(getRandomTypeIconOption);
  const [categoryId, setCategoryId] = useState<number | string | null>(null);
  const { categories, isLoading: isCategoriesLoading, fetchCategories } = useIssueTypeCategories(workspaceSlug);

  useEffect(() => {
    if (!isOpen) return;
    if (editingIssueType) {
      setName(editingIssueType.name ?? "");
      setDescription(editingIssueType.description ?? "");
      setIconOption(getTypeIconOption(editingIssueType?.logo_props?.icon));
      setCategoryId(editingIssueType.category_id ?? null);
    } else {
      setName("");
      setDescription("");
      setIconOption(getRandomTypeIconOption());
      setCategoryId(null);
    }
    setIsIconPickerOpen(false);
    fetchCategories();
  }, [isOpen, editingIssueType?.id, fetchCategories]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (categoryId === null || categoryId === undefined || categoryId === "") {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "校验失败",
        message: "请选择工作项类型的类别。",
      });
      return;
    }

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      logo_props: { icon: toTypeIconProps(iconOption) },
      category_id: categoryId,
    });
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
      className="overflow-visible border border-subtle"
    >
      <form onSubmit={handleSubmit} className="p-5">
        <h3 className="text-lg font-semibold text-primary">
          {editingIssueType ? t("project_settings.issue_types.edit_title") : "创建工作项类型"}
        </h3>
        <div className="relative mt-4 flex items-end gap-2">
          <TypeIconPicker
            value={iconOption}
            isOpen={isIconPickerOpen}
            onChange={setIconOption}
            onToggle={setIsIconPickerOpen}
          />
          <div className="min-w-0 flex-1 rounded-lg border border-subtle bg-surface-1">
            <Input
              name="issue-type-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="为此工作项类型取一个独特的名称"
              mode="true-transparent"
              className="h-9 w-full px-2.5 py-0 text-sm leading-normal"
              required
              maxLength={255}
              pattern=".*\S.*"
              title="请输入工作项类型名称"
              autoFocus
            />
          </div>
          <div className="flex w-44 shrink-0 flex-col gap-1">
            <label className="text-xs font-medium text-secondary">
              类别<span className="ml-0.5 text-danger-primary">*</span>
            </label>
            <IssueTypeCategorySelect
              value={categoryId}
              categories={categories}
              isLoading={isCategoriesLoading}
              onChange={setCategoryId}
            />
          </div>
        </div>
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述此工作项类型的用途和使用时机。"
          className="mt-3 min-h-24 resize-none rounded-lg border border-subtle bg-surface-1 text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={isSubmitting}
            disabled={
              isSubmitting || !name.trim() || categoryId === null || categoryId === undefined || categoryId === ""
            }
          >
            {editingIssueType ? t("update") : t("project_settings.issue_types.add")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

type TIssueTypesSettingsContentProps = {
  workspaceSlug: string;
  /** 项目 id，或模板中心的方案作用域键 `scheme:<id>`（见 services/project/issue-scheme-scope.ts） */
  projectId: string;
};

/**
 * 工作项类型与自定义属性的维护面板。项目设置「工作项类型」页与模板中心「工作项配置」页签共用：
 * 能不能改见 useIssueConfigPermission（方案作用域看研发模式权限，跟随研发模式的项目只读）。
 */
function IssueTypesSettingsContentInner({ workspaceSlug, projectId }: TIssueTypesSettingsContentProps) {
  // store
  const { canEdit: canEditByKeys } = useIssueConfigPermission(workspaceSlug, projectId);
  const {
    issueTypes,
    isLoading: issueTypesLoading,
    createIssueType,
    updateIssueType,
    deleteIssueType,
  } = useProjectIssueTypes(workspaceSlug, projectId);
  const {
    fields,
    isLoading: fieldsLoading,
    createField,
    updateField,
    deleteField,
  } = useProjectIssueTypeFields(workspaceSlug, projectId);
  // translation
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingIssueType, setEditingIssueType] = useState<TIssueType | undefined>();
  const [isTypeSubmitting, setIsTypeSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TDeleteTarget | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const { categories: issueTypeCategories, fetchCategories: fetchIssueTypeCategories } =
    useIssueTypeCategories(workspaceSlug);

  const issueTypeCategoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of issueTypeCategories) {
      map.set(String(c.id), c.name);
    }
    return map;
  }, [issueTypeCategories]);

  useEffect(() => {
    if (!workspaceSlug) return;
    void fetchIssueTypeCategories();
  }, [workspaceSlug, fetchIssueTypeCategories]);

  useEffect(() => {
    if (isTypeModalOpen) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setEditingIssueType(undefined);
    }, WORK_ITEM_TYPE_MODAL_LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [isTypeModalOpen]);
  // derived values
  const settingsDetails = PROJECT_SETTINGS.issue_types;
  const canEdit = canEditByKeys(settingsDetails.editPermissionKeys ?? []);
  const fieldsByIssueTypeId = useMemo(() => {
    const groupedFields: Record<string, TTypeExtraField[]> = {};
    (fields ?? []).forEach((field) => {
      if (!groupedFields[field.issue_type_id]) groupedFields[field.issue_type_id] = [];
      groupedFields[field.issue_type_id].push(field);
    });
    return groupedFields;
  }, [fields]);

  const issueTypeIdsKey = useMemo(
    () =>
      issueTypes?.length
        ? [...issueTypes]
            .map((t) => t.id)
            .sort()
            .join(",")
        : "",
    [issueTypes]
  );

  useEffect(() => {
    if (!issueTypes?.length) {
      setExpandedId(undefined);
      return;
    }
    setExpandedId((prev) => {
      if (prev !== undefined && issueTypes.some((t) => t.id === prev)) return prev;
      return undefined;
    });
  }, [issueTypeIdsKey, issueTypes]);

  const handleCreateIssueType = async (data: Partial<TIssueType>) => {
    if (!canEdit) return;
    setIsTypeSubmitting(true);
    try {
      const createdIssueType = await createIssueType(data);
      if (createdIssueType) {
        setExpandedId(createdIssueType.id);
        setIsTypeModalOpen(false);
      }
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "创建失败",
        message: getApiErrorMessage(error, "无法创建工作项类型，请稍后重试。"),
      });
    } finally {
      setIsTypeSubmitting(false);
    }
  };

  const handleUpdateIssueType = async (data: Partial<TIssueType>) => {
    if (!editingIssueType || !canEdit) return;
    setIsTypeSubmitting(true);
    try {
      await updateIssueType(editingIssueType.id, data);
      setIsTypeModalOpen(false);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新失败",
        message: getApiErrorMessage(error, "无法更新工作项类型，请稍后重试。"),
      });
    } finally {
      setIsTypeSubmitting(false);
    }
  };

  const handleToggleIssueType = async (issueType: TIssueType, isActive: boolean) => {
    if (issueType.is_default || !canEdit) return;

    try {
      await updateIssueType(issueType.id, { is_active: isActive });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新失败",
        message: getApiErrorMessage(error, "无法更新工作项类型状态，请稍后重试。"),
      });
    }
  };

  const requestDeleteIssueType = (issueType: TIssueType) => {
    if (issueType.is_default || !canEdit) return;
    setDeleteTarget({ kind: "issueType", issueType });
  };

  const requestDeleteField = (field: TTypeExtraField) => {
    if (!canEdit) return;
    setDeleteTarget({ kind: "field", field });
  };

  /** 字段库字段在类型里只是一条绑定，删的是绑定，文案说「移除」 */
  const isRemovingLibraryField = deleteTarget?.kind === "field" && Boolean(deleteTarget.field.library_field_id);

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !canEdit) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "issueType") {
        await deleteIssueType(deleteTarget.issueType.id);
        if (expandedId === deleteTarget.issueType.id) setExpandedId(undefined);
      } else {
        await deleteField(deleteTarget.field.id);
      }
      setDeleteTarget(undefined);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: getApiErrorMessage(
          error,
          deleteTarget.kind === "issueType"
            ? "该工作项类型可能正在使用中，暂时无法删除。"
            : "无法删除自定义属性，请稍后重试。"
        ),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
      <div className="w-full">
        <SettingsHeading
          title={t("project_settings.issue_types.heading")}
          description={t("project_settings.issue_types.description")}
          control={
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              onClick={() => {
                setEditingIssueType(undefined);
                setIsTypeModalOpen(true);
              }}
              disabled={!canEdit}
            >
              {t("project_settings.issue_types.add")}
            </Button>
          }
        />

        <div className="mt-6 w-full">
          {issueTypesLoading ? (
            <div className="rounded-lg border border-subtle p-6 text-sm text-secondary">正在加载工作项类型...</div>
          ) : !issueTypes?.length ? (
            <div className="rounded-lg border border-dashed border-subtle px-6 py-12 text-center">
              <WorkItemTypeIcon className="mx-auto size-12" />
              <h3 className="mt-4 text-sm font-semibold text-primary">暂无工作项类型</h3>
              <p className="mt-1 text-sm text-secondary">创建第一个工作项类型后，可以继续添加专属属性。</p>
              <Button
                variant="primary"
                size="sm"
                className="mx-auto mt-4"
                onClick={() => {
                  setEditingIssueType(undefined);
                  setIsTypeModalOpen(true);
                }}
                disabled={!canEdit}
              >
                {t("project_settings.issue_types.add")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-subtle">
              {issueTypes?.map((issueType) => {
                const isExpanded = expandedId === issueType.id;
                const typeFields = fieldsByIssueTypeId[issueType.id] ?? [];
                const categoryDisplayName =
                  issueType.category_name?.trim() ||
                  (issueType.category_id !== null && issueType.category_id !== undefined && issueType.category_id !== ""
                    ? issueTypeCategoryNameById.get(String(issueType.category_id))
                    : undefined);

                return (
                  <div key={issueType.id} className="py-1.5 first:pt-0 last:pb-0">
                    <div
                      className={`-mx-3 rounded-md px-3 transition-colors ${
                        isExpanded ? "bg-layer-1-hover" : "hover:bg-layer-1-hover"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 py-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => setExpandedId(isExpanded ? undefined : issueType.id)}
                        >
                          <ChevronDown
                            className={`size-4 shrink-0 text-tertiary transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
                          />
                          <WorkItemTypeIcon issueType={issueType} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-primary">{issueType.name}</span>
                            {issueType.description?.trim() ? (
                              <span className="block truncate text-xs text-secondary">
                                {issueType.description.trim()}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-3">
                          {categoryDisplayName ? <StatusBadge tone="neutral">{categoryDisplayName}</StatusBadge> : null}
                          {issueType.is_default ? <StatusBadge tone="blue">默认</StatusBadge> : null}
                          {issueType.is_active === false ? (
                            <StatusBadge tone="danger">已禁用</StatusBadge>
                          ) : !issueType.is_default ? (
                            <StatusBadge tone="success">活动</StatusBadge>
                          ) : null}
                          {!issueType.is_default && (
                            <ToggleSwitch
                              value={issueType.is_active !== false}
                              onChange={(value) => handleToggleIssueType(issueType, value)}
                              size="sm"
                              disabled={!canEdit}
                            />
                          )}
                          <MoreMenu
                            items={[
                              {
                                label: t("edit"),
                                icon: <Pencil className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />,
                                disabled: !canEdit,
                                onClick: () => {
                                  setEditingIssueType(issueType);
                                  setIsTypeModalOpen(true);
                                },
                              },
                              {
                                label: "删除",
                                disabled: issueType.is_default || !canEdit,
                                tone: "danger",
                                icon: <Trash2 className="size-3.5 shrink-0" strokeWidth={2} />,
                                onClick: () => requestDeleteIssueType(issueType),
                              },
                            ]}
                          />
                        </div>
                      </div>

                      <div
                        className={`grid transition-all duration-300 ease-in-out ${
                          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="border-t border-subtle">
                            <IssueTypeFieldList
                              issueTypeId={issueType.id}
                              fields={typeFields}
                              isLoading={fieldsLoading}
                              canEdit={canEdit}
                              workspaceSlug={workspaceSlug}
                              scopeKey={projectId}
                              issueType={issueType}
                              onCreate={createField}
                              onUpdate={updateField}
                              onRequestDelete={requestDeleteField}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <WorkItemTypeModal
          isOpen={isTypeModalOpen}
          isSubmitting={isTypeSubmitting}
          editingIssueType={editingIssueType}
          workspaceSlug={workspaceSlug}
          onClose={() => setIsTypeModalOpen(false)}
          onSubmit={async (data) => {
            if (editingIssueType) {
              await handleUpdateIssueType(data);
            } else {
              await handleCreateIssueType(data);
            }
          }}
        />
        <AlertModalCore
          isOpen={!!deleteTarget}
          isSubmitting={isDeleting}
          variant="danger"
          title={
            isRemovingLibraryField ? "移除字段" : deleteTarget?.kind === "field" ? "删除自定义属性" : "删除工作项类型"
          }
          primaryButtonText={
            isRemovingLibraryField ? { loading: "移除中", default: "移除" } : { loading: "删除中", default: "删除" }
          }
          secondaryButtonText="取消"
          content={
            deleteTarget?.kind === "field" && isRemovingLibraryField ? (
              <>
                确定要从此类型移除字段
                <span className="font-medium text-primary">「{deleteTarget.field.name}」</span>
                吗？
              </>
            ) : deleteTarget ? (
              <>
                确定要删除{deleteTarget.kind === "field" ? "自定义属性" : "工作项类型"}
                <span className="font-medium text-primary">
                  「{deleteTarget.kind === "field" ? deleteTarget.field.name : deleteTarget.issueType.name}」
                </span>
                吗？此操作不可撤销。
              </>
            ) : (
              ""
            )
          }
          handleClose={() => {
            if (!isDeleting) setDeleteTarget(undefined);
          }}
          handleSubmit={handleConfirmDelete}
        />
      </div>
  );
}

export const IssueTypesSettingsContent = observer(IssueTypesSettingsContentInner);

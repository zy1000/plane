import { useEffect, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TRequirementFieldDefinition,
  TRequirementFieldDefinitionPayload,
  TRequirementFieldLibraryDataLoss,
  TRequirementFieldType,
  TRequirementSelectOption,
} from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, Sortable, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { IssueTypeTag } from "@/components/project-issue-types/field-display";
import { LockedSelectBox } from "@/components/requirements/requirement-common-fields";
import { CHILD_FIELD_TYPES, ROOT_FIELD_TYPES } from "@/components/requirements/requirement-field-builder";
import {
  getRequirementSelectMode,
  getRequirementSelectOptions,
  hasValidRequirementSelectOptions,
} from "@/components/requirements/requirement-select";
import { RequirementSelectOptionsBulkModal } from "@/components/requirements/requirement-select-options-bulk-modal";
import { RequirementFieldImpactView } from "./requirement-field-impact-view";

type Props = {
  isOpen: boolean;
  /** null = 新建 */
  field: TRequirementFieldDefinition | null;
  onClose: () => void;
  /** 成功后由调用方关弹窗；失败时把后端的错误体原样抛回来 */
  onSubmit: (payload: TRequirementFieldDefinitionPayload) => Promise<unknown>;
};

type TConfig = TRequirementFieldDefinition["config"];
/** 弹窗里的一个节点草稿：根字段或表单的一个子字段。key 只在前端用（排序、定位） */
type TNodeDraft = {
  key: string;
  id?: string;
  name: string;
  field_type: TRequirementFieldType;
  is_required: boolean;
  config: TConfig;
  default_value: TRequirementFieldDefinition["default_value"];
};

const ROOT_KEY = "root";
const LABEL = "flex items-center gap-1 text-14 font-medium text-primary";
const INPUT =
  "w-full rounded-lg border border-subtle-1 bg-layer-2 px-3 text-14 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong";
const LINK = "text-13 font-medium text-accent-primary hover:underline disabled:cursor-not-allowed disabled:text-disabled";
const ICON_BUTTON =
  "grid size-8 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40";

const emptyNode = (key: string): TNodeDraft => ({
  key,
  name: "",
  field_type: "text",
  is_required: false,
  config: {},
  default_value: null,
});

const toPayloadNode = (node: TNodeDraft) => ({
  name: node.name.trim(),
  field_type: node.field_type,
  is_required: node.is_required,
  config: node.config,
  default_value: node.field_type === "form" ? null : node.default_value,
});

/**
 * 新建 / 编辑需求通用字段。表单类型带一层子字段；选择器的选项与需求类型配置页同一套规则。
 * 保存会清掉已有字段值时（后端 409），弹窗原地换成「保存影响确认」，确认后带 confirm_data_loss 重发，
 * 返回修改则回到表单、草稿不丢。
 */
export function RequirementFieldFormModal({ isOpen, field, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [root, setRoot] = useState<TNodeDraft>(() => emptyNode(ROOT_KEY));
  const [children, setChildren] = useState<TNodeDraft[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [impact, setImpact] = useState<{
    payload: TRequirementFieldDefinitionPayload;
    data: TRequirementFieldLibraryDataLoss;
  } | null>(null);
  /** 正在批量编辑选项的节点：根字段或某个子字段的 key */
  const [bulkTarget, setBulkTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRoot(
      field
        ? {
            key: ROOT_KEY,
            id: field.id,
            name: field.name,
            field_type: field.field_type,
            is_required: field.is_required,
            config: { ...field.config },
            default_value: field.default_value,
          }
        : emptyNode(ROOT_KEY)
    );
    setChildren(
      (field?.children ?? []).map((child) => ({
        key: child.id,
        id: child.id,
        name: child.name,
        field_type: child.field_type,
        is_required: child.is_required,
        config: { ...child.config },
        default_value: child.default_value,
      }))
    );
    setNameError(null);
    setError(null);
    setImpact(null);
    setBulkTarget(null);
  }, [isOpen, field]);

  const isEdit = Boolean(field);
  const usedBy = field?.used_by ?? [];
  // 被需求类型使用后不能换类型：换类型等于各类型同时丢掉这个字段的值
  const isTypeLocked = usedBy.length > 0;
  const typeLabel = (type: TRequirementFieldType) => t(`requirement_fields.field_types.${type}`);
  const defaultOptionLabels = [1, 2].map((index) => t("requirement_fields.builder.default_option", { index }));
  const rootOptions = root.field_type === "select" ? getRequirementSelectOptions(root) : [];

  /** 换类型：说明与输入提示留着，其余配置按新类型重置 */
  const withType = (node: TNodeDraft, fieldType: TRequirementFieldType): TNodeDraft => {
    const kept = {
      ...(node.config.description ? { description: node.config.description } : {}),
      ...(node.config.placeholder ? { placeholder: node.config.placeholder } : {}),
    };
    return {
      ...node,
      field_type: fieldType,
      default_value: null,
      config:
        fieldType === "select"
          ? {
              ...kept,
              selection_mode: "single",
              options: defaultOptionLabels.map((label) => ({ id: uuidv4(), label })),
            }
          : kept,
    };
  };
  const withMode = (node: TNodeDraft, mode: "single" | "multiple"): TNodeDraft => ({
    ...node,
    config: { ...node.config, selection_mode: mode },
    default_value: mode === "multiple" ? [] : null,
  });
  const withOptions = (node: TNodeDraft, options: TRequirementSelectOption[]): TNodeDraft => ({
    ...node,
    config: { ...node.config, options },
  });
  const updateChild = (key: string, update: (child: TNodeDraft) => TNodeDraft) =>
    setChildren((current) => current.map((child) => (child.key === key ? update(child) : child)));

  const addRootOption = () => {
    const taken = new Set(rootOptions.map((option) => option.label.trim().toLocaleLowerCase()));
    let index = rootOptions.length + 1;
    let label = t("requirement_fields.builder.default_option", { index });
    while (taken.has(label.toLocaleLowerCase())) {
      index += 1;
      label = t("requirement_fields.builder.default_option", { index });
    }
    setRoot(withOptions(root, [...rootOptions, { id: uuidv4(), label }]));
  };

  const bulkNode = bulkTarget === ROOT_KEY ? root : children.find((child) => child.key === bulkTarget);

  const submit = async (payload: TRequirementFieldDefinitionPayload) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(payload);
    } catch (submitError) {
      const data = (submitError ?? {}) as Partial<TRequirementFieldLibraryDataLoss> & { name?: string[] };
      if (data.code === "REQUIREMENT_FIELD_LIBRARY_DATA_LOSS" && data.affected) {
        setImpact({ payload, data: data as TRequirementFieldLibraryDataLoss });
      } else {
        setImpact(null);
        if (Array.isArray(data.name) && data.name[0]) setNameError(String(data.name[0]));
        else setError(data.error ?? "保存失败，请稍后重试。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!root.name.trim()) return setNameError("请填写字段名称");
    if (root.field_type === "select" && !hasValidRequirementSelectOptions(root))
      return setError("选择器至少需要一个选项，选项名称不能为空或重复。");
    const isForm = root.field_type === "form";
    if (isForm) {
      if (children.some((child) => !child.name.trim())) return setError("请填写子字段名称。");
      const names = children.map((child) => child.name.trim().toLocaleLowerCase());
      if (new Set(names).size !== names.length) return setError("子字段名称不能重复。");
      if (children.some((child) => child.field_type === "select" && !hasValidRequirementSelectOptions(child)))
        return setError("选择器类型的子字段至少需要一个选项，选项名称不能为空或重复。");
    }
    void submit({
      ...toPayloadNode(root),
      children: isForm
        ? children.map((child) => ({ ...(child.id ? { id: child.id } : {}), ...toPayloadNode(child) }))
        : [],
    });
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.TOP}
      width={impact ? EModalWidth.XL : EModalWidth.XXXL}
    >
      {impact ? (
        <RequirementFieldImpactView
          data={impact.data}
          isSubmitting={isSubmitting}
          onBack={() => setImpact(null)}
          onConfirm={() => void submit({ ...impact.payload, confirm_data_loss: true })}
        />
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <h2 className="text-18 font-semibold text-primary">{isEdit ? "编辑通用字段" : "新建通用字段"}</h2>
            <button type="button" className={ICON_BUTTON} onClick={handleClose} disabled={isSubmitting} aria-label="关闭">
              <X className="size-4" />
            </button>
          </div>

          {usedBy.length > 0 && (
            <div className="mx-6 mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-layer-1 px-3 py-2.5 text-13">
              <span className="text-secondary">使用的类型</span>
              {usedBy.map((type) => (
                <IssueTypeTag
                  key={type.requirement_type_id}
                  name={type.name}
                  icon={type.logo_props?.icon}
                  className="max-w-48 min-w-0 shrink bg-surface-1"
                />
              ))}
              <span className="ml-auto text-secondary">保存后同步更新</span>
            </div>
          )}

          <div className="flex max-h-[calc(100vh-17rem)] flex-col gap-5 overflow-y-auto px-6 pt-4 pb-6">
            <div className="flex flex-col gap-1.5">
              <label className={LABEL} htmlFor="requirement-field-definition-name">
                字段名称
                <span className="text-danger-primary">*</span>
              </label>
              <input
                id="requirement-field-definition-name"
                className={cn(INPUT, "h-10", nameError && "border-danger-strong focus:border-danger-strong")}
                maxLength={255}
                value={root.name}
                placeholder="请输入字段名称"
                autoFocus
                onChange={(event) => {
                  setRoot({ ...root, name: event.target.value });
                  if (nameError) setNameError(null);
                }}
              />
              {nameError && <p className="text-11 leading-4 text-danger-primary">{nameError}</p>}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_120px] items-start gap-6">
              <div className="flex flex-col gap-1.5">
                <label className={LABEL} htmlFor="requirement-field-definition-type">
                  字段类型
                </label>
                {isTypeLocked ? (
                  <LockedSelectBox label={typeLabel(root.field_type)} />
                ) : (
                  <select
                    id="requirement-field-definition-type"
                    className={cn(INPUT, "h-10")}
                    value={root.field_type}
                    onChange={(event) => {
                      const next = event.target.value as TRequirementFieldType;
                      setRoot(withType(root, next));
                      if (next !== "form") setChildren([]);
                    }}
                  >
                    {ROOT_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {typeLabel(type)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>必填</span>
                <div className="flex h-10 items-center">
                  <ToggleSwitch
                    value={root.is_required}
                    onChange={(value) => setRoot({ ...root, is_required: value })}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {root.field_type === "select" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>选择模式</span>
                  <div className="grid w-60 grid-cols-2 rounded-lg border border-subtle bg-surface-1 p-0.5">
                    {(["single", "multiple"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={getRequirementSelectMode(root) === mode}
                        onClick={() => setRoot(withMode(root, mode))}
                        className={cn(
                          "h-8 rounded-md text-13 font-medium transition-colors",
                          getRequirementSelectMode(root) === mode
                            ? "bg-layer-2 text-primary shadow-sm"
                            : "text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                        )}
                      >
                        {t(`requirement_fields.builder.${mode === "multiple" ? "multiple_select" : "single_select"}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className={LABEL}>
                      选项
                      <span className="rounded bg-layer-2 px-1.5 text-12 font-medium text-secondary tabular-nums">
                        {rootOptions.length}
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      <button type="button" className={LINK} onClick={() => setBulkTarget(ROOT_KEY)}>
                        批量编辑
                      </button>
                      <button type="button" className={LINK} onClick={addRootOption}>
                        添加选项
                      </button>
                    </span>
                  </div>
                  <Sortable
                    id="requirement-field-definition-options"
                    data={rootOptions}
                    keyExtractor={(option) => option.id}
                    containerClassName="mb-2 last:mb-0"
                    onChange={(options) => setRoot(withOptions(root, options))}
                    render={(option, index) => (
                      <div className="flex items-center gap-2.5">
                        <span
                          data-sortable-drag-handle
                          className="grid size-5 shrink-0 cursor-grab place-items-center text-tertiary active:cursor-grabbing"
                        >
                          <GripVertical className="pointer-events-none size-4" />
                        </span>
                        <input
                          className={cn(INPUT, "h-9")}
                          maxLength={255}
                          value={option.label}
                          aria-label={t("requirement_fields.builder.option_label", { index: index + 1 })}
                          onChange={(event) =>
                            setRoot(
                              withOptions(
                                root,
                                rootOptions.map((item) =>
                                  item.id === option.id ? { ...item, label: event.target.value } : item
                                )
                              )
                            )
                          }
                        />
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          disabled={rootOptions.length <= 1}
                          aria-label={t("requirement_fields.builder.delete_option")}
                          onClick={() =>
                            setRoot(
                              withOptions(
                                root,
                                rootOptions.filter((item) => item.id !== option.id)
                              )
                            )
                          }
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    )}
                  />
                </div>
              </>
            )}

            {root.field_type === "form" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={LABEL}>
                    子字段
                    <span className="rounded bg-layer-2 px-1.5 text-12 font-medium text-secondary tabular-nums">
                      {children.length}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={LINK}
                    onClick={() => setChildren((current) => [...current, emptyNode(uuidv4())])}
                  >
                    添加子字段
                  </button>
                </div>
                {children.length === 0 && <p className="text-13 text-tertiary">暂无子字段</p>}
                <Sortable
                  id="requirement-field-definition-children"
                  data={children}
                  keyExtractor={(child) => child.key}
                  containerClassName="mb-2 last:mb-0"
                  onChange={setChildren}
                  render={(child) => (
                    <div>
                      <div className="grid grid-cols-[20px_minmax(0,1fr)_168px_32px] items-center gap-2.5">
                        <span
                          data-sortable-drag-handle
                          className="grid size-5 cursor-grab place-items-center text-tertiary active:cursor-grabbing"
                        >
                          <GripVertical className="pointer-events-none size-4" />
                        </span>
                        <input
                          className={cn(INPUT, "h-9")}
                          maxLength={255}
                          value={child.name}
                          placeholder="子字段名称"
                          aria-label="子字段名称"
                          onChange={(event) =>
                            updateChild(child.key, (current) => ({ ...current, name: event.target.value }))
                          }
                        />
                        <select
                          className={cn(INPUT, "h-9")}
                          value={child.field_type}
                          aria-label="子字段类型"
                          onChange={(event) =>
                            updateChild(child.key, (current) =>
                              withType(current, event.target.value as TRequirementFieldType)
                            )
                          }
                        >
                          {CHILD_FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {typeLabel(type)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          aria-label="删除子字段"
                          onClick={() => setChildren((current) => current.filter((item) => item.key !== child.key))}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      {child.field_type === "select" && (
                        <div className="mt-1.5 flex items-center gap-4 pl-[30px] text-13 text-secondary">
                          <select
                            className="h-7 rounded-md border border-subtle-1 bg-layer-2 px-2 text-13 text-primary outline-none"
                            value={getRequirementSelectMode(child)}
                            aria-label="选择模式"
                            onChange={(event) =>
                              updateChild(child.key, (current) =>
                                withMode(current, event.target.value === "multiple" ? "multiple" : "single")
                              )
                            }
                          >
                            <option value="single">{t("requirement_fields.builder.single_select")}</option>
                            <option value="multiple">{t("requirement_fields.builder.multiple_select")}</option>
                          </select>
                          <button type="button" className={LINK} onClick={() => setBulkTarget(child.key)}>
                            编辑选项（{getRequirementSelectOptions(child).length}）
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                />
              </div>
            )}

            {root.field_type !== "form" && (
              <div className="flex flex-col gap-1.5">
                <label className={LABEL} htmlFor="requirement-field-definition-placeholder">
                  {t("requirement_fields.fields.placeholder")}
                </label>
                <input
                  id="requirement-field-definition-placeholder"
                  className={cn(INPUT, "h-10")}
                  value={String(root.config.placeholder ?? "")}
                  onChange={(event) => setRoot({ ...root, config: { ...root.config, placeholder: event.target.value } })}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className={LABEL} htmlFor="requirement-field-definition-description">
                字段说明
              </label>
              <textarea
                id="requirement-field-definition-description"
                className={cn(INPUT, "min-h-[72px] resize-none py-2 leading-5")}
                value={String(root.config.description ?? "")}
                placeholder="帮助填写人理解该字段"
                onChange={(event) => setRoot({ ...root, config: { ...root.config, description: event.target.value } })}
              />
            </div>

            {error && <p className="text-13 leading-5 text-danger-primary">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-subtle px-6 py-4">
            <Button variant="secondary" size="lg" type="button" onClick={handleClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
              {isEdit ? "保存" : "创建"}
            </Button>
          </div>
        </form>
      )}

      <RequirementSelectOptionsBulkModal
        isOpen={Boolean(bulkNode)}
        onClose={() => setBulkTarget(null)}
        options={bulkNode ? getRequirementSelectOptions(bulkNode) : []}
        onApply={(options) => {
          if (bulkTarget === ROOT_KEY) setRoot(withOptions(root, options));
          else if (bulkTarget) updateChild(bulkTarget, (child) => withOptions(child, options));
        }}
      />
    </ModalCore>
  );
}

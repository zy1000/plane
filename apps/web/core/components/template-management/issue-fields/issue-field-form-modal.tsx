import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueFieldLibraryItem, TIssueFieldLibraryPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, TextArea, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  buildFieldPayload,
  changeFieldType,
  DEFAULT_FIELD_FORM,
  fieldToFormState,
  getNormalizedSelectOptions,
  isSelectFieldType,
  removeSelectOption,
  SelectExtraFieldDefaultMultiple,
  SelectExtraFieldDefaultSingle,
} from "@/components/project-issue-types/field-form";
import type { TFieldFormState } from "@/components/project-issue-types/field-form";
import { getIssueFieldErrorMessage } from "./helpers";
import { IssueFieldSyncTargets } from "./issue-field-used-by";

type Props = {
  isOpen: boolean;
  /** null 为新建 */
  field: TIssueFieldLibraryItem | null;
  onClose: () => void;
  /** 失败时抛出，弹窗保持打开 */
  onSubmit: (payload: TIssueFieldLibraryPayload) => Promise<unknown>;
};

/** 顺序同效果图 */
const FIELD_TYPE_SEGMENTS: { value: TFieldFormState["field_type"]; label: string }[] = [
  { value: "select", label: "下拉" },
  { value: "text", label: "文本" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "user", label: "人员" },
  { value: "boolean", label: "是/否" },
];

const LABEL_CLASS = "text-13 font-medium text-secondary";
const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-14 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong";

function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  title,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" title={title} className={cn("flex gap-0.5 rounded-[9px] bg-layer-1 p-[3px]", className)}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled && !isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 flex-1 rounded-[7px] px-2 text-13 whitespace-nowrap transition-colors",
              isActive
                ? "bg-surface-1 font-medium text-primary shadow-raised-100"
                : "text-secondary hover:text-primary disabled:cursor-not-allowed disabled:text-disabled disabled:hover:text-disabled"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 改选项文字时，若它正是默认值，默认值跟着改，免得保存时默认值被悄悄丢掉 */
const renameSelectOption = (form: TFieldFormState, index: number, value: string): TFieldFormState => {
  const previous = (form.select_options[index] ?? "").trim();
  const nextOptions = [...form.select_options];
  nextOptions[index] = value;
  const next = value.trim();
  return {
    ...form,
    select_options: nextOptions,
    select_default_value: previous && form.select_default_value === previous ? next : form.select_default_value,
    select_default_values: previous
      ? form.select_default_values.map((item) => (item === previous ? next : item))
      : form.select_default_values,
  };
};

/**
 * 通用字段库的新建 / 编辑弹窗：左栏基本定义，右栏下拉选项（不是下拉时收成单栏）。
 * 表单状态、校验、请求体与类型属性的行内表单共用 project-issue-types/field-form。
 */
export function IssueFieldFormModal({ isOpen, field, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TFieldFormState>(DEFAULT_FIELD_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 打开时聚焦名称：不指定时 Headless UI 会聚焦右上角的关闭按钮
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // 新建默认选「下拉」（分段里的第一个）
    setForm(field ? fieldToFormState(field) : { ...DEFAULT_FIELD_FORM, field_type: "select" });
  }, [isOpen, field?.id]);

  const isEditing = Boolean(field);
  const isSelect = isSelectFieldType(form.field_type);
  const selectOptions = getNormalizedSelectOptions(form.select_options);
  const isDefaultOption = (option: string) => {
    const value = option.trim();
    if (!value) return false;
    return form.select_is_multiple ? form.select_default_values.includes(value) : form.select_default_value === value;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    const built = buildFieldPayload(form);
    if ("error" in built) {
      setToast({ type: TOAST_TYPE.ERROR, title: "校验失败", message: built.error });
      return;
    }
    const { name, description, field_type, is_required, is_active, options, default_value } = built.payload;
    const payload: TIssueFieldLibraryPayload = {
      name,
      description: description ?? "",
      field_type,
      is_required: is_required === true,
      is_active: is_active !== false,
      ...(options !== undefined ? { options } : {}),
      ...("default_value" in built.payload ? { default_value } : {}),
    };
    setIsSubmitting(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: isEditing ? "保存失败" : "创建失败",
        message: getIssueFieldErrorMessage(
          error,
          isEditing ? "无法保存字段，请稍后重试。" : "无法创建字段，请稍后重试。"
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDefaultValue = () => {
    if (isSelect) {
      if (selectOptions.length === 0) return null;
      return (
        <div className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>默认值</span>
          {form.select_is_multiple ? (
            <SelectExtraFieldDefaultMultiple
              label={null}
              values={form.select_default_values}
              options={selectOptions}
              onChange={(select_default_values) => setForm({ ...form, select_default_values })}
            />
          ) : (
            <SelectExtraFieldDefaultSingle
              label={null}
              value={form.select_default_value}
              options={selectOptions}
              onChange={(select_default_value) => setForm({ ...form, select_default_value })}
            />
          )}
        </div>
      );
    }
    if (form.field_type === "number") {
      return (
        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>默认值</span>
          <input
            type="number"
            inputMode="decimal"
            value={form.number_default_value}
            onChange={(event) => setForm({ ...form, number_default_value: event.target.value })}
            placeholder="不设置"
            className={INPUT_CLASS}
          />
        </label>
      );
    }
    return null;
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={isSelect ? EModalWidth.XXXXL : EModalWidth.XL}
      initialFocus={nameInputRef}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="flex items-center justify-between gap-3 px-7 pt-5">
          <h2 className="text-20 font-semibold text-primary">{isEditing ? "编辑字段" : "新建字段"}</h2>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className={cn("grid gap-8 px-7 pt-[18px] pb-6", isSelect ? "grid-cols-2" : "grid-cols-1")}>
          <div className="flex min-w-0 flex-col gap-[18px]">
            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASS}>
                字段名称<span className="ml-0.5 text-danger-primary">*</span>
              </span>
              <input
                ref={nameInputRef}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                maxLength={255}
                className={INPUT_CLASS}
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className={LABEL_CLASS}>字段类型</span>
              <Segmented
                options={FIELD_TYPE_SEGMENTS}
                value={form.field_type}
                disabled={isEditing}
                title={isEditing ? "编辑时不可修改字段类型" : undefined}
                onChange={(fieldType) => setForm(changeFieldType(form, fieldType))}
              />
            </div>

            {(isSelect || form.field_type === "user") && (
              <div className="flex flex-col gap-2">
                <span className={LABEL_CLASS}>选择方式</span>
                <Segmented
                  className="w-[200px]"
                  options={[
                    { value: "single", label: "单选" },
                    { value: "multiple", label: "多选" },
                  ]}
                  value={(isSelect ? form.select_is_multiple : form.user_is_multiple) ? "multiple" : "single"}
                  onChange={(mode) => {
                    const multiple = mode === "multiple";
                    if (!isSelect) {
                      setForm({ ...form, user_is_multiple: multiple });
                      return;
                    }
                    // 单 / 多选切换时把已有默认值搬到另一种形态，不丢
                    setForm(
                      multiple
                        ? {
                            ...form,
                            select_is_multiple: true,
                            select_default_values: form.select_default_value ? [form.select_default_value] : [],
                            select_default_value: "",
                          }
                        : {
                            ...form,
                            select_is_multiple: false,
                            select_default_value: form.select_default_values[0] ?? "",
                            select_default_values: [],
                          }
                    );
                  }}
                />
              </div>
            )}

            {form.field_type === "text" && (
              <div className="flex flex-col gap-2">
                <span className={LABEL_CLASS}>文本格式</span>
                <Segmented
                  className="w-[200px]"
                  options={[
                    { value: "single_line", label: "单行" },
                    { value: "paragraph", label: "多行" },
                  ]}
                  value={form.text_is_paragraph ? "paragraph" : "single_line"}
                  onChange={(mode) => setForm({ ...form, text_is_paragraph: mode === "paragraph" })}
                />
              </div>
            )}

            {renderDefaultValue()}

            <div className="flex h-10 items-center justify-between">
              <span className={LABEL_CLASS}>必填</span>
              <ToggleSwitch value={form.is_required} onChange={(value) => setForm({ ...form, is_required: value })} />
            </div>

            <label className="flex flex-col gap-2">
              <span className={LABEL_CLASS}>说明</span>
              <TextArea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="填写字段说明"
                className="h-[72px] resize-none rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-14"
              />
            </label>
          </div>

          {isSelect && (
            <div className="flex min-w-0 flex-col gap-2">
              <span className={LABEL_CLASS}>选项</span>
              <div className="flex max-h-[460px] flex-col overflow-y-auto rounded-[10px] border border-subtle p-1.5">
                {form.select_options.map((option, index) => (
                  <div
                    key={index}
                    className="flex h-[42px] shrink-0 items-center gap-2.5 rounded-lg pr-2 pl-2.5 hover:bg-layer-1-hover"
                  >
                    <input
                      value={option}
                      onChange={(event) => setForm(renameSelectOption(form, index, event.target.value))}
                      onKeyDown={(event) => {
                        // 选项里回车不提交整张表单
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      placeholder="选项名称"
                      className="h-8 min-w-0 flex-1 bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
                    />
                    {isDefaultOption(option) && (
                      <span className="shrink-0 rounded-[5px] bg-layer-1 px-2 text-12 leading-[22px] text-secondary">
                        默认
                      </span>
                    )}
                    {form.select_options.length > 1 && (
                      <button
                        type="button"
                        aria-label="删除选项"
                        className="grid size-7 shrink-0 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-danger-primary"
                        onClick={() => setForm(removeSelectOption(form, index))}
                      >
                        <X className="size-[15px]" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="flex h-10 shrink-0 items-center px-2.5 text-left text-14 text-accent-primary hover:underline"
                  onClick={() => setForm({ ...form, select_options: [...form.select_options, ""] })}
                >
                  添加选项
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 rounded-b-lg border-t border-subtle bg-surface-2 px-7 py-4">
          {field && <IssueFieldSyncTargets field={field} />}
          <div className="ml-auto flex shrink-0 gap-2.5">
            <Button
              variant="secondary"
              size="xl"
              className="px-4"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="xl"
              className="px-4"
              type="submit"
              loading={isSubmitting}
              disabled={!form.name.trim()}
            >
              {isEditing ? "保存" : "创建"}
            </Button>
          </div>
        </div>
      </form>
    </ModalCore>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TIssueFieldLibraryItem, TIssueFieldLibraryPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { buildFieldPayload, DEFAULT_FIELD_FORM, fieldToFormState } from "@/components/project-issue-types/field-form";
import type { TFieldFormState } from "@/components/project-issue-types/field-form";
import { FieldLinkageEditor } from "@/components/project-issue-types/field-linkage-editor";
import type { TLinkageIssueType } from "@/utils/field-linkage";
import { getIssueFieldErrorMessage } from "./helpers";
import { IssueFieldPreview } from "./issue-field-preview";
import { IssueFieldSettings } from "./issue-field-settings";

type Props = {
  isOpen: boolean;
  fields: TIssueFieldLibraryItem[];
  field: TIssueFieldLibraryItem | null;
  /** 类型库里的类型：联动规则的「工作项类型」条件从这里选 */
  issueTypes: TLinkageIssueType[];
  onClose: () => void;
  onSubmit: (payload: TIssueFieldLibraryPayload) => Promise<unknown>;
};
type Tab = "settings" | "linkage";
const TABS: { id: Tab; label: string }[] = [
  { id: "settings", label: "字段设置" },
  { id: "linkage", label: "联动规则" },
];

/** 单栏弹窗：页头和页脚固定，中间随内容长高、超出后滚动。联动规则页签下方带一张预览卡片。 */
export function IssueFieldFormModal({ isOpen, field, fields, issueTypes, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TFieldFormState>(DEFAULT_FIELD_FORM);
  const [activeTab, setActiveTab] = useState<Tab>("settings");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  useEffect(() => {
    if (!isOpen) return;
    setForm(field ? fieldToFormState(field) : { ...DEFAULT_FIELD_FORM, field_type: "select" });
    setActiveTab("settings");
    setError(null);
  }, [isOpen, field?.id]);

  const updateForm = (next: TFieldFormState) => {
    setForm(next);
    setError(null);
  };
  const close = () => {
    if (!isSubmitting) onClose();
  };
  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!form.name.trim()) {
      setActiveTab("settings");
      setError("请填写字段名称。");
      requestAnimationFrame(() => nameInputRef.current?.focus());
      return;
    }
    const built = buildFieldPayload(form);
    if ("error" in built) {
      setActiveTab(built.error.includes("联动") ? "linkage" : "settings");
      setError(built.error);
      return;
    }
    const { name, description, field_type, is_required, is_active, options, default_value, linkage } = built.payload;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        description: description ?? "",
        field_type,
        is_required: is_required === true,
        is_active: is_active !== false,
        linkage,
        ...(options !== undefined ? { options } : {}),
        ...("default_value" in built.payload ? { default_value } : {}),
      });
      onClose();
    } catch (submitError) {
      if (submitError && typeof submitError === "object" && "linkage" in submitError) setActiveTab("linkage");
      setError(getIssueFieldErrorMessage(submitError, "无法保存字段，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={close}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXL}
      initialFocus={nameInputRef}
      className="overflow-hidden border border-subtle"
    >
      <form
        className="flex max-h-[min(860px,calc(100dvh-2rem))] min-h-0 flex-col"
        aria-label={field ? "编辑字段" : "新建字段"}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <header className="shrink-0 px-6 pt-6 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-18 font-semibold text-primary">{field ? "编辑字段" : "新建字段"}</h2>
            <button
              type="button"
              aria-label="关闭"
              disabled={isSubmitting}
              onClick={close}
              className="-mr-1 grid size-8 place-items-center rounded-lg text-secondary hover:bg-layer-1-hover disabled:opacity-50"
            >
              <X className="size-[18px]" />
            </button>
          </div>
          <div role="tablist" aria-label="字段配置" className="mt-5 flex gap-8">
            {TABS.map((tab, index) => (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${id}-${tab.id}-tab`}
                aria-controls={`${id}-${tab.id}-panel`}
                aria-selected={activeTab === tab.id}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
                  setActiveTab(TABS[next].id);
                  tabRefs.current[next]?.focus();
                }}
                className={cn(
                  "border-b-2 px-0.5 pb-3 text-14 outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
                  activeTab === tab.id
                    ? "border-accent-strong font-semibold text-primary"
                    : "border-transparent text-secondary hover:text-primary"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto border-t border-subtle px-6 py-7 sm:px-8"
          data-modal-wheel-scroll
        >
          <div
            role="tabpanel"
            id={`${id}-settings-panel`}
            aria-labelledby={`${id}-settings-tab`}
            hidden={activeTab !== "settings"}
          >
            <IssueFieldSettings
              key={`${field?.id ?? "new"}-${isOpen}`}
              form={form}
              onChange={updateForm}
              nameInputRef={nameInputRef}
              isEditing={Boolean(field)}
              disabled={isSubmitting}
            />
          </div>
          <div
            role="tabpanel"
            id={`${id}-linkage-panel`}
            aria-labelledby={`${id}-linkage-tab`}
            hidden={activeTab !== "linkage"}
            className="space-y-6"
          >
            <FieldLinkageEditor
              key={`editor-${field?.id ?? "new"}-${isOpen}`}
              fieldId={field?.id}
              fieldType={form.field_type}
              fields={fields}
              issueTypes={issueTypes}
              choices={form.select_options
                .map((option) => option.trim())
                .filter(Boolean)
                .map((key) => ({ key, label: key }))}
              value={form.linkage}
              onChange={(linkage) => updateForm({ ...form, linkage })}
              disabled={isSubmitting}
            />
            <IssueFieldPreview
              key={`preview-${field?.id ?? "new"}-${isOpen}`}
              form={form}
              fields={fields}
              fieldId={field?.id}
              issueTypes={issueTypes}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="shrink-0 border-t border-subtle px-6 py-2.5 text-14 text-danger-primary sm:px-8">
            {error}
          </p>
        )}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-subtle px-6 py-4 sm:px-8">
          <span className="hidden text-13 text-secondary sm:block">
            {field && field.binding_count > 0 ? `保存后同步到 ${field.binding_count} 个类型` : ""}
          </span>
          <div className="ml-auto flex gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="xl"
              className="px-3"
              onClick={close}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="xl"
              className="px-3"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {field ? "保存" : "创建"}
            </Button>
          </div>
        </footer>
      </form>
    </ModalCore>
  );
}

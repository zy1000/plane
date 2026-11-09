import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TIssueFieldLibraryItem, TIssueFieldLibraryPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { buildFieldPayload, DEFAULT_FIELD_FORM, fieldToFormState } from "@/components/project-issue-types/field-form";
import type { TFieldFormState } from "@/components/project-issue-types/field-form";
import { FieldLinkageEditor } from "@/components/project-issue-types/field-linkage-editor";
import { dependencyClosure, linkageSources } from "@/utils/field-linkage";
import { getIssueFieldErrorMessage } from "./helpers";
import { IssueFieldPreview } from "./issue-field-preview";
import { IssueFieldSettings } from "./issue-field-settings";
import { IssueFieldSyncTargets } from "./issue-field-used-by";

type Props = {
  isOpen: boolean;
  fields: TIssueFieldLibraryItem[];
  field: TIssueFieldLibraryItem | null;
  onClose: () => void;
  onSubmit: (payload: TIssueFieldLibraryPayload) => Promise<unknown>;
};
type Tab = "settings" | "linkage";
const TABS: { id: Tab; label: string }[] = [
  { id: "settings", label: "字段设置" },
  { id: "linkage", label: "联动规则" },
];

/** Fixed header/footer with independently scrollable editing and live preview panes. */
export function IssueFieldFormModal({ isOpen, field, fields, onClose, onSubmit }: Props) {
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
  const dependencyNames = dependencyClosure(fields, linkageSources(form.linkage)).map((source) => source.name);
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
      setActiveTab(/显示|映射/.test(built.error) ? "linkage" : "settings");
      setError(built.error);
      return;
    }
    if (linkageSources(form.linkage).length !== Object.keys(form.linkage).length) {
      setActiveTab("linkage");
      setError("请为已开启的联动规则选择来源字段。");
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
      width={EModalWidth.XXXXL}
      initialFocus={nameInputRef}
      className="overflow-hidden border border-subtle"
    >
      <form
        className="flex h-[min(820px,calc(100dvh-2rem))] min-h-0 flex-col"
        aria-label={field ? "编辑字段" : "新建字段"}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <header className="shrink-0 px-6 pt-5 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-20 font-semibold text-primary">{field ? "编辑字段" : "新建字段"}</h2>
              <span className="rounded bg-layer-1 px-2 py-0.5 text-12 font-medium text-secondary">通用字段</span>
            </div>
            <button
              type="button"
              aria-label="关闭"
              disabled={isSubmitting}
              onClick={close}
              className="-mr-1 grid size-7 place-items-center rounded text-secondary hover:bg-layer-1-hover disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 text-13 text-secondary">定义字段内容与填写规则</p>
          <div role="tablist" aria-label="字段配置" className="mt-5 flex gap-7">
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
          className="grid min-h-0 flex-1 overflow-y-auto border-t border-subtle md:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] md:overflow-hidden"
          data-modal-wheel-scroll
        >
          <div className="min-w-0 px-6 py-6 sm:px-7 md:overflow-y-auto" data-modal-wheel-scroll>
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
            >
              <FieldLinkageEditor
                fieldId={field?.id}
                fieldType={form.field_type}
                fieldName={form.name}
                fields={fields}
                choices={form.select_options
                  .map((option) => option.trim())
                  .filter(Boolean)
                  .map((key) => ({ key, label: key }))}
                value={form.linkage}
                onChange={(linkage) => updateForm({ ...form, linkage })}
                disabled={isSubmitting}
              />
              {dependencyNames.length > 0 && (
                <p className="mt-6 border-t border-subtle pt-4 text-12 leading-5 text-secondary">
                  依赖字段：{dependencyNames.join("、")}。引用类型中缺少的依赖会一并添加。
                </p>
              )}
              {field && field.binding_count > 0 && (
                <div className="mt-4 space-y-2 text-12 leading-5 text-secondary">
                  <IssueFieldSyncTargets field={field} />
                  <p>保存后同步至 {field.binding_count} 处引用；遇到同名冲突时整次保存取消。</p>
                </div>
              )}
            </div>
          </div>
          <IssueFieldPreview
            key={`${field?.id ?? "new"}-${isOpen}`}
            form={form}
            fields={fields}
            fieldId={field?.id}
            showLinkage={activeTab === "linkage"}
          />
        </div>
        {error && (
          <p role="alert" className="shrink-0 border-t border-subtle px-6 py-2 text-13 text-danger-primary sm:px-7">
            {error}
          </p>
        )}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-subtle px-6 py-4 sm:px-7">
          <span className="hidden text-12 text-secondary sm:block">
            {field ? `保存后同步到 ${field.binding_count} 处引用` : "创建后可添加到工作项类型"}
          </span>
          <div className="ml-auto flex gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="xl"
              className="h-9 px-3"
              onClick={close}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="xl"
              className="h-9 px-3"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {field ? "保存修改" : "创建字段"}
            </Button>
          </div>
        </footer>
      </form>
    </ModalCore>
  );
}

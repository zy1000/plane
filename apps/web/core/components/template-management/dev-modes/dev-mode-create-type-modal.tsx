import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { TCreateDevModeIssueTypePayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
import {
  getRandomTypeIconOption,
  toTypeIconProps,
  TypeIconPicker,
} from "@/components/common/type-icon-picker";
import type { TTypeIconOption } from "@/components/common/type-icon-picker";
import { getApiErrorMessage } from "@/components/project-issue-types/root";
import { IssueTypeCategorySelect } from "@/components/workspace/settings/issue-type-categories/issue-type-category-select";
import { useIssueTypeCategories } from "@/hooks/store/use-issue-type-categories";

const LABEL = "flex items-center gap-0.5 text-13 font-medium text-secondary";

/**
 * 在研发模式里新建工作项类型：字段同类型库的新建弹窗（图标、名称、分类、描述），
 * 建好的类型进类型库并自动关联到当前模式，底部左侧标出关联到哪个模式。
 *
 * 不直接用 WorkItemTypeModal：它的底栏没有放「关联到」的位置。
 */
export function DevModeCreateTypeModal({
  isOpen,
  workspaceSlug,
  devModeName,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  workspaceSlug: string;
  devModeName: string;
  onClose: () => void;
  /** 失败时抛出，错误显示在底栏上方，弹窗保持打开 */
  onSubmit: (payload: TCreateDevModeIssueTypePayload) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconOption, setIconOption] = useState<TTypeIconOption>(getRandomTypeIconOption);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<number | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { categories, isLoading: isCategoriesLoading, fetchCategories } = useIssueTypeCategories(workspaceSlug);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setIconOption(getRandomTypeIconOption());
    setIsIconPickerOpen(false);
    setCategoryId(null);
    setError(null);
    void fetchCategories();
  }, [isOpen, fetchCategories]);

  const hasCategory = categoryId !== null && categoryId !== undefined && categoryId !== "";
  const canSubmit = !!name.trim() && hasCategory && !isSubmitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        logo_props: { icon: toTypeIconProps(iconOption) },
        category_id: categoryId,
      });
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "无法创建工作项类型，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !isSubmitting && onClose()}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
      className="overflow-visible"
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-18 font-semibold text-primary">新建工作项类型</h2>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-6 pt-4 pb-6">
          <div className="flex flex-col gap-2">
            <span className={LABEL}>
              名称<span className="text-danger-primary">*</span>
            </span>
            <div className="flex gap-2.5">
              <TypeIconPicker
                value={iconOption}
                isOpen={isIconPickerOpen}
                onChange={setIconOption}
                onToggle={setIsIconPickerOpen}
                buttonClassName="rounded-md border border-subtle"
              />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="为此工作项类型取一个独特的名称"
                maxLength={255}
                autoFocus
                className="h-9 min-w-0 flex-1 rounded-md border border-subtle bg-surface-1 px-3 text-14 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className={LABEL}>
              分类<span className="text-danger-primary">*</span>
            </span>
            <IssueTypeCategorySelect
              value={categoryId}
              categories={categories}
              isLoading={isCategoriesLoading}
              onChange={setCategoryId}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className={LABEL}>描述</span>
            <TextArea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="描述此工作项类型的用途和使用时机"
              className="min-h-24 resize-none rounded-md border border-subtle bg-surface-1 text-14"
            />
          </div>

          {error && <p className="text-12 text-danger-primary">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-subtle bg-surface-2 px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-2 text-13 text-secondary">
            <span className="shrink-0">关联到</span>
            <span className="inline-flex h-[26px] max-w-60 items-center truncate rounded-md bg-accent-subtle px-2.5 text-13 font-medium text-accent-primary">
              {devModeName}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="xl" className="px-3" type="button" onClick={onClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button
              variant="primary"
              size="xl"
              className="px-3"
              type="submit"
              loading={isSubmitting}
              disabled={!canSubmit}
            >
              创建
            </Button>
          </div>
        </div>
      </form>
    </ModalCore>
  );
}

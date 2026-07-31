import { useEffect, useState } from "react";
import { Settings2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirement } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { renderFormattedDateTime } from "@plane/utils";

type TMetadataDraft = Pick<TRequirement, "title" | "description_html">;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** 页面草稿的当前值，打开弹窗时作为本地草稿的初值 */
  metadata: TMetadataDraft;
  /** 点「确定」才回写页面草稿；「取消」丢弃本次弹窗内的修改 */
  onApply: (next: TMetadataDraft) => void;
  requirement: TRequirement | undefined;
  fieldSummary: { topLevel: number; columns: number };
};

/**
 * 模板设置：名称、说明与概况。
 *
 * 页面主体是字段构建器，这些低频且定长的元信息收进弹窗，不再占一个平级 tab。
 * 引用的标准库故意不在这里 —— 那份列表会随数据增长，放弹窗里没法看，改由头部胶囊
 * 跳到标准库列表页按模板筛选。
 *
 * 弹窗持有本地草稿，确定后才回写，所以「取消」只丢弃弹窗内的改动，不影响已改过的字段。
 */
export function RequirementTemplateSettingsModal(props: Props) {
  const { isOpen, onClose, metadata, onApply, requirement, fieldSummary } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TMetadataDraft>(metadata);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(metadata);
    setError(null);
    // metadata 只在开启时取一次快照，故意不进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleApply = () => {
    if (!draft.title.trim()) {
      setError(t("workspace_templates.requirements.validation.name_required"));
      return;
    }
    onApply({ ...draft, title: draft.title.trim() });
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-layer-2 text-secondary">
            <Settings2 className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">{t("workspace_templates.requirements.editor.settings")}</h2>
            <p className="text-11 text-secondary">
              {t("workspace_templates.requirements.editor.settings_description")}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-5" data-modal-wheel-scroll>
        <label className="block">
          <span className="mb-1.5 block text-12 font-medium text-secondary">
            {t("workspace_templates.requirements.fields.name")}
            <span className="ml-0.5 text-danger-primary">*</span>
          </span>
          <input
            value={draft.title}
            onChange={(event) => {
              setDraft({ ...draft, title: event.target.value });
              setError(null);
            }}
            maxLength={255}
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_templates.requirements.fields.name_placeholder")}
          />
          {error && <p className="mt-1.5 text-11 text-danger-primary">{error}</p>}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-12 font-medium text-secondary">
            {t("workspace_templates.requirements.fields.description")}
          </span>
          <textarea
            value={draft.description_html ?? ""}
            onChange={(event) => setDraft({ ...draft, description_html: event.target.value })}
            rows={4}
            className="focus:border-accent-primary w-full resize-y rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 leading-5 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_templates.requirements.fields.description_placeholder")}
          />
        </label>

        <section className="overflow-hidden rounded-lg border border-subtle">
          <header className="border-b border-subtle bg-layer-1 px-3 py-2 text-12 font-semibold text-primary">
            {t("workspace_templates.requirements.editor.overview")}
          </header>
          <dl className="px-3 py-1">
            <div className="flex items-center justify-between gap-3 border-b border-subtle py-2 text-12 last:border-b-0">
              <dt className="text-tertiary">{t("workspace_templates.requirements.list.field_count")}</dt>
              <dd className="m-0 font-medium tabular-nums text-primary">
                {t("workspace_templates.requirements.editor.field_summary", {
                  top: fieldSummary.topLevel,
                  columns: fieldSummary.columns,
                })}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-subtle py-2 text-12 last:border-b-0">
              <dt className="text-tertiary">{t("workspace_templates.requirements.editor.owner")}</dt>
              <dd className="m-0 font-medium text-primary">{requirement?.owner_detail?.display_name ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-subtle py-2 text-12 last:border-b-0">
              <dt className="text-tertiary">{t("workspace_templates.requirements.editor.created_at")}</dt>
              <dd className="m-0 font-medium text-primary">
                {renderFormattedDateTime(requirement?.created_at) || "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-subtle py-2 text-12 last:border-b-0">
              <dt className="text-tertiary">{t("workspace_templates.requirements.editor.updated_at")}</dt>
              <dd className="m-0 font-medium text-primary">
                {renderFormattedDateTime(requirement?.updated_at) || "—"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={handleApply}>
          {t("confirm")}
        </Button>
      </div>
    </ModalCore>
  );
}

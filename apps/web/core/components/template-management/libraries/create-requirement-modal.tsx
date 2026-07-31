import { useEffect, useState } from "react";
import { FilePlus2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import type { TRequirement } from "@plane/types";

type TProps = {
  isOpen: boolean;
  onClose: () => void;
  isMutating: boolean;
  templateTitle: string | undefined;
  fieldCount: number;
  onCreate: (payload: { title: string; description_html?: string | null }) => Promise<TRequirement>;
  onCreated: (requirement: TRequirement) => void;
};

/**
 * 新建标准需求。
 *
 * 没有审批人 / 审批规则字段 —— 标准需求不走变更审批流程，字段也来自库所选模板，
 * 所以这里只需要标题和描述。
 */
export function StandardRequirementCreateModal(props: TProps) {
  const { isOpen, onClose, isMutating, templateTitle, fieldCount, onCreate, onCreated } = props;
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDescription("");
    setError(null);
  }, [isOpen]);

  const handleCreate = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError(t("requirement_libraries.validation.requirement_title_required"));
      return;
    }
    setError(null);
    try {
      const requirement = await onCreate({
        title: normalizedTitle,
        description_html: description.trim() ? `<p>${description.trim()}</p>` : null,
      });
      onCreated(requirement);
    } catch (requestError) {
      const payload = requestError as { title?: string[]; error?: string };
      setError(payload?.title?.[0] ?? payload?.error ?? t("requirement_libraries.toast.requirement_failed"));
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-layer-2 text-secondary">
            <FilePlus2 className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">{t("requirement_libraries.requirements.create")}</h2>
            <p className="text-11 text-secondary">
              {t("requirement_libraries.requirements.create_description", {
                template: templateTitle ?? "",
                count: fieldCount,
              })}
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
      <div className="space-y-4 px-5 py-5">
        <label className="block">
          <span className="mb-1.5 block text-12 font-medium text-secondary">
            {t("requirement_libraries.requirements.fields.title")}
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("requirement_libraries.requirements.fields.title_placeholder")}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-12 font-medium text-secondary">
            {t("requirement_libraries.fields.description")}
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("requirement_libraries.fields.description_placeholder")}
          />
        </label>
        {error && <p className="text-11 text-danger-primary">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onClose} disabled={isMutating}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleCreate()} loading={isMutating}>
          {t("requirement_libraries.requirements.create_and_fill")}
        </Button>
      </div>
    </ModalCore>
  );
}

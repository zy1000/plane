import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FilePlus2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useRequirementTemplatesContext } from "./context";

export function RequirementTemplateCreateModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaceSlug, isCreateModalOpen, setIsCreateModalOpen, createTemplate, isMutating } =
    useRequirementTemplatesContext();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    setTitle("");
    setError(null);
  }, [isCreateModalOpen]);

  const handleCreate = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError(t("workspace_templates.requirements.validation.name_required"));
      return;
    }
    setError(null);
    try {
      const template = await createTemplate({
        is_template: true,
        title: normalizedTitle,
      });
      setIsCreateModalOpen(false);
      navigate(`/${workspaceSlug}/templates/requirements/${template.id}`);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_templates.requirements.toast.created"),
      });
    } catch (requestError) {
      const payload = requestError as { title?: string[]; error?: string };
      setError(payload?.title?.[0] ?? payload?.error ?? t("workspace_templates.requirements.toast.failed"));
    }
  };

  return (
    <ModalCore
      isOpen={isCreateModalOpen}
      handleClose={() => setIsCreateModalOpen(false)}
      position={EModalPosition.CENTER}
      width={EModalWidth.LG}
    >
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-layer-2 text-secondary">
            <FilePlus2 className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">{t("workspace_templates.requirements.create")}</h2>
            <p className="text-11 text-secondary">{t("workspace_templates.requirements.create_description")}</p>
          </div>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover"
          onClick={() => setIsCreateModalOpen(false)}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-5">
        <label className="block">
          <span className="mb-1.5 block text-12 font-medium text-secondary">
            {t("workspace_templates.requirements.fields.name")}
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_templates.requirements.fields.name_placeholder")}
          />
        </label>
        {error && <p className="text-11 text-danger-primary">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)} disabled={isMutating}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleCreate()} loading={isMutating}>
          {t("workspace_templates.requirements.create_and_edit")}
        </Button>
      </div>
    </ModalCore>
  );
}

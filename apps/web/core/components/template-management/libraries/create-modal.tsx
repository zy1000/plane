import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Library, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useRequirementTemplates } from "@/hooks/store/use-requirement-templates";
import { useRequirementLibrariesContext } from "./context";

export function RequirementLibraryCreateModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaceSlug, isCreateModalOpen, setIsCreateModalOpen, createLibrary, isMutating } =
    useRequirementLibrariesContext();
  const { templates, isLoading: isTemplatesLoading } = useRequirementTemplates(workspaceSlug);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    setName("");
    setDescription("");
    setTemplateId("");
    setError(null);
  }, [isCreateModalOpen]);

  const handleCreate = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError(t("requirement_libraries.validation.name_required"));
      return;
    }
    if (!templateId) {
      setError(t("requirement_libraries.validation.template_required"));
      return;
    }
    setError(null);
    try {
      const library = await createLibrary({
        name: normalizedName,
        template_id: templateId,
        description: description.trim(),
      });
      setIsCreateModalOpen(false);
      navigate(`/${workspaceSlug}/templates/libraries/${library.id}`);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("requirement_libraries.toast.created"),
      });
    } catch (requestError) {
      const payload = requestError as { name?: string[]; template_id?: string[]; error?: string };
      setError(
        payload?.name?.[0] ?? payload?.template_id?.[0] ?? payload?.error ?? t("requirement_libraries.toast.failed")
      );
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
            <Library className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">{t("requirement_libraries.create")}</h2>
            <p className="text-11 text-secondary">{t("requirement_libraries.create_description")}</p>
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
            {t("requirement_libraries.fields.name")}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("requirement_libraries.fields.name_placeholder")}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-12 font-medium text-secondary">
            {t("requirement_libraries.fields.template")}
          </span>
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            disabled={isTemplatesLoading}
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{t("requirement_libraries.fields.template_placeholder")}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-11 text-tertiary">{t("requirement_libraries.fields.template_hint")}</span>
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
        <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)} disabled={isMutating}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleCreate()} loading={isMutating}>
          {t("requirement_libraries.create_action")}
        </Button>
      </div>
    </ModalCore>
  );
}

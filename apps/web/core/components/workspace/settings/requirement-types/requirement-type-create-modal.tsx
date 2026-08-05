import { useEffect, useState } from "react";
import { FilePlus2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TCreateRequirementTypePayload, TRequirementType } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: TCreateRequirementTypePayload) => Promise<TRequirementType>;
  onCreated: (requirementType: TRequirementType) => void;
  isSubmitting: boolean;
};

/** 纯 props 驱动，不依赖模板管理的 context —— 那个 provider 以后要删。 */
export function RequirementTypeCreateModal(props: Props) {
  const { isOpen, onClose, onCreate, onCreated, isSubmitting } = props;
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setError(null);
  }, [isOpen]);

  const handleCreate = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError(t("workspace_templates.requirement_types.validation.name_required"));
      return;
    }
    setError(null);
    try {
      onCreated(await onCreate({ name: normalizedName }));
    } catch (requestError) {
      const payload = requestError as { name?: string[]; error?: string };
      setError(payload?.name?.[0] ?? payload?.error ?? t("workspace_templates.requirement_types.toast.failed"));
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
            <h2 className="text-14 font-medium text-primary">{t("workspace_templates.requirement_types.create")}</h2>
            <p className="text-11 text-secondary">{t("workspace_templates.requirement_types.create_description")}</p>
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
            {t("workspace_templates.requirement_types.fields.name")}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_templates.requirement_types.fields.name_placeholder")}
          />
        </label>
        {error && <p className="text-11 text-danger-primary">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleCreate()} loading={isSubmitting}>
          {t("workspace_templates.requirement_types.create_and_edit")}
        </Button>
      </div>
    </ModalCore>
  );
}

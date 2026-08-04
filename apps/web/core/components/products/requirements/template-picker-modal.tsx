"use client";

import { useEffect, useMemo, useState } from "react";
import { Table2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useRequirementTemplates } from "@/hooks/store/use-requirement-templates";

/**
 * 手动录入前先选模板 —— 明细行的字段由所选模板决定。
 *
 * 只在「默认视图」或需求还没有任何模板时才需要；已经在某个模板视图里时，模板由视图
 * 确定，直接用表格下方的「新增数据」即可。
 */
type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  onClose: () => void;
  onConfirm: (templateId: string) => void;
};

export const RequirementTemplatePickerModal = ({ isOpen, workspaceSlug, onClose, onConfirm }: TProps) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { templates, isLoading } = useRequirementTemplates(workspaceSlug);

  useEffect(() => {
    if (isOpen) return;
    setSelectedId(null);
    setSearch("");
  }, [isOpen]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const active = templates.filter((template) => template.is_active);
    if (!keyword) return active;
    return active.filter((template) => template.title.toLowerCase().includes(keyword));
  }, [search, templates]);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-layer-2 text-secondary">
            <Table2 className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">
              {t("workspace_products.requirements.template_picker.title")}
            </h2>
            <p className="text-11 text-secondary">
              {t("workspace_products.requirements.template_picker.description")}
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

      <div className="max-h-[50vh] min-h-[220px] space-y-3 overflow-auto px-5 py-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="focus:border-accent-primary h-9 w-full rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder"
          placeholder={t("workspace_products.requirements.template_picker.search")}
        />
        {isLoading ? (
          <Loader>
            <Loader.Item height="140px" />
          </Loader>
        ) : !filtered.length ? (
          <p className="py-10 text-center text-13 text-secondary">
            {t("workspace_products.requirements.template_picker.empty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    selectedId === template.id
                      ? "border-accent-primary bg-layer-1"
                      : "border-subtle hover:border-accent-primary hover:bg-layer-1"
                  )}
                >
                  <span className="truncate text-13 font-medium text-primary">{template.title}</span>
                  <span className="shrink-0 text-11 text-tertiary">
                    {t("workspace_products.requirements.template_picker.field_count", {
                      count: template.field_count,
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" disabled={!selectedId} onClick={() => selectedId && onConfirm(selectedId)}>
          {t("workspace_products.requirements.template_picker.confirm")}
        </Button>
      </div>
    </ModalCore>
  );
};

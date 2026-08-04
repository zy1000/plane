"use client";

import { useEffect, useMemo, useState } from "react";
import { Table2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useRequirementTypes } from "@/hooks/store/use-requirement-types";

/**
 * 手动录入前先选类型 —— 明细行的字段由所选类型决定。
 *
 * 只在「默认视图」或需求还没有任何需求类型时才需要；已经在某个类型视图里时，类型由视图
 * 确定，直接用表格下方的「新增数据」即可。
 */
type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  onClose: () => void;
  onConfirm: (requirementTypeId: string) => void;
};

export const RequirementTypePickerModal = ({ isOpen, workspaceSlug, onClose, onConfirm }: TProps) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { requirementTypes, isLoading } = useRequirementTypes(workspaceSlug);

  useEffect(() => {
    if (isOpen) return;
    setSelectedId(null);
    setSearch("");
  }, [isOpen]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const active = requirementTypes.filter((requirementType) => requirementType.is_active);
    if (!keyword) return active;
    return active.filter((requirementType) => requirementType.name.toLowerCase().includes(keyword));
  }, [search, requirementTypes]);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-layer-2 text-secondary">
            <Table2 className="size-4" />
          </span>
          <div>
            <h2 className="text-14 font-medium text-primary">
              {t("workspace_products.requirements.requirement_type_picker.title")}
            </h2>
            <p className="text-11 text-secondary">
              {t("workspace_products.requirements.requirement_type_picker.description")}
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
          placeholder={t("workspace_products.requirements.requirement_type_picker.search")}
        />
        {isLoading ? (
          <Loader>
            <Loader.Item height="140px" />
          </Loader>
        ) : !filtered.length ? (
          <p className="py-10 text-center text-13 text-secondary">
            {t("workspace_products.requirements.requirement_type_picker.empty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((requirementType) => (
              <li key={requirementType.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(requirementType.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    selectedId === requirementType.id
                      ? "border-accent-primary bg-layer-1"
                      : "border-subtle hover:border-accent-primary hover:bg-layer-1"
                  )}
                >
                  <span className="truncate text-13 font-medium text-primary">{requirementType.name}</span>
                  <span className="shrink-0 text-11 text-tertiary">
                    {t("workspace_products.requirements.requirement_type_picker.field_count", {
                      count: requirementType.field_count,
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
          {t("workspace_products.requirements.requirement_type_picker.confirm")}
        </Button>
      </div>
    </ModalCore>
  );
};

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevModeStage, TStageType } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { DEV_MODE_I18N } from "./dev-modes-grid";

/**
 * 批量新建阶段：一次多选阶段类型，各生成一行，名称取类型名，评审节点默认全勾。
 *
 * 已有同名阶段的类型置灰标「已有」—— 后端也会跳过它们，这里提前说清楚，免得人勾了
 * 之后发现数量对不上。
 */
export function DevModeStageBulkCreateModal({
  isOpen,
  stageTypes,
  stages,
  templateCountByStageType,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  stageTypes: TStageType[];
  stages: TDevModeStage[];
  /** 每个阶段类型下的活跃评审节点数，用来在行尾提示会勾上多少 */
  templateCountByStageType: Record<string, number>;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (stageTypeIds: string[]) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const takenNames = useMemo(() => new Set(stages.map((item) => item.name)), [stages]);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setError(null);
  }, [isOpen]);

  const toggle = (stageTypeId: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(stageTypeId);
      else next.delete(stageTypeId);
      return next;
    });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selected.size === 0) return setError(t(`${DEV_MODE_I18N}.errors.bulk_nothing_selected`));
    setError(null);
    try {
      await onSubmit([...selected]);
    } catch (submitError) {
      const payload = submitError as { code?: string; error?: string } | undefined;
      setError(payload?.error ?? t(`${DEV_MODE_I18N}.errors.generic`));
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">{t(`${DEV_MODE_I18N}.bulk_create.title`)}</h2>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover disabled:opacity-50"
          onClick={onClose}
          disabled={isSubmitting}
        >
          <X className="size-4" />
        </button>
      </div>

      <form className="flex flex-col gap-3 px-5 py-5" onSubmit={handleSubmit}>
        <p className="text-11 leading-4 text-tertiary">{t(`${DEV_MODE_I18N}.bulk_create.hint`)}</p>

        <div className="vertical-scrollbar scrollbar-sm max-h-80 overflow-y-auto rounded-md border border-subtle-1">
          {stageTypes.map((stageType) => {
            const isTaken = takenNames.has(stageType.name);
            const isChecked = selected.has(stageType.id);
            const nodeCount = templateCountByStageType[stageType.id] ?? 0;
            return (
              <label
                key={stageType.id}
                className={cn(
                  "flex h-9 items-center gap-2.5 border-b border-subtle px-3 text-13 last:border-b-0",
                  isTaken ? "cursor-not-allowed text-tertiary" : "cursor-pointer",
                  isChecked && "bg-accent-subtle"
                )}
              >
                <Checkbox
                  disabled={isTaken}
                  checked={isTaken || isChecked}
                  onChange={(event) => toggle(stageType.id, event.target.checked)}
                />
                <span className="w-12 shrink-0 font-mono text-12 tabular-nums text-secondary">{stageType.code}</span>
                <span className="flex-1 truncate font-medium">{stageType.name}</span>
                <span className="shrink-0 text-11 text-tertiary">
                  {isTaken
                    ? t(`${DEV_MODE_I18N}.bulk_create.already_added`)
                    : t(`${DEV_MODE_I18N}.bulk_create.node_count`, { count: nodeCount })}
                </span>
              </label>
            );
          })}
        </div>

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={selected.size === 0}>
            {t(`${DEV_MODE_I18N}.bulk_create.confirm`, { count: selected.size })}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

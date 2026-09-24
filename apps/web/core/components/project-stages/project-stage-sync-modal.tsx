import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Route, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TDevModeStage, TProjectStage } from "@plane/types";
import { PROJECT_STAGE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { getProjectStageError } from "@/hooks/store/use-project-stages";
import { DevModeService } from "@/services/dev-mode.service";

const I18N = "project_stage.sync";
const service = new DevModeService();

/**
 * 「从研发模式带出」：列出项目研发模式的全部阶段，已带出的置灰标「已带出」，还没带出的默认勾上。
 * 已带出按 source_stage 认，同类型同名的也算（与后端 sync 口径一致）。
 * 勾选的占比合计会让叶子超 100 时给一条提示：后端会把超出的阶段占比留空。
 */
export const ProjectStageSyncModal = ({
  isOpen,
  workspaceSlug,
  devModeId,
  devModeName,
  stages,
  workloadTotal,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  workspaceSlug: string;
  devModeId: string | null | undefined;
  devModeName: string;
  stages: TProjectStage[];
  workloadTotal: number;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (modeStageIds: string[]) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const [modeStages, setModeStages] = useState<TDevModeStage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const existingBySource = useMemo(
    () => new Set(stages.map((stage) => stage.source_stage_id).filter(Boolean) as string[]),
    [stages]
  );
  const existingByTypeName = useMemo(
    () => new Set(stages.map((stage) => `${stage.stage_type_id}:${stage.name}`)),
    [stages]
  );
  const isImported = (modeStage: TDevModeStage) =>
    existingBySource.has(modeStage.id) || existingByTypeName.has(`${modeStage.stage_type_id}:${modeStage.name}`);

  useEffect(() => {
    if (!isOpen || !devModeId) return;
    setError(null);
    setModeStages(null);
    let cancelled = false;
    service
      .listStages(workspaceSlug, devModeId)
      .then((list) => {
        if (cancelled) return;
        setModeStages(list);
        setSelected(new Set(list.filter((item) => !isImported(item)).map((item) => item.id)));
      })
      .catch((requestError) => {
        if (!cancelled) setError(getProjectStageError(requestError).message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, devModeId, workspaceSlug]);

  const pending = (modeStages ?? []).filter((item) => !isImported(item));
  const selectedRatio = (modeStages ?? [])
    .filter((item) => selected.has(item.id))
    .reduce((sum, item) => sum + Math.round(Number(item.workload_ratio ?? 0) * 100), 0);
  const willExceed = Math.round(workloadTotal * 100) + selectedRatio > PROJECT_STAGE_MAX_WORKLOAD_RATIO * 100;

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selected.size === 0) return;
    setError(null);
    try {
      await onSubmit([...selected]);
      onClose();
    } catch (submitError) {
      setError(getProjectStageError(submitError).message);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex items-start justify-between px-6 pt-5 pb-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-16 font-semibold text-primary">{t(`${I18N}.title`)}</h2>
          <p className="flex items-center gap-2 text-13 text-secondary">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-accent-subtle px-2 text-12 font-medium text-accent-primary">
              <Route className="size-3.5" />
              {devModeName}
            </span>
            {modeStages
              ? t(`${I18N}.hint`, {
                  total: modeStages.length,
                  existing: modeStages.length - pending.length,
                  pending: pending.length,
                })
              : null}
          </p>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover disabled:opacity-50"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <form className="flex flex-col gap-3 px-6 pb-5" onSubmit={handleSubmit}>
        <div className="vertical-scrollbar scrollbar-sm max-h-96 overflow-y-auto rounded-lg border border-subtle-1">
          {modeStages === null && !error ? (
            <Loader className="flex flex-col gap-2 p-3">
              <Loader.Item height="28px" />
              <Loader.Item height="28px" />
              <Loader.Item height="28px" />
            </Loader>
          ) : (
            (modeStages ?? []).map((modeStage) => {
              const imported = isImported(modeStage);
              const checked = selected.has(modeStage.id);
              return (
                <label
                  key={modeStage.id}
                  className={cn(
                    "flex h-10 items-center gap-3 border-b border-subtle px-3 text-13 last:border-b-0",
                    imported ? "cursor-not-allowed text-tertiary" : "cursor-pointer",
                    checked && "bg-accent-subtle"
                  )}
                >
                  <Checkbox
                    disabled={imported}
                    checked={imported || checked}
                    onChange={(event) => toggle(modeStage.id, event.target.checked)}
                  />
                  <span className="w-12 shrink-0 font-mono text-12 tabular-nums text-tertiary">{modeStage.code}</span>
                  <span className={cn("flex-1 truncate", !imported && "font-medium text-primary")}>{modeStage.name}</span>
                  <span className="w-12 shrink-0 text-right text-12 tabular-nums text-tertiary">
                    {modeStage.workload_ratio !== null ? `${Number(modeStage.workload_ratio)}%` : ""}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-11 font-medium",
                      imported ? "bg-layer-3 text-tertiary" : "bg-accent-subtle text-accent-primary"
                    )}
                  >
                    {t(imported ? `${I18N}.already` : `${I18N}.new`)}
                  </span>
                </label>
              );
            })
          )}
          {modeStages && modeStages.length === 0 && (
            <p className="px-3 py-6 text-center text-13 text-tertiary">{t(`${I18N}.empty`)}</p>
          )}
        </div>

        {willExceed && (
          <div className="flex gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-12 text-secondary">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-primary" />
            <span>{t(`${I18N}.ratio_warning`)}</span>
          </div>
        )}
        {error && <p className="text-12 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={selected.size === 0}>
            {t(`${I18N}.confirm`, { count: selected.size })}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
};

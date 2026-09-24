import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectStage, TProjectStageBulkChanges } from "@plane/types";
import { getProjectStageError } from "@/hooks/store/use-project-stages";
import { ProjectStageService } from "@/services/project-stage.service";
import type { TProjectStageColumn } from "../project-stage-table";

const service = new ProjectStageService();
const I18N = "project_stage.bulk";
const FLASH_MS = 1600;

export type TProjectStageFlashedCells = { ids: Set<string>; columns: Set<TProjectStageColumn> };

const FIELD_COLUMN: Record<keyof TProjectStageBulkChanges, TProjectStageColumn> = {
  owner: "owner",
  start_date: "start_date",
  end_date: "end_date",
};

type TParams = {
  workspaceSlug: string;
  projectId: string;
  selectedIds: string[];
  replaceSelection: (ids: string[]) => void;
  applyStages: (stages: TProjectStage[]) => void;
};

/** 阶段列表「修改属性」：面板开关、提交、部分成功提示与格子高亮。口径同阶段评审 */
export const useProjectStageBulkEdit = ({ workspaceSlug, projectId, selectedIds, replaceSelection, applyStages }: TParams) => {
  const { t } = useTranslation();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flashedCells, setFlashedCells] = useState<TProjectStageFlashedCells | null>(null);

  useEffect(() => {
    if (selectedIds.length === 0) setIsPanelOpen(false);
  }, [selectedIds.length]);

  useEffect(() => {
    if (!flashedCells) return;
    const timer = window.setTimeout(() => setFlashedCells(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashedCells]);

  const apply = async (changes: TProjectStageBulkChanges) => {
    const ids = [...selectedIds];
    setSubmitting(true);
    try {
      const result = await service.bulkUpdate(workspaceSlug, projectId, { stage_ids: ids, ...changes });
      applyStages(result.stages);

      if (result.failed.length === 0) {
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.toast_success`, { count: result.updated }) });
      } else {
        const first = result.failed[0];
        setToast({
          type: result.updated > 0 ? TOAST_TYPE.WARNING : TOAST_TYPE.ERROR,
          title: t(`${I18N}.toast_partial`, { updated: result.updated, failed: result.failed.length }),
          message: t(`${I18N}.toast_partial_detail`, { name: first.name, error: first.error }),
        });
      }

      const failedIds = result.failed.map((item) => item.id);
      replaceSelection(failedIds);
      if (failedIds.length === 0) setIsPanelOpen(false);

      const columns = new Set(
        (Object.keys(changes) as (keyof TProjectStageBulkChanges)[]).map((field) => FIELD_COLUMN[field])
      );
      setFlashedCells({ ids: new Set(result.stages.map((stage) => stage.id)), columns });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.toast_error`), message: getProjectStageError(error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    isPanelOpen,
    togglePanel: () => setIsPanelOpen((open) => !open),
    closePanel: () => setIsPanelOpen(false),
    submitting,
    flashedCells,
    apply,
  };
};

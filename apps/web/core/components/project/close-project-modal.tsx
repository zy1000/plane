import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Clock, X } from "lucide-react";
import { PROJECT_CLOSED_STATUS_LABELS, PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
import { ModalFieldLabel } from "@/components/common/form-modal";
import { DictionaryColorDot } from "@/components/data-dictionaries";
import { DateDropdown } from "@/components/dropdowns/date";
import { useProject } from "@/hooks/store/use-project";
import type { TProjectListLookups } from "./filters/use-project-list-lookups";
import { getProjectDateFormatToken } from "./form-fields/constants";
import { resolveProjectStatusColor } from "./status-color";

const I18N = "workspace_projects.close";

type TModalProps = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
};

const toastTitleForError = (error: unknown, fallback: string, t: (key: string) => string) =>
  isProjectPermissionError(error) ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title) : fallback;

/** 弹窗标题行：标题 + 项目药丸 + 关闭 × */
const ModalHeader = ({
  title,
  project,
  onClose,
}: {
  title: string;
  project: { name: string; logo_props: Parameters<typeof Logo>[0]["logo"] };
  onClose: () => void;
}) => (
  <div className="flex items-center gap-2.5 px-6 pt-5">
    <h3 className="text-16 font-semibold text-primary">{title}</h3>
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-layer-1 py-0.5 pl-1.5 pr-2.5 text-13 font-medium text-secondary">
      <Logo logo={project.logo_props} size={14} />
      <span className="truncate">{project.name}</span>
    </span>
    <button
      type="button"
      aria-label="关闭"
      className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
      onClick={onClose}
    >
      <X className="size-4" />
    </button>
  </div>
);

/**
 * 列表行操作「关闭项目」：关成 已完成 / 已取消 之一，记实际完成日期（默认今天）与备注。
 * 终态候选从字典「项目状态」里按 PROJECT_CLOSED_STATUS_LABELS 取。
 */
export const CloseProjectModal = observer(function CloseProjectModal(props: TModalProps & { lookups: TProjectListLookups }) {
  const { workspaceSlug, projectId, isOpen, onClose, lookups } = props;
  const { t, currentLocale } = useTranslation();
  const { getProjectById, closeProject } = useProject();
  const project = getProjectById(projectId);
  const statusDictionary = lookups.getDictionary("status");
  const closedStatuses = useMemo(
    () => (statusDictionary?.items ?? []).filter((item) => PROJECT_CLOSED_STATUS_LABELS.includes(item.label)),
    [statusDictionary]
  );
  const [statusId, setStatusId] = useState<string | null>(() => closedStatuses[0]?.id ?? null);
  const [actualEndDate, setActualEndDate] = useState<string | null>(() => renderFormattedPayloadDate(new Date()) ?? null);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!project) return null;
  const canSubmit = !!statusId && !!actualEndDate && !isSubmitting;

  const handleSubmit = async () => {
    if (!statusId || !actualEndDate) return;
    setIsSubmitting(true);
    try {
      await closeProject(workspaceSlug, projectId, { status: statusId, actual_end_date: actualEndDate, close_note: note.trim() });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.success`, { name: project.name }) });
      onClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: toastTitleForError(error, t(`${I18N}.error`), t) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <ModalHeader title={t(`${I18N}.title`)} project={project} onClose={onClose} />
      <div className="flex flex-col gap-5 px-6 pt-5">
        <div>
          <ModalFieldLabel required>{t(`${I18N}.close_as`)}</ModalFieldLabel>
          {closedStatuses.length === 0 ? (
            <p className="text-13 text-danger-primary">{t(`${I18N}.no_closed_status`)}</p>
          ) : (
            <div role="radiogroup" aria-label={t(`${I18N}.close_as`)} className="inline-flex gap-0.5 rounded-lg border border-subtle-1 bg-layer-1 p-[3px]">
              {closedStatuses.map((item) => {
                const active = item.id === statusId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStatusId(item.id)}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-md border px-4 text-13 font-medium transition-colors",
                      active
                        ? "border-subtle-1 bg-surface-1 text-primary shadow-raised-200"
                        : "border-transparent text-secondary hover:text-primary"
                    )}
                  >
                    <DictionaryColorDot color={resolveProjectStatusColor(item, statusDictionary)} size="sm" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <ModalFieldLabel required>{t(`${I18N}.actual_end_date`)}</ModalFieldLabel>
          <DateDropdown
            value={getDate(actualEndDate)}
            onChange={(date) => setActualEndDate(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
            buttonVariant="border-with-text"
            isClearable={false}
            placeholder={t("workspace_projects.fields.date_placeholder")}
            formatToken={getProjectDateFormatToken(currentLocale)}
            className="w-[220px]"
            buttonContainerClassName="w-full"
            buttonClassName="h-10 w-full rounded-[10px] px-3.5 text-14"
          />
        </div>
        <div>
          <ModalFieldLabel htmlFor="project-close-note">{t(`${I18N}.note`)}</ModalFieldLabel>
          <TextArea
            id="project-close-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(`${I18N}.note_placeholder`)}
            className="min-h-[104px] w-full resize-none rounded-[10px] text-14"
          />
        </div>
      </div>
      <div className="flex items-center gap-2.5 px-6 py-5">
        <span className="inline-flex items-center gap-1.5 text-12 text-placeholder">
          <Clock className="size-3.5" />
          {t(`${I18N}.reopen_hint`)}
        </span>
        <Button variant="secondary" size="lg" className="ml-auto" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" size="lg" disabled={!canSubmit} loading={isSubmitting} onClick={handleSubmit}>
          {isSubmitting ? t(`${I18N}.submitting`) : t(`${I18N}.submit`)}
        </Button>
      </div>
    </ModalCore>
  );
});

/** 已关闭（已完成 / 已取消）的项目改回「活跃中」，实际完成日期与关闭备注清空 */
export const ReopenProjectModal = observer(function ReopenProjectModal(props: TModalProps) {
  const { workspaceSlug, projectId, isOpen, onClose } = props;
  const { t } = useTranslation();
  const { getProjectById, reopenProject } = useProject();
  const project = getProjectById(projectId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!project) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await reopenProject(workspaceSlug, projectId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.reopen_success`, { name: project.name }) });
      onClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: toastTitleForError(error, t(`${I18N}.reopen_error`), t) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <ModalHeader title={t(`${I18N}.reopen_title`)} project={project} onClose={onClose} />
      <div className="flex flex-col gap-3 px-6 pt-4">
        <p className="text-13 text-secondary">{t(`${I18N}.reopen_description`, { name: project.name })}</p>
        {project.close_note && (
          <div className="rounded-lg bg-layer-1 px-3.5 py-2.5 text-13 text-secondary">
            <span className="mr-2 text-12 text-placeholder">{t(`${I18N}.note`)}</span>
            <span className="whitespace-pre-wrap">{project.close_note}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2.5 px-6 py-5">
        <Button variant="secondary" size="lg" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" size="lg" loading={isSubmitting} onClick={handleSubmit}>
          {isSubmitting ? t(`${I18N}.reopening`) : t(`${I18N}.reopen_submit`)}
        </Button>
      </div>
    </ModalCore>
  );
});

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TStageReviewTemplate } from "@plane/types";
import {
  EStageReviewKind,
  STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT,
  STAGE_REVIEW_ACTIVITY_KINDS,
  STAGE_REVIEW_ROOT_KINDS,
} from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

export type TStageReviewFormValue = {
  kind: EStageReviewKind;
  /** null = 直接归属阶段（有些阶段没有汇总评审，活动本身就是顶层项） */
  parent_id: string | null;
  title: string;
  initiator_role: string;
  leader_role: string;
  auditor_role: string;
};

type Props = {
  isOpen: boolean;
  /** 编辑已有节点；为空即新建 */
  template: TStageReviewTemplate | null;
  stageLabel: string;
  /** 本阶段的根评审，作为「归属」的候选（按族过滤后展示） */
  stageRoots: TStageReviewTemplate[];
  /** 从某条评审的 ＋ 进来时的预选父级 */
  defaultParent: TStageReviewTemplate | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (value: TStageReviewFormValue) => Promise<unknown>;
};

const I18N = "workspace_templates.reviews";

const KIND_OPTIONS = [
  EStageReviewKind.REVIEW,
  EStageReviewKind.ACTIVITY,
  EStageReviewKind.O_STAGE_REVIEW,
  EStageReviewKind.O_STAGE_ACTIVITY,
];

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-subtle bg-surface-1 px-2.5 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong";

/** 该活动类型能挂在哪些根类型下（父子必须同族） */
const rootKindFor = (activityKind: EStageReviewKind): EStageReviewKind | null => {
  const entry = Object.entries(STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT).find(([, child]) => child === activityKind);
  return (entry?.[0] as EStageReviewKind) ?? null;
};

export function StageReviewTemplateFormModal(props: Props) {
  const { isOpen, template, stageLabel, stageRoots, defaultParent, isSubmitting, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const [value, setValue] = useState<TStageReviewFormValue>({
    kind: EStageReviewKind.REVIEW,
    parent_id: null,
    title: "",
    initiator_role: "",
    leader_role: "",
    auditor_role: "",
  });
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(template);
  const isActivity = STAGE_REVIEW_ACTIVITY_KINDS.includes(value.kind);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (template) {
      setValue({
        kind: template.kind,
        parent_id: template.parent_id,
        title: template.title,
        initiator_role: template.initiator_role,
        leader_role: template.leader_role,
        auditor_role: template.auditor_role,
      });
      return;
    }
    // 从某条评审的 ＋ 进来：类型由父级的族推导，归属预选好
    const kind = defaultParent
      ? STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT[defaultParent.kind]
      : EStageReviewKind.REVIEW;
    setValue({
      kind,
      parent_id: defaultParent?.id ?? null,
      title: "",
      initiator_role: "",
      leader_role: "",
      auditor_role: "",
    });
  }, [isOpen, template, defaultParent]);

  /** 归属候选：只列同族的根评审。族不匹配的挂上去后端会 400 */
  const parentOptions = useMemo(() => {
    if (!isActivity) return [];
    const wantedRootKind = rootKindFor(value.kind);
    return stageRoots.filter(
      (root) => STAGE_REVIEW_ROOT_KINDS.includes(root.kind) && root.kind === wantedRootKind
    );
  }, [isActivity, value.kind, stageRoots]);

  const handleKindChange = (kind: EStageReviewKind) => {
    setValue((current) => {
      // 换族或换成根类型，原来的归属就不成立了，直接清掉
      const keepParent =
        STAGE_REVIEW_ACTIVITY_KINDS.includes(kind) &&
        stageRoots.some((root) => root.id === current.parent_id && STAGE_REVIEW_ACTIVITY_KIND_BY_ROOT[root.kind] === kind);
      return { ...current, kind, parent_id: keepParent ? current.parent_id : null };
    });
  };

  const handleSubmit = async () => {
    const title = value.title.trim();
    if (!title) {
      setError(t(`${I18N}.form.title_required`));
      return;
    }
    try {
      await onSubmit({ ...value, title });
    } catch (submitError) {
      const payload = submitError as Record<string, unknown> | undefined;
      const first = payload ? Object.values(payload)[0] : undefined;
      setError(Array.isArray(first) ? String(first[0]) : t(`${I18N}.form.save_failed`));
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex items-start justify-between border-b border-subtle px-5 py-4">
        <div>
          <h2 className="text-14 font-medium text-primary">
            {t(isEdit ? `${I18N}.form.edit_title` : `${I18N}.form.create_title`)}
          </h2>
          <p className="mt-0.5 text-11 text-tertiary">{stageLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover disabled:opacity-50"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3.5 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-12 text-tertiary">{t(`${I18N}.table.title`)}</span>
          <input
            autoFocus
            value={value.title}
            maxLength={255}
            disabled={isSubmitting}
            onChange={(event) => {
              setValue((current) => ({ ...current, title: event.target.value }));
              setError(null);
            }}
            className={cn(INPUT_CLASS, error && "border-danger-strong")}
            placeholder={t(`${I18N}.form.title_placeholder`)}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-12 text-tertiary">{t(`${I18N}.table.kind`)}</span>
          <div className="flex gap-1.5">
            {KIND_OPTIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={isSubmitting || isEdit}
                onClick={() => handleKindChange(kind)}
                className={cn(
                  "h-8 flex-1 rounded-md border text-12 transition-colors",
                  value.kind === kind
                    ? "border-accent-strong bg-accent-primary/10 font-medium text-accent-primary"
                    : "border-subtle text-secondary hover:bg-layer-1-hover",
                  (isSubmitting || isEdit) && "cursor-not-allowed opacity-60"
                )}
              >
                {t(`${I18N}.kind.${kind}`)}
              </button>
            ))}
          </div>
          {/* 类型决定它能挂在哪、带不带 O 阶段那几组字段，改了会让已有子节点失配 */}
          {isEdit && <p className="text-10 text-tertiary">{t(`${I18N}.form.kind_locked`)}</p>}
        </div>

        {/* 只有评审活动才谈得上归属；评审恒在顶层 */}
        {isActivity && (
          <label className="flex flex-col gap-1.5">
            <span className="text-12 text-tertiary">{t(`${I18N}.form.parent_label`)}</span>
            <select
              value={value.parent_id ?? ""}
              disabled={isSubmitting}
              onChange={(event) =>
                setValue((current) => ({ ...current, parent_id: event.target.value || null }))
              }
              className={INPUT_CLASS}
            >
              <option value="">{t(`${I18N}.form.parent_stage_option`)}</option>
              {parentOptions.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.title}
                </option>
              ))}
            </select>
            {parentOptions.length === 0 && (
              <p className="text-10 leading-4 text-tertiary">{t(`${I18N}.form.parent_empty`)}</p>
            )}
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-12 text-tertiary">{t(`${I18N}.table.initiator`)}</span>
          <input
            value={value.initiator_role}
            maxLength={255}
            disabled={isSubmitting}
            onChange={(event) => setValue((current) => ({ ...current, initiator_role: event.target.value }))}
            className={INPUT_CLASS}
            placeholder={t(`${I18N}.form.role_placeholder`)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-12 text-tertiary">{t(`${I18N}.table.leader`)}</span>
            <input
              value={value.leader_role}
              maxLength={255}
              disabled={isSubmitting}
              onChange={(event) => setValue((current) => ({ ...current, leader_role: event.target.value }))}
              className={INPUT_CLASS}
              placeholder={t(`${I18N}.form.role_placeholder`)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-12 text-tertiary">{t(`${I18N}.table.auditor`)}</span>
            <input
              value={value.auditor_role}
              maxLength={255}
              disabled={isSubmitting}
              onChange={(event) => setValue((current) => ({ ...current, auditor_role: event.target.value }))}
              className={INPUT_CLASS}
              placeholder={t(`${I18N}.form.auditor_placeholder`)}
            />
          </label>
        </div>

        {/* 角色填的是名称不是人：模板是工作区级标准流程，落到项目 + 产品时才解析成人 */}
        <p className="text-10 leading-4 text-tertiary">{t(`${I18N}.form.role_hint`)}</p>
        {error && <p className="text-10 leading-4 text-danger-primary">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="sm" onClick={() => void handleSubmit()} loading={isSubmitting}>
          {t(isEdit ? "save" : "create")}
        </Button>
      </div>
    </ModalCore>
  );
}

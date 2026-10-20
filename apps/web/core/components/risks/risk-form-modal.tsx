import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCreateRiskPayload, TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
import { RequiredStatus } from "@/components/common/form-modal";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { RISK_I18N, RISK_REQUIRED_FIELDS } from "./constants";
import { translateRiskError } from "./errors";
import { RiskFormAttachments } from "./form/risk-form-attachments";
import { RiskFormContent } from "./form/risk-form-content";
import { RiskFormProperties } from "./form/risk-form-properties";
import type { TRiskFormValue } from "./form/risk-form-state";
import { EMPTY_RISK_FORM, getRiskFilledMap, riskFormFromDetail, toRiskPayload } from "./form/risk-form-state";
import { useRiskFormAttachments } from "./form/use-risk-form-attachments";
import { getRiskCodeText } from "./risk-code-label";

const I18N = RISK_I18N;

/**
 * 新建 / 编辑风险：两栏弹窗，骨架同产品、项目的新建弹窗。
 *
 * - 左栏（宽）按填写顺序（`RiskFormContent`）：名称、风险描述、影响程度 / 发生概率 / 风险等级、影响描述、
 *   应对措施、风险损失、触发因素、风险管理策略。等级随两项推算，也能手动改（见 `RiskAssessmentField`）。
 * - 右栏（窄，340px）点选（`RiskFormProperties`）：基本信息 / 人员 / 日期。
 * - 必填 8 项在页脚计数；点过提交后缺的一次全部标红。后端错误翻成文案显示在页脚左侧。
 * - 编号由简道云生成：新建时芯片写「保存后由简道云生成」（非简道云项目是「—」），编辑时显编号或推送状态。
 * - 编辑态整份提交（PATCH 允许全量），`stakeholder_ids` 整份替换。
 * - 附件（`useRiskFormAttachments`）：新建时先存在浏览器，风险建好后逐个上传，这期间弹窗关不掉；有失败照常关，
 *   提示去详情页重传（不会重复建风险）。编辑时选了就传、删了就删。
 */
export const RiskFormModal = ({
  isOpen,
  form,
  workspaceSlug,
  projectId,
  isSubmitting,
  onClose,
  onCreate,
  onUpdate,
}: {
  isOpen: boolean;
  form: { mode: "create" } | { mode: "edit"; risk: TRiskDetail } | null;
  workspaceSlug: string;
  projectId: string;
  isSubmitting: boolean;
  onClose: () => void;
  /** 返回新建的风险：暂存的附件要传到它名下 */
  onCreate: (payload: TCreateRiskPayload) => Promise<TRiskDetail | undefined>;
  onUpdate: (riskId: string, payload: TUpdateRiskPayload) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { getProjectById } = useProject();
  const nameRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<TRiskFormValue>(EMPTY_RISK_FORM);
  /** 点过提交：缺的必填项开始标红 */
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  /** 新建成功后正在传暂存的附件：一共几个 */
  const [afterCreateUploadTotal, setAfterCreateUploadTotal] = useState(0);

  const editing = form?.mode === "edit" ? form.risk : null;
  const attachments = useRiskFormAttachments({
    workspaceSlug,
    projectId,
    riskId: editing?.id ?? null,
    isOpen: isOpen && Boolean(form),
  });
  const isUploadingAfterCreate = afterCreateUploadTotal > 0;
  // 建风险、传附件期间都不能关、不能再提交
  const busy = isSubmitting || isUploadingAfterCreate || attachments.isUploading;
  const handleClose = () => {
    if (!busy) onClose();
  };
  const today = renderFormattedPayloadDate(new Date()) ?? "";
  // 简道云同步来的项目里，编号由简道云生成；老项目里的风险不同步、没有编号
  const isJdyProject = getProjectById(projectId)?.external_source === "jiandaoyun_rd_project";

  useEffect(() => {
    if (!isOpen || !form) return;
    setValue(
      form.mode === "edit"
        ? riskFormFromDetail(form.risk)
        : { ...EMPTY_RISK_FORM, proposerId: currentUser?.id ?? null, proposedDate: today }
    );
    setTouched(false);
    setServerError(null);
    // currentUser / today 只在打开那一刻取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form]);

  const patch = (next: Partial<TRiskFormValue>) => {
    setValue((current) => ({ ...current, ...next }));
    setServerError(null);
  };

  const filledMap = getRiskFilledMap(value);
  const filled = RISK_REQUIRED_FIELDS.filter((field) => filledMap[field]).length;
  const missing = (field: (typeof RISK_REQUIRED_FIELDS)[number]) => touched && !filledMap[field];
  const closeBeforeProposed = Boolean(
    value.actualCloseDate && value.proposedDate && value.actualCloseDate < value.proposedDate
  );
  const hasErrors = Boolean(serverError) || (touched && filled < RISK_REQUIRED_FIELDS.length) || closeBeforeProposed;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setTouched(true);
    if (filled < RISK_REQUIRED_FIELDS.length || closeBeforeProposed) return;
    setServerError(null);
    const payload = toRiskPayload(value);
    try {
      if (editing) {
        await onUpdate(editing.id, payload);
        onClose();
        return;
      }
      const created = await onCreate(payload);
      if (created && attachments.pendingCount > 0) {
        setAfterCreateUploadTotal(attachments.pendingCount);
        try {
          const failed = await attachments.uploadPending(created.id);
          if (failed.length > 0) {
            setToast({
              type: TOAST_TYPE.WARNING,
              title: t(`${I18N}.form.attachments_partial_failed`, { count: failed.length }),
              message: failed.join("、"),
            });
          }
        } finally {
          setAfterCreateUploadTotal(0);
        }
      }
      onClose();
    } catch (submitError) {
      setServerError(translateRiskError(t, submitError));
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
      className="rounded-2xl sm:max-w-[72rem]"
      initialFocus={nameRef}
    >
      {/*
        高度要扣掉 ModalCore TOP 位置的上下外边距（my-10 / md:my-20），否则弹窗比视口高，外层遮罩变成可滚动，
        滚轮一碰到栏目滚到头就把整个弹窗带着上下跑
      */}
      <form
        onSubmit={handleSubmit}
        className="relative flex h-[min(calc(100vh-5rem),52rem)] min-h-0 flex-col md:h-[min(calc(100vh-10rem),52rem)]"
      >
        {/* 宽屏左右两栏各自滚动；窄屏上下堆叠，整体一起滚 */}
        <div
          data-modal-wheel-scroll
          className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain md:grid-cols-[minmax(0,1fr)_21.25rem] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden"
        >
          <div
            data-modal-wheel-scroll
            className="vertical-scrollbar scrollbar-sm min-w-0 overscroll-contain px-7 pt-7 pb-7 md:min-h-0 md:overflow-y-auto md:px-8"
          >
            <RiskFormContent
              title={t(`${I18N}.form.${editing ? "edit_title" : "create_title"}`)}
              codeLabel={editing ? getRiskCodeText(t, editing) : isJdyProject ? t(`${I18N}.form.code_from_jdy`) : "—"}
              value={value}
              patch={patch}
              nameError={missing("name") ? t(`${I18N}.errors.RISK_NAME_REQUIRED`) : undefined}
              descriptionError={missing("description") ? t(`${I18N}.errors.RISK_DESCRIPTION_REQUIRED`) : undefined}
              assessmentError={
                missing("impact_level") || missing("probability") ? t(`${I18N}.form.assessment_required`) : undefined
              }
              nameRef={nameRef}
              attachments={<RiskFormAttachments state={attachments} locked={isSubmitting || isUploadingAfterCreate} />}
            />
          </div>

          <RiskFormProperties
            projectId={projectId}
            value={value}
            patch={patch}
            errors={{
              proposerId: missing("proposer_id") ? t(`${I18N}.form.required`) : undefined,
              proposedDate: missing("proposed_date") ? t(`${I18N}.form.required`) : undefined,
              ownerId: missing("owner_id") ? t(`${I18N}.form.owner_required`) : undefined,
            }}
          />
        </div>

        {/* 页脚：必填进度 / 服务端错误 + 取消、提交 */}
        <div className="flex shrink-0 items-center gap-4 border-t border-subtle px-7 py-3.5 md:pl-8">
          {isUploadingAfterCreate ? (
            <span className="flex min-w-0 items-center gap-2 text-13 text-secondary">
              <LoaderCircle className="size-4 shrink-0 animate-spin text-accent-primary motion-reduce:animate-none" />
              <span className="truncate tabular-nums">
                {t(`${I18N}.form.attachments_uploading`, {
                  done: attachments.settledCount,
                  total: afterCreateUploadTotal,
                })}
              </span>
            </span>
          ) : serverError ? (
            <span className="min-w-0 truncate text-13 font-medium text-danger-primary">{serverError}</span>
          ) : (
            <RequiredStatus filled={filled} total={RISK_REQUIRED_FIELDS.length} hasErrors={hasErrors} />
          )}
          <div className="ml-auto flex shrink-0 gap-2.5">
            <Button type="button" variant="secondary" size="lg" onClick={handleClose} disabled={busy}>
              {t(`${I18N}.form.cancel`)}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting || isUploadingAfterCreate}
              disabled={busy}
            >
              {t(`${I18N}.form.${editing ? "submit_edit" : "submit_create"}`)}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          aria-label={t("close")}
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <CloseIcon className="size-4" />
        </button>
      </form>
    </ModalCore>
  );
};

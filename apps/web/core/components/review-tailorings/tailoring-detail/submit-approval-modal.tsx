import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TReviewTailoringApprovalType, TSubmitReviewTailoringPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import {
  RadioOption,
  TailoringFacts,
  TailoringField,
  TailoringModalFooter,
  TailoringModalHeader,
} from "./modal-frame";
import type { TTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring.approval";

/** 裁剪表必须有人签批，所以规则里没有 none */
const TAILORING_APPROVAL_TYPES: TReviewTailoringApprovalType[] = ["any", "all", "n_of_m"];

/** n_of_m 的合法区间是 1..签批人数；没人时按 1 兜底 */
const clamp = (count: number, total: number) => Math.min(Math.max(count, 1), total || 1);

/**
 * 提交签批：先交代「你在提交什么」（保留 / 裁剪几项、生效后增删几条评审），再选本轮的签批人与通过规则。
 *
 * 缺原因的格子在这里就拦住（主按钮不可点 + 「去补齐」跳回矩阵并只看待补原因），
 * 不再等服务端 400 回来才知道。每次打开都从空白开始 —— 名单与规则只对这一轮有效。
 */
export const SubmitApprovalModal = observer(function SubmitApprovalModal({
  isOpen,
  isSubmitting,
  projectId,
  title,
  stats,
  onClose,
  onFixMissing,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  projectId: string;
  /** 裁剪表标题 */
  title: string;
  stats: TTailoringStats;
  onClose: () => void;
  onFixMissing: () => void;
  onSubmit: (payload: TSubmitReviewTailoringPayload) => void;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const {
    project: { getProjectMemberIds, getProjectMemberDetails },
  } = useMember();

  const [approvalType, setApprovalType] = useState<TReviewTailoringApprovalType>("any");
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [requiredCount, setRequiredCount] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setApprovalType("any");
    setApproverIds([]);
    setRequiredCount(1);
  }, [isOpen]);

  /** 候选池 = 项目成员 ∪ 当前用户：提交人可以把自己列为签批人 */
  const memberById = useMemo(() => {
    const byId = new Map<string, IUserLite>();
    for (const memberId of getProjectMemberIds(projectId, false) ?? []) {
      const detail = getProjectMemberDetails(memberId, projectId);
      if (detail?.member) byId.set(detail.member.id, detail.member as unknown as IUserLite);
    }
    if (currentUser) byId.set(currentUser.id, currentUser);
    return byId;
  }, [projectId, getProjectMemberIds, getProjectMemberDetails, currentUser]);

  const changeApprovers = (ids: string[]) => {
    setApproverIds(ids);
    setRequiredCount((current) => clamp(current, ids.length));
  };

  const hasMissing = stats.missing > 0;
  const canSubmit = approverIds.length > 0 && !hasMissing;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <TailoringModalHeader title={t(`${I18N}.submit_title`)} onClose={onClose} />

      <div className="flex flex-col gap-5 px-6 py-5">
        <TailoringFacts
          items={[
            { label: t("review_tailoring.title"), value: title },
            {
              label: t(`${I18N}.fact_result`),
              value: (
                <span className="tabular-nums">
                  {t(`${I18N}.fact_result_value`, { kept: stats.selected, cut: stats.cut })}
                  {hasMissing && (
                    <>
                      <span className="text-warning-primary">
                        {t(`${I18N}.fact_result_missing`, { count: stats.missing })}
                      </span>
                      <button
                        type="button"
                        className="ml-2 text-accent-primary hover:underline"
                        onClick={onFixMissing}
                      >
                        {t(`${I18N}.summary_fix`)}
                      </button>
                    </>
                  )}
                </span>
              ),
            },
            {
              label: t("review_tailoring.detail.stat_after"),
              value: (
                <span className="tabular-nums">
                  {t("review_tailoring.detail.info_after_value", { created: stats.toCreate, deleted: stats.toDelete })}
                  {stats.toMove > 0 && t("review_tailoring.detail.info_after_moved", { count: stats.toMove })}
                </span>
              ),
            },
          ]}
        />

        {stats.toDeleteCompleted > 0 && (
          <p className="text-13 text-danger-primary">
            {t(`${I18N}.completed_delete_warning`, { count: stats.toDeleteCompleted })}
          </p>
        )}

        <TailoringField label={t(`${I18N}.approvers`)} required hint={t(`${I18N}.approvers_help`)}>
          <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2 py-1">
            {approverIds.map((id) => (
              <span
                key={id}
                className="inline-flex h-6.5 items-center gap-1 rounded border border-subtle bg-layer-1 pr-1 pl-2 text-13 text-primary"
              >
                {memberById.get(id)?.display_name}
                <button
                  type="button"
                  aria-label={t(`${I18N}.remove_approver`)}
                  className="grid size-4.5 place-items-center rounded text-tertiary hover:text-primary"
                  onClick={() => changeApprovers(approverIds.filter((entry) => entry !== id))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <MemberDropdown
              multiple
              value={approverIds}
              onChange={changeApprovers}
              memberIds={[...memberById.keys()]}
              buttonVariant="transparent-with-text"
              buttonContainerClassName="min-w-0 flex-1 text-left"
              button={<span className="block px-1 py-1 text-13 text-placeholder">{t(`${I18N}.add_approver`)}</span>}
              placement="bottom-start"
            />
          </div>
        </TailoringField>

        <div className="flex flex-col gap-1.5">
          <span id="submit-approval-rule" className="text-13 font-medium text-secondary">
            {t(`${I18N}.rule`)}
          </span>
          <div role="radiogroup" aria-labelledby="submit-approval-rule" className="flex flex-col gap-3 pt-1">
            {TAILORING_APPROVAL_TYPES.map((type) => (
              <div key={type} className="flex h-7 items-center gap-2.5">
                <RadioOption checked={approvalType === type} onSelect={() => setApprovalType(type)}>
                  {type === "n_of_m" ? t(`${I18N}.n_of_m_short`) : t(`${I18N}.${type}`)}
                </RadioOption>
                {type === "n_of_m" && (
                  <>
                    <input
                      type="number"
                      aria-label={t(`${I18N}.n_of_m_short`)}
                      min={1}
                      max={approverIds.length || 1}
                      disabled={approvalType !== "n_of_m"}
                      value={requiredCount}
                      onChange={(event) =>
                        setRequiredCount(clamp(Number(event.target.value) || 1, approverIds.length))
                      }
                      className="h-7 w-14 rounded-md border border-subtle bg-surface-1 px-2 text-center text-13 text-primary outline-none focus:border-accent-strong disabled:bg-layer-1 disabled:text-tertiary"
                    />
                    <span className="text-13 text-tertiary tabular-nums">
                      {t(`${I18N}.n_of_m_total`, { total: approverIds.length })}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <TailoringModalFooter
        hint={
          hasMissing ? (
            <span className="text-warning-primary">{t(`${I18N}.missing_block`, { count: stats.missing })}</span>
          ) : approverIds.length === 0 ? (
            t(`${I18N}.approvers_required`)
          ) : undefined
        }
      >
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={!canSubmit || isSubmitting}
          onClick={() =>
            onSubmit({
              approval_type: approvalType,
              required_count: approvalType === "n_of_m" ? requiredCount : null,
              approver_ids: approverIds,
            })
          }
        >
          {t(`${I18N}.submit`)}
        </Button>
      </TailoringModalFooter>
    </ModalCore>
  );
});

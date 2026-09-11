import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TStageReviewCandidates } from "@plane/types";
import { Avatar, CustomSearchSelect } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { StageReviewService } from "@/services/stage-review.service";

const service = new StageReviewService();
const I18N = "stage_review";

/**
 * 负责人 / 审核者选择器。候选人三级回退，由后端 resolve_role_candidates 决定：
 * **产品**下担任这个角色的人 → **工作区**里担任这个角色的人 → **全部项目成员**。
 *
 * 模板上存的是角色名称文本（发起者 / 主导者 / 审核者），生成评审时留空，在这里才解析
 * 成人。不是从产品配置里筛出来的时候，下面补一句说明这批人是谁 —— 比给一个看不出
 * 所以然的名单强。
 *
 * 候选人**打开时才拉**：一屏抽屉有两个这样的选择器，进页就拉等于每次开抽屉多两个请求。
 */
export const RoleMemberSelect = ({
  workspaceSlug,
  projectId,
  reviewId,
  role,
  value,
  valueDetail,
  disabled,
  onChange,
}: {
  workspaceSlug: string;
  projectId: string;
  reviewId: string;
  role: "leader" | "auditor";
  value: string | null;
  valueDetail: IUserLite | null;
  disabled?: boolean;
  onChange: (userId: string | null) => void;
}) => {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<TStageReviewCandidates | null>(null);

  const fetchCandidates = useCallback(() => {
    if (candidates) return;
    void service
      .listCandidates(workspaceSlug, projectId, reviewId, role)
      .then(setCandidates)
      .catch(() => undefined);
  }, [candidates, workspaceSlug, projectId, reviewId, role]);

  // 换一条评审时把上一条的候选人丢掉：角色名与产品都变了
  useEffect(() => setCandidates(null), [reviewId, role]);

  const options = (candidates?.results ?? []).map((user) => ({
    value: user.id,
    query: user.display_name,
    content: (
      <span className="flex items-center gap-2">
        <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
        <span className="truncate">{user.display_name}</span>
      </span>
    ),
  }));

  if (disabled) {
    return valueDetail ? (
      <span className="flex items-center gap-2 text-13 text-primary">
        <Avatar size="sm" name={valueDetail.display_name} src={getFileURL(valueDetail.avatar_url ?? "")} />
        {valueDetail.display_name}
      </span>
    ) : (
      <span className="text-13 text-tertiary">—</span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <CustomSearchSelect
        value={value}
        onChange={(next: string | null) => onChange(next === value ? null : next)}
        onOpen={fetchCandidates}
        options={options}
        maxHeight="lg"
        buttonClassName="w-full justify-between border-none bg-transparent px-1 py-0.5 hover:bg-layer-2"
        noResultsMessage={t(`${I18N}.detail.no_candidates`)}
        label={
          valueDetail ? (
            <span className="flex items-center gap-2 text-13 text-primary">
              <Avatar size="sm" name={valueDetail.display_name} src={getFileURL(valueDetail.avatar_url ?? "")} />
              {valueDetail.display_name}
            </span>
          ) : (
            <span className="text-13 text-tertiary">{t(`${I18N}.detail.pick_member`)}</span>
          )
        }
      />
      {/* 从产品的角色配置里筛出来的是正路，不用解释；另外两档要说清楚这批人是谁 */}
      {candidates && candidates.source !== "product" && candidates.role_name && (
        <span className="px-1 text-11 leading-relaxed text-tertiary">
          {t(`${I18N}.detail.role_source_${candidates.source}`, { role: candidates.role_name })}
        </span>
      )}
    </div>
  );
};

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TStageReviewCandidates } from "@plane/types";
import { Avatar, CustomSearchSelect } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { StageReviewService } from "@/services/stage-review.service";

const service = new StageReviewService();
const I18N = "stage_review";

/** 没人时的占位：灰字动词，和工作项「指定负责人」同一个口气，不画空头像以免和上面的值错开 */
const EmptyMember = ({ label }: { label: string }) => <span className="text-13 text-placeholder">{label}</span>;

const MemberLabel = ({ user }: { user: IUserLite }) => (
  <span className="flex min-w-0 items-center gap-2 text-13 text-primary">
    <Avatar size="md" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
    <span className="truncate">{user.display_name}</span>
  </span>
);

/**
 * 负责人 / 审核者选择器。候选人三级回退，由后端 resolve_role_candidates 决定：
 * **产品**下担任这个角色的人 → **工作区**里担任这个角色的人 → **全部项目成员**。
 *
 * 模板上存的是角色名称文本（发起者 / 主导者 / 审核者），生成评审时留空，在这里才解析
 * 成人。
 *
 * 候选人**随抽屉预拉**：打开下拉时才拉会先闪一下空列表再出人。只读（disabled）时不拉；
 * 预拉失败的话，打开下拉时再补拉一次。
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

  // 换一条评审时丢掉上一条的候选人（角色名与产品都变了），并预拉这一条的
  useEffect(() => {
    setCandidates(null);
    if (disabled) return;
    let cancelled = false;
    void service
      .listCandidates(workspaceSlug, projectId, reviewId, role)
      .then((next) => {
        if (!cancelled) setCandidates(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, reviewId, role, disabled]);

  const options = (candidates?.results ?? []).map((user) => ({
    value: user.id,
    query: user.display_name,
    content: <MemberLabel user={user} />,
  }));

  if (disabled) {
    return valueDetail ? (
      <MemberLabel user={valueDetail} />
    ) : (
      <EmptyMember label={t(`${I18N}.detail.unassigned`)} />
    );
  }

  return (
    <CustomSearchSelect
      value={value}
      onChange={(next: string | null) => onChange(next === value ? null : next)}
      onOpen={fetchCandidates}
      options={options}
      maxHeight="lg"
      buttonClassName="-mx-2 w-[calc(100%+1rem)] justify-between rounded-md border-none bg-transparent px-2 py-1 hover:bg-layer-2"
      noResultsMessage={t(`${I18N}.detail.no_candidates`)}
      label={valueDetail ? <MemberLabel user={valueDetail} /> : <EmptyMember label={t(`${I18N}.detail.pick_${role}`)} />}
    />
  );
};

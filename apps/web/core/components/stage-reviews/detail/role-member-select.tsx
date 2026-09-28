import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TStageReviewCandidates } from "@plane/types";
import { Avatar, CustomSearchSelect } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { StageReviewService } from "@/services/stage-review.service";
import { StageReviewPeople } from "../people";
import { INLINE_FIELD_CLASS } from "./stage-review-content";

const service = new StageReviewService();
const I18N = "stage_review";

const isSameMembers = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

const MemberLabel = ({ user }: { user: IUserLite }) => (
  <span className="flex min-w-0 items-center gap-2 text-14 text-primary">
    <Avatar size="md" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
    <span className="truncate">{user.display_name}</span>
  </span>
);

/**
 * 负责人 / 审核者选择器，**可多选**：这一步由名单里任意一人推进即可。候选人三级回退，
 * 由后端 resolve_role_candidates 决定：
 * **产品**下担任这个角色的人 → **工作区**里担任这个角色的人 → **全部项目成员**。
 *
 * 模板上存的是角色名称文本（发起者 / 主导者 / 审核者），生成评审时留空，在这里才解析
 * 成人。
 *
 * 候选人**随抽屉预拉**：打开下拉时才拉会先闪一下空列表再出人。只读（disabled）时不拉；
 * 预拉失败的话，打开下拉时再补拉一次。
 *
 * 勾选先落在本地草稿里，**关上下拉才保存一次**：下拉算新名单用的是传进去的 value，
 * 每点一下就保存的话，连点两个人时第二下拿到的还是旧名单，会把第一个人盖掉。
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
  value: string[];
  valueDetail: IUserLite[];
  disabled?: boolean;
  onChange: (userIds: string[]) => void;
}) => {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<TStageReviewCandidates | null>(null);
  const [draft, setDraft] = useState<string[]>(value);
  const draftRef = useRef(draft);
  const isOpenRef = useRef(false);

  // 保存回来、或换了一条评审：草稿跟上。下拉开着时不动，免得别处的保存回灌把正在勾的冲掉
  const valueKey = value.join(",");
  useEffect(() => {
    if (isOpenRef.current) return;
    draftRef.current = value;
    setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

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

  // 已选的人不一定还在候选里（角色后来换了人）：并进选项，否则取消不掉
  const users = useMemo(() => {
    const merged = [...(candidates?.results ?? [])];
    for (const user of valueDetail) {
      if (!merged.some((item) => item.id === user.id)) merged.push(user);
    }
    return merged;
  }, [candidates, valueDetail]);

  if (disabled) {
    return (
      <StageReviewPeople users={valueDetail} unassigned={t(`${I18N}.detail.unassigned`)} size="md" showEmptyIcon={false} />
    );
  }

  const options = users.map((user) => ({
    value: user.id,
    query: user.display_name,
    content: <MemberLabel user={user} />,
  }));
  const draftUsers = draft.flatMap((id) => users.find((user) => user.id === id) ?? []);

  return (
    <CustomSearchSelect
      multiple
      value={draft}
      onChange={(next: string[]) => {
        draftRef.current = next;
        setDraft(next);
      }}
      onOpen={() => {
        isOpenRef.current = true;
        fetchCandidates();
      }}
      // 页面上任何一次外部点击都会走到这里（不管下拉开没开），所以先认开关、再比名单
      onClose={() => {
        if (!isOpenRef.current) return;
        isOpenRef.current = false;
        if (!isSameMembers(draftRef.current, value)) onChange(draftRef.current);
      }}
      options={options}
      maxHeight="lg"
      buttonClassName={cn(INLINE_FIELD_CLASS, "justify-between")}
      noResultsMessage={t(`${I18N}.detail.no_candidates`)}
      label={
        <StageReviewPeople
          users={draftUsers}
          unassigned={t(`${I18N}.detail.pick_${role}`)}
          size="md"
          showEmptyIcon={false}
        />
      }
    />
  );
};

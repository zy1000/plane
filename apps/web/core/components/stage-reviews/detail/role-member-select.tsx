import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite, TStageReviewCandidates } from "@plane/types";
import { Avatar, CustomSearchSelect } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { StageReviewService } from "@/services/stage-review.service";
import { StageReviewPeople, StageReviewPeopleCell } from "../people";
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
 *
 * `variant="cell"` 给列表表格用，按钮长得同工作项表格的人员格子（见 `StageReviewPeopleCell`）。
 * 一屏几十行不能每行都预拉候选人，改成鼠标移上去再拉；`idle` 时连下拉都不挂，只画长得一样的静态格子
 * （列表滚动时新滚进来的行只画这个，鼠标移到行上才换成真下拉）。
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
  variant = "field",
  placeholder,
  idle = false,
  hint,
}: {
  workspaceSlug: string;
  projectId: string;
  reviewId: string;
  role: "leader" | "auditor";
  value: string[];
  valueDetail: IUserLite[];
  disabled?: boolean;
  onChange: (userIds: string[]) => void;
  variant?: "field" | "cell";
  /** cell：没人时灰字显示的列名 */
  placeholder?: string;
  /** cell：只画静态格子，不挂下拉 */
  idle?: boolean;
  /** field：跟在名字后面的小提示（没指定人时的「建议 某岗位」），点它同样是打开下拉 */
  hint?: React.ReactNode;
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
    if (disabled || variant === "cell") return;
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
  }, [workspaceSlug, projectId, reviewId, role, disabled, variant]);

  // 已选的人不一定还在候选里（角色后来换了人）：并进选项，否则取消不掉
  const users = useMemo(() => {
    const merged = [...(candidates?.results ?? [])];
    for (const user of valueDetail) {
      if (!merged.some((item) => item.id === user.id)) merged.push(user);
    }
    return merged;
  }, [candidates, valueDetail]);

  const isCell = variant === "cell";
  if (disabled) {
    if (isCell) {
      // 只读格子没有人就留空；可改的格子才用灰字列名提示「点这里指定」
      return valueDetail.length > 0 ? <StageReviewPeopleCell users={valueDetail} placeholder="" /> : null;
    }
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn("flex min-w-0", hint && "shrink-0")}>
          <StageReviewPeople users={valueDetail} unassigned={t(`${I18N}.detail.unassigned`)} size="md" showEmptyIcon={false} />
        </span>
        {hint}
      </span>
    );
  }

  if (isCell && idle) {
    // 与下面 CustomSearchSelect 的外层 div + customButton 同一套盒子，换成真下拉时不跳
    return (
      <span className="flex h-full w-full min-w-0">
        <span className="-mx-3 flex h-full w-[calc(100%+1.5rem)] min-w-0 items-center justify-start gap-1 px-3">
          <StageReviewPeopleCell users={valueDetail} placeholder={placeholder ?? ""} />
        </span>
      </span>
    );
  }

  const options = users.map((user) => ({
    value: user.id,
    query: user.display_name,
    content: <MemberLabel user={user} />,
  }));
  const draftUsers = draft.flatMap((id) => users.find((user) => user.id === id) ?? []);

  const select = (
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
      noResultsMessage={t(`${I18N}.detail.no_candidates`)}
      {...(isCell
        ? {
            className: "h-full w-full min-w-0",
            // 格子左右各留了 px-3，按钮反向撑出去，悬停底色铺满整格（同工作项表格）
            customButtonClassName: "-mx-3 h-full w-[calc(100%+1.5rem)] min-w-0 justify-start rounded-none px-3",
            customButton: <StageReviewPeopleCell users={draftUsers} placeholder={placeholder ?? ""} />,
          }
        : { buttonClassName: cn(INLINE_FIELD_CLASS, "justify-between") })}
      label={
        <span className="flex min-w-0 items-center gap-2">
          {/* 有提示时「指定负责人」不让缩，窄了只截断提示 */}
          <span className={cn("flex min-w-0", !isCell && hint && "shrink-0")}>
            <StageReviewPeople
              users={draftUsers}
              unassigned={t(`${I18N}.detail.pick_${role}`)}
              size="md"
              showEmptyIcon={false}
            />
          </span>
          {!isCell && hint}
        </span>
      }
    />
  );
  return isCell ? (
    <span className="flex h-full w-full min-w-0" onMouseEnter={fetchCandidates}>
      {select}
    </span>
  ) : (
    select
  );
};

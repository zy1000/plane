import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { ISearchIssueResponse, TIssue, TProjectIssuesSearchParams, TRiskLinkedIssue } from "@plane/types";
import { ControlLink } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { ProjectService } from "@/services/project";
import { Block, BlockAction, EmptyLine } from "../../stage-reviews/detail/stage-review-content";
import { DEFECT_CATEGORY_NAME, RISK_I18N } from "../constants";

const projectService = new ProjectService();
const STATE_GROUP_COLORS = STATE_GROUPS as Record<string, { color: string }>;

/**
 * 一行关联缺陷：等宽编号 + 标题 + 状态药丸 + 执行人头像 + ×。单击在当前页开工作项抽屉，
 * Ctrl/⌘+单击才新开标签（ControlLink 的默认行为）。
 */
const IssueRow = ({
  workspaceSlug,
  issue,
  editable,
  onUnlink,
}: {
  workspaceSlug: string;
  issue: TRiskLinkedIssue;
  editable: boolean;
  onUnlink: (issueId: string) => void;
}) => {
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const isArchived = Boolean(issue.archived_at);
  const link = generateWorkItemLink({
    workspaceSlug,
    projectId: issue.project_id,
    issueId: issue.id,
    projectIdentifier: issue.project_identifier,
    sequenceId: issue.sequence_id,
    isArchived,
  });
  // 状态按 state_group 配色（组是跨项目稳定的语义轴），没有组才退到状态自己的颜色
  const stateColor = (issue.state_group && STATE_GROUP_COLORS[issue.state_group]?.color) || issue.state_color || undefined;

  return (
    <div
      className={cn(
        "group -mx-2 flex h-10 items-center gap-3 rounded-md px-2 transition hover:bg-layer-2",
        isArchived && "opacity-60"
      )}
    >
      <ControlLink
        href={link}
        onClick={() =>
          handleRedirection(
            workspaceSlug,
            { id: issue.id, project_id: issue.project_id, sequence_id: issue.sequence_id, archived_at: issue.archived_at } as TIssue,
            isMobile
          )
        }
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="shrink-0 font-mono text-12 text-secondary tabular-nums">
          {issue.project_identifier}-{issue.sequence_id}
        </span>
        <Tooltip tooltipContent={issue.name} isMobile={isMobile}>
          <span className="min-w-0 truncate text-14 text-primary">{issue.name}</span>
        </Tooltip>
      </ControlLink>

      <div className="flex shrink-0 items-center gap-2.5">
        {issue.state_name && (
          <span className="inline-flex h-5.5 items-center gap-1.5 rounded-md border border-subtle px-1.5 text-12 whitespace-nowrap text-secondary">
            <span className="size-1.75 rounded-full" style={{ backgroundColor: stateColor }} />
            {issue.state_name}
          </span>
        )}
        {issue.assignee_ids.length > 0 && <ButtonAvatars showTooltip userIds={issue.assignee_ids} />}
        {editable && (
          <Tooltip tooltipContent={t(`${RISK_I18N}.detail.unlink`)}>
            <button
              type="button"
              aria-label={t(`${RISK_I18N}.detail.unlink`)}
              onClick={() => onUnlink(issue.id)}
              // 解除是低频动作：悬停到这一行才浮出，不与状态、头像抢眼
              className="grid size-6 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-layer-3 hover:text-secondary focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

/**
 * 关联缺陷区块。「关联缺陷」开工作项搜索弹窗，候选池限定为本项目里类别是「缺陷」的工作项类型
 * （口径同缺陷页与后端 utils/risk.py，后端还会再校验一次）。
 *
 * 弹窗自带的类型筛选会覆盖 `searchParams.type_ids`，所以类型限定要塞在 `workItemSearchServiceCallback`
 * 里：用户在弹窗里选了类型就取与缺陷类型的交集，没选就全体缺陷类型。已关联的从候选里藏掉。
 */
export const RiskIssues = ({
  workspaceSlug,
  projectId,
  issues,
  editable,
  onLink,
  onUnlink,
}: {
  workspaceSlug: string;
  projectId: string;
  issues: TRiskLinkedIssue[];
  editable: boolean;
  onLink: (issueIds: string[]) => Promise<unknown>;
  onUnlink: (issueId: string) => void;
}) => {
  const { t } = useTranslation();
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);

  const defectTypeIds = useMemo(
    () => (issueTypes ?? []).filter((type) => type.category_name === DEFECT_CATEGORY_NAME).map((type) => type.id),
    [issueTypes]
  );
  const linkedIds = useMemo(() => new Set(issues.map((issue) => issue.id)), [issues]);

  // 弹窗把这两个回调放进了请求 effect 的依赖里，必须稳定，否则每次重渲都重新搜一遍
  const searchIssues = useCallback(
    async (params: TProjectIssuesSearchParams) => {
      const requested = (params.type_ids ?? "").split(",").filter(Boolean);
      const typeIds = requested.length > 0 ? requested.filter((id) => defectTypeIds.includes(id)) : defectTypeIds;
      if (typeIds.length === 0) return [];
      return projectService.projectIssuesSearch(workspaceSlug, projectId, { ...params, type_ids: typeIds.join(",") });
    },
    [workspaceSlug, projectId, defectTypeIds]
  );
  const hideLinked = useCallback((issue: ISearchIssueResponse) => linkedIds.has(issue.id), [linkedIds]);

  const handleLink = async (selected: ISearchIssueResponse[]) => {
    const ids = selected.map((item) => item.id).filter((id) => !linkedIds.has(id));
    if (ids.length > 0) await onLink(ids);
  };

  return (
    <Block
      title={t(`${RISK_I18N}.detail.issues`)}
      count={issues.length}
      action={
        editable && (
          <BlockAction icon={PlusIcon} label={t(`${RISK_I18N}.detail.link_issues`)} onClick={() => setIsLinkOpen(true)} />
        )
      }
    >
      {issues.length === 0 ? (
        <EmptyLine text={t(`${RISK_I18N}.detail.no_issues`)} />
      ) : (
        <div className="flex flex-col">
          {issues.map((issue) => (
            <IssueRow key={issue.id} workspaceSlug={workspaceSlug} issue={issue} editable={editable} onUnlink={onUnlink} />
          ))}
        </div>
      )}

      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isLinkOpen}
        handleClose={() => setIsLinkOpen(false)}
        searchParams={{}}
        shouldHideIssue={hideLinked}
        workItemSearchServiceCallback={searchIssues}
        handleOnSubmit={handleLink}
      />

      {/* 点行打开的工作项 peek 挂在这里：抽屉与独立页都要能看缺陷 */}
      <IssuePeekOverview />
    </Block>
  );
};

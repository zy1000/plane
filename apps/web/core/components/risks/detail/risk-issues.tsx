import { useCallback, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon, LinkIcon, PlusIcon, PriorityIcon, StateGroupIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type {
  ISearchIssueResponse,
  TIssue,
  TIssuePriorities,
  TProjectIssuesSearchParams,
  TRiskLinkedIssue,
  TStateGroups,
} from "@plane/types";
import { ControlLink, CustomMenu } from "@plane/ui";
import { cn, copyUrlToClipboard, generateWorkItemLink } from "@plane/utils";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import { ProjectService } from "@/services/project";
import { DEFECT_CATEGORY_NAME, RISK_I18N } from "../constants";
import { RiskCollapsibleHeader } from "./risk-collapsible-header";

const projectService = new ProjectService();

/**
 * 一行关联缺陷，照工作项「关系」的行（issues/relations/issue-list-item.tsx）：编号 · 名称 · 状态 · 优先级 · 负责人，
 * 悬停出「⋯」（复制链接 / 解除关联）。状态、优先级、负责人只显示不能改（要改进缺陷里改）。
 * 单击在当前页开工作项抽屉，Ctrl/⌘+单击才新开标签（ControlLink 的默认行为）。
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

  const handleCopyLink = () => {
    void copyUrlToClipboard(link).then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t("common.link_copied") }));
  };
  // 属性和菜单的点击不能冒到整行的链接上
  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <ControlLink
      href={link}
      onClick={() =>
        handleRedirection(
          workspaceSlug,
          { id: issue.id, project_id: issue.project_id, sequence_id: issue.sequence_id, archived_at: issue.archived_at } as TIssue,
          isMobile
        )
      }
      className="w-full cursor-pointer"
    >
      <div
        className={cn(
          "group flex min-h-11 w-full items-center gap-3 rounded-md py-1 pr-1.5 pl-9 transition-colors hover:bg-surface-2",
          isArchived && "opacity-60"
        )}
      >
        <IssueIdentifier
          projectId={issue.project_id}
          issueTypeId={issue.type_id}
          projectIdentifier={issue.project_identifier}
          issueSequenceId={issue.sequence_id}
          size="xs"
          variant="secondary"
        />
        <Tooltip tooltipContent={issue.name} isMobile={isMobile}>
          <span className="w-0 flex-1 truncate text-14 text-primary">{issue.name}</span>
        </Tooltip>

        <div className="flex shrink-0 items-center gap-2" onClick={stop}>
          {issue.state_name && (
            <span className="flex h-5.5 items-center gap-1.5 rounded-sm border-[0.5px] border-strong px-2 text-12 whitespace-nowrap text-secondary">
              <StateGroupIcon
                stateGroup={(issue.state_group ?? "backlog") as TStateGroups}
                color={issue.state_color ?? undefined}
                className="size-3.5 shrink-0"
              />
              {issue.state_name}
            </span>
          )}
          <span className="grid size-5.5 place-items-center rounded-sm border-[0.5px] border-strong">
            <PriorityIcon priority={issue.priority as TIssuePriorities | null} size={12} />
          </span>
          {issue.assignee_ids.length > 0 && <ButtonAvatars showTooltip userIds={issue.assignee_ids} />}
        </div>

        <div
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          onClick={stop}
        >
          <CustomMenu placement="bottom-end" ellipsis closeOnSelect>
            <CustomMenu.MenuItem onClick={handleCopyLink}>
              <div className="flex items-center gap-2">
                <LinkIcon className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{t("common.actions.copy_link")}</span>
              </div>
            </CustomMenu.MenuItem>
            {editable && (
              <CustomMenu.MenuItem onClick={() => onUnlink(issue.id)}>
                <div className="flex items-center gap-2 text-danger-primary">
                  <CloseIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{t(`${RISK_I18N}.detail.unlink`)}</span>
                </div>
              </CustomMenu.MenuItem>
            )}
          </CustomMenu>
        </div>
      </div>
    </ControlLink>
  );
};

/**
 * 关联缺陷区块，外形照工作项的「关系」小部件：可折叠标题「▾ 关联缺陷 N ＋」+ 上面的行。
 * 「＋」开工作项搜索弹窗，候选池限定为本项目里类别是「缺陷」的工作项类型
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
  const [isOpen, setIsOpen] = useState(true);
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
    <section className="-mx-2.5 flex flex-col">
      <RiskCollapsibleHeader
        title={t(`${RISK_I18N}.detail.issues`)}
        count={issues.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen((current) => !current)}
        actionLabel={t(`${RISK_I18N}.detail.link_issues`)}
        onAction={editable ? () => setIsLinkOpen(true) : undefined}
      />

      {isOpen &&
        (issues.length === 0 ? (
          editable ? (
            // 空态一行灰字可点，同右上角「+」
            <button
              type="button"
              onClick={() => setIsLinkOpen(true)}
              className="flex h-9 w-fit max-w-full items-center gap-2 rounded-md pr-2 pl-9 text-14 text-placeholder transition-colors hover:text-secondary"
            >
              <PlusIcon className="size-3.5" />
              {t(`${RISK_I18N}.detail.link_issues`)}
            </button>
          ) : (
            <p className="flex h-9 items-center pl-9 text-14 text-placeholder">{t(`${RISK_I18N}.detail.no_issues`)}</p>
          )
        ) : (
          <div className="flex flex-col">
            {issues.map((issue) => (
              <IssueRow key={issue.id} workspaceSlug={workspaceSlug} issue={issue} editable={editable} onUnlink={onUnlink} />
            ))}
          </div>
        ))}

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
    </section>
  );
};

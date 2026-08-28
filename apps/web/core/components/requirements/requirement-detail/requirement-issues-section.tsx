/**
 * 需求详情的「关联工作项」Section（项目侧变体）。
 *
 * 主入口在项目，不在产品：拆分/关联都要求一个确定的项目语境（RequirementIssue 挂在
 * (需求, 项目) 下），产品侧的按项目分组复用这里导出的行组件
 * （见 requirement-issues-by-project.tsx）—— 解除不用选项目，两侧都给。
 *
 * 拆分是「创建 + 关联」两步、非原子（§1.4 已裁决不做组合端点）：第二步失败时工作项
 * 已经创建成功，所以失败提示引导走「关联已有工作项」补救，而不是让人重拆一条。
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { Link2Off, Split } from "lucide-react";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { ISearchIssueResponse, TIssue, TRequirement, TRequirementIssue } from "@plane/types";
import { AlertModalCore, ControlLink, Loader } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useProject } from "@/hooks/store/use-project";
import { useRequirementIssues } from "@/hooks/store/use-requirement-issues";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import { RequirementIssueHeaderActions } from "./requirement-relation-action-buttons";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";

/**
 * 关联工作项的一行。版式对齐工作项详情子工作项：左缩进 + 箭头占位，属性收在右侧。
 *
 * 项目侧 Section 与产品侧按项目分组共用 —— 能不能解除收在 onUnlink 是否传入里，
 * 不另开一套行渲染。
 */
export const RequirementIssueRow = ({
  workspaceSlug,
  issue,
  projectIdentifier,
  onUnlink,
}: {
  workspaceSlug: string;
  issue: TRequirementIssue;
  /** 编号徽章与 /browse/ 链接都要它；私密项目解析不到时编号与跳转一并退化为纯文本 */
  projectIdentifier?: string;
  /** 传了才渲染行尾的解除按钮：项目侧按 requirement_link.manage，产品侧暂只按 canManage */
  onUnlink?: (issue: TRequirementIssue) => void;
}) => {
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const isArchived = Boolean(issue.archived_at);
  // 归档行走 /archives/ 路由（只要 id），普通行走 /browse/IDENT-seq（要 identifier）。
  // 单击在当前页开工作项抽屉，和用例行开详情弹窗同一手感；Ctrl/⌘+单击才新开标签。
  const workItemLink =
    isArchived || projectIdentifier
      ? generateWorkItemLink({
          workspaceSlug,
          projectId: issue.project_id,
          issueId: issue.id,
          projectIdentifier,
          sequenceId: issue.sequence_id,
          isArchived,
        })
      : null;

  const openIssue = () => {
    if (!workItemLink) return;
    handleRedirection(
      workspaceSlug,
      {
        id: issue.id,
        project_id: issue.project_id,
        sequence_id: issue.sequence_id,
        archived_at: issue.archived_at,
      } as TIssue,
      isMobile
    );
  };

  const heading = (
    <>
      {projectIdentifier && (
        <span className="shrink-0">
          <IssueIdentifier
            projectId={issue.project_id}
            issueTypeId={issue.type_id}
            projectIdentifier={projectIdentifier}
            issueSequenceId={issue.sequence_id}
            size="xs"
            variant="secondary"
          />
        </span>
      )}
      <Tooltip tooltipContent={issue.name} position="top">
        <span className="min-w-0 max-w-full truncate text-body-xs-medium text-primary">{issue.name}</span>
      </Tooltip>
    </>
  );

  return (
    // 归档仍是事实（照常计入工作项数与完成率），只在展示上置灰
    <div
      className={cn(
        "group relative flex h-full min-h-11 w-full items-center py-1 pr-2 transition-all hover:bg-surface-2",
        isArchived && "opacity-60"
      )}
      style={{ paddingLeft: 6 }}
    >
      {/* 对齐折叠头的展开箭头占位，编号与子工作项 CULTER-xxx 同一竖线 */}
      <div className="flex size-5 shrink-0" aria-hidden />
      {workItemLink ? (
        <ControlLink
          href={workItemLink}
          onClick={openIssue}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {heading}
        </ControlLink>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{heading}</span>
      )}

      <div className="flex shrink-0 items-center gap-2">
        {/* 状态按 state_group 配色 —— 状态名是项目内自定义的，group 才是稳定的
            跨项目语义轴（完成率也按它算），行内色点与之保持同一口径 */}
        {issue.state_name && (
          <span className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-sm-medium text-secondary">
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor:
                  (issue.state_group && STATE_GROUPS[issue.state_group]?.color) || issue.state_color || undefined,
              }}
            />
            {issue.state_name}
          </span>
        )}

        {issue.assignee_ids.length > 0 && (
          <span className="shrink-0">
            <ButtonAvatars showTooltip userIds={issue.assignee_ids} />
          </span>
        )}

        {onUnlink && (
          <Tooltip tooltipContent={t("project_requirements.issues.unlink")}>
            <button
              type="button"
              aria-label={t("project_requirements.issues.unlink")}
              onClick={() => onUnlink(issue)}
              // 解除是破坏性的低频动作：hover 到这一行才浮出，不与每行的状态、头像抢眼
              className="grid size-6 shrink-0 place-items-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-layer-2 hover:text-secondary focus-visible:opacity-100"
            >
              <Link2Off className="size-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

type TProps = {
  workspaceSlug: string;
  projectId: string;
  requirementId: string;
  /**
   * 拆分弹窗的预填来源（标题/描述/优先级/迭代）。项目侧传列表行（TProjectRequirement）
   * 天然满足 —— 项目侧看到的就是已通过评审的那一版内容，linked_cycle_ids 也只有它注解。
   */
  requirement: Pick<TRequirement, "title" | "description_html" | "priority"> & {
    /** 恰好一个未取消迭代时拆分预填迭代；多个不猜，留给用户在弹窗里自己选 */
    linked_cycle_ids?: string[];
  };
  canManage: boolean;
  /**
   * 关联/解除成功后由父级刷新需求行 —— 工作项数 / 完成率是服务端注解，不重拉这一行，
   * 网格与抽屉 seed 会停在旧值上。关联/解除不改需求状态（状态是人工维护的）。
   */
  onChanged?: () => void;
  /** 外层已有快捷操作条时，空列表不再占一块折叠头 */
  hideWhenEmpty?: boolean;
  /** 外层工具条已经承担新增时，折叠头不再放拆分 / 关联按钮 */
  hideAddActions?: boolean;
  splitModalOpen?: boolean;
  onSplitModalOpenChange?: (open: boolean) => void;
  linkModalOpen?: boolean;
  onLinkModalOpenChange?: (open: boolean) => void;
  /** 只挂弹窗（产品侧列表已经按项目分组渲染过了，避免再画一份） */
  hideList?: boolean;
};

export const RequirementIssuesSection = observer(function RequirementIssuesSection(props: TProps) {
  const {
    workspaceSlug,
    projectId,
    requirementId,
    requirement,
    canManage,
    onChanged,
    hideWhenEmpty = false,
    hideAddActions = false,
    splitModalOpen,
    onSplitModalOpenChange,
    linkModalOpen,
    onLinkModalOpenChange,
    hideList = false,
  } = props;
  const { t } = useTranslation();
  const { getProjectIdentifierById } = useProject();
  const { issues, isLoading, linkIssues, unlinkIssue } = useRequirementIssues({
    workspaceSlug,
    projectId,
    requirementId,
  });

  const [localSplitOpen, setLocalSplitOpen] = useState(false);
  const [localLinkOpen, setLocalLinkOpen] = useState(false);
  const isSplitModalOpen = splitModalOpen ?? localSplitOpen;
  const setIsSplitModalOpen = onSplitModalOpenChange ?? setLocalSplitOpen;
  const isLinkModalOpen = linkModalOpen ?? localLinkOpen;
  const setIsLinkModalOpen = onLinkModalOpenChange ?? setLocalLinkOpen;
  /** 待确认解除的行；非空即弹确认框，与项目需求页解除关联同一交互口径 */
  const [issueToUnlink, setIssueToUnlink] = useState<TRequirementIssue | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const projectIdentifier = getProjectIdentifierById(projectId) || undefined;
  const linkedCycleIds = requirement.linked_cycle_ids ?? [];
  const completedCount = issues.filter((issue) => issue.state_group === "completed").length;
  const showList = !hideList && (issues.length > 0 || !hideWhenEmpty);

  const notifyLinkFailure = (error: unknown) => {
    const payload = error as { error?: string } | null;
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("error"),
      message: payload?.error ?? t("project_requirements.issues.toast_link_failed"),
    });
  };

  /** 拆分第二步：把刚创建的工作项挂到需求上。失败不重抛 —— 工作项已存在，弹窗不必留着 */
  const handleSplitSubmit = async (created: TIssue) => {
    try {
      await linkIssues([created.id]);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.issues.toast_linked") });
      onChanged?.();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_requirements.issues.toast_created_link_failed"),
      });
    }
  };

  const handleLinkExisting = async (selected: ISearchIssueResponse[]) => {
    try {
      await linkIssues(selected.map((item) => item.id));
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.issues.toast_linked") });
      onChanged?.();
    } catch (error) {
      notifyLinkFailure(error);
    }
  };

  const handleUnlink = async () => {
    if (!issueToUnlink) return;
    setIsUnlinking(true);
    try {
      await unlinkIssue(issueToUnlink.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.issues.toast_unlinked") });
      setIssueToUnlink(null);
      onChanged?.();
    } catch (error) {
      const payload = error as { error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("project_requirements.toast.failed"),
      });
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <>
      {showList && (
        <RequirementRelationCollapsible
          title={t("project_requirements.issues.widget_title")}
          icon={Split}
          progress={{
            completed: completedCount,
            total: issues.length,
            doneLabel: t("common.done"),
          }}
          actions={
            canManage && !hideAddActions ? (
              // 项目侧语境已定，两个动作直接开弹窗，不必再选项目
              <RequirementIssueHeaderActions
                onSplit={() => setIsSplitModalOpen(true)}
                onLinkIssue={() => setIsLinkModalOpen(true)}
              />
            ) : undefined
          }
        >
          {isLoading && !issues.length ? (
            <div className="px-2.5 pb-2.5">
              <Loader className="flex flex-col gap-1.5">
                <Loader.Item height="36px" />
                <Loader.Item height="36px" />
              </Loader>
            </div>
          ) : issues.length ? (
            <div className="pb-1">
              {issues.map((issue) => (
                <RequirementIssueRow
                  key={issue.id}
                  workspaceSlug={workspaceSlug}
                  issue={issue}
                  projectIdentifier={projectIdentifier}
                  onUnlink={canManage ? setIssueToUnlink : undefined}
                />
              ))}
            </div>
          ) : (
            <p className="px-2.5 py-2.5 text-body-xs-regular text-placeholder">{t("project_requirements.issues.empty")}</p>
          )}
        </RequirementRelationCollapsible>
      )}

      {/* 拆分：现成创建弹窗零改造，内容预填自需求行；项目选择锁死 —— 拆出去的工作项
          必须落在本项目，换了项目关联接口会按不变量拒绝 */}
      <CreateUpdateIssueModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        data={{
          project_id: projectId,
          name: requirement.title,
          description_html: requirement.description_html ?? undefined,
          priority: requirement.priority,
          cycle_id: linkedCycleIds.length === 1 ? linkedCycleIds[0] : undefined,
        }}
        isProjectSelectionDisabled
        onSubmit={handleSplitSubmit}
      />

      {/* 候选池由服务端只排除已挂**本**需求的工作项 —— 多对多，挂过别的需求的仍可再挂到这条上 */}
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isLinkModalOpen}
        handleClose={() => setIsLinkModalOpen(false)}
        searchParams={{ exclude_requirement_id: requirementId }}
        handleOnSubmit={handleLinkExisting}
      />

      <AlertModalCore
        isOpen={Boolean(issueToUnlink)}
        isSubmitting={isUnlinking}
        handleClose={() => setIssueToUnlink(null)}
        handleSubmit={() => void handleUnlink()}
        title={t("project_requirements.issues.unlink_confirm_title")}
        content={t("project_requirements.issues.unlink_confirm_description")}
        // AlertModalCore 的按钮默认是英文硬编码，本仓库其余调用点也都显式传
        primaryButtonText={{ default: t("project_requirements.issues.unlink"), loading: t("loading") }}
        secondaryButtonText={t("cancel")}
      />

      {!hideList && <IssuePeekOverview />}
    </>
  );
});

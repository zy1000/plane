/**
 * 需求详情的「关联工作项」Section（项目侧变体）。
 *
 * 主入口在项目，不在产品：拆分/关联/解除都要求一个确定的项目语境（RequirementIssue
 * 挂在 (需求, 项目) 下），产品侧的按项目分组只读展示复用这里导出的行组件
 * （见 requirement-issues-by-project.tsx）。
 *
 * 拆分是「创建 + 关联」两步、非原子（§1.4 已裁决不做组合端点）：第二步失败时工作项
 * 已经创建成功，所以失败提示引导走「关联已有工作项」补救，而不是让人重拆一条。
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { Link2, Link2Off, Split } from "lucide-react";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { ISearchIssueResponse, TIssue, TRequirement, TRequirementIssue } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { useProject } from "@/hooks/store/use-project";
import { useRequirementIssues } from "@/hooks/store/use-requirement-issues";
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";

/**
 * 关联工作项的一行：编号 / 标题 / 状态胶囊 / 负责人 / 解除按钮。
 *
 * 项目侧 Section 与产品侧按项目分组共用 —— 两侧的差别只有「能不能解除」，收在
 * onUnlink 是否传入里，不另开一套行渲染。
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
  /** 传了才渲染行尾的解除按钮（项目侧 canManage）；产品侧只读不传 */
  onUnlink?: (issue: TRequirementIssue) => void;
}) => {
  const { t } = useTranslation();
  const isArchived = Boolean(issue.archived_at);
  // 归档行走 /archives/ 路由（只要 id），普通行走 /browse/IDENT-seq（要 identifier）。
  // 新开标签页 —— 详情抽屉还开着，原地跳走会把用户静默弹出需求语境
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
      <span className="min-w-0 flex-1 truncate text-primary group-hover:underline">{issue.name}</span>
    </>
  );

  return (
    // 归档仍是事实（照常计入阶段派生与完成率），只在展示上置灰
    <div className={cn("flex items-center gap-2.5 px-3 py-2 text-12", isArchived && "opacity-60")}>
      {workItemLink ? (
        <a
          href={workItemLink}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-w-0 flex-1 items-center gap-2.5"
        >
          {heading}
        </a>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">{heading}</span>
      )}

      {/* 状态胶囊按 state_group 配色 —— 状态名是项目内自定义的，group 才是稳定的
          跨项目语义轴（完成率也按它算），行内色点与之保持同一口径 */}
      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-layer-2 px-1.5 text-11 font-medium text-secondary">
        <span
          className="size-1.5 rounded-full"
          style={{
            backgroundColor:
              (issue.state_group && STATE_GROUPS[issue.state_group]?.color) || issue.state_color || undefined,
          }}
        />
        {issue.state_name}
      </span>

      {issue.assignee_ids.length > 0 && (
        <span className="shrink-0">
          <ButtonAvatars showTooltip userIds={issue.assignee_ids} />
        </span>
      )}

      {onUnlink && (
        <Tooltip tooltipContent={t("project_requirements.issues.unlink")}>
          <span className="shrink-0">
            <IconButton
              variant="ghost"
              size="sm"
              icon={Link2Off}
              aria-label={t("project_requirements.issues.unlink")}
              onClick={() => onUnlink(issue)}
            />
          </span>
        </Tooltip>
      )}
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
   * 关联/解除成功后由父级刷新需求行 —— 阶段/工作项数是服务端注解，重算后不重拉
   * 这一行，网格与抽屉 seed 会停在旧值上。
   */
  onChanged?: () => void;
};

export const RequirementIssuesSection = observer(function RequirementIssuesSection(props: TProps) {
  const { workspaceSlug, projectId, requirementId, requirement, canManage, onChanged } = props;
  const { t } = useTranslation();
  const { getProjectIdentifierById } = useProject();
  const { issues, isLoading, linkIssues, unlinkIssue } = useRequirementIssues({
    workspaceSlug,
    projectId,
    requirementId,
  });

  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  /** 待确认解除的行；非空即弹确认框，与项目需求页解除关联同一交互口径 */
  const [issueToUnlink, setIssueToUnlink] = useState<TRequirementIssue | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const projectIdentifier = getProjectIdentifierById(projectId) || undefined;
  const linkedCycleIds = requirement.linked_cycle_ids ?? [];

  const notifyLinkFailure = (error: unknown) => {
    const payload = error as
      | { code?: string; error?: string; conflicts?: { requirement_display_id?: string }[] }
      | null;
    // 409 冲突要报出已挂需求的编号 —— 「不能关联」不可行动，「已挂在 ECOM-12 上」才可
    if (payload?.code === "ISSUE_ALREADY_LINKED" && payload.conflicts?.length) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_requirements.issues.already_linked", {
          display_id: payload.conflicts[0].requirement_display_id ?? "",
        }),
      });
      return;
    }
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
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-13 font-medium text-primary">
            {t("project_requirements.issues.section_title")}
          </span>
          {canManage && (
            <span className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setIsSplitModalOpen(true)}>
                <Split className="size-3" />
                {t("project_requirements.issues.split")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsLinkModalOpen(true)}>
                <Link2 className="size-3" />
                {t("project_requirements.issues.link_existing")}
              </Button>
            </span>
          )}
        </div>

        {isLoading && !issues.length ? (
          <Loader className="flex flex-col gap-1.5">
            <Loader.Item height="32px" />
            <Loader.Item height="32px" />
          </Loader>
        ) : issues.length ? (
          // 一个外框 + 分隔线，而不是 N 张小卡片 —— 与子需求区同版式
          <div className="divide-y divide-subtle overflow-hidden rounded-md border border-subtle">
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
          <p className="text-12 text-placeholder">{t("project_requirements.issues.empty")}</p>
        )}
      </section>

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

      {/* 候选池由服务端排除一切已挂需求的工作项（含挂本需求的 —— 再选一遍没有意义） */}
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isLinkModalOpen}
        handleClose={() => setIsLinkModalOpen(false)}
        searchParams={{ requirement: true }}
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
    </>
  );
});

/**
 * 产品侧需求详情的「关联工作项」：按项目分组的列表，可解除关联。
 *
 * RequirementIssue 挂在 (需求, 项目) 下，hooks 不能进循环，所以仍逐项目拉数；
 * 界面不再用项目名分组 —— 行上的编号（如 CAC2-1）已经带项目前缀。
 *
 * 「拆分」仍然只在项目侧：拆出去的工作项必须先落到一个确定的项目。解除不需要选项目
 * （关联行自带项目），所以这里给出。
 *
 * 产品侧不判项目级的 requirement_link.manage —— 产品自己的权限体系还没做，这里先只
 * 跟着产品侧的 canManage 走（与同区域的添加操作条同一道门）。后端 DELETE 仍按项目级
 * 权限校验，无权时点了会收到 403 提示。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Split } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementIssue } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { useRequirementIssues } from "@/hooks/store/use-requirement-issues";
import { RequirementIssueRow } from "./requirement-issues-section";
import { RequirementRelationCollapsible } from "./requirement-relation-collapsible";

/** 单个项目的数据单元：只出工作项行，不出项目名分组头 */
const ProjectIssuesGroup = ({
  workspaceSlug,
  requirementId,
  projectId,
  projectIdentifier,
  canManage,
  onChanged,
  onCountChange,
}: {
  workspaceSlug: string;
  requirementId: string;
  projectId: string;
  projectIdentifier?: string;
  canManage: boolean;
  onChanged?: () => void;
  /** 本项目的行数（加载完才报；无权查看按 0 报），给外层汇总成 Tab 计数 */
  onCountChange?: (projectId: string, count: number) => void;
}) => {
  const { t } = useTranslation();
  const { issues, isLoading, error, unlinkIssue } = useRequirementIssues({
    workspaceSlug,
    projectId,
    requirementId,
  });
  const [issueToUnlink, setIssueToUnlink] = useState<TRequirementIssue | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    onCountChange?.(projectId, error ? 0 : issues.length);
  }, [error, isLoading, issues.length, onCountChange, projectId]);

  const handleUnlink = async () => {
    if (!issueToUnlink) return;
    setIsUnlinking(true);
    try {
      await unlinkIssue(issueToUnlink.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("project_requirements.issues.toast_unlinked") });
      setIssueToUnlink(null);
      // 解除会改需求行上的工作项数与完成率，得让调用方重拉需求
      onChanged?.();
    } catch (requestError) {
      const payload = requestError as { error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("project_requirements.toast.failed"),
      });
    } finally {
      setIsUnlinking(false);
    }
  };

  if (error) {
    // 无权查看该项目（403 等）时如实说明，不能把「看不到」误报成「没拆工作项」
    return (
      <p data-requirement-issues className="px-2.5 text-body-xs-regular text-tertiary">
        {t("project_requirements.hidden_project")}
      </p>
    );
  }
  if (isLoading && !issues.length) {
    return (
      <Loader className="flex flex-col gap-1.5 px-2.5">
        <Loader.Item height="32px" />
      </Loader>
    );
  }
  if (!issues.length) return null;

  return (
    <div data-requirement-issues>
      {issues.map((issue) => (
        <RequirementIssueRow
          key={issue.id}
          workspaceSlug={workspaceSlug}
          issue={issue}
          projectIdentifier={projectIdentifier}
          onUnlink={canManage ? setIssueToUnlink : undefined}
        />
      ))}

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
    </div>
  );
};

export const RequirementIssuesByProject = ({
  workspaceSlug,
  requirement,
  canManage,
  onChanged,
  variant = "collapsible",
  onCountChange,
}: {
  workspaceSlug: string;
  requirement: TRequirement;
  canManage: boolean;
  onChanged?: () => void;
  /**
   * collapsible：自带「工作项」折叠头，没进项目 / 还没关联时整块不出现（关联区用）。
   * plain：只出行，没进项目 / 还没关联时用一句说明占位 —— 给整页的关联 Tab 卡片用，
   * 折叠头由 Tab 代替，空态也必须占位，否则切到这个 Tab 会是一片空白。
   */
  variant?: "collapsible" | "plain";
  /** 各项目行数之和；每个项目都加载完才报一次 */
  onCountChange?: (count: number) => void;
}) => {
  const { t } = useTranslation();
  // 项目名/标识与详情页「所属项目」多选同源（产品 ↔ 项目关联表）；候选只含当前用户
  // 可见的项目，解析不到 = 私密项目
  const { links } = useProductProjects({ workspaceSlug, productId: requirement.product_id ?? undefined });
  const projectById = useMemo(
    () => new Map(links.map((link) => [link.project, link.project_detail])),
    [links]
  );

  const projectIds = useMemo(() => requirement.project_ids ?? [], [requirement.project_ids]);

  // 每个项目各自拉数，Tab 计数要等全部到齐再汇总，否则数字会一跳一跳
  const [counts, setCounts] = useState<Record<string, number>>({});
  const handleGroupCount = useCallback((projectId: string, count: number) => {
    setCounts((prev) => (prev[projectId] === count ? prev : { ...prev, [projectId]: count }));
  }, []);
  const allLoaded = projectIds.every((projectId) => projectId in counts);
  useEffect(() => {
    if (!onCountChange || !allLoaded) return;
    onCountChange(projectIds.reduce((sum, projectId) => sum + (counts[projectId] ?? 0), 0));
  }, [allLoaded, counts, onCountChange, projectIds]);

  const groups = projectIds.map((projectId) => {
    const detail = projectById.get(projectId);
    return (
      <ProjectIssuesGroup
        key={projectId}
        workspaceSlug={workspaceSlug}
        requirementId={requirement.id}
        projectId={projectId}
        projectIdentifier={detail?.identifier}
        canManage={canManage}
        onChanged={onChanged}
        onCountChange={handleGroupCount}
      />
    );
  });

  if (variant === "plain") {
    return (
      <>
        {!projectIds.length ? (
          <p className="px-3 py-4 text-body-xs-regular text-tertiary">
            {t("project_requirements.issues.link_project_first")}
          </p>
        ) : (
          // 有任何一行（含无权查看的说明）就把空态藏掉；加载中不出空态，免得与骨架屏叠着
          <div className={cn("flex flex-col py-1", "[&:has([data-requirement-issues])_[data-issues-empty]]:hidden")}>
            {groups}
            {allLoaded && (
              <p data-issues-empty className="px-3 py-3 text-body-xs-regular text-tertiary">
                {t("project_requirements.issues.empty")}
              </p>
            )}
          </div>
        )}
        <IssuePeekOverview />
      </>
    );
  }

  // 没进任何项目就整个 Section 不渲染。有项目但还没关联工作项时，靠
  // has-[[data-requirement-issues]] 把空折叠头藏掉 —— 行一到就显示。
  if (!projectIds.length) return null;

  return (
    <>
      <div className="hidden has-[[data-requirement-issues]]:block">
        <RequirementRelationCollapsible title={t("project_requirements.issues.widget_title")} icon={Split}>
          <div className="flex flex-col pb-1">{groups}</div>
        </RequirementRelationCollapsible>
      </div>
      <IssuePeekOverview />
    </>
  );
};

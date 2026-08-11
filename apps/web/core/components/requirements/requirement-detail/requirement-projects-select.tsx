/**
 * 需求详情里的「所属项目」多选。
 *
 * 候选项是**已经关联了本产品**的项目 —— 与项目侧关联走的是同一条规则（后端会再校验
 * 一次，见 RequirementProjectsViewSet.create），换个方向进来不该松一格。所以没有关联
 * 过本产品的项目在这里根本不出现，而不是选中后再报错。
 *
 * 只有已通过评审的需求能进项目（决策 3），未过评审的行整块禁用并说明原因。
 */
import { useMemo, useState } from "react";
import { xor } from "lodash-es";
import { FolderKanban } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement, TRequirementProjectStage } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProductProjects } from "@/hooks/store/use-product-projects";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

/**
 * 阶段徽章配色，越靠后越接近完成 —— 与项目侧 projects/requirements/
 * project-requirement-stage-cell.tsx 的 REQUIREMENT_STAGE_PILL 同谱，就地定义
 * 避免产品侧跨目录依赖项目侧组件。
 */
const STAGE_BADGE_CLASS: Record<TRequirementProjectStage, string> = {
  linked: "bg-layer-3 text-secondary",
  planned: "bg-accent-subtle text-accent-primary",
  in_progress: "bg-warning-subtle text-warning-primary",
  done: "bg-success-subtle text-success-primary",
  pending_verification: "bg-warning-subtle text-warning-primary",
  released: "bg-success-subtle text-success-primary",
};

type TProps = {
  workspaceSlug: string;
  productId: string;
  requirement: TRequirement;
  readOnly: boolean;
  /** 写成功后让调用方重新拉这一行，project_ids 是服务端注解的 */
  onChanged?: () => void;
};

export const RequirementProjectsSelect = ({
  workspaceSlug,
  productId,
  requirement,
  readOnly,
  onChanged,
}: TProps) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const { links, isLoading } = useProductProjects({ workspaceSlug, productId });

  const options = useMemo(
    () =>
      links.map((link) => ({
        value: link.project,
        query: `${link.project_detail?.name ?? ""} ${link.project_detail?.identifier ?? ""}`,
        content: (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="grid size-4 shrink-0 place-items-center">
              <Logo logo={link.project_detail?.logo_props} size={12} />
            </span>
            <span className="truncate">{link.project_detail?.name ?? link.project}</span>
          </span>
        ),
      })),
    [links]
  );

  const selectedIds = requirement.project_ids ?? [];
  /** project_id -> 该项目内的阶段。阶段长在关联行（project_links）上，不在需求本体上 */
  const stageByProject = useMemo(
    () => new Map((requirement.project_links ?? []).map((link) => [link.project_id, link.stage])),
    [requirement.project_links]
  );
  /**
   * project_ids 是服务端按需求注解的，不带项目可见性过滤；而候选项 links 只包含
   * 当前用户看得见的项目。两者的差集 = 这条需求进了某个我看不见的私密项目。
   * 那种情况给中性占位，绝不把 UUID 甩给用户 —— 它既看不懂也没法用。
   */
  const selectedEntries = useMemo(
    () =>
      selectedIds.map((id) => ({
        id,
        name:
          links.find((link) => link.project === id)?.project_detail?.name ?? t("project_requirements.hidden_project"),
        stage: stageByProject.get(id),
      })),
    [links, selectedIds, stageByProject, t]
  );

  /**
   * 求差集后拆成 {projects, removed_projects} 两份 —— 与工作项挂模块的接口同形，
   * 见 components/issues/issue-detail/module-select.tsx。
   */
  const handleChange = async (nextIds: string[]) => {
    const changed = xor(selectedIds, nextIds);
    if (!changed.length) return;

    const projects: string[] = [];
    const removedProjects: string[] = [];
    for (const projectId of changed) {
      if (selectedIds.includes(projectId)) removedProjects.push(projectId);
      else projects.push(projectId);
    }

    setIsUpdating(true);
    try {
      await requirementService.updateRequirementProjects(workspaceSlug, productId, requirement.id, {
        projects,
        removed_projects: removedProjects,
      });
      onChanged?.();
    } catch (error) {
      const payload = error as { error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("project_requirements.toast.failed"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // 未过评审的需求不进入交付链路，禁用比让人点完再吃 409 好
  const isApproved = requirement.approved_version !== null;
  /**
   * 只在**结构性**不可用时换成静态按钮。
   *
   * isUpdating 刻意不在这里：它每次勾选都会翻转一次，若参与判断就会在提交的瞬间把
   * 挂载着的 CustomSearchSelect 换成 Tooltip，下拉被整个卸载 —— 多选变成「勾一个关
   * 一次」。在飞的请求改用 disabled 表达，组件本身不动。
   */
  const isStaticallyDisabled = readOnly || isLoading || !isApproved;

  const button = (
    <span
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-2 text-13",
        isStaticallyDisabled ? "text-secondary" : "text-primary hover:bg-layer-transparent-hover"
      )}
    >
      <FolderKanban className="size-3.5 shrink-0 text-tertiary" />
      {selectedEntries.length ? (
        // 每个项目名旁挂它在该项目内的阶段小徽章。单行截断：这是 h-7 的侧栏行，不折行
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {selectedEntries.map((entry) => (
            <span key={entry.id} className="inline-flex min-w-0 items-center gap-1">
              <span className="truncate">{entry.name}</span>
              {entry.stage && (
                <span
                  className={cn(
                    "inline-flex h-4 shrink-0 items-center rounded px-1 text-10 font-medium",
                    STAGE_BADGE_CLASS[entry.stage]
                  )}
                >
                  {t(`project_requirements.stage.${entry.stage}`)}
                </span>
              )}
            </span>
          ))}
        </span>
      ) : (
        <>
          <span className="truncate text-placeholder">{t("requirement_detail.projects.placeholder")}</span>
          {/* 零关联 = 「未开始」。纯前端展示值，不落库（阶段阶梯的第 0 档） */}
          <span className="inline-flex h-4 shrink-0 items-center rounded bg-layer-3 px-1 text-10 font-medium text-secondary">
            {t("project_requirements.stage_not_started")}
          </span>
        </>
      )}
    </span>
  );

  if (isStaticallyDisabled) {
    return (
      <Tooltip
        tooltipContent={
          !isApproved
            ? t("requirement_detail.projects.needs_approval")
            : t("project_requirements.readonly_hint")
        }
      >
        {button}
      </Tooltip>
    );
  }

  return (
    <CustomSearchSelect
      multiple
      value={selectedIds}
      options={options}
      onChange={(next: string[]) => void handleChange(next)}
      customButton={button}
      className="w-full"
      placement="bottom-start"
      disabled={isUpdating}
      noResultsMessage={t("requirement_detail.projects.no_candidates")}
    />
  );
};

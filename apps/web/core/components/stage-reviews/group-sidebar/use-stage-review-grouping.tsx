import type { ReactNode } from "react";
import { useMemo } from "react";
import { FolderKanban, Package, Rows3 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { LayersIcon } from "@plane/propel/icons";
import type { IUserLite, TStageReview, TStageReviewStageSummary } from "@plane/types";
import { EStageReviewKind, EStageReviewResult, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { TStageReviewDisplaySettings } from "../display/display-settings";
import type { TStageReviewRow } from "../stage-review-rows";
import {
  STAGE_REVIEW_GROUP_ALL,
  STAGE_REVIEW_GROUP_NONE,
  buildStageReviewRowsByGroup,
  stageReviewGroupKey,
} from "../stage-review-rows";
import { StageReviewStatusIcon } from "../status-icon";

const I18N = "stage_review";

export type TStageReviewSidebarGroup = {
  id: string;
  name: string;
  /** 筛选后这一组命中的条数（被带出来的所属评审不算） */
  count: number;
  icon: ReactNode;
  /** 只有按研发阶段分组时有：阶段的整体完成度，画分段进度条用，不受筛选影响 */
  stage?: TStageReviewStageSummary;
  /** 产品页按研发阶段分组时：这一组属于哪个项目，淡色缀在阶段名后面 */
  projectName?: string | null;
  /** 产品页按研发阶段分组时：这一组就是产品档案里的当前阶段 */
  isCurrent?: boolean;
  /** 按阶段分组时：子阶段缩进一级 */
  depth?: number;
};

const RESULT_ORDER: string[] = [
  EStageReviewResult.PASSED,
  EStageReviewResult.CONDITIONAL,
  EStageReviewResult.REJECTED,
  EStageReviewResult.WAIVED,
  STAGE_REVIEW_GROUP_NONE,
];

const RESULT_DOT: Record<string, string> = {
  [EStageReviewResult.PASSED]: "bg-success-primary",
  [EStageReviewResult.CONDITIONAL]: "bg-warning-primary",
  [EStageReviewResult.REJECTED]: "bg-danger-primary",
  [EStageReviewResult.WAIVED]: "bg-layer-3",
};

const stageNodeClassName = (stage: TStageReviewStageSummary | undefined) => {
  if (!stage || stage.total === 0) return "border-strong";
  if (stage.completed === stage.total) return "border-success-primary bg-success-primary";
  if (stage.completed + stage.in_review + stage.in_approval > 0) return "border-warning-primary";
  return "border-strong";
};

const UnassignedIcon = () => <span className="size-4 shrink-0 rounded-full border border-dashed border-strong" />;

const userIcon = (user: IUserLite | null | undefined) =>
  user ? (
    <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
  ) : (
    <UnassignedIcon />
  );

/**
 * 左侧分组栏 + 右侧内容的分组计算，口径照工作项：
 *
 * - 分组栏列出**当前分组方式下的所有组**，数字是筛选后的命中数；关着「显示空组」时命中 0 的组不列。
 * - 组的顺序：研发阶段按阶段排序；状态 / 结论 / 类型按流程顺序；产品与人按名字，空值沉底。
 * - 右侧只看选中那一组；摘要按这一组**未筛选**的评审算，图例点了才不会把别的状态清零。
 * - 分组栏最上面固定一行「全部评审」（id 为 `STAGE_REVIEW_GROUP_ALL`），选它右侧按不分组的口径列全部。
 */
export const useStageReviewGrouping = ({
  reviews,
  stages,
  isHit,
  settings,
  currentStageName = null,
  crossProject = false,
}: {
  reviews: TStageReview[];
  stages: TStageReviewStageSummary[];
  isHit: (review: TStageReview) => boolean;
  settings: TStageReviewDisplaySettings;
  /**
   * 产品页传产品档案里「产品阶段」的**名字**，同名的那一组标「当前」；项目页不传。
   *
   * 按名字而不是 id：产品阶段是数据字典值，评审阶段是研发模式里的一行，两套 id 对不上。
   */
  currentStageName?: string | null;
  /** 产品页：研发阶段分组的键带上项目，两个项目的同一个模式阶段不合并 */
  crossProject?: boolean;
}) => {
  const { t } = useTranslation();
  const { groupBy, orderBy, showActivities, showEmptyGroups } = settings;

  const rowsByGroup = useMemo(
    () => buildStageReviewRowsByGroup({ reviews, isHit, orderBy, groupBy, showActivities, crossProject }),
    [reviews, isHit, orderBy, groupBy, showActivities, crossProject]
  );
  const allRows = useMemo(
    () =>
      buildStageReviewRowsByGroup({ reviews, isHit, orderBy, groupBy: "none", showActivities }).get(
        STAGE_REVIEW_GROUP_ALL
      ) ?? [],
    [reviews, isHit, orderBy, showActivities]
  );

  const sidebarGroups = useMemo<TStageReviewSidebarGroup[]>(() => {
    if (groupBy === "none") return [];

    const sampleByKey = new Map<string, TStageReview>();
    for (const review of reviews) {
      const key = stageReviewGroupKey(groupBy, review, crossProject);
      if (!sampleByKey.has(key)) sampleByKey.set(key, review);
    }
    const byName = (name: (review: TStageReview) => string) =>
      [...sampleByKey.keys()].sort((a, b) => {
        if (a === STAGE_REVIEW_GROUP_NONE) return 1;
        if (b === STAGE_REVIEW_GROUP_NONE) return -1;
        return name(sampleByKey.get(a)!).localeCompare(name(sampleByKey.get(b)!));
      });
    const stageById = new Map(stages.map((stage) => [stage.stage_id, stage]));

    let keys: string[];
    switch (groupBy) {
      case "stage":
        keys = [
          ...stages.map((stage) => stage.stage_id),
          ...[...sampleByKey.keys()].filter((key) => !stageById.has(key)),
        ];
        break;
      case "status":
        keys = [...STAGE_REVIEW_STATUS_ORDER];
        break;
      case "result":
        keys = RESULT_ORDER;
        break;
      case "kind":
        keys = Object.values(EStageReviewKind);
        break;
      case "product":
        keys = byName((review) => review.product_detail?.name ?? "");
        break;
      case "project":
        keys = byName((review) => review.project_detail?.name ?? "");
        break;
      case "leader":
        keys = byName((review) => review.leader_detail?.display_name ?? "");
        break;
      default:
        keys = byName((review) => review.auditor_detail?.display_name ?? "");
    }

    const describe = (
      key: string
    ): Pick<TStageReviewSidebarGroup, "name" | "icon" | "stage" | "isCurrent" | "projectName" | "depth"> => {
      const sample = sampleByKey.get(key);
      switch (groupBy) {
        case "stage": {
          const stage = stageById.get(key);
          return {
            name: stage?.label ?? "—",
            // 产品页：同名阶段在不同项目里各成一组，组名后面淡色缀项目名才分得清
            projectName: crossProject ? (stage?.project_name ?? sample?.project_detail?.name ?? null) : null,
            stage,
            depth: stage?.depth ?? 0,
            isCurrent: Boolean(currentStageName) && stage?.label === currentStageName,
            icon: <span className={cn("size-2.5 shrink-0 rounded-full border-2", stageNodeClassName(stage))} />,
          };
        }
        case "product":
          return {
            name: sample?.product_detail?.name ?? "—",
            icon: <Package className="size-4 shrink-0 text-tertiary" strokeWidth={2} />,
          };
        case "project":
          return {
            name: sample?.project_detail?.name ?? "—",
            icon: sample?.project_detail ? (
              <Logo logo={sample.project_detail.logo_props} size={14} />
            ) : (
              <FolderKanban className="size-4 shrink-0 text-tertiary" strokeWidth={2} />
            ),
          };
        case "status":
          return {
            name: t(`${I18N}.status.${key}`),
            icon: <StageReviewStatusIcon status={key as (typeof STAGE_REVIEW_STATUS_ORDER)[number]} />,
          };
        case "leader":
        case "auditor": {
          const user = groupBy === "leader" ? sample?.leader_detail : sample?.auditor_detail;
          return {
            name: key === STAGE_REVIEW_GROUP_NONE || !user ? t(`${I18N}.list.unassigned`) : user.display_name,
            icon: userIcon(key === STAGE_REVIEW_GROUP_NONE ? null : user),
          };
        }
        case "result":
          return {
            name: key === STAGE_REVIEW_GROUP_NONE ? t(`${I18N}.list.no_result`) : t(`${I18N}.result.${key}`),
            icon:
              key === STAGE_REVIEW_GROUP_NONE ? (
                <UnassignedIcon />
              ) : (
                <span className={cn("m-1 size-2 shrink-0 rounded-full", RESULT_DOT[key])} />
              ),
          };
        default:
          return {
            name: t(`workspace_templates.reviews.kind.${key}`),
            icon: <LayersIcon className="size-4 shrink-0 text-tertiary" />,
          };
      }
    };

    const groups = keys
      .map((key) => ({
        id: key,
        count: (rowsByGroup.get(key) ?? []).filter((row) => !row.carried).length,
        ...describe(key),
      }))
      .filter((group) => showEmptyGroups || group.count > 0);
    if (groups.length === 0) return groups;
    return [
      {
        id: STAGE_REVIEW_GROUP_ALL,
        name: t(`${I18N}.list.all_reviews`),
        count: allRows.filter((row) => !row.carried).length,
        icon: <Rows3 className="size-4 shrink-0 text-tertiary" strokeWidth={2} />,
      },
      ...groups,
    ];
    // t 每次渲染都是新引用，放进依赖会让分组栏每帧重建；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, reviews, stages, rowsByGroup, allRows, showEmptyGroups, currentStageName, crossProject]);

  const rowsOf = (groupId: string | null): TStageReviewRow[] =>
    groupBy === "none" || groupId === STAGE_REVIEW_GROUP_ALL ? allRows : (rowsByGroup.get(groupId ?? "") ?? []);

  const reviewsOf = (groupId: string | null): TStageReview[] =>
    groupBy === "none" || groupId === STAGE_REVIEW_GROUP_ALL
      ? reviews
      : reviews.filter((review) => stageReviewGroupKey(groupBy, review) === groupId);

  return { sidebarGroups, rowsOf, reviewsOf };
};

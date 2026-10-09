import type { TStageReview } from "@plane/types";
import { EStageReviewStatus } from "@plane/types";
import type { TStageReviewGroupBy, TStageReviewOrderBy } from "./display/display-settings";

/** 一条评审下全部评审活动（不受筛选影响）按状态的条数，标题后面的进度条用 */
export type TStageReviewActivityStats = Record<EStageReviewStatus, number> & { total: number };

/** 表格里的一行：评审或评审活动 */
export type TStageReviewRow = {
  review: TStageReview;
  /** 1 = 挂在所属评审下的评审活动（按研发阶段 / 产品分组或不分组时出现），落在评审下面的下沉区里 */
  depth: 0 | 1;
  /** 自己没命中，只是因为子活动命中被带出来的所属评审：半透明，不计入命中数 */
  carried: boolean;
  /** 列表里显示的标题：子活动去掉「所属评审-」前缀 */
  title: string;
  /** 铺平时，子活动前面带的「所属评审 ›」 */
  parentTitle: string | null;
  /** depth 1 的所属评审：与它相同的列（产品 / 来源裁剪表等）活动行不再重复 */
  parent: TStageReview | null;
  /** depth 0 且下面跟着活动行：行首出折叠箭头 */
  expandable: boolean;
  /** depth 1 里紧挨着所属评审的第一行：下沉区顶部的内阴影画在它上面 */
  isFirstChild: boolean;
  /** 这条评审有评审活动时的进度；没有活动为 null */
  activities: TStageReviewActivityStats | null;
};

const EMPTY_ACTIVITY_STATS: TStageReviewActivityStats = {
  [EStageReviewStatus.NOT_STARTED]: 0,
  [EStageReviewStatus.IN_REVIEW]: 0,
  [EStageReviewStatus.IN_APPROVAL]: 0,
  [EStageReviewStatus.COMPLETED]: 0,
  total: 0,
};

/** 负责人 / 审核者 / 结论为空的那一组 */
export const STAGE_REVIEW_GROUP_NONE = "__none__";
/** 分组方式为「无」时唯一的那一组 */
export const STAGE_REVIEW_GROUP_ALL = "__all__";

/**
 * 一条评审落在哪些分组里。按研发阶段 / 产品 / 项目分时父子一定同组，其它方式可能拆开。
 * 只有负责人 / 审核者会落进多个组：两者是名单，名单里有几个人就进几个组（同工作项按
 * 负责人分组），名单为空进「未指定」。
 *
 * ``crossProject``（产品页）时研发阶段这一维要带上项目：阶段是研发模式里的一行，两个项目
 * 用同一个模式就是同一个阶段 id，跨项目视角下合并成一组会把「电表平台走到 O 阶段」和
 * 「通信模组走到 O 阶段」混为一谈。键的形状与后端产品级汇总接口一致。
 */
export const stageReviewGroupKeys = (
  groupBy: TStageReviewGroupBy,
  review: TStageReview,
  crossProject = false
): string[] => {
  switch (groupBy) {
    case "stage":
      return [crossProject ? `${review.project_id}:${review.stage_id}` : review.stage_id];
    case "product":
      return [review.product_id];
    case "project":
      return [review.project_id];
    case "status":
      return [review.status];
    case "leader":
      return review.leader_ids.length > 0 ? review.leader_ids : [STAGE_REVIEW_GROUP_NONE];
    case "auditor":
      return review.auditor_ids.length > 0 ? review.auditor_ids : [STAGE_REVIEW_GROUP_NONE];
    case "result":
      return [review.result || STAGE_REVIEW_GROUP_NONE];
    case "kind":
      return [review.kind];
    default:
      return [STAGE_REVIEW_GROUP_ALL];
  }
};

/** 「D阶段评审-需求Review（软件&整机）」挂在「D阶段评审」下时只显示后半段；前缀后面必须跟分隔符才去 */
const stripParentPrefix = (title: string, parentTitle: string) => {
  if (!parentTitle || !title.startsWith(parentTitle)) return title;
  const rest = title.slice(parentTitle.length).match(/^\s*[-－—–:：]\s*(.+)$/);
  return rest ? rest[1] : title;
};

const compareBy = (orderBy: TStageReviewOrderBy, indexOf: (review: TStageReview) => number) => {
  const byIndex = (a: TStageReview, b: TStageReview) => indexOf(a) - indexOf(b);
  return (a: TStageReview, b: TStageReview) => {
    switch (orderBy) {
      case "-created_at":
        return b.created_at.localeCompare(a.created_at) || byIndex(a, b);
      case "-updated_at":
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "") || byIndex(a, b);
      case "start_date":
      case "end_date": {
        const left = a[orderBy];
        const right = b[orderBy];
        if (left === right) return byIndex(a, b);
        // 没排期的沉底
        if (!left) return 1;
        if (!right) return -1;
        return left.localeCompare(right);
      }
      default:
        return byIndex(a, b);
    }
  };
};

/**
 * 扁平评审列表 → 「分组 key → 表格行」。分组的顺序、名称、空组由左侧分组栏决定，这里不管。
 *
 * - **按研发阶段 / 产品分组或不分组**：父子一定同组，保留「评审 → 评审活动」两层。命中子
 *   活动时它所属的评审跟着出来（`carried`），否则一条活动孤零零地顶着。
 * - **按其它属性分组**：父子可能落在不同组，一律铺平，子活动前面带「所属评审 ›」。
 *   按负责人 / 审核者分组时，一条评审在名单里每个人的组里各出现一次。
 * - 评审活动允许没有父，或父不在列表里 —— 那种按顶层行处理。
 * - 排序作用在评审这一层；活动在所属评审下按同一口径排。关掉「显示评审活动」只剩顶层行。
 * - 收起不在这里做（见 {@link collapseStageReviewRows}），分组栏的条数不受收起影响。
 */
export const buildStageReviewRowsByGroup = ({
  reviews,
  isHit,
  orderBy,
  groupBy,
  showActivities,
  crossProject = false,
}: {
  reviews: TStageReview[];
  isHit: (review: TStageReview) => boolean;
  orderBy: TStageReviewOrderBy;
  groupBy: TStageReviewGroupBy;
  showActivities: boolean;
  /** 产品页：研发阶段分组的键要带上项目，见 stageReviewGroupKeys */
  crossProject?: boolean;
}): Map<string, TStageReviewRow[]> => {
  const byId = new Map(reviews.map((review) => [review.id, review]));
  const index = new Map(reviews.map((review, position) => [review.id, position]));
  const compare = compareBy(orderBy, (review) => index.get(review.id) ?? 0);
  const parentOf = (review: TStageReview) => (review.parent_id ? (byId.get(review.parent_id) ?? null) : null);
  const push = (rowsByKey: Map<string, TStageReviewRow[]>, keys: string[], rows: TStageReviewRow[]) =>
    keys.forEach((key) => rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), ...rows]));

  const hits = new Set(
    reviews.filter((review) => (showActivities || !parentOf(review)) && isHit(review)).map((review) => review.id)
  );
  const rowsByKey = new Map<string, TStageReviewRow[]>();
  // 进度按这条评审下的全部活动算，不看筛选：被筛掉几条活动，评审本身的进度并没有变
  const statsById = new Map<string, TStageReviewActivityStats>();
  for (const review of reviews) {
    const parent = parentOf(review);
    if (!parent) continue;
    const stats = statsById.get(parent.id) ?? { ...EMPTY_ACTIVITY_STATS };
    stats[review.status] += 1;
    stats.total += 1;
    statsById.set(parent.id, stats);
  }
  const activitiesOf = (review: TStageReview) => statsById.get(review.id) ?? null;

  if (groupBy === "none" || groupBy === "stage" || groupBy === "product" || groupBy === "project") {
    const carried = new Set<string>();
    const childrenOf = new Map<string, TStageReview[]>();
    for (const review of reviews) {
      const parent = parentOf(review);
      if (!parent || !hits.has(review.id)) continue;
      if (!hits.has(parent.id)) carried.add(parent.id);
      childrenOf.set(parent.id, [...(childrenOf.get(parent.id) ?? []), review]);
    }

    const roots = reviews
      .filter((review) => !parentOf(review) && (hits.has(review.id) || carried.has(review.id)))
      .sort(compare);
    for (const root of roots) {
      const children = (childrenOf.get(root.id) ?? []).sort(compare);
      push(rowsByKey, stageReviewGroupKeys(groupBy, root, crossProject), [
        {
          review: root,
          depth: 0,
          carried: carried.has(root.id),
          title: root.title,
          parentTitle: null,
          parent: null,
          // 被带出来的评审不给收：它出现就是为了下面那几条命中的活动
          expandable: children.length > 0 && !carried.has(root.id),
          isFirstChild: false,
          activities: activitiesOf(root),
        },
        ...children.map((child, position) => ({
          review: child,
          depth: 1 as const,
          carried: false,
          title: stripParentPrefix(child.title, root.title),
          parentTitle: null,
          parent: root,
          expandable: false,
          isFirstChild: position === 0,
          activities: activitiesOf(child),
        })),
      ]);
    }
    return rowsByKey;
  }

  for (const review of reviews.filter((item) => hits.has(item.id)).sort(compare)) {
    const parent = parentOf(review);
    push(rowsByKey, stageReviewGroupKeys(groupBy, review, crossProject), [
      {
        review,
        depth: 0,
        carried: false,
        title: parent ? stripParentPrefix(review.title, parent.title) : review.title,
        parentTitle: parent?.title ?? null,
        parent: null,
        expandable: false,
        isFirstChild: false,
        activities: activitiesOf(review),
      },
    ]);
  }
  return rowsByKey;
};

/** 拿掉收起的评审下面的活动行；`collapsedIds` 里不可折叠的（被带出来的评审）不算 */
export const collapseStageReviewRows = (rows: TStageReviewRow[], collapsedIds: Set<string>): TStageReviewRow[] => {
  if (collapsedIds.size === 0) return rows;
  const collapsed = new Set(
    rows.filter((row) => row.expandable && collapsedIds.has(row.review.id)).map((row) => row.review.id)
  );
  return collapsed.size === 0 ? rows : rows.filter((row) => !(row.parent && collapsed.has(row.parent.id)));
};

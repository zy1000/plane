import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringActivity } from "@plane/types";
import type { THistoryNode } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import {
  HistoryActor,
  HistoryEmpty,
  HistoryEntry,
  HistoryHeader,
  HistoryNote,
  HistoryText,
  HistoryTimeline,
} from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { buildActivityMessage } from "./tailoring-activity-message";

/**
 * 时间线节点的形状：生效 / 驳回给不同的色点，其余都是灰点。
 * 「取消修订」按 cancelled 走 —— 它撤销的是一段还没生效的改动。
 */
const nodeFor = (activity: TReviewTailoringActivity): THistoryNode => {
  if (activity.field !== "status") return { kind: "dot", tone: "pending" };
  if (activity.verb === "approved") return { kind: "dot", tone: "approved" };
  if (activity.verb === "rejected") return { kind: "dot", tone: "rejected" };
  if (activity.verb === "withdrawn" || activity.verb === "revision_cancelled")
    return { kind: "dot", tone: "cancelled" };
  return { kind: "dot", tone: "pending" };
};

/** 变更历史。复用需求详情那套时间线原子件，两处的读法保持一致 */
export const TailoringActivityFeed = ({ activities }: { activities: TReviewTailoringActivity[] }) => {
  const { t } = useTranslation();

  if (activities.length === 0) {
    return (
      <HistoryEmpty
        title={t("review_tailoring.activity.empty_title")}
        description={t("review_tailoring.activity.empty_description")}
      />
    );
  }

  return (
    <HistoryTimeline>
      {activities.map((activity, index) => (
        <HistoryEntry
          key={activity.id}
          node={nodeFor(activity)}
          isFirst={index === 0}
          isLast={index === activities.length - 1}
        >
          <HistoryHeader time={activity.created_at}>
            <HistoryActor user={activity.actor_detail} />
            <HistoryText>{buildActivityMessage(activity, t)}</HistoryText>
          </HistoryHeader>
          {activity.field === "status" && activity.comment && <HistoryNote>{activity.comment}</HistoryNote>}
        </HistoryEntry>
      ))}
    </HistoryTimeline>
  );
};

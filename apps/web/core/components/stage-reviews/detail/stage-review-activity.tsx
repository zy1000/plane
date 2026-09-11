import { useTranslation } from "@plane/i18n";
import type { TStageReviewActivity } from "@plane/types";
import { EStageReviewStatus } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL, renderFormattedDateTime } from "@plane/utils";

const I18N = "stage_review";

/**
 * 一条轨迹翻成一句中文。
 *
 * 状态那条走 `comment`（后端写的是按钮文案：开始评审 / 提交审核 / 审核通过 / 退回），
 * 这样「谁在什么时候推进了什么」读起来就是一句话，不用前端再去推断方向。
 */
const useActivityMessage = () => {
  const { t } = useTranslation();

  return (activity: TStageReviewActivity) => {
    const statusLabel = (value: string | null) =>
      value ? t(`${I18N}.status.${value as EStageReviewStatus}`, { defaultValue: value }) : "";

    if (activity.field === "status") {
      return t(`${I18N}.activity.status`, {
        action: activity.comment,
        from: statusLabel(activity.old_value),
        to: statusLabel(activity.new_value),
      });
    }
    if (activity.field === "comment") return t(`${I18N}.activity.comment`);
    if (activity.field === "attachment") {
      return activity.verb === "deleted"
        ? t(`${I18N}.activity.attachment_deleted`, { name: activity.old_value ?? "" })
        : t(`${I18N}.activity.attachment_created`, { name: activity.new_value ?? "" });
    }
    if (activity.verb === "created") return t(`${I18N}.activity.created`);
    return t(`${I18N}.activity.updated`, {
      field: t(`${I18N}.fields.${activity.field}`, { defaultValue: activity.field ?? "" }),
    });
  };
};

/** 变更轨迹。状态只能一步步推进，所以这条时间线读下来就是完整的推进过程 */
export const StageReviewActivityFeed = ({ activities }: { activities: TStageReviewActivity[] }) => {
  const { t } = useTranslation();
  const buildMessage = useActivityMessage();

  return (
    <div className="flex flex-col gap-3">
      {activities.length === 0 ? (
        <p className="py-2 text-center text-12 text-tertiary">{t(`${I18N}.detail.no_activity`)}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {activities.map((activity) => (
            <li key={activity.id} className="flex items-center gap-2 text-12 text-secondary">
              <Avatar
                size="sm"
                name={activity.actor_detail?.display_name ?? ""}
                src={getFileURL(activity.actor_detail?.avatar_url ?? "")}
              />
              <span className="font-medium text-primary">{activity.actor_detail?.display_name ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate">{buildMessage(activity)}</span>
              <span className="shrink-0 text-11 text-tertiary">{renderFormattedDateTime(activity.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

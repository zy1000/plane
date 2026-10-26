"use client";

/**
 * 流转记录：状态变更、工作流审批、归档 / 恢复、收件箱处理、删除。
 * 彩色圆节点 + 14px 句子，状态用药丸「旧 → 新」。节点颜色跟目标状态的组走：
 * 完成绿、取消灰、进行中琥珀，其余灰；审批中是空心琥珀，拒绝红。
 */
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import type { LucideIcon } from "lucide-react";
import { Archive, ArrowRight, Check, ClipboardCheck, Clock, Inbox, RotateCcw, Trash2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TIssueActivity } from "@plane/types";
import { useProjectState } from "@/hooks/store/use-project-state";
import { ActivityTime, ActorName, Arrow, StateValue, StatusNode, TimelineRow } from "./timeline-primitives";

const I18N = "issue_activity";

type TTone = "neutral" | "warning" | "accent" | "success" | "danger";

/** 解析后端写入的取消审批 comment，例如：必填字段缺失，审批已取消（A → B）：xxx */
const parseCancelComment = (comment: string | undefined) => {
  const text = (comment || "").trim();
  const matched = text.match(/^(.*?)（(.+?) → (.+?)）(?:：([\s\S]+))?$/);
  if (matched) {
    return { prefix: matched[1].trim(), from: matched[2], to: matched[3], detail: matched[4]?.trim() };
  }
  return { prefix: text, from: undefined, to: undefined, detail: undefined };
};

const Shell = ({
  activity,
  icon,
  tone,
  hollow,
  isFirst,
  isLast,
  workspaceSlug,
  actorName,
  children,
  sub,
}: {
  activity: TIssueActivity;
  icon: LucideIcon;
  tone: TTone;
  hollow?: boolean;
  isFirst: boolean;
  isLast: boolean;
  workspaceSlug: string;
  /** 系统动作（审批被拒、校验失败取消、自动归档）不挂在具体操作人头上 */
  actorName?: string;
  children: ReactNode;
  sub?: ReactNode;
}) => (
  <TimelineRow node={<StatusNode icon={icon} tone={tone} hollow={hollow} />} isFirst={isFirst} isLast={isLast}>
    <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-14 text-secondary">
      {actorName ? (
        <ActorName name={actorName} />
      ) : (
        <ActorName
          name={activity.actor_detail?.display_name ?? ""}
          userId={activity.actor_detail?.id ?? activity.actor}
          workspaceSlug={workspaceSlug}
        />
      )}
      {children}
      <ActivityTime value={activity.created_at} />
    </div>
    {sub && <div className="pb-1 text-13 text-tertiary">{sub}</div>}
  </TimelineRow>
);

const StateChange = ({ from, to, fromId, toId }: { from?: string; to?: string; fromId?: string; toId?: string }) => (
  <>
    {from && <StateValue name={from} stateId={fromId} old />}
    {from && to && <Arrow />}
    {to && <StateValue name={to} stateId={toId} />}
  </>
);

export const ActivityTransitionRow = observer(function ActivityTransitionRow(props: {
  activity: TIssueActivity;
  isFirst: boolean;
  isLast: boolean;
  workspaceSlug: string;
}) {
  const { activity } = props;
  const { t } = useTranslation();
  const { getStateById } = useProjectState();
  const field = activity.field ?? "";
  const shell = { activity, isFirst: props.isFirst, isLast: props.isLast, workspaceSlug: props.workspaceSlug };

  if (field === "state") {
    const group = activity.new_identifier ? getStateById(activity.new_identifier)?.group : undefined;
    const tone: TTone =
      group === "completed" ? "success" : group === "cancelled" ? "neutral" : group === "started" ? "warning" : "neutral";
    const icon = group === "completed" ? Check : group === "cancelled" ? X : ArrowRight;
    return (
      <Shell {...shell} icon={icon} tone={tone}>
        <span>{t(`${I18N}.state_changed`)}</span>
        <StateChange
          from={activity.old_value || undefined}
          to={activity.new_value || undefined}
          fromId={activity.old_identifier}
          toId={activity.new_identifier}
        />
      </Shell>
    );
  }

  if (field === "workflow_approval_request") {
    const value = activity.new_value ?? "";
    if (value === "rejected") {
      return (
        <Shell {...shell} icon={X} tone="danger" actorName={t(`${I18N}.system`)}>
          <span>{t(`${I18N}.approval.request_rejected`)}</span>
          <StateChange from={activity.old_value || undefined} fromId={activity.old_identifier} />
        </Shell>
      );
    }
    if (value === "cancelled") {
      const parsed = parseCancelComment(activity.comment);
      const isSystem = !parsed.prefix.includes("直接更改状态");
      return (
        <Shell
          {...shell}
          icon={X}
          tone="neutral"
          actorName={isSystem ? t(`${I18N}.system`) : undefined}
          sub={parsed.detail}
        >
          <span>{parsed.prefix || t(`${I18N}.approval.request_cancelled`)}</span>
          <StateChange from={parsed.from ?? activity.old_value ?? undefined} to={parsed.to} />
        </Shell>
      );
    }
    if (value === "reset") {
      return (
        <Shell {...shell} icon={RotateCcw} tone="neutral">
          <span>{t(`${I18N}.approval.reset`)}</span>
          <StateChange from={activity.old_value || undefined} fromId={activity.old_identifier} />
        </Shell>
      );
    }
    return (
      <Shell {...shell} icon={Clock} tone="warning" hollow>
        <span>{t(`${I18N}.approval.requested`)}</span>
        <StateChange from={activity.old_value || undefined} to={value || undefined} fromId={activity.old_identifier} />
      </Shell>
    );
  }

  if (field === "workflow_approval_action") {
    const approved = activity.new_value === "approved";
    return (
      <Shell {...shell} icon={approved ? ClipboardCheck : X} tone={approved ? "success" : "danger"}>
        <span>{t(`${I18N}.approval.${approved ? "approved" : "rejected"}`)}</span>
      </Shell>
    );
  }

  if (field === "archived_at") {
    const restored = activity.new_value === "restore";
    return (
      <Shell
        {...shell}
        icon={restored ? RotateCcw : Archive}
        tone="neutral"
        actorName={restored ? undefined : t(`${I18N}.system`)}
      >
        <span>{t(`${I18N}.${restored ? "restored" : "archived"}`)}</span>
      </Shell>
    );
  }

  if (field === "intake" || field === "inbox") {
    const key =
      activity.verb === "1"
        ? "accepted"
        : activity.verb === "-1"
          ? "declined"
          : activity.verb === "0"
            ? "snoozed"
            : activity.verb === "2"
              ? "duplicate"
              : "updated";
    const tone: TTone = key === "accepted" ? "success" : key === "declined" || key === "duplicate" ? "danger" : "neutral";
    return (
      <Shell {...shell} icon={Inbox} tone={tone}>
        <span>{t(`${I18N}.intake.${key}`)}</span>
      </Shell>
    );
  }

  // 没有 field 且不是创建：删除记录
  return (
    <Shell {...shell} icon={Trash2} tone="danger">
      <span>{t(`${I18N}.deleted`)}</span>
    </Shell>
  );
});

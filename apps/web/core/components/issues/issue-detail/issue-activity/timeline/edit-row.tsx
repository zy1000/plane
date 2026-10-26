"use client";

/**
 * 修改轨迹的一行：8px 灰点 + 13px 灰字，视觉上让位给流转节点和评论。
 *
 * 连续修改（同一人、同一次保存或相邻不超过 10 分钟，分组在 hook 里做）合成一条：
 * - 只有一条 → 直接一句话；
 * - 全是负责人 / 标签的增删 → 「更换了负责人 A → B」「添加了标签 X Y」；
 * - 全是同一动作的附件 → 一句话列出文件名；
 * - 其余 → 「修改了 N 项」+ 字段名标签，点开逐项看「字段 | 旧 → 新」。
 * 标题、描述、长文本自定义字段不写旧值新值，直接给行内 diff，改了哪几个字一眼看到。
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TIssueActivity } from "@plane/types";
import { cn } from "@plane/utils";
import { InlineTextDiff } from "@/components/common/inline-text-diff";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import {
  COLLECTION_FIELDS,
  isAutoFilledFromRequirement,
  isRelationField,
  isTextDiffActivity,
  useActivityDisplayValue,
  useActivityFieldLabel,
} from "./activity-text";
import {
  ActivityTime,
  ActorName,
  Arrow,
  DotNode,
  LabelChip,
  PersonChip,
  TimelineRow,
  Value,
} from "./timeline-primitives";

const I18N = "issue_activity";

const isAdded = (activity: TIssueActivity) => !activity.old_value && !!activity.new_value;
const isRemoved = (activity: TIssueActivity) => !!activity.old_value && !activity.new_value;

/** 迭代 / 模块有详情页，句子里的名字可点；发布没有稳定路由，只显示名字 */
const collectionHref = (activity: TIssueActivity, side: "old" | "new") => {
  const id = side === "new" ? activity.new_identifier : activity.old_identifier;
  if (!id || !activity.workspace_detail?.slug) return undefined;
  if (activity.field === "cycles") return `/${activity.workspace_detail.slug}/projects/${activity.project}/cycles/${id}`;
  if (activity.field === "modules") return `/${activity.workspace_detail.slug}/projects/${activity.project}/modules/${id}`;
  return undefined;
};

/**
 * 一个值的写法：人 → 头像 chip，标签 → 色点 chip，链接 → 可点，其余 → 文字（旧值划线）。
 * 创建行下面的初始属性、展开后的详情、单条句子都用它。
 */
export const EditValue = observer(function EditValue({
  activity,
  side,
}: {
  activity: TIssueActivity;
  side: "old" | "new";
}) {
  const { getUserDetails } = useMember();
  const { getLabelById } = useLabel();
  const display = useActivityDisplayValue();
  const old = side === "old";
  const raw = (old ? activity.old_value : activity.new_value) ?? "";
  const identifier = old ? activity.old_identifier : activity.new_identifier;
  const field = activity.field ?? "";

  if (field === "assignees") {
    const user = identifier ? getUserDetails(identifier) : undefined;
    return <PersonChip name={raw} avatarUrl={user?.avatar_url} old={old} />;
  }
  if (field === "labels") {
    return <LabelChip name={raw} color={identifier ? getLabelById(identifier)?.color : undefined} old={old} />;
  }
  if (field === "link") {
    return (
      <a
        href={raw}
        target="_blank"
        rel="noopener noreferrer"
        title={raw}
        className={cn("inline-block max-w-[280px] truncate align-bottom hover:underline", old ? "text-placeholder line-through" : "text-accent-primary")}
      >
        {raw}
      </a>
    );
  }
  const href = COLLECTION_FIELDS.includes(field) ? collectionHref(activity, side) : undefined;
  if (href && !old) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={raw} className="inline-block max-w-[280px] truncate align-bottom text-primary hover:underline">
        {raw}
      </a>
    );
  }
  return <Value old={old}>{display(activity, raw)}</Value>;
});

/** 「旧 → 新」：缺哪头就只画另一头 */
const ChangeValue = ({ activity }: { activity: TIssueActivity }) => (
  <>
    {activity.old_value && <EditValue activity={activity} side="old" />}
    {activity.old_value && activity.new_value && <Arrow />}
    {activity.new_value && <EditValue activity={activity} side="new" />}
  </>
);

/** 描述：默认只说「更新了内容」，点「查看变化」才展开 HTML 转纯文本后的 diff */
const DescriptionChange = ({ activity, inline = false }: { activity: TIssueActivity; inline?: boolean }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const hasDiff = !!activity.old_value || !!activity.new_value;
  return (
    <span className={cn("flex min-w-0 flex-col gap-1", inline && "flex-1")}>
      <span className="flex items-center gap-2">
        <span className="text-secondary">{t(`${I18N}.edits.content_updated`)}</span>
        {hasDiff && (
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="text-13 text-accent-primary hover:underline"
          >
            {t(`${I18N}.edits.${isOpen ? "hide_diff" : "view_diff"}`)}
          </button>
        )}
      </span>
      {isOpen && (
        <InlineTextDiff
          before={activity.old_value}
          after={activity.new_value}
          isHtml
          formatOnlyLabel={t(`${I18N}.edits.format_only`)}
          className="rounded-md bg-layer-1 px-2.5 py-1.5"
        />
      )}
    </span>
  );
};

/** 标题 / 长文本自定义字段：直接给行内 diff */
const TextDiffBlock = ({ activity, className }: { activity: TIssueActivity; className?: string }) => {
  const { t } = useTranslation();
  return (
    <InlineTextDiff
      before={activity.old_value}
      after={activity.new_value}
      formatOnlyLabel={t(`${I18N}.edits.content_updated`)}
      className={cn("rounded-md bg-layer-1 px-2.5 py-1.5", className)}
    />
  );
};

/** 一条修改写成一句话（单条时用）；返回 { sentence, block }，block 是句子下面的 diff 块 */
const useEditSentence = () => {
  const { t } = useTranslation();
  const fieldLabel = useActivityFieldLabel();
  return (activity: TIssueActivity): { sentence: ReactNode; block?: ReactNode } => {
    const field = activity.field ?? "";
    const label = fieldLabel(activity);
    const text = (key: string) => <span>{t(`${I18N}.${key}`, { field: label })}</span>;

    if (field === "description") return { sentence: <DescriptionChange activity={activity} /> };
    if (isTextDiffActivity(activity)) {
      return { sentence: text("edits.updated"), block: <TextDiffBlock activity={activity} /> };
    }
    if (field === "assignees" || field === "labels") {
      const removed = isRemoved(activity);
      return {
        sentence: (
          <>
            {text(removed ? "edits.removed" : "edits.added")}
            <EditValue activity={activity} side={removed ? "old" : "new"} />
          </>
        ),
      };
    }
    if (COLLECTION_FIELDS.includes(field)) {
      const key =
        activity.verb === "created" ? "added_to" : activity.verb === "deleted" ? "removed_from" : "changed_to";
      return {
        sentence: (
          <>
            {text(`collection.${key}`)}
            <EditValue activity={activity} side={key === "removed_from" ? "old" : "new"} />
          </>
        ),
      };
    }
    if (field === "link" || field === "attachment") {
      const key = activity.verb === "created" ? "added" : activity.verb === "deleted" ? "removed" : "updated";
      return {
        sentence: (
          <>
            <span>{t(`${I18N}.${field}.${key}`)}</span>
            <EditValue activity={activity} side={key === "removed" ? "old" : "new"} />
          </>
        ),
      };
    }
    if (isRelationField(field)) {
      const removed = !!activity.old_value;
      const type = ["relates_to", "duplicate", "blocked_by", "blocking"].includes(field) ? field : "other";
      return {
        sentence: (
          <>
            <span>{t(`${I18N}.relation.${type}.${removed ? "removed" : "added"}`)}</span>
            <EditValue activity={activity} side={removed ? "old" : "new"} />
          </>
        ),
      };
    }
    const suffix = isAutoFilledFromRequirement(activity) ? (
      <span className="text-placeholder">（{t(`${I18N}.edits.from_requirement`)}）</span>
    ) : null;
    if (activity.old_value && activity.new_value) {
      return {
        sentence: (
          <>
            {text("edits.change_from")}
            <ChangeValue activity={activity} />
            {suffix}
          </>
        ),
      };
    }
    if (activity.new_value) {
      return {
        sentence: (
          <>
            {text("edits.set_to")}
            <EditValue activity={activity} side="new" />
            {suffix}
          </>
        ),
      };
    }
    if (activity.old_value) {
      return {
        sentence: (
          <>
            {text("edits.cleared")}
            <EditValue activity={activity} side="old" />
          </>
        ),
      };
    }
    return { sentence: text("edits.updated") };
  };
};

/** 展开后的一项：字段名 | 旧 → 新（文本字段直接是 diff） */
const EditDetailItem = observer(function EditDetailItem({ activity }: { activity: TIssueActivity }) {
  const fieldLabel = useActivityFieldLabel();
  const field = activity.field ?? "";
  const label = fieldLabel(activity);

  let value: ReactNode;
  if (field === "description") value = <DescriptionChange activity={activity} inline />;
  else if (isTextDiffActivity(activity)) value = <TextDiffBlock activity={activity} className="flex-1" />;
  else if (field === "assignees" || field === "labels") {
    value = <EditValue activity={activity} side={isRemoved(activity) ? "old" : "new"} />;
  } else if (COLLECTION_FIELDS.includes(field) || field === "link" || field === "attachment") {
    value = activity.verb === "deleted" ? <EditValue activity={activity} side="old" /> : <ChangeValue activity={activity} />;
  } else if (isRelationField(field)) {
    value = <EditValue activity={activity} side={activity.old_value ? "old" : "new"} />;
  } else if (!activity.old_value && !activity.new_value) {
    value = <span className="text-placeholder">—</span>;
  } else {
    value = <ChangeValue activity={activity} />;
  }

  return (
    <li className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-x-3 py-1 text-13">
      <span className="truncate pt-px text-tertiary" title={label}>
        {label}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-primary">{value}</span>
    </li>
  );
});

/** 一组里全是同一个名单字段（负责人 / 标签）的增删时，合成一句 */
const summarizeListField = (activities: TIssueActivity[]) => {
  const field = activities[0]?.field;
  if (field !== "assignees" && field !== "labels") return null;
  if (!activities.every((item) => item.field === field && (isAdded(item) || isRemoved(item)))) return null;
  const added = activities.filter(isAdded);
  const removed = activities.filter(isRemoved);
  if (added.length === 1 && removed.length === 1) return { kind: "replaced" as const, added, removed };
  if (removed.length === 0) return { kind: "added" as const, added, removed };
  if (added.length === 0) return { kind: "removed" as const, added, removed };
  return null;
};

export const ActivityEditRow = observer(function ActivityEditRow({
  activities,
  isFirst,
  isLast,
  workspaceSlug,
}: {
  activities: TIssueActivity[];
  isFirst: boolean;
  isLast: boolean;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const fieldLabel = useActivityFieldLabel();
  const sentenceOf = useEditSentence();
  const [isOpen, setIsOpen] = useState(false);
  const first = activities[0];
  if (!first) return null;

  const actor = (
    <ActorName
      name={first.actor_detail?.display_name ?? ""}
      userId={first.actor_detail?.id ?? first.actor}
      workspaceSlug={workspaceSlug}
    />
  );

  let sentence: ReactNode;
  let block: ReactNode = null;
  const listSummary = activities.length > 1 ? summarizeListField(activities) : null;
  const sameAttachmentAction =
    activities.length > 1 && activities.every((item) => item.field === "attachment" && item.verb === first.verb);

  if (activities.length === 1) {
    ({ sentence, block } = sentenceOf(first));
  } else if (listSummary) {
    const field = fieldLabel(first);
    if (listSummary.kind === "replaced") {
      sentence = (
        <>
          <span>{t(`${I18N}.edits.replaced`, { field })}</span>
          <EditValue activity={listSummary.removed[0]} side="old" />
          <Arrow />
          <EditValue activity={listSummary.added[0]} side="new" />
        </>
      );
    } else {
      const items = listSummary.kind === "added" ? listSummary.added : listSummary.removed;
      sentence = (
        <>
          <span>{t(`${I18N}.edits.${listSummary.kind}`, { field })}</span>
          {items.map((item) => (
            <EditValue key={item.id} activity={item} side={listSummary.kind === "added" ? "new" : "old"} />
          ))}
        </>
      );
    }
  } else if (sameAttachmentAction) {
    const removed = first.verb === "deleted";
    sentence = (
      <>
        <span>{t(`${I18N}.attachment.${removed ? "removed" : "added"}`)}</span>
        {activities.map((item) => (
          <EditValue key={item.id} activity={item} side={removed ? "old" : "new"} />
        ))}
      </>
    );
  } else {
    const allFilled = activities.every((item) => item.field === "extra_field" && isAdded(item));
    const labels = Array.from(new Set(activities.map(fieldLabel)));
    const Chevron = isOpen ? ChevronUp : ChevronDown;
    // 收起时字段名用「·」接在句子后面，一行灰字；整句可点，箭头常驻但用最浅的灰
    sentence = (
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="-mx-1 flex min-w-0 flex-wrap items-center gap-x-1.5 rounded-md px-1 text-left transition hover:bg-layer-1"
      >
        <span>{t(`${I18N}.edits.${allFilled ? "filled" : "count"}`, { count: activities.length })}</span>
        {!isOpen && (
          <>
            <span className="text-placeholder" aria-hidden>
              ·
            </span>
            <span className="min-w-0 break-all text-tertiary">{labels.join("、")}</span>
          </>
        )}
        <Chevron className="size-3.5 shrink-0 text-placeholder" />
      </button>
    );
    block = isOpen ? (
      <ul className="flex flex-col pb-1">
        {activities.map((item) => (
          <EditDetailItem key={item.id} activity={item} />
        ))}
      </ul>
    ) : null;
  }

  return (
    <TimelineRow node={<DotNode />} isFirst={isFirst} isLast={isLast}>
      <div className="flex min-h-7 flex-wrap items-center gap-x-1.5 gap-y-1 text-13 text-tertiary">
        {actor}
        {sentence}
        <ActivityTime value={first.created_at} />
      </div>
      {block && <div className="mt-0.5 text-13">{block}</div>}
    </TimelineRow>
  );
});

/** 创建行下面的初始属性：同一字段的几个值排在一起（「负责人 A B」） */
export const InitialValues = observer(function InitialValues({ activities }: { activities: TIssueActivity[] }) {
  const fieldLabel = useActivityFieldLabel();
  const groups = new Map<string, TIssueActivity[]>();
  activities
    .filter((item) => !!item.new_value && item.field !== "description" && !isTextDiffActivity(item))
    .forEach((item) => {
      const label = fieldLabel(item);
      groups.set(label, [...(groups.get(label) ?? []), item]);
    });
  if (groups.size === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-13 text-tertiary">
      {Array.from(groups.entries()).map(([label, items]) => (
        <span key={label} className="inline-flex flex-wrap items-center gap-1.5">
          <span>{label}</span>
          {items.map((item) => (
            <Fragment key={item.id}>
              <EditValue activity={item} side="new" />
            </Fragment>
          ))}
        </span>
      ))}
    </div>
  );
});

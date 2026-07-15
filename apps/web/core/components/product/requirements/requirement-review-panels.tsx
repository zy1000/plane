import { useState } from "react";
import { ArrowRight, Check, ChevronDown, CircleHelp, Clock3, GitCompareArrows, X } from "lucide-react";
import { useParams } from "next/navigation";
import { Avatar } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL } from "@plane/utils";
import { useRequirementAttachmentDownload } from "@/hooks/use-requirement-attachment-download";
import type {
  TRequirementAttachment,
  TRequirementChange,
  TRequirementChangeReviewer,
  TRequirementFieldDiff,
  TRequirementDiff,
  TRequirementReviewOpinion,
  TRequirementStatus,
} from "@/services/requirement.service";

const opinionMeta: Record<
  TRequirementReviewOpinion,
  { label: string; icon: typeof Check; className: string; segmentClassName: string }
> = {
  approved: {
    label: "通过",
    icon: Check,
    className: "bg-green-500/10 text-green-700 dark:text-green-300",
    segmentClassName: "bg-success-primary",
  },
  rejected: {
    label: "拒绝",
    icon: X,
    className: "bg-red-500/10 text-red-700 dark:text-red-300",
    segmentClassName: "bg-danger-primary",
  },
  needs_clarification: {
    label: "有待明确",
    icon: CircleHelp,
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    segmentClassName: "bg-warning-primary",
  },
};

export function RequirementStatusBadge(props: {
  status: TRequirementStatus;
  className?: string;
  /** 属性栏等需与纯文本左对齐时，去掉 pill 内边距与前置圆点 */
  plain?: boolean;
}) {
  const meta = {
    draft: {
      label: "草稿",
      className: "bg-gray-500/10 text-gray-700 dark:text-gray-300",
      textClassName: "text-gray-700 dark:text-gray-300",
      dotClassName: "bg-gray-500",
    },
    in_review: {
      label: "评审中",
      className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
      textClassName: "text-yellow-700 dark:text-yellow-300",
      dotClassName: "bg-yellow-500",
    },
    published: {
      label: "已发布",
      className: "bg-green-500/10 text-green-700 dark:text-green-300",
      textClassName: "text-green-700 dark:text-green-300",
      dotClassName: "bg-green-500",
    },
    rejected: {
      label: "已拒绝",
      className: "bg-red-500/10 text-red-700 dark:text-red-300",
      textClassName: "text-red-700 dark:text-red-300",
      dotClassName: "bg-red-500",
    },
    closed: {
      label: "已关闭",
      className: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
      textClassName: "text-slate-700 dark:text-slate-300",
      dotClassName: "bg-slate-500",
    },
  }[props.status];

  if (props.plain) {
    return (
      <span className={cn("text-body-xs-medium font-medium", meta.textClassName, props.className)}>
        {meta.label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-11 font-medium",
        meta.className,
        props.className
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClassName)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function RequirementReviewProgress(props: { change: TRequirementChange; variant?: "default" | "inverse" }) {
  const { change } = props;
  const { approved, needs_clarification: needsClarification, pending, rejected, total } = change.review_progress;
  const isInverse = props.variant === "inverse";
  const progressSegments = [
    { key: "approved", label: "通过", value: approved, className: opinionMeta.approved.segmentClassName },
    {
      key: "needs_clarification",
      label: "待明确",
      value: needsClarification,
      className: opinionMeta.needs_clarification.segmentClassName,
    },
    { key: "rejected", label: "拒绝", value: rejected, className: opinionMeta.rejected.segmentClassName },
  ].filter((segment) => segment.value > 0);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("text-11 font-medium", isInverse ? "text-on-color/80" : "text-secondary")}>
          评审通过进度
        </span>
        <span className={cn("text-13 font-semibold tabular-nums", isInverse ? "text-on-color" : "text-primary")}>
          {approved} / {total}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 flex h-2 overflow-hidden rounded-full",
          isInverse ? "bg-white/25 ring-1 ring-white/20 ring-inset dark:bg-black/25 dark:ring-black/20" : "bg-layer-2"
        )}
        role="progressbar"
        aria-label="评审通过进度"
        aria-valuemin={0}
        aria-valuemax={Math.max(total, 1)}
        aria-valuenow={approved}
        aria-valuetext={`${approved} 人通过，共 ${total} 人`}
      >
        {progressSegments.map((segment) => (
          <span
            key={segment.key}
            title={`${segment.label}：${segment.value} 人`}
            className={cn(
              "h-full transition-[width] duration-200 ease-out motion-reduce:transition-none",
              segment.className
            )}
            style={{ width: `${(segment.value / Math.max(total, 1)) * 100}%` }}
          />
        ))}
      </div>
      <div
        className={cn(
          "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-10 tabular-nums",
          isInverse ? "text-on-color/80" : "text-secondary"
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success-primary" aria-hidden="true" />
          {approved} 通过
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn("size-1.5 rounded-full", isInverse ? "bg-white/35 dark:bg-black/35" : "bg-layer-2")}
            aria-hidden="true"
          />
          {pending} 待处理
        </span>
        {needsClarification > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warning-primary" aria-hidden="true" />
            {needsClarification} 待明确
          </span>
        )}
        {rejected > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-danger-primary" aria-hidden="true" />
            {rejected} 拒绝
          </span>
        )}
      </div>
    </div>
  );
}

function RequirementAttachmentList(props: { attachments: TRequirementAttachment[] }) {
  const { productId, workspaceSlug } = useParams();
  const { download } = useRequirementAttachmentDownload(workspaceSlug?.toString(), productId?.toString());
  if (props.attachments.length === 0) return <span className="text-tertiary italic">无</span>;
  return (
    <div className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
      {props.attachments.map((attachment) => {
        return (
          <button
            key={attachment.id}
            type="button"
            onClick={() => download(attachment)}
            className="group focus-visible:ring-accent-primary/40 flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-12 text-secondary transition-colors duration-150 hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none"
          >
            <span className="min-w-0 truncate">{attachment.attributes?.name ?? "附件"}</span>
            <span className="shrink-0 text-10 text-tertiary group-hover:text-accent-primary">下载</span>
          </button>
        );
      })}
    </div>
  );
}

function displayValue(field: string, value: unknown) {
  if (field === "attachments") {
    return <RequirementAttachmentList attachments={(value as TRequirementAttachment[] | null | undefined) ?? []} />;
  }
  if (value === null || value === undefined || value === "") {
    return <span className="text-tertiary italic">未设置</span>;
  }
  if (field === "description_html" || field === "acceptance_criteria_html") {
    return (
      <div
        className="prose-sm dark:prose-invert max-w-none text-primary prose [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: String(value) }}
      />
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-tertiary italic">无</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item) => {
          const record = item as { id?: string; name?: string; display_name?: string; attributes?: { name?: string } };
          return (
            <span
              key={record.id ?? JSON.stringify(item) ?? String(item)}
              className="rounded-md border border-subtle bg-layer-1 px-2 py-1 text-11"
            >
              {record.display_name ?? record.name ?? record.attributes?.name ?? String(item)}
            </span>
          );
        })}
      </div>
    );
  }
  if (typeof value === "object") {
    const record = value as { name?: string; display_name?: string };
    return <span>{record.display_name ?? record.name ?? JSON.stringify(record)}</span>;
  }
  return <span>{String(value)}</span>;
}

function DiffField(props: { diff: TRequirementFieldDiff }) {
  const { diff } = props;
  const changeMeta =
    diff.change_type === "added"
      ? { label: "新增", className: "bg-success-subtle text-success-primary" }
      : { label: "修改", className: "bg-warning-subtle text-warning-primary" };

  return (
    <article>
      <div className="flex items-center justify-between gap-3 bg-layer-2 px-4 py-3 md:px-5">
        <h3 className="text-12 font-semibold text-primary">{diff.label}</h3>
        <span className={cn("rounded-md px-2 py-1 text-10 font-medium", changeMeta.className)}>{changeMeta.label}</span>
      </div>
      <div className="grid divide-y divide-subtle md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="bg-red-500/[0.045] min-w-0 p-4 md:p-5">
          <p className="text-red-700 dark:text-red-300 mb-2 text-10 font-medium md:hidden">变更前</p>
          <div className="text-13 leading-6 break-words text-secondary">{displayValue(diff.field, diff.from)}</div>
        </div>
        <div className="bg-green-500/[0.065] min-w-0 p-4 md:p-5">
          <p className="text-green-700 dark:text-green-300 mb-2 text-10 font-medium md:hidden">变更后</p>
          <div className="text-13 leading-6 break-words text-primary">{displayValue(diff.field, diff.to)}</div>
        </div>
      </div>
    </article>
  );
}

function RequirementDiffSurface(props: {
  diff: TRequirementDiff;
  subtitle?: string;
  beforeVersionLabel: string;
  afterVersionLabel: string;
}) {
  const { afterVersionLabel, beforeVersionLabel, diff, subtitle } = props;
  // 结构化数据的差异由专门的结构化面板逐项展示，这里剔除机器可读的哈希快照字段
  const changedFields = diff.changed_fields.filter((field) => field.field !== "structured");

  return (
    <section className="overflow-hidden rounded-2xl border border-strong bg-surface-1 shadow-raised-200">
      <div className="flex flex-col justify-between gap-4 border-b border-subtle px-4 py-5 sm:flex-row sm:items-center md:px-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-primary/10 text-accent-primary">
            <GitCompareArrows className="size-5" />
          </span>
          <div>
            <h2 className="text-16 font-semibold text-primary">需求信息变更</h2>
            {subtitle && <p className="mt-0.5 text-11 leading-5 text-secondary">{subtitle}</p>}
          </div>
        </div>
        <span className="w-fit rounded-md bg-accent-primary px-2.5 py-1.5 text-11 font-semibold text-on-color tabular-nums shadow-raised-100">
          {changedFields.length} 处变更
        </span>
      </div>

      {changedFields.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <Check className="text-green-600 dark:text-green-400 mx-auto size-6" />
          <p className="mt-3 text-13 font-medium text-primary">没有发现字段差异</p>
          <p className="mt-1 text-11 text-secondary">两个版本的需求内容保持一致。</p>
        </div>
      ) : (
        <>
          <div className="relative hidden grid-cols-2 divide-x divide-subtle border-b border-subtle md:grid">
            <div className="bg-red-500/[0.08] px-5 py-3.5">
              <p className="text-red-700 dark:text-red-300 text-10 font-medium">变更前</p>
              <p className="mt-0.5 text-12 font-semibold text-primary">{beforeVersionLabel}</p>
            </div>
            <div className="bg-green-500/[0.1] px-5 py-3.5">
              <p className="text-green-700 dark:text-green-300 text-10 font-medium">变更后</p>
              <p className="mt-0.5 text-12 font-semibold text-primary">{afterVersionLabel}</p>
            </div>
            <span
              className="border-surface-1 absolute top-1/2 left-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 bg-accent-primary text-on-color shadow-raised-100"
              aria-hidden="true"
            >
              <ArrowRight className="size-4" />
            </span>
          </div>
          <div className="divide-y divide-subtle">
            {changedFields.map((diffItem) => (
              <DiffField key={diffItem.field} diff={diffItem} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function RequirementDiffPanel(props: { change: TRequirementChange }) {
  const { change } = props;
  return (
    <RequirementDiffSurface
      diff={change.diff}
      subtitle="名称、优先级、描述等需求属性的调整"
      beforeVersionLabel={change.base_version_number ? `基线 V${change.base_version_number}` : "新建需求"}
      afterVersionLabel="本轮提案"
    />
  );
}

export function RequirementDiffResultPanel(props: { diff: TRequirementDiff; subtitle?: string }) {
  return (
    <RequirementDiffSurface
      diff={props.diff}
      subtitle={props.subtitle ?? `共发现 ${props.diff.changed_count} 个字段差异`}
      beforeVersionLabel="原版本"
      afterVersionLabel="目标版本"
    />
  );
}

function RequirementReviewerAssignmentItem(props: { assignment: TRequirementChangeReviewer }) {
  const { assignment } = props;
  const [expanded, setExpanded] = useState(false);
  const meta = assignment.latest_opinion ? opinionMeta[assignment.latest_opinion] : undefined;
  const Icon = meta?.icon ?? Clock3;
  const hasRecords = assignment.records.length > 0;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            name={assignment.reviewer_detail.display_name}
            src={getFileURL(assignment.reviewer_detail.avatar_url)}
            size="sm"
          />
          <span className="truncate text-12 font-medium text-primary">{assignment.reviewer_detail.display_name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-10 font-medium",
              meta?.className ?? "bg-layer-1 text-secondary"
            )}
          >
            <Icon className="size-3" />
            {meta?.label ?? "待评审"}
          </span>
          {hasRecords && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-label={expanded ? "收起评审记录" : "展开评审记录"}
              className="flex size-6 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
            >
              <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      {hasRecords && expanded && (
        <div className="mt-3 space-y-2">
          {assignment.records.map((record) => (
            <div key={record.id} className="rounded-md bg-layer-1 px-3 py-2.5 text-11 leading-5 text-secondary">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <span className="font-medium text-primary">{opinionMeta[record.opinion].label}</span>
                <span className="text-10 text-tertiary">{calculateTimeAgo(record.created_at)}</span>
              </div>
              {record.reason && <p className="mt-1 text-pretty whitespace-pre-wrap">{record.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequirementReviewHistory(props: { change: TRequirementChange }) {
  const { change } = props;
  return (
    <section className="overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-raised-100">
      <div className="flex items-start justify-between gap-3 border-b border-subtle bg-layer-1 px-4 py-3.5">
        <div>
          <h2 className="text-13 font-semibold text-primary">评审参与者</h2>
        </div>
        <span className="shrink-0 rounded-md bg-layer-1 px-2 py-1 text-10 font-medium text-secondary tabular-nums">
          {change.review_progress.approved}/{change.review_progress.total} 通过
        </span>
      </div>
      <div className="divide-y divide-subtle">
        {change.reviewer_assignments.map((assignment) => (
          <RequirementReviewerAssignmentItem key={assignment.id} assignment={assignment} />
        ))}
      </div>
    </section>
  );
}

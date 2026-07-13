import { Check, CircleHelp, Clock3, FileText, X } from "lucide-react";
import { Avatar } from "@plane/ui";
import { calculateTimeAgo, getFileURL } from "@plane/utils";
import type {
  TRequirementChange,
  TRequirementFieldDiff,
  TRequirementDiff,
  TRequirementReviewOpinion,
  TRequirementStatus,
} from "@/services/requirement.service";

const opinionMeta: Record<TRequirementReviewOpinion, { label: string; icon: typeof Check; className: string }> = {
  approved: { label: "通过", icon: Check, className: "bg-green-500/10 text-green-700 dark:text-green-300" },
  rejected: { label: "拒绝", icon: X, className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  needs_clarification: {
    label: "有待明确",
    icon: CircleHelp,
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  },
};

export function RequirementStatusBadge(props: { status: TRequirementStatus }) {
  const meta = {
    in_review: { label: "评审中", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300" },
    active: { label: "激活", className: "bg-green-500/10 text-green-700 dark:text-green-300" },
    rejected: { label: "拒绝", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  }[props.status];
  return <span className={`rounded-full px-2.5 py-1 text-11 font-medium ${meta.className}`}>{meta.label}</span>;
}

function displayValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return <span className="text-placeholder">未设置</span>;
  if (field === "description_html" || field === "acceptance_criteria_html") {
    return (
      <div
        className="prose-sm dark:prose-invert max-w-none text-secondary prose"
        dangerouslySetInnerHTML={{ __html: String(value) }}
      />
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-placeholder">无</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, index) => {
          const record = item as { id?: string; name?: string; display_name?: string; attributes?: { name?: string } };
          return (
            <span key={record.id ?? index} className="rounded-md border border-subtle bg-layer-1 px-2 py-1 text-11">
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
  return (
    <div className="rounded-lg border border-subtle bg-surface-1">
      <div className="flex items-center justify-between border-b border-subtle px-4 py-2.5">
        <span className="text-12 font-semibold text-primary">{diff.label}</span>
        <span className="text-10 tracking-wide text-tertiary uppercase">已变更</span>
      </div>
      <div className="bg-subtle grid gap-px md:grid-cols-2">
        <div className="min-w-0 bg-surface-1 p-4">
          <p className="mb-2 text-10 font-medium tracking-wide text-tertiary uppercase">变更前</p>
          <div className="text-12 leading-5 break-words text-secondary">{displayValue(diff.field, diff.from)}</div>
        </div>
        <div className="bg-green-500/[0.035] min-w-0 p-4">
          <p className="text-green-700 dark:text-green-300 mb-2 text-10 font-medium tracking-wide uppercase">变更后</p>
          <div className="text-12 leading-5 break-words text-primary">{displayValue(diff.field, diff.to)}</div>
        </div>
      </div>
    </div>
  );
}

export function RequirementDiffPanel(props: { change: TRequirementChange }) {
  const { change } = props;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-15 font-semibold text-primary">字段变更</h2>
          <p className="mt-0.5 text-11 text-secondary">
            基于 {change.base_version_number ? `V${change.base_version_number}` : "新建需求"}，共变更{" "}
            {change.diff.changed_count} 个字段
          </p>
        </div>
      </div>
      {change.diff.changed_fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-subtle px-4 py-8 text-center text-12 text-secondary">
          本次提案没有字段差异。
        </div>
      ) : (
        <div className="space-y-3">
          {change.diff.changed_fields.map((diff) => (
            <DiffField key={diff.field} diff={diff} />
          ))}
        </div>
      )}
    </section>
  );
}

export function RequirementDiffResultPanel(props: { diff: TRequirementDiff; subtitle?: string }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-15 font-semibold text-primary">版本差异</h2>
        <p className="mt-0.5 text-11 text-secondary">
          {props.subtitle ?? `共发现 ${props.diff.changed_count} 个字段差异`}
        </p>
      </div>
      {props.diff.changed_fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-subtle px-4 py-8 text-center text-12 text-secondary">
          两个版本之间没有字段差异。
        </div>
      ) : (
        <div className="space-y-3">
          {props.diff.changed_fields.map((diff) => (
            <DiffField key={diff.field} diff={diff} />
          ))}
        </div>
      )}
    </section>
  );
}

export function RequirementReviewHistory(props: { change: TRequirementChange }) {
  const { change } = props;
  return (
    <section className="rounded-lg border border-subtle bg-surface-1">
      <div className="border-b border-subtle px-4 py-3">
        <h2 className="text-14 font-semibold text-primary">评审进度</h2>
        <p className="mt-0.5 text-11 text-secondary">
          {change.review_progress.approved}/{change.review_progress.total} 已通过
        </p>
      </div>
      <div className="divide-y divide-subtle">
        {change.reviewer_assignments.map((assignment) => {
          const meta = assignment.latest_opinion ? opinionMeta[assignment.latest_opinion] : undefined;
          const Icon = meta?.icon ?? Clock3;
          return (
            <div key={assignment.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar
                    name={assignment.reviewer_detail.display_name}
                    src={getFileURL(assignment.reviewer_detail.avatar_url)}
                    size="sm"
                  />
                  <span className="truncate text-12 font-medium text-primary">
                    {assignment.reviewer_detail.display_name}
                  </span>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-10 font-medium ${
                    meta?.className ?? "bg-layer-1 text-secondary"
                  }`}
                >
                  <Icon className="size-3" />
                  {meta?.label ?? "待评审"}
                </span>
              </div>
              {assignment.records.length > 0 && (
                <div className="mt-3 space-y-2 border-l border-subtle pl-3">
                  {assignment.records.map((record) => (
                    <div key={record.id} className="text-11 leading-5 text-secondary">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-primary">{opinionMeta[record.opinion].label}</span>
                        <span className="text-tertiary">{calculateTimeAgo(record.created_at)}</span>
                      </div>
                      {record.reason && <p className="mt-0.5 whitespace-pre-wrap">{record.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RequirementAttachments(props: { change: TRequirementChange }) {
  if (props.change.attachments.length === 0) return null;
  return (
    <section className="rounded-lg border border-subtle bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 text-13 font-semibold text-primary">
        <FileText className="size-4 text-tertiary" /> 附件
      </h2>
      <div className="mt-3 space-y-2">
        {props.change.attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={attachment.asset_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-md border border-subtle px-3 py-2 text-12 text-secondary hover:bg-layer-1 hover:text-primary"
          >
            <span className="truncate">{attachment.attributes.name ?? "附件"}</span>
            <span className="text-10 text-tertiary">查看</span>
          </a>
        ))}
      </div>
    </section>
  );
}

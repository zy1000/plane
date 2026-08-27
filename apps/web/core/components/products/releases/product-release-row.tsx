import { Link } from "react-router";
import { CheckIcon } from "@plane/propel/icons";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TProductRelease } from "@plane/types";
import { Avatar, CircularProgressIndicator } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate } from "@plane/utils";
import { ReleaseOverdueTags } from "@/components/releases/release-overdue-tags";
import {
  getReleaseOverdueToneTextClass,
  getReleaseRowTone,
  getReleaseStatusDetails,
} from "@/components/releases/release-status-config";

type Props = {
  release: TProductRelease;
  workspaceSlug: string;
};

function releaseProgress(release: TProductRelease) {
  const total = release.total_issues ?? 0;
  const completed = release.completed_issues ?? 0;
  const cancelled = release.cancelled_issues ?? 0;
  const percentage = ((completed + cancelled) / total) * 100;
  return Number.isNaN(percentage) ? 0 : Math.floor(percentage);
}

export function ProductReleaseRow(props: Props) {
  const { release, workspaceSlug } = props;
  const statusDetails = getReleaseStatusDetails(release.status);
  const project = release.project_detail;
  const overdueTone = getReleaseRowTone(release);
  const progress = releaseProgress(release);
  const isCompleted = release.status === "completed";
  const overviewPath = `/${workspaceSlug}/projects/${release.project_id}/releases/${release.id}/overview`;

  return (
    <tr className="group border-b border-subtle hover:bg-layer-transparent-hover">
      <td className="px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <CircularProgressIndicator size={32} percentage={progress} strokeWidth={4}>
            {isCompleted ? (
              progress === 100 ? (
                <CheckIcon className="h-3 w-3 stroke-[2] text-accent-primary" />
              ) : (
                <span className="text-13 text-accent-primary">!</span>
              )
            ) : progress === 100 ? (
              <CheckIcon className="h-3 w-3 stroke-[2] text-accent-primary" />
            ) : (
              <span className="text-10 font-medium tabular-nums leading-none text-primary">{`${progress}%`}</span>
            )}
          </CircularProgressIndicator>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              to={overviewPath}
              className={cn(
                "min-w-0 break-words text-13 font-medium",
                overdueTone === "default"
                  ? "text-primary group-hover:text-accent-primary"
                  : getReleaseOverdueToneTextClass(overdueTone)
              )}
            >
              {release.name}
            </Link>
            <ReleaseOverdueTags
              releaseDetails={release}
              workspaceSlug={workspaceSlug}
              projectId={release.project_id}
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Link
          to={`/${workspaceSlug}/projects/${release.project_id}/overview`}
          className="flex min-w-0 items-start gap-2"
        >
          <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
            <Logo logo={project?.logo_props} size={14} />
          </span>
          <span className="line-clamp-2 text-12 leading-[1.35] text-primary group-hover:text-accent-primary">
            {project?.name ?? release.project_id}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-11 font-medium",
            statusDetails.bgColor,
            statusDetails.textColor
          )}
        >
          {statusDetails.label}
        </span>
      </td>
      <td className="px-4 py-3">
        {release.lead_detail ? (
          <span className="flex min-w-0 items-center gap-1.5 text-12 text-secondary">
            <Avatar
              name={release.lead_detail.display_name}
              src={getFileURL(release.lead_detail.avatar_url ?? "")}
              size="sm"
              className="shrink-0"
              showTooltip={false}
            />
            <span className="truncate">{release.lead_detail.display_name}</span>
          </span>
        ) : (
          <span className="text-12 text-secondary">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-11 text-secondary">
        {renderFormattedDate(release.target_date, "yyyy-MM-dd") ?? "—"}
      </td>
      <td className="px-4 py-3 text-11 text-secondary">
        {renderFormattedDate(release.test_handoff_date, "yyyy-MM-dd") ?? "—"}
      </td>
      <td
        className={cn(
          "px-4 py-3 text-13 tabular-nums",
          release.product_requirement_count ? "text-primary" : "text-placeholder"
        )}
      >
        {release.product_requirement_count}
      </td>
    </tr>
  );
}

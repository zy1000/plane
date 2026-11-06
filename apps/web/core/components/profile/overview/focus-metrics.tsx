/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { Bug, ChevronRight, ClipboardCheck, Play, ShieldCheck, UserCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useNavigate } from "react-router";
// plane imports
import { useTranslation } from "@plane/i18n";
import { DueDatePropertyIcon, OverdueDatePropertyIcon } from "@plane/propel/icons";
import type { IUserProfileData } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useUserWorkSummary } from "@/hooks/use-user-work";
// types
import type { TUserWorkType } from "@/types/user-work";
// local
import { sortTypes, workTypeLabel } from "../work/work-types";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TTone = "accent" | "danger" | "neutral" | "warning";

type TFocusTile = {
  key: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: TTone;
  value: number;
  unit: string;
  href: string;
};

const toneClasses: Record<TTone, { icon: string; value: string }> = {
  accent: {
    icon: "bg-accent-subtle text-accent-primary",
    value: "text-accent-primary",
  },
  danger: {
    icon: "bg-danger-subtle text-danger-primary",
    value: "text-danger-primary",
  },
  neutral: {
    icon: "bg-surface-2 text-secondary",
    value: "text-primary",
  },
  warning: {
    icon: "bg-warning-subtle text-warning-primary",
    value: "text-warning-primary",
  },
};

/**
 * 摘要页「今日焦点」：八张卡，数字来自「我的工作」汇总接口（含评审 / 审批），
 * 点卡片带着类型 / 时间桶参数跳到待处理页，不再在摘要页里开明细弹窗。
 */
export function ProfileFocusMetrics({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { summary } = useUserWorkSummary(String(workspaceSlug), String(userId));

  if (!userProfile || !summary) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.work.summary.focus_title")}</h3>
        <Loader className="h-[220px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  const pending = summary.pending;
  const base = `/${workspaceSlug}/profile/${userId}/pending`;
  const item = t("profile.stats.workbench.items");
  const breakdown = (byType: Partial<Record<TUserWorkType, number>>, limit = 3) =>
    sortTypes(Object.keys(byType) as TUserWorkType[])
      .filter((type) => (byType[type] ?? 0) > 0)
      .slice(0, limit)
      .map((type) => `${workTypeLabel(t, type)} ${byType[type]}`)
      .join(" · ");
  const action = (key: keyof typeof pending.by_action) => pending.by_action[key] ?? 0;

  const toReview = action("start_review") + action("submit_for_approval");
  const toAudit = action("audit");
  const toApprove = action("approve") + action("review") + action("sign");
  const approvalBreakdown = breakdown({
    issue_approval: pending.by_type.issue_approval,
    requirement_change: pending.by_type.requirement_change,
    tailoring_approval: pending.by_type.tailoring_approval,
  });

  const tiles: TFocusTile[] = [
    {
      key: "overdue",
      title: t("profile.work.summary.overdue"),
      description: breakdown(pending.quick.overdue.by_type),
      icon: OverdueDatePropertyIcon,
      tone: pending.quick.overdue.total > 0 ? "danger" : "neutral",
      value: pending.quick.overdue.total,
      unit: item,
      href: `${base}?quick=overdue`,
    },
    {
      key: "due_today",
      title: t("profile.work.summary.due_today"),
      description: breakdown(pending.quick.today.by_type),
      icon: DueDatePropertyIcon,
      tone: pending.quick.today.total > 0 ? "warning" : "neutral",
      value: pending.quick.today.total,
      unit: item,
      href: `${base}?quick=today`,
    },
    {
      key: "due_week",
      title: t("profile.work.summary.due_week"),
      description: breakdown(pending.quick.week.by_type),
      icon: DueDatePropertyIcon,
      tone: "neutral",
      value: pending.quick.week.total,
      unit: item,
      href: `${base}?quick=week`,
    },
    {
      key: "open_defects",
      title: t("profile.work.summary.open_defects"),
      description:
        (pending.quick.overdue.by_type.defect ?? 0) > 0
          ? t("profile.work.summary.overdue_count", { count: pending.quick.overdue.by_type.defect ?? 0 })
          : "",
      icon: Bug,
      tone: (pending.by_type.defect ?? 0) > 0 ? "danger" : "neutral",
      value: pending.by_type.defect ?? 0,
      unit: item,
      href: `${base}?type=defect`,
    },
    {
      key: "to_review",
      title: t("profile.work.summary.to_review"),
      description: [
        breakdown({ review: pending.by_type.review, review_activity: pending.by_type.review_activity }),
        t("profile.work.summary.as_leader"),
      ]
        .filter(Boolean)
        .join(" · "),
      icon: ClipboardCheck,
      tone: toReview > 0 ? "accent" : "neutral",
      value: toReview,
      unit: item,
      href: `${base}?type=review`,
    },
    {
      key: "to_audit",
      title: t("profile.work.summary.to_audit"),
      description: t("profile.work.summary.as_auditor"),
      icon: UserCheck,
      tone: toAudit > 0 ? "accent" : "neutral",
      value: toAudit,
      unit: item,
      href: `${base}?type=review`,
    },
    {
      key: "to_approve",
      title: t("profile.work.summary.to_approve"),
      description: approvalBreakdown,
      icon: ShieldCheck,
      tone: toApprove > 0 ? "warning" : "neutral",
      value: toApprove,
      unit: item,
      href: `${base}?type=issue_approval`,
    },
    {
      key: "to_execute",
      title: t("profile.work.summary.to_execute"),
      description: "",
      icon: Play,
      tone: "neutral",
      value: userProfile.pending_execution_cases,
      unit: t("profile.work.summary.unit_case"),
      href: `${base}?type=case_execution`,
    },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.work.summary.focus_title")}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate(tile.href)}
            className="focus-visible:ring-accent-primary rounded-md border border-subtle bg-surface-1 px-4 py-3.5 text-left outline-none transition-colors hover:border-strong focus-visible:ring-2 focus-visible:ring-inset"
          >
            <div className="flex items-center gap-2">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", toneClasses[tile.tone].icon)}>
                <tile.icon className="size-3.5" />
              </span>
              <span className="min-w-0 truncate text-12 font-medium text-secondary">{tile.title}</span>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-placeholder" />
            </div>
            <div className="mt-3 flex items-end gap-1.5">
              <span className={cn("text-24 leading-none font-semibold tabular-nums", toneClasses[tile.tone].value)}>
                {tile.value}
              </span>
              {tile.unit && <span className="pb-0.5 text-11 text-placeholder">{tile.unit}</span>}
            </div>
            <p className="mt-2 line-clamp-1 min-h-4 text-11 leading-4 text-placeholder">{tile.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { Bug, ChevronRight, ClipboardCheck, Play, ShieldCheck, SquareCheck } from "lucide-react";
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
import { countScope, sortTypes, workTypeLabel } from "../work/work-types";

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
  const parts = (entries: [string, number][]) =>
    entries
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `${label} ${count}`)
      .join(" · ");

  // 第二行按「等我拍板 / 等我推进」分：评审的审核和其它审批都是通过 / 驳回，并成一张
  const toApprove = countScope(pending.by_action, "approve");
  const toLead = countScope(pending.by_action, "lead");
  const approvalBreakdown = parts([
    [t("profile.work.summary.review_audit"), action("audit")],
    [workTypeLabel(t, "issue_approval"), pending.by_type.issue_approval ?? 0],
    [workTypeLabel(t, "requirement_change"), pending.by_type.requirement_change ?? 0],
    [workTypeLabel(t, "tailoring_approval"), pending.by_type.tailoring_approval ?? 0],
  ]);
  const leadBreakdown = parts([
    [t("stage_review.status.not_started"), action("start_review")],
    [t("stage_review.status.in_review"), action("submit_for_approval")],
  ]);

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
      key: "to_approve",
      title: t("profile.work.summary.to_approve"),
      description: approvalBreakdown,
      icon: ShieldCheck,
      tone: toApprove > 0 ? "warning" : "neutral",
      value: toApprove,
      unit: item,
      href: `${base}?scope=approve`,
    },
    {
      key: "lead_reviews",
      title: t("profile.work.summary.lead_reviews"),
      description: leadBreakdown,
      icon: ClipboardCheck,
      tone: toLead > 0 ? "accent" : "neutral",
      value: toLead,
      unit: item,
      href: `${base}?scope=lead`,
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
    {
      key: "to_review_cases",
      title: t("profile.work.summary.to_review_cases"),
      description: "",
      icon: SquareCheck,
      tone: "neutral",
      value: pending.by_type.case_review ?? 0,
      unit: t("profile.work.summary.unit_case"),
      href: `${base}?type=case_review`,
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

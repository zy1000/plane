/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ComponentType } from "react";
import { Bug, ChevronRight, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useNavigate } from "react-router";
import { useSWRConfig } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { DueDatePropertyIcon, OverdueDatePropertyIcon, WorkflowsPropertyIcon } from "@plane/propel/icons";
import type { IUserProfileData, TProfileMetricKey } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { ApprovalInboxModal } from "@/components/products/requirements/approval/approval-inbox-modal";
// constants
import { USER_PROFILE_DATA } from "@/constants/fetch-keys";
// hooks
import { useRequirementApprovalInbox } from "@/hooks/store/use-requirement-changes";
import { useUser } from "@/hooks/store/user";
// local
import { ProfileMetricDetailModal } from "./metric-detail-modal";

type Props = {
  userProfile: IUserProfileData | undefined;
};

type TTone = "accent" | "danger" | "neutral" | "warning";

type TFocusMetric = {
  description: string;
  icon: ComponentType<{ className?: string }>;
  key: TProfileMetricKey;
  title: string;
  tone: TTone;
  value: number;
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

export function ProfileFocusMetrics({ userProfile }: Props) {
  const { workspaceSlug, userId } = useParams();
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const [activeMetric, setActiveMetric] = useState<TProfileMetricKey | null>(null);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  // 看自己的页时「待评审需求」直接打开评审收件箱就地审批；看别人的页只能看明细
  const isOwnProfile = !!currentUser?.id && currentUser.id === String(userId);
  const approvalInbox = useRequirementApprovalInbox({
    workspaceSlug: isOwnProfile && workspaceSlug ? String(workspaceSlug) : undefined,
  });

  if (!userProfile) {
    return (
      <div className="space-y-2">
        <h3 className="text-16 font-medium">{t("profile.stats.focus.title")}</h3>
        <Loader className="h-[120px]">
          <Loader.Item width="100%" height="100%" />
        </Loader>
      </div>
    );
  }

  const metrics: TFocusMetric[] = [
    {
      description: t("profile.stats.today_pending_description"),
      icon: DueDatePropertyIcon,
      key: "today_pending_issues",
      title: t("profile.stats.today_pending"),
      tone: userProfile.today_pending_issues > 0 ? "danger" : "neutral",
      value: userProfile.today_pending_issues,
    },
    {
      description: t("profile.stats.week_pending_description"),
      icon: DueDatePropertyIcon,
      key: "week_pending_issues",
      title: t("profile.stats.week_pending"),
      tone: userProfile.week_pending_issues > 0 ? "warning" : "neutral",
      value: userProfile.week_pending_issues,
    },
    {
      description: t("profile.stats.overdue_description"),
      icon: OverdueDatePropertyIcon,
      key: "overdue_issues",
      title: t("profile.stats.overdue"),
      tone: userProfile.overdue_issues > 0 ? "danger" : "neutral",
      value: userProfile.overdue_issues,
    },
    {
      description: t("profile.stats.pending_approval_description"),
      icon: WorkflowsPropertyIcon,
      key: "pending_approval_issues",
      title: t("profile.stats.pending_approval"),
      tone: userProfile.pending_approval_issues > 0 ? "warning" : "neutral",
      value: userProfile.pending_approval_issues,
    },
    {
      description: t("profile.stats.pending_requirement_approvals_description"),
      icon: ShieldCheck,
      key: "pending_requirement_approvals",
      title: t("profile.stats.pending_requirement_approvals"),
      tone: userProfile.pending_requirement_approvals > 0 ? "warning" : "neutral",
      value: userProfile.pending_requirement_approvals,
    },
    {
      description: t("profile.stats.focus.defects_description"),
      icon: Bug,
      key: "open_defect_issues",
      title: t("profile.stats.focus.defects"),
      tone: userProfile.open_defect_issues > 0 ? "danger" : "neutral",
      value: userProfile.open_defect_issues,
    },
  ];

  const activeMetricTitle = metrics.find((metric) => metric.key === activeMetric)?.title;

  const handleSelectMetric = (key: TProfileMetricKey) => {
    if (key === "pending_requirement_approvals" && isOwnProfile) {
      setIsInboxOpen(true);
      return;
    }
    setActiveMetric(key);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-16 font-medium">{t("profile.stats.focus.title")}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            onClick={() => handleSelectMetric(metric.key)}
            className="focus-visible:ring-accent-primary rounded-md border border-subtle bg-surface-1 px-4 py-3.5 text-left outline-none transition-colors hover:border-strong focus-visible:ring-2 focus-visible:ring-inset"
          >
            <div className="flex items-center gap-2">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", toneClasses[metric.tone].icon)}>
                <metric.icon className="size-3.5" />
              </span>
              <span className="min-w-0 truncate text-12 font-medium text-secondary">{metric.title}</span>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-placeholder" />
            </div>
            <div className="mt-3 flex items-end gap-1.5">
              <span className={cn("text-24 leading-none font-semibold tabular-nums", toneClasses[metric.tone].value)}>
                {metric.value}
              </span>
              <span className="pb-0.5 text-11 text-placeholder">{t("profile.stats.workbench.items")}</span>
            </div>
            <p className="mt-2 line-clamp-1 text-11 leading-4 text-placeholder">{metric.description}</p>
          </button>
        ))}
      </div>
      {activeMetric && activeMetricTitle && (
        <ProfileMetricDetailModal
          metric={activeMetric}
          metricTitle={activeMetricTitle}
          open
          onClose={() => setActiveMetric(null)}
          workspaceSlug={String(workspaceSlug)}
          userId={String(userId)}
        />
      )}
      {isOwnProfile && (
        <ApprovalInboxModal
          isOpen={isInboxOpen}
          inbox={approvalInbox}
          onClose={() => setIsInboxOpen(false)}
          onSettled={() => void mutate(USER_PROFILE_DATA(String(workspaceSlug), String(userId)))}
          onOpenChangeRequest={(item) => {
            setIsInboxOpen(false);
            navigate(`/${workspaceSlug}/products/${item.product_id}/requirements?tab=changes&cr=${item.id}`);
          }}
        />
      )}
    </div>
  );
}

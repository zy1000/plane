/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalState, TRequirementItemStatus } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { REQUIREMENT_APPROVAL_PILL } from "@/components/products/requirements/approval/requirement-approval-cell";
import { getRequirementStatusStyle } from "@/components/requirements/requirement-status-cell";

const PILL_BASE = "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-11 font-medium";

/** 需求交付状态胶囊，配色与需求网格一致 */
export function RequirementStatusPill({ className, status }: { className?: string; status: TRequirementItemStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn(PILL_BASE, getRequirementStatusStyle(status).pill, className)}>
      {t(`requirement_fields.statuses.${status}`)}
    </span>
  );
}

/** 需求评审态胶囊，配色与需求网格审批列一致 */
export function RequirementApprovalPill({
  className,
  state,
}: {
  className?: string;
  state: TRequirementApprovalState;
}) {
  const { t } = useTranslation();
  return (
    <span className={cn(PILL_BASE, REQUIREMENT_APPROVAL_PILL[state], className)}>
      {t(`requirement_approval.state.${state}`)}
    </span>
  );
}

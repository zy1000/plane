/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import { EIssueServiceType } from "@plane/types";
// ui
import { Checkbox } from "@plane/ui";
// helpers
import { cn } from "@plane/utils";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  className?: string;
  disabled?: boolean;
  groupId: string;
  id: string;
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
};

/**
 * Recursively collect all descendant issue IDs (all levels of sub-issues)
 */
function getAllDescendantIssueIds(
  issueId: string,
  subIssuesStore: { subIssuesByIssueId: (id: string) => string[] | undefined },
  visited: Set<string> = new Set()
): string[] {
  // Prevent infinite recursion
  if (visited.has(issueId)) return [];
  visited.add(issueId);

  const directSubIssues = subIssuesStore.subIssuesByIssueId(issueId) || [];
  const allDescendants: string[] = [...directSubIssues];

  // Recursively get descendants of each sub-issue
  for (const subIssueId of directSubIssues) {
    const descendants = getAllDescendantIssueIds(subIssueId, subIssuesStore, visited);
    allDescendants.push(...descendants);
  }

  return allDescendants;
}

export const MultipleSelectEntityAction = observer(function MultipleSelectEntityAction(props: Props) {
  const { className, disabled = false, groupId, id, selectionHelpers, isEpic = false } = props;
  // derived values
  const isSelected = selectionHelpers.getIsEntitySelected(id);
  const isExtended = selectionHelpers.getIsExtendedSelection(id);

  // Get sub-issues from store
  const { subIssues: subIssuesStore } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);

  // Get all descendant issue IDs (including all levels of sub-issues)
  const allDescendantIds = getAllDescendantIssueIds(id, subIssuesStore);
  const hasSubIssues = allDescendantIds.length > 0;

  // Determine checkbox state
  // - unchecked: not selected
  // - checked: selected (single)
  // - indeterminate: extended selection (with sub-issues)
  const checkboxState = isSelected ? (isExtended && hasSubIssues ? "indeterminate" : "checked") : "unchecked";

  if (selectionHelpers.isSelectionDisabled) return null;

  return (
    <Checkbox
      className={cn("size-3.5 !outline-none", className)}
      iconClassName="size-3"
      onClick={(e) => {
        e.stopPropagation();
        selectionHelpers.handleEntityClickWithSubIssues(e, id, groupId, allDescendantIds);
      }}
      checked={checkboxState === "checked" || checkboxState === "indeterminate"}
      indeterminate={checkboxState === "indeterminate"}
      data-entity-group-id={groupId}
      data-entity-id={id}
      disabled={disabled}
      readOnly
    />
  );
});

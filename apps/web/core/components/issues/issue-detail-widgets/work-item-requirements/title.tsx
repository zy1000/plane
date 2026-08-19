/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
import { CollapsibleButton } from "@plane/ui";
// local imports
import { WorkItemRequirementsActionButton } from "./quick-action-button";

type Props = {
  isOpen: boolean;
  count: number;
  /** 有关联管理权限且工作项可编辑时才在折叠头放 + */
  canManage: boolean;
  issueServiceType: TIssueServiceType;
};

export const WorkItemRequirementsCollapsibleTitle = observer(function WorkItemRequirementsCollapsibleTitle(
  props: Props
) {
  const { isOpen, count, canManage, issueServiceType } = props;
  // translation
  const { t } = useTranslation();

  // indicator element
  const indicatorElement = useMemo(
    () => (
      <span className="flex items-center justify-center">
        <p className="text-14 !leading-3 text-tertiary">{count}</p>
      </span>
    ),
    [count]
  );

  return (
    <CollapsibleButton
      isOpen={isOpen}
      title={t("project_requirements.container.title")}
      indicatorElement={indicatorElement}
      actionItemElement={canManage && <WorkItemRequirementsActionButton issueServiceType={issueServiceType} />}
    />
  );
});

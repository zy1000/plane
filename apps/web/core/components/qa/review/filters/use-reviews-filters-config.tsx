/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { CalendarLayoutIcon, MembersPropertyIcon, StatePropertyIcon } from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getFileURL,
  getMemberMultiSelectConfig,
  getMultiSelectConfig,
  getSupportedDateOperators,
} from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TReviewFilterProperty } from "./types";

type TReviewEnums = Record<string, Record<string, { color: string; label: string }>>;

type TUseReviewsFiltersConfigProps = {
  projectId: string;
  reviewEnums: TReviewEnums;
  workspaceSlug: string;
};

type TSelectOption = {
  id: string;
  label: string;
  value: string;
};

const getMultiSelectOperatorConfigs = (
  options: TSelectOption[],
  params: {
    allowNegative: boolean;
    allowedOperators: Set<TSupportedOperators>;
    isEnabled: boolean;
  }
) =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
      getMultiSelectConfig<TSelectOption, string, undefined>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
        },
        {
          singleValueOperator: EQUALITY_OPERATOR.EXACT,
          ...updatedParams,
        }
      )
    ),
  ]);

export const useReviewsFiltersConfig = ({
  projectId,
  reviewEnums,
  workspaceSlug,
}: TUseReviewsFiltersConfigProps) => {
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const memberIds = getProjectMemberIds(projectId, false) ?? [];
  const members = useMemo(
    () => memberIds.map((memberId) => getUserDetails(memberId)).filter((member) => member) as IUserLite[],
    [getUserDetails, memberIds]
  );

  const stateOptions = useMemo<TSelectOption[]>(() => {
    const stateMap = reviewEnums?.CaseReview_State ?? {};
    return Object.entries(stateMap).map(([value, meta]) => ({
      id: value,
      value,
      label: meta?.label || value,
    }));
  }, [reviewEnums]);

  const modeOptions = useMemo<TSelectOption[]>(() => {
    const modeMap = reviewEnums?.CaseReview_ReviewMode ?? {};
    return Object.entries(modeMap).map(([value, meta]) => ({
      id: value,
      value,
      label: meta?.label || value,
    }));
  }, [reviewEnums]);

  const stateFilterConfig = useMemo<TFilterConfig<TReviewFilterProperty>>(
    () =>
      createFilterConfig<TReviewFilterProperty>({
        id: "state",
        label: "状态",
        icon: StatePropertyIcon,
        isEnabled: stateOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(stateOptions, {
          isEnabled: stateOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, stateOptions]
  );

  const modeFilterConfig = useMemo<TFilterConfig<TReviewFilterProperty>>(
    () =>
      createFilterConfig<TReviewFilterProperty>({
        id: "mode",
        label: "评审模式",
        icon: StatePropertyIcon,
        isEnabled: modeOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(modeOptions, {
          isEnabled: modeOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [modeOptions, operatorConfigs.allowNegative, operatorConfigs.allowedOperators]
  );

  const assigneeFilterConfig = useMemo<TFilterConfig<TReviewFilterProperty>>(
    () =>
      createFilterConfig<TReviewFilterProperty>({
        id: "assignee",
        label: "评审人",
        icon: MembersPropertyIcon,
        isEnabled: members.length > 0,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(
            COLLECTION_OPERATOR.IN,
            {
              isEnabled: members.length > 0,
              members,
              filterIcon: MembersPropertyIcon,
              getOptionIcon: (memberDetails: IUserLite) => (
                <Avatar
                  name={memberDetails.display_name}
                  src={getFileURL(memberDetails.avatar_url)}
                  showTooltip={false}
                  size="sm"
                />
              ),
              ...operatorConfigs,
            },
            (updatedParams) => getMemberMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
          ),
        ]),
      }),
    [members, operatorConfigs]
  );

  const periodFilterConfig = useMemo<TFilterConfig<TReviewFilterProperty>>(
    () =>
      createFilterConfig<TReviewFilterProperty>({
        id: "period",
        label: "评审周期",
        icon: CalendarLayoutIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: getSupportedDateOperators({
          isEnabled: true,
          filterIcon: CalendarLayoutIcon,
          ...operatorConfigs,
        }),
      }),
    [operatorConfigs]
  );

  return {
    areAllConfigsInitialized: true,
    configs: [stateFilterConfig, modeFilterConfig, assigneeFilterConfig, periodFilterConfig],
  };
};

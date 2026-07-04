/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { LayersIcon, MembersPropertyIcon, PriorityPropertyIcon, StatePropertyIcon } from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getFileURL,
  getMemberMultiSelectConfig,
  getMultiSelectConfig,
} from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TReviewCaseFilterProperty } from "./types";

type TReviewEnums = Record<string, Record<string, { color: string; label: string }>>;

export type TReviewCaseFilterSelectOption = {
  id: string;
  label: string;
  value: string;
};

type TUseReviewCaseFiltersConfigProps = {
  assigneeIds: string[];
  casePriorityEnums: Record<string, string>;
  moduleOptions: TReviewCaseFilterSelectOption[];
  repositoryOptions: TReviewCaseFilterSelectOption[];
  reviewEnums: TReviewEnums;
  workspaceSlug: string;
};

const getMultiSelectOperatorConfigs = (
  options: TReviewCaseFilterSelectOption[],
  params: {
    allowNegative: boolean;
    allowedOperators: Set<TSupportedOperators>;
    isEnabled: boolean;
  }
) =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
      getMultiSelectConfig<TReviewCaseFilterSelectOption, string, undefined>(
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

export const useReviewCaseFiltersConfig = ({
  assigneeIds,
  casePriorityEnums,
  moduleOptions,
  repositoryOptions,
  reviewEnums,
  workspaceSlug,
}: TUseReviewCaseFiltersConfigProps) => {
  const { getUserDetails } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const members = useMemo(
    () =>
      Array.from(new Set(assigneeIds.map((assigneeId) => String(assigneeId)).filter(Boolean)))
        .map((memberId) => getUserDetails(memberId))
        .filter((member) => member) as IUserLite[],
    [assigneeIds, getUserDetails]
  );

  const resultOptions = useMemo<TReviewCaseFilterSelectOption[]>(() => {
    const resultMap = reviewEnums?.CaseReviewThrough_Result ?? {};
    return Object.entries(resultMap).map(([value, meta]) => ({
      id: value,
      value,
      label: meta?.label || value,
    }));
  }, [reviewEnums]);

  const priorityOptions = useMemo<TReviewCaseFilterSelectOption[]>(() => {
    return Object.entries(casePriorityEnums || {}).map(([value, label]) => ({
      id: String(value),
      value: String(value),
      label: String(label),
    }));
  }, [casePriorityEnums]);

  const resultFilterConfig = useMemo<TFilterConfig<TReviewCaseFilterProperty>>(
    () =>
      createFilterConfig<TReviewCaseFilterProperty>({
        id: "result",
        label: "评审结果",
        icon: StatePropertyIcon,
        isEnabled: resultOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(resultOptions, {
          isEnabled: resultOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, resultOptions]
  );

  const priorityFilterConfig = useMemo<TFilterConfig<TReviewCaseFilterProperty>>(
    () =>
      createFilterConfig<TReviewCaseFilterProperty>({
        id: "priority",
        label: "用例等级",
        icon: PriorityPropertyIcon,
        isEnabled: priorityOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(priorityOptions, {
          isEnabled: priorityOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, priorityOptions]
  );

  const assigneeFilterConfig = useMemo<TFilterConfig<TReviewCaseFilterProperty>>(
    () =>
      createFilterConfig<TReviewCaseFilterProperty>({
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

  const repositoryFilterConfig = useMemo<TFilterConfig<TReviewCaseFilterProperty>>(
    () =>
      createFilterConfig<TReviewCaseFilterProperty>({
        id: "repository",
        label: "用例库",
        icon: LayersIcon,
        isEnabled: repositoryOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(repositoryOptions, {
          isEnabled: repositoryOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, repositoryOptions]
  );

  const moduleFilterConfig = useMemo<TFilterConfig<TReviewCaseFilterProperty>>(
    () =>
      createFilterConfig<TReviewCaseFilterProperty>({
        id: "module",
        label: "模块",
        icon: LayersIcon,
        isEnabled: moduleOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(moduleOptions, {
          isEnabled: moduleOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [moduleOptions, operatorConfigs.allowNegative, operatorConfigs.allowedOperators]
  );

  return {
    areAllConfigsInitialized: true,
    configs: [resultFilterConfig, priorityFilterConfig, assigneeFilterConfig, repositoryFilterConfig, moduleFilterConfig],
  };
};

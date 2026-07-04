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
import type { TPlanCaseFilterProperty } from "./types";

export type TPlanCaseFilterSelectOption = {
  id: string;
  label: string;
  value: string;
};

type TUsePlanCaseFiltersConfigProps = {
  casePriorityEnums: Record<string, string>;
  caseTypeEnums: Record<string, string>;
  moduleOptions: TPlanCaseFilterSelectOption[];
  planCaseResultEnums: Record<string, string>;
  projectId: string;
  repositoryOptions: TPlanCaseFilterSelectOption[];
  workspaceSlug: string;
};

const getMultiSelectOperatorConfigs = (
  options: TPlanCaseFilterSelectOption[],
  params: {
    allowNegative: boolean;
    allowedOperators: Set<TSupportedOperators>;
    isEnabled: boolean;
  }
) =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
      getMultiSelectConfig<TPlanCaseFilterSelectOption, string, undefined>(
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

export const usePlanCaseFiltersConfig = ({
  casePriorityEnums,
  caseTypeEnums,
  moduleOptions,
  planCaseResultEnums,
  projectId,
  repositoryOptions,
  workspaceSlug,
}: TUsePlanCaseFiltersConfigProps) => {
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const memberIds = useMemo(() => getProjectMemberIds(projectId, false) ?? [], [getProjectMemberIds, projectId]);
  const members = useMemo(
    () => memberIds.map((memberId) => getUserDetails(memberId)).filter((member) => member) as IUserLite[],
    [getUserDetails, memberIds]
  );

  const resultOptions = useMemo<TPlanCaseFilterSelectOption[]>(() => {
    return Object.entries(planCaseResultEnums || {}).map(([value]) => ({
      id: String(value),
      value: String(value),
      label: String(value),
    }));
  }, [planCaseResultEnums]);

  const typeOptions = useMemo<TPlanCaseFilterSelectOption[]>(() => {
    return Object.entries(caseTypeEnums || {}).map(([value, label]) => ({
      id: String(value),
      value: String(value),
      label: String(label),
    }));
  }, [caseTypeEnums]);

  const priorityOptions = useMemo<TPlanCaseFilterSelectOption[]>(() => {
    return Object.entries(casePriorityEnums || {}).map(([value, label]) => ({
      id: String(value),
      value: String(value),
      label: String(label),
    }));
  }, [casePriorityEnums]);

  const resultFilterConfig = useMemo<TFilterConfig<TPlanCaseFilterProperty>>(
    () =>
      createFilterConfig<TPlanCaseFilterProperty>({
        id: "result",
        label: "执行结果",
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

  const typeFilterConfig = useMemo<TFilterConfig<TPlanCaseFilterProperty>>(
    () =>
      createFilterConfig<TPlanCaseFilterProperty>({
        id: "type",
        label: "类型",
        icon: LayersIcon,
        isEnabled: typeOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(typeOptions, {
          isEnabled: typeOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, typeOptions]
  );

  const priorityFilterConfig = useMemo<TFilterConfig<TPlanCaseFilterProperty>>(
    () =>
      createFilterConfig<TPlanCaseFilterProperty>({
        id: "priority",
        label: "优先级",
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

  const assigneeFilterConfig = useMemo<TFilterConfig<TPlanCaseFilterProperty>>(
    () =>
      createFilterConfig<TPlanCaseFilterProperty>({
        id: "assignee",
        label: "执行人",
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

  const repositoryFilterConfig = useMemo<TFilterConfig<TPlanCaseFilterProperty>>(
    () =>
      createFilterConfig<TPlanCaseFilterProperty>({
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

  const moduleFilterConfig = useMemo<TFilterConfig<TPlanCaseFilterProperty>>(
    () =>
      createFilterConfig<TPlanCaseFilterProperty>({
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
    configs: [
      resultFilterConfig,
      typeFilterConfig,
      priorityFilterConfig,
      assigneeFilterConfig,
      repositoryFilterConfig,
      moduleFilterConfig,
    ],
  };
};

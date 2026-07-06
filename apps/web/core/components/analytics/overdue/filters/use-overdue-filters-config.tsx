/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { Briefcase } from "lucide-react";
import {
  CalendarLayoutIcon,
  DueDatePropertyIcon,
  LayersIcon,
  MembersPropertyIcon,
  StartDatePropertyIcon,
} from "@plane/propel/icons";
import type { TFilterConfig, TOverdueRecord, TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, COMPARISON_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getMultiSelectConfig,
  getNumberInputConfig,
} from "@plane/utils";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TOverdueFilterProperty } from "./types";

type TSelectOption = {
  id: string;
  label: string;
  value: string;
};

const ENTITY_TYPE_OPTIONS: TSelectOption[] = [
  { id: "issue", label: "工作项", value: "issue" },
  { id: "cycle", label: "迭代", value: "cycle" },
  { id: "release", label: "发布", value: "release" },
  { id: "test_plan", label: "测试计划", value: "test_plan" },
];

type TUseOverdueFiltersConfigProps = {
  records: TOverdueRecord[];
  workspaceSlug: string;
};

const getMultiSelectOperatorConfigs = (
  options: TSelectOption[],
  params: {
    isEnabled: boolean;
    allowedOperators: Set<TSupportedOperators>;
    allowNegative: boolean;
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
          isOperatorEnabled: updatedParams.isOperatorEnabled,
        }
      )
    ),
  ]);

export const useOverdueFiltersConfig = ({ records, workspaceSlug }: TUseOverdueFiltersConfigProps) => {
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const projectOptions = useMemo<TSelectOption[]>(() => {
    const projectMap = new Map<string, TSelectOption>();

    records.forEach((record) => {
      if (!record.project_id) return;
      if (projectMap.has(record.project_id)) return;

      projectMap.set(record.project_id, {
        id: record.project_id,
        value: record.project_id,
        label: record.project_name || "未命名项目",
      });
    });

    return Array.from(projectMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  const assigneeOptions = useMemo<TSelectOption[]>(() => {
    const assigneeMap = new Map<string, TSelectOption>();

    records.forEach((record) => {
      record.assignees.forEach((assignee) => {
        if (!assignee.id || assigneeMap.has(assignee.id)) return;
        assigneeMap.set(assignee.id, {
          id: assignee.id,
          value: assignee.id,
          label: assignee.display_name || "未命名成员",
        });
      });
    });

    return Array.from(assigneeMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  const entityTypeFilterConfig = useMemo<TFilterConfig<TOverdueFilterProperty>>(
    () =>
      createFilterConfig<TOverdueFilterProperty>({
        id: "entity_type",
        label: "类型",
        icon: LayersIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(ENTITY_TYPE_OPTIONS, {
          isEnabled: true,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators]
  );

  const projectFilterConfig = useMemo<TFilterConfig<TOverdueFilterProperty>>(
    () =>
      createFilterConfig<TOverdueFilterProperty>({
        id: "project_id",
        label: "项目",
        icon: Briefcase,
        isEnabled: projectOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(projectOptions, {
          isEnabled: projectOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, projectOptions]
  );

  const assigneeFilterConfig = useMemo<TFilterConfig<TOverdueFilterProperty>>(
    () =>
      createFilterConfig<TOverdueFilterProperty>({
        id: "assignee_id",
        label: "负责人",
        icon: MembersPropertyIcon,
        isEnabled: assigneeOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(assigneeOptions, {
          isEnabled: assigneeOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [assigneeOptions, operatorConfigs.allowNegative, operatorConfigs.allowedOperators]
  );

  const overdueDaysFilterConfig = useMemo<TFilterConfig<TOverdueFilterProperty>>(
    () =>
      createFilterConfig<TOverdueFilterProperty>({
        id: "overdue_days",
        label: "延期天数",
        icon: CalendarLayoutIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(
            EQUALITY_OPERATOR.EXACT,
            {
              isEnabled: true,
              allowedOperators: operatorConfigs.allowedOperators,
              allowNegative: operatorConfigs.allowNegative,
            },
            (updatedParams) =>
              getNumberInputConfig({
                isOperatorEnabled: updatedParams.isOperatorEnabled,
                placeholder: "输入延期天数",
              })
          ),
          createOperatorConfigEntry(
            COMPARISON_OPERATOR.RANGE,
            {
              isEnabled: true,
              allowedOperators: operatorConfigs.allowedOperators,
              allowNegative: operatorConfigs.allowNegative,
            },
            (updatedParams) =>
              getNumberInputConfig({
                isOperatorEnabled: updatedParams.isOperatorEnabled,
                placeholder: "最小值到最大值",
              })
          ),
        ]),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators]
  );

  const deadlineFilterConfig = useMemo<TFilterConfig<TOverdueFilterProperty>>(
    () =>
      createFilterConfig<TOverdueFilterProperty>({
        id: "deadline",
        label: "截止日期",
        icon: DueDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(
            EQUALITY_OPERATOR.EXACT,
            {
              isEnabled: true,
              allowedOperators: operatorConfigs.allowedOperators,
              allowNegative: operatorConfigs.allowNegative,
            },
            (updatedParams) => getDatePickerConfig({ isOperatorEnabled: updatedParams.isOperatorEnabled })
          ),
          createOperatorConfigEntry(
            COMPARISON_OPERATOR.RANGE,
            {
              isEnabled: true,
              allowedOperators: operatorConfigs.allowedOperators,
              allowNegative: operatorConfigs.allowNegative,
            },
            (updatedParams) => getDateRangePickerConfig({ isOperatorEnabled: updatedParams.isOperatorEnabled })
          ),
        ]),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators]
  );

  const overdueSinceFilterConfig = useMemo<TFilterConfig<TOverdueFilterProperty>>(
    () =>
      createFilterConfig<TOverdueFilterProperty>({
        id: "overdue_since",
        label: "延期开始",
        icon: StartDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(
            EQUALITY_OPERATOR.EXACT,
            {
              isEnabled: true,
              allowedOperators: operatorConfigs.allowedOperators,
              allowNegative: operatorConfigs.allowNegative,
            },
            (updatedParams) => getDatePickerConfig({ isOperatorEnabled: updatedParams.isOperatorEnabled })
          ),
          createOperatorConfigEntry(
            COMPARISON_OPERATOR.RANGE,
            {
              isEnabled: true,
              allowedOperators: operatorConfigs.allowedOperators,
              allowNegative: operatorConfigs.allowNegative,
            },
            (updatedParams) => getDateRangePickerConfig({ isOperatorEnabled: updatedParams.isOperatorEnabled })
          ),
        ]),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators]
  );

  return {
    areAllConfigsInitialized: true,
    configs: [
      entityTypeFilterConfig,
      assigneeFilterConfig,
      projectFilterConfig,
      overdueDaysFilterConfig,
      deadlineFilterConfig,
      overdueSinceFilterConfig,
    ],
  };
};

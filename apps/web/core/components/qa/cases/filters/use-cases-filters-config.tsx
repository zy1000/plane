/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { SVGAttributes } from "react";
import { Folder } from "lucide-react";
import { LayersIcon, LabelPropertyIcon, MembersPropertyIcon, PriorityPropertyIcon, StatePropertyIcon } from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR, EXTENDED_EQUALITY_OPERATOR } from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getAssigneeFilterConfig,
  getFileURL,
  getMultiSelectConfig,
  getTextInputConfig,
} from "@plane/utils";
import { UNASSIGNED_MODULE_KEY, UNASSIGNED_MODULE_LABEL, UnassignedModuleIcon } from "@/components/qa/module-tree";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TCaseFilterProperty } from "./types";

type TReviewEnums = Record<string, Record<string, { color: string; label: string }>>;

/** 当前用例库的模块树（接口原样结构），只用到 id / name / children */
type TCaseModuleSource = { id?: string | number; name?: string; children?: TCaseModuleSource[] };

type TUseCasesFiltersConfigProps = {
  casePriorityEnums: Record<string, string>;
  caseTypeEnums: Record<string, string>;
  workspaceSlug: string;
  /** 项目 ID；为空时（如工作区级模板场景）维护人筛选来源切换为工作区成员 */
  projectId?: string;
  reviewEnums: TReviewEnums;
  moduleTree?: TCaseModuleSource[];
};

const ModuleFilterIcon = ({ className }: SVGAttributes<SVGElement>) => <Folder className={className} />;

type TSelectOption = {
  id: string;
  label: string;
  value: string;
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

export const useCasesFiltersConfig = ({
  casePriorityEnums,
  caseTypeEnums,
  workspaceSlug,
  projectId,
  reviewEnums,
  moduleTree,
}: TUseCasesFiltersConfigProps) => {
  const {
    getUserDetails,
    project: { getProjectMemberIds },
    workspace: { getWorkspaceMemberIds },
  } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  // projectId 有值时用项目成员；为空（模板等无项目语境）时回退到工作区成员
  const memberIds =
    (projectId ? getProjectMemberIds(projectId, false) : getWorkspaceMemberIds(workspaceSlug)) ?? [];
  const members = useMemo(
    () => memberIds.map((memberId) => getUserDetails(memberId)).filter((member) => member) as IUserLite[],
    [getUserDetails, memberIds]
  );

  const reviewOptions = useMemo<TSelectOption[]>(() => {
    const reviewMap = reviewEnums?.CaseReviewThrough_Result ?? {};
    return Object.entries(reviewMap).map(([value, meta]) => ({
      id: value,
      value,
      label: meta?.label || value,
    }));
  }, [reviewEnums]);

  const typeOptions = useMemo<TSelectOption[]>(() => {
    return Object.entries(caseTypeEnums || {}).map(([value, label]) => ({
      id: String(value),
      value: String(value),
      label: String(label),
    }));
  }, [caseTypeEnums]);

  const priorityOptions = useMemo<TSelectOption[]>(() => {
    return Object.entries(casePriorityEnums || {}).map(([value, label]) => ({
      id: String(value),
      value: String(value),
      label: String(label),
    }));
  }, [casePriorityEnums]);

  // 第一项固定「未归类」，其后按树序列出模块，子模块写成「父 / 子」路径
  const moduleOptions = useMemo<TSelectOption[]>(() => {
    const options: TSelectOption[] = [
      { id: UNASSIGNED_MODULE_KEY, value: UNASSIGNED_MODULE_KEY, label: UNASSIGNED_MODULE_LABEL },
    ];
    const walk = (list: TCaseModuleSource[], parentPath: string) => {
      list.forEach((node) => {
        if (node?.id === undefined || node?.id === null) return;
        const path = parentPath ? `${parentPath} / ${node.name ?? "-"}` : String(node.name ?? "-");
        options.push({ id: String(node.id), value: String(node.id), label: path });
        walk(Array.isArray(node.children) ? node.children : [], path);
      });
    };
    walk(Array.isArray(moduleTree) ? moduleTree : [], "");
    return options;
  }, [moduleTree]);

  const reviewFilterConfig = useMemo<TFilterConfig<TCaseFilterProperty>>(
    () =>
      createFilterConfig<TCaseFilterProperty>({
        id: "review",
        label: "评审结果",
        icon: StatePropertyIcon,
        isEnabled: reviewOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(reviewOptions, {
          isEnabled: reviewOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, reviewOptions]
  );

  const typeFilterConfig = useMemo<TFilterConfig<TCaseFilterProperty>>(
    () =>
      createFilterConfig<TCaseFilterProperty>({
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

  const priorityFilterConfig = useMemo<TFilterConfig<TCaseFilterProperty>>(
    () =>
      createFilterConfig<TCaseFilterProperty>({
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

  const assigneeFilterConfig = useMemo<TFilterConfig<TCaseFilterProperty>>(
    () =>
      getAssigneeFilterConfig<TCaseFilterProperty>("assignee")({
        isEnabled: members.length > 0,
        filterIcon: MembersPropertyIcon,
        members,
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [members, operatorConfigs]
  );

  const labelsFilterConfig = useMemo<TFilterConfig<TCaseFilterProperty>>(
    () =>
      createFilterConfig<TCaseFilterProperty>({
        id: "labels",
        label: "标签",
        icon: LabelPropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.CONTAINS, operatorConfigs, (updatedParams) =>
            getTextInputConfig({
              ...updatedParams,
              placeholder: "输入标签关键字",
            })
          ),
        ]),
      }),
    [operatorConfigs]
  );

  const moduleFilterConfig = useMemo<TFilterConfig<TCaseFilterProperty>>(
    () =>
      createFilterConfig<TCaseFilterProperty>({
        id: "module",
        label: "模块",
        icon: ModuleFilterIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(COLLECTION_OPERATOR.IN, operatorConfigs, (updatedParams) =>
            getMultiSelectConfig<TSelectOption, string, boolean>(
              {
                items: moduleOptions,
                getId: (option) => option.id,
                getLabel: (option) => option.label,
                getValue: (option) => option.value,
                getIconData: (option) => option.id === UNASSIGNED_MODULE_KEY,
              },
              {
                singleValueOperator: EQUALITY_OPERATOR.EXACT,
                isOperatorEnabled: updatedParams.isOperatorEnabled,
              },
              {
                getOptionIcon: (isUnassigned) =>
                  isUnassigned ? <UnassignedModuleIcon /> : <Folder className="size-3.5" />,
              }
            )
          ),
        ]),
      }),
    [moduleOptions, operatorConfigs]
  );

  return {
    areAllConfigsInitialized: true,
    configs: [
      reviewFilterConfig,
      typeFilterConfig,
      priorityFilterConfig,
      assigneeFilterConfig,
      labelsFilterConfig,
      moduleFilterConfig,
    ],
  };
};

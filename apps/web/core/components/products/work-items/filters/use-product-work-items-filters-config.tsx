/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { Boxes, Briefcase } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import {
  DueDatePropertyIcon,
  LayersIcon,
  MembersPropertyIcon,
  PriorityIcon,
  PriorityPropertyIcon,
} from "@plane/propel/icons";
import type { IProject, IUserLite, TFilterConfig, TFlatProductModule, TWorkItemFilterProperty } from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  getAssigneeFilterConfig,
  getFileURL,
  getIssueTypeFilterConfig,
  getPriorityFilterConfig,
  getProductModuleFilterConfig,
  getProjectFilterConfig,
  getTargetDateFilterConfig,
} from "@plane/utils";
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TProductWorkItemFacets } from "@/types/product-work-items";

const EMPTY_FACETS: TProductWorkItemFacets = { projects: [], types: [], modules: [], assignee_ids: [] };

/**
 * 筛选属性：所属项目 / 类型 / 优先级 / 负责人 / 模块 / 截止日期。
 * 候选只取本产品工作项里实际出现过的值（接口 facets），不拉整个工作区的项目和成员。
 */
export const useProductWorkItemsFiltersConfig = ({
  workspaceSlug,
  productId,
  facets,
}: {
  workspaceSlug: string;
  productId: string;
  facets: TProductWorkItemFacets | undefined;
}) => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });
  const source = facets ?? EMPTY_FACETS;

  const members = useMemo(
    () => source.assignee_ids.map((id) => getUserDetails(id)).filter((member): member is IUserLite => !!member),
    [getUserDetails, source.assignee_ids]
  );

  return useMemo<TFilterConfig<TWorkItemFilterProperty>[]>(() => {
    // 工厂只用到 id / name；项目的 Logo 图标不需要
    const projects = source.projects.map((project) => ({ id: project.id, name: project.name })) as IProject[];
    const modules: TFlatProductModule[] = source.modules.map((module) => ({
      id: module.id,
      name: module.name,
      path: module.name,
      depth: 0,
      product_id: productId,
    }));
    const issueTypes = source.types.map((type) => ({
      id: type.id,
      name: type.name,
      logo_props: type.logo_props?.icon ? { icon: type.logo_props.icon } : undefined,
    }));

    return [
      {
        ...getProjectFilterConfig<TWorkItemFilterProperty>("project_id")({
          isEnabled: true,
          filterIcon: Briefcase,
          projects,
          ...operatorConfigs,
        }),
        label: t("workspace_products.work_items.columns.project"),
      },
      getIssueTypeFilterConfig<TWorkItemFilterProperty>("type_id")({
        isEnabled: true,
        filterIcon: LayersIcon,
        issueTypes,
        getOptionIcon: (issueType) => (
          <WorkItemTypeIcon typeName={issueType.name} fallbackIcon={issueType.logo_props?.icon} size={14} />
        ),
        ...operatorConfigs,
      }) as TFilterConfig<TWorkItemFilterProperty>,
      getPriorityFilterConfig<TWorkItemFilterProperty>("priority")({
        isEnabled: true,
        filterIcon: PriorityPropertyIcon,
        getOptionIcon: (priority) => <PriorityIcon priority={priority} />,
        ...operatorConfigs,
      }),
      getAssigneeFilterConfig<TWorkItemFilterProperty>("assignee_id")({
        isEnabled: true,
        filterIcon: MembersPropertyIcon,
        members,
        getOptionIcon: (member) => (
          <Avatar name={member.display_name} src={getFileURL(member.avatar_url)} showTooltip={false} size="sm" />
        ),
        ...operatorConfigs,
      }),
      {
        ...getProductModuleFilterConfig<TWorkItemFilterProperty>("product_module_id")({
          isEnabled: true,
          filterIcon: Boxes,
          modules,
          ...operatorConfigs,
        }),
        label: t("workspace_products.work_items.columns.module"),
      },
      {
        ...getTargetDateFilterConfig<TWorkItemFilterProperty>("target_date")({
          isEnabled: true,
          filterIcon: DueDatePropertyIcon,
          ...operatorConfigs,
        }),
        label: t("workspace_products.work_items.columns.target_date"),
      },
    ];
  }, [members, operatorConfigs, productId, source.modules, source.projects, source.types, t]);
};

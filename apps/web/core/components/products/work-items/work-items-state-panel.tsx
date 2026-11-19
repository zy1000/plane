/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { StateGroupIcon } from "@plane/propel/icons";
import type { TStateGroups } from "@plane/types";
import { MODULE_TREE_ROOT_KEY, ModuleTreePanel, type TModuleTreeNode } from "@/components/qa/module-tree";
import type { TProductWorkItemStateGroupCounts } from "@/types/product-work-items";

export const PRODUCT_WORK_ITEM_STATE_GROUPS: TStateGroups[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "cancelled",
];

const NO_EXPANDED: string[] = [];
const noop = () => {};

type TProps = {
  counts: TProductWorkItemStateGroupCounts | undefined;
  selected: TStateGroups | null;
  onSelect: (group: TStateGroups | null) => void;
  loading?: boolean;
};

/** 左栏：全部工作项 + 五个状态组（计数跟随搜索与筛选），样式同产品需求页的模块树 */
export const ProductWorkItemsStatePanel = ({ counts, selected, onSelect, loading }: TProps) => {
  const { t } = useTranslation();
  const allLabel = t("workspace_products.work_items.all");

  const nodes = useMemo<TModuleTreeNode[]>(
    () =>
      PRODUCT_WORK_ITEM_STATE_GROUPS.map((group) => ({
        key: group,
        // 状态组名照系统原名（项目状态设置、列表按状态组分组同一来源）
        label: STATE_GROUPS[group].label,
        count: counts?.[group],
        leading: <StateGroupIcon stateGroup={group} />,
        virtual: true,
      })),
    [counts]
  );

  return (
    <ModuleTreePanel
      title={t("workspace_products.work_items.state_panel_title")}
      root={{ label: allLabel, count: counts?.all }}
      nodes={nodes}
      selectedKey={selected ?? MODULE_TREE_ROOT_KEY}
      onSelect={(key) => onSelect(key === MODULE_TREE_ROOT_KEY ? null : (key as TStateGroups))}
      expandedKeys={NO_EXPANDED}
      onExpandedKeysChange={noop}
      searchable={false}
      railLabel={selected ? STATE_GROUPS[selected].label : allLabel}
      loading={loading}
    />
  );
};

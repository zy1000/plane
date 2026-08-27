import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
// plane imports
import type { IProfileMetricTreeNode, TProfileMetricKey } from "@plane/types";
// services
import { UserService } from "@/services/user.service";

const userService = new UserService();

export const PROFILE_METRIC_PAGE_SIZE = 20;

type TSelectedNode = {
  id: string;
  projectId?: string;
  type: "all" | IProfileMetricTreeNode["type"];
};

type TUseProfileMetricDetails = {
  metric: TProfileMetricKey;
  open: boolean;
  userId: string;
  workspaceSlug: string;
};

function findTreeNode(nodes: IProfileMetricTreeNode[], id: string): IProfileMetricTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children?.find((item) => item.id === id);
    if (child) return child;
  }
  return undefined;
}

export function useProfileMetricDetails({ metric, open, userId, workspaceSlug }: TUseProfileMetricDetails) {
  const [page, setPage] = useState(1);
  const [selectedNode, setSelectedNode] = useState<TSelectedNode>({ id: "all", type: "all" });

  useEffect(() => {
    setPage(1);
    setSelectedNode({ id: "all", type: "all" });
  }, [metric, open]);

  const {
    data: tree,
    error: treeError,
    isLoading: isTreeLoading,
    mutate: refetchTree,
  } = useSWR(
    open ? ["profile-metric-tree", workspaceSlug, userId, metric] : null,
    () => userService.getUserProfileMetricTree(workspaceSlug, userId, metric),
    { keepPreviousData: false }
  );

  const itemParams = useMemo(() => {
    const params: {
      page: number;
      page_size: number;
      plan_id?: string;
      product_id?: string;
      project_id?: string;
      review_id?: string;
    } = { page, page_size: PROFILE_METRIC_PAGE_SIZE };

    if (selectedNode.type === "project") params.project_id = selectedNode.id;
    if (selectedNode.type === "product") params.product_id = selectedNode.id;
    if (selectedNode.type === "plan") {
      params.project_id = selectedNode.projectId;
      params.plan_id = selectedNode.id;
    }
    if (selectedNode.type === "review") {
      params.project_id = selectedNode.projectId;
      params.review_id = selectedNode.id;
    }
    return params;
  }, [page, selectedNode]);

  const {
    data: items,
    error: itemsError,
    isLoading: isItemsLoading,
    mutate: refetchItems,
  } = useSWR(
    open ? ["profile-metric-items", workspaceSlug, userId, metric, itemParams] : null,
    () => userService.getUserProfileMetricItems(workspaceSlug, userId, metric, itemParams),
    { keepPreviousData: true }
  );

  const selectNode = useCallback(
    (nodeId: string) => {
      setPage(1);
      if (nodeId === "all") {
        setSelectedNode({ id: "all", type: "all" });
        return;
      }
      const node = findTreeNode(tree?.nodes ?? [], nodeId);
      if (!node) return;
      setSelectedNode({ id: node.id, type: node.type, projectId: node.project_id });
    },
    [tree?.nodes]
  );

  const retry = useCallback(() => {
    void refetchTree();
    void refetchItems();
  }, [refetchItems, refetchTree]);

  return {
    error: treeError ?? itemsError,
    isItemsLoading,
    isTreeLoading,
    items,
    page,
    retry,
    selectedNodeId: selectedNode.id,
    selectNode,
    setPage,
    tree,
  };
}

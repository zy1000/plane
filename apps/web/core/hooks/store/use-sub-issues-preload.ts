/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
// types
import type { TIssueMap } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";

type Props = {
  issueIds: string[];
  issuesMap: TIssueMap;
  isEpic?: boolean;
  /** 预加载的最大深度，与 UI 中 nestingLevel < 3 才可展开保持一致 */
  maxDepth?: number;
};

/**
 * @description 进入页面即对所有含子工作项的父项预加载多层子工作项数据（不改变树的折叠展示）。
 * 这样父项复选框可在未展开时就连带选中子项，子项复选框也可被直接勾选。
 * 通过批量接口一次取回多层子工作项，并用 ref 记录已尝试 ID 避免重复请求。
 */
export const useSubIssuesPreload = (props: Props) => {
  const { issueIds, issuesMap, isEpic = false, maxDepth = 3 } = props;
  // router params
  const { workspaceSlug } = useParams();
  const storeType = useIssueStoreType();
  const shouldSkipPreload = isEpic || storeType === EIssuesStoreType.EPIC;
  // store hooks
  const { subIssues: subIssuesStore } = useIssueDetail(
    shouldSkipPreload ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES
  );
  // 记录已尝试预加载的父项 ID，避免在重渲染时重复请求
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // epic 列表不展示子工作项，跳过
    if (shouldSkipPreload) return;
    if (!workspaceSlug || !issueIds || issueIds.length === 0) return;

    const ws = workspaceSlug.toString();

    const preloadIds = issueIds.filter((id) => {
      const issue = issuesMap[id];
      if (!issue || !issue.project_id) return false;
      if ((issue.sub_issues_count ?? 0) <= 0) return false;
      if (subIssuesStore.subIssuesByIssueId(id) !== undefined) return false;
      return !attemptedRef.current.has(id);
    });
    if (preloadIds.length === 0) return;

    preloadIds.forEach((id) => attemptedRef.current.add(id));

    const preload = async (): Promise<void> => {
      try {
        const preloadIdsByProjectId = preloadIds.reduce(
          (acc, id) => {
            const projectId = issuesMap[id]?.project_id;
            if (!projectId) return acc;
            acc[projectId] = [...(acc[projectId] ?? []), id];
            return acc;
          },
          {} as Record<string, string[]>
        );

        await Promise.all(
          Object.entries(preloadIdsByProjectId).map(([projectId, ids]) =>
            subIssuesStore.fetchBulkSubIssues(ws, projectId, ids, maxDepth)
          )
        );
      } catch {
        // 失败时允许后续重试
        preloadIds.forEach((id) => attemptedRef.current.delete(id));
        return;
      }
    };

    void preload();
  }, [workspaceSlug, issueIds, issuesMap, shouldSkipPreload, maxDepth, subIssuesStore]);
};

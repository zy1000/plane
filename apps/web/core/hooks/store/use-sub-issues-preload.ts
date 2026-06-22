/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
// types
import type { TIssueMap } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  issueIds: string[];
  issuesMap: TIssueMap;
  isEpic?: boolean;
  /** 预加载的最大深度，与 UI 中 nestingLevel < 3 才可展开保持一致 */
  maxDepth?: number;
};

/**
 * @description 进入页面即对所有含子工作项的父项递归预加载子工作项数据（不改变树的折叠展示）。
 * 这样父项复选框可在未展开时就连带选中子项，子项复选框也可被直接勾选。
 * 依赖 subIssuesStore.fetchSubIssues 自带的 in-flight 去重，并用 ref 记录已尝试 ID 避免重复请求。
 */
export const useSubIssuesPreload = (props: Props) => {
  const { issueIds, issuesMap, isEpic = false, maxDepth = 3 } = props;
  // router params
  const { workspaceSlug } = useParams();
  // store hooks
  const { subIssues: subIssuesStore } = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);
  // 记录已尝试预加载的父项 ID，避免在重渲染时重复请求
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // epic 列表不展示子工作项，跳过
    if (isEpic) return;
    if (!workspaceSlug || !issueIds || issueIds.length === 0) return;

    const ws = workspaceSlug.toString();
    let cancelled = false;

    const preloadForIds = async (ids: string[], depth: number): Promise<void> => {
      if (cancelled || depth > maxDepth || ids.length === 0) return;

      await Promise.all(
        ids.map(async (id) => {
          if (cancelled) return;
          const issue = issuesMap[id];
          if (!issue || !issue.project_id) return;
          if ((issue.sub_issues_count ?? 0) <= 0) return;

          // 未加载过且未尝试过才请求；fetchSubIssues 内部已做并发去重
          const loaded = subIssuesStore.subIssuesByIssueId(id);
          if (loaded === undefined && !attemptedRef.current.has(id)) {
            attemptedRef.current.add(id);
            try {
              await subIssuesStore.fetchSubIssues(ws, issue.project_id, id);
            } catch {
              // 失败时允许后续重试
              attemptedRef.current.delete(id);
              return;
            }
          }

          if (cancelled) return;
          // 递归预加载下一层（子项数据此时已写入全局 issuesMap）
          const childIds = subIssuesStore.subIssuesByIssueId(id) ?? [];
          if (childIds.length > 0) await preloadForIds(childIds, depth + 1);
        })
      );
    };

    void preloadForIds(issueIds, 1);

    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, issueIds, issuesMap, isEpic, maxDepth, subIssuesStore]);
};

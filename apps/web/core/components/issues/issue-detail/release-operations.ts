/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueStore } from "@/store/issue/issue.store";
import { ReleaseService } from "@/services/release.service";

const releaseService = new ReleaseService();

/** 多值字段「先去掉 remove、再追加 add」的合并顺序；编辑态暂存与真实提交都用它，保证两边算出的数组一致 */
export const mergeIds = (current: string[] | null | undefined, addIds: string[], removeIds: string[]): string[] => {
  const kept = (current ?? []).filter((id) => !removeIds.includes(id));
  return kept.concat(addIds.filter((id) => !kept.includes(id)));
};

/** 发布不走工作项 PATCH，走专用接口：本地乐观更新 → 调接口 → 失败回滚 */
export const changeIssueReleases = async (
  issueStore: Pick<IIssueStore, "getIssueById" | "updateIssue">,
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  addIds: string[],
  removeIds: string[]
): Promise<void> => {
  const currentReleaseIds = issueStore.getIssueById(issueId)?.release_ids ?? [];
  issueStore.updateIssue(issueId, { release_ids: mergeIds(currentReleaseIds, addIds, removeIds) });
  try {
    await releaseService.addReleasesToIssue(workspaceSlug, projectId, issueId, {
      releases: addIds,
      removed_releases: removeIds,
    });
  } catch (error) {
    issueStore.updateIssue(issueId, { release_ids: currentReleaseIds });
    throw error;
  }
};

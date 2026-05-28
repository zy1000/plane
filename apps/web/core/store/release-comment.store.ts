/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TReleaseComment } from "@plane/types";
// services
import { ReleaseCommentService } from "@/services/release-comment.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IReleaseCommentStore {
  // observables
  commentsByReleaseId: Record<string, TReleaseComment[]>;
  loaderByReleaseId: Record<string, boolean>;
  fetchedByReleaseId: Record<string, boolean>;
  // computed actions
  getCommentsByReleaseId: (releaseId: string) => TReleaseComment[];
  getCommentById: (releaseId: string, commentId: string) => TReleaseComment | undefined;
  isLoadingByReleaseId: (releaseId: string) => boolean;
  // actions
  fetchComments: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<TReleaseComment[]>;
  createComment: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<TReleaseComment>
  ) => Promise<TReleaseComment>;
  removeComment: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    commentId: string
  ) => Promise<void>;
}

/**
 * 给定评论列表与目标 root id，返回该评论的全部后代 id（不含 root 本身）。
 * 与后端 `parent on_delete=CASCADE` 行为对齐，删除时一次性把树清理掉。
 */
const collectDescendantIds = (rootId: string, comments: TReleaseComment[]): string[] => {
  const childrenByParent: Record<string, string[]> = {};
  for (const comment of comments) {
    if (comment.parent) {
      (childrenByParent[comment.parent] ||= []).push(comment.id);
    }
  }
  const descendants: string[] = [];
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const children = childrenByParent[current] ?? [];
    for (const childId of children) {
      descendants.push(childId);
      stack.push(childId);
    }
  }
  return descendants;
};

export class ReleaseCommentStore implements IReleaseCommentStore {
  // observables
  commentsByReleaseId: Record<string, TReleaseComment[]> = {};
  loaderByReleaseId: Record<string, boolean> = {};
  fetchedByReleaseId: Record<string, boolean> = {};
  // services
  releaseCommentService: ReleaseCommentService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      commentsByReleaseId: observable,
      loaderByReleaseId: observable,
      fetchedByReleaseId: observable,
      // actions
      fetchComments: action,
      createComment: action,
      removeComment: action,
    });
    this.releaseCommentService = new ReleaseCommentService();
  }

  getCommentsByReleaseId = computedFn(
    (releaseId: string): TReleaseComment[] => this.commentsByReleaseId[releaseId] ?? []
  );

  getCommentById = computedFn(
    (releaseId: string, commentId: string): TReleaseComment | undefined =>
      this.commentsByReleaseId[releaseId]?.find((comment) => comment.id === commentId)
  );

  isLoadingByReleaseId = computedFn((releaseId: string): boolean => !!this.loaderByReleaseId[releaseId]);

  fetchComments = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ): Promise<TReleaseComment[]> => {
    runInAction(() => {
      this.loaderByReleaseId[releaseId] = true;
    });
    try {
      const response = await this.releaseCommentService.getReleaseComments(workspaceSlug, projectId, releaseId);
      const sorted = [...(response ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      runInAction(() => {
        this.commentsByReleaseId[releaseId] = sorted;
        this.fetchedByReleaseId[releaseId] = true;
      });
      return sorted;
    } finally {
      runInAction(() => {
        this.loaderByReleaseId[releaseId] = false;
      });
    }
  };

  createComment = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<TReleaseComment>
  ): Promise<TReleaseComment> => {
    const created = await this.releaseCommentService.createReleaseComment(
      workspaceSlug,
      projectId,
      releaseId,
      data
    );
    runInAction(() => {
      const existing = this.commentsByReleaseId[releaseId] ?? [];
      this.commentsByReleaseId[releaseId] = [...existing, created];
    });
    return created;
  };

  removeComment = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    commentId: string
  ): Promise<void> => {
    await this.releaseCommentService.deleteReleaseComment(workspaceSlug, projectId, releaseId, commentId);
    runInAction(() => {
      const existing = this.commentsByReleaseId[releaseId] ?? [];
      const descendantIds = collectDescendantIds(commentId, existing);
      const idsToRemove = new Set<string>([commentId, ...descendantIds]);
      this.commentsByReleaseId[releaseId] = existing.filter((comment) => !idsToRemove.has(comment.id));
    });
  };
}

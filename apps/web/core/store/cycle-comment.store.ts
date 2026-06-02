/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TCycleComment } from "@plane/types";
// services
import { CycleCommentService } from "@/services/cycle-comment.service";
// store
import type { CoreRootStore } from "./root.store";

export interface ICycleCommentStore {
  // observables
  commentsByCycleId: Record<string, TCycleComment[]>;
  loaderByCycleId: Record<string, boolean>;
  fetchedByCycleId: Record<string, boolean>;
  // computed actions
  getCommentsByCycleId: (cycleId: string) => TCycleComment[];
  getCommentById: (cycleId: string, commentId: string) => TCycleComment | undefined;
  isLoadingByCycleId: (cycleId: string) => boolean;
  // actions
  fetchComments: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<TCycleComment[]>;
  createComment: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: Partial<TCycleComment>
  ) => Promise<TCycleComment>;
  removeComment: (workspaceSlug: string, projectId: string, cycleId: string, commentId: string) => Promise<void>;
}

/**
 * 给定评论列表与目标 root id，返回该评论的全部后代 id（不含 root 本身）。
 * 与后端 `parent on_delete=CASCADE` 行为对齐，删除时一次性把树清理掉。
 */
const collectDescendantIds = (rootId: string, comments: TCycleComment[]): string[] => {
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

export class CycleCommentStore implements ICycleCommentStore {
  // observables
  commentsByCycleId: Record<string, TCycleComment[]> = {};
  loaderByCycleId: Record<string, boolean> = {};
  fetchedByCycleId: Record<string, boolean> = {};
  // services
  cycleCommentService: CycleCommentService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      commentsByCycleId: observable,
      loaderByCycleId: observable,
      fetchedByCycleId: observable,
      // actions
      fetchComments: action,
      createComment: action,
      removeComment: action,
    });
    this.cycleCommentService = new CycleCommentService();
  }

  getCommentsByCycleId = computedFn((cycleId: string): TCycleComment[] => this.commentsByCycleId[cycleId] ?? []);

  getCommentById = computedFn(
    (cycleId: string, commentId: string): TCycleComment | undefined =>
      this.commentsByCycleId[cycleId]?.find((comment) => comment.id === commentId)
  );

  isLoadingByCycleId = computedFn((cycleId: string): boolean => !!this.loaderByCycleId[cycleId]);

  fetchComments = async (workspaceSlug: string, projectId: string, cycleId: string): Promise<TCycleComment[]> => {
    runInAction(() => {
      this.loaderByCycleId[cycleId] = true;
    });
    try {
      const response = await this.cycleCommentService.getCycleComments(workspaceSlug, projectId, cycleId);
      const sorted = [...(response ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      runInAction(() => {
        this.commentsByCycleId[cycleId] = sorted;
        this.fetchedByCycleId[cycleId] = true;
      });
      return sorted;
    } finally {
      runInAction(() => {
        this.loaderByCycleId[cycleId] = false;
      });
    }
  };

  createComment = async (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: Partial<TCycleComment>
  ): Promise<TCycleComment> => {
    const created = await this.cycleCommentService.createCycleComment(workspaceSlug, projectId, cycleId, data);
    runInAction(() => {
      const existing = this.commentsByCycleId[cycleId] ?? [];
      this.commentsByCycleId[cycleId] = [...existing, created];
    });
    return created;
  };

  removeComment = async (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    commentId: string
  ): Promise<void> => {
    await this.cycleCommentService.deleteCycleComment(workspaceSlug, projectId, cycleId, commentId);
    runInAction(() => {
      const existing = this.commentsByCycleId[cycleId] ?? [];
      const descendantIds = collectDescendantIds(commentId, existing);
      const idsToRemove = new Set<string>([commentId, ...descendantIds]);
      this.commentsByCycleId[cycleId] = existing.filter((comment) => !idsToRemove.has(comment.id));
    });
  };
}

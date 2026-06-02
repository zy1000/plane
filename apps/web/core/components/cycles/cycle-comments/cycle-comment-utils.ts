/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCycleComment } from "@plane/types";

export type TCommentTree = {
  /** 顶层评论（parent 为 null），按创建时间升序。 */
  roots: TCycleComment[];
  /** parent comment id → 直接子评论（已按创建时间升序）。 */
  childrenByParent: Record<string, TCycleComment[]>;
  /** comment id → comment，用于渲染回复目标。 */
  commentsById: Record<string, TCycleComment>;
};

const compareByCreated = (a: TCycleComment, b: TCycleComment) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

/**
 * 把扁平评论列表组织为根评论、直接子评论索引与 comment 索引。
 * - 同层级按 created_at 升序排列；
 * - 不依赖输入数组的顺序，调用方传入的列表可乱序。
 */
export const buildCommentTree = (comments: TCycleComment[]): TCommentTree => {
  const childrenByParent: Record<string, TCycleComment[]> = {};
  const commentsById: Record<string, TCycleComment> = {};
  const roots: TCycleComment[] = [];

  for (const comment of comments) {
    commentsById[comment.id] = comment;
    if (comment.parent) {
      (childrenByParent[comment.parent] ||= []).push(comment);
    } else {
      roots.push(comment);
    }
  }

  roots.sort(compareByCreated);
  for (const key of Object.keys(childrenByParent)) {
    childrenByParent[key].sort(compareByCreated);
  }

  return { roots, childrenByParent, commentsById };
};

/** 收集某条顶层评论下的全部后代回复，并按回复时间升序展平。 */
export const flattenCommentDescendants = (
  rootId: string,
  childrenByParent: Record<string, TCycleComment[]>
): TCycleComment[] => {
  const descendants: TCycleComment[] = [];
  const stack = [...(childrenByParent[rootId] ?? [])];

  while (stack.length > 0) {
    const current = stack.pop() as TCycleComment;
    descendants.push(current);
    stack.push(...(childrenByParent[current.id] ?? []));
  }

  return descendants.sort(compareByCreated);
};

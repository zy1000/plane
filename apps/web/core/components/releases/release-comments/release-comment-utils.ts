/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TReleaseComment } from "@plane/types";

export type TCommentTree = {
  /** 顶层评论（parent 为 null），按创建时间升序。 */
  roots: TReleaseComment[];
  /** parent comment id → 直接子评论（已按创建时间升序）。 */
  childrenByParent: Record<string, TReleaseComment[]>;
  /** comment id → comment，用于渲染回复目标。 */
  commentsById: Record<string, TReleaseComment>;
};

const compareByCreated = (a: TReleaseComment, b: TReleaseComment) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

/**
 * 把扁平评论列表组织为根评论、直接子评论索引与 comment 索引。
 * - 同层级按 created_at 升序排列；
 * - 不依赖输入数组的顺序，调用方传入的列表可乱序。
 */
export const buildCommentTree = (comments: TReleaseComment[]): TCommentTree => {
  const childrenByParent: Record<string, TReleaseComment[]> = {};
  const commentsById: Record<string, TReleaseComment> = {};
  const roots: TReleaseComment[] = [];

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
  childrenByParent: Record<string, TReleaseComment[]>
): TReleaseComment[] => {
  const descendants: TReleaseComment[] = [];
  const stack = [...(childrenByParent[rootId] ?? [])];

  while (stack.length > 0) {
    const current = stack.pop() as TReleaseComment;
    descendants.push(current);
    stack.push(...(childrenByParent[current.id] ?? []));
  }

  return descendants.sort(compareByCreated);
};

/**
 * 收集某条评论的全部后代 id（不包含 rootId 本身）。前端在乐观删除时需要把这些
 * 子评论一并从本地状态中移除，与后端 `parent on_delete=CASCADE` 行为保持一致。
 */
export const collectDescendantIds = (
  rootId: string,
  childrenByParent: Record<string, TReleaseComment[]>
): string[] => {
  const result: string[] = [];
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const children = childrenByParent[current] ?? [];
    for (const child of children) {
      result.push(child.id);
      stack.push(child.id);
    }
  }
  return result;
};


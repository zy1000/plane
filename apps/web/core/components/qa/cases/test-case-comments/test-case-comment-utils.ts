import type { TTestCaseComment } from "@plane/types";

export type TCommentTree = {
  roots: TTestCaseComment[];
  childrenByParent: Record<string, TTestCaseComment[]>;
  commentsById: Record<string, TTestCaseComment>;
};

const compareByCreated = (a: TTestCaseComment, b: TTestCaseComment) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export const buildCommentTree = (comments: TTestCaseComment[]): TCommentTree => {
  const childrenByParent: Record<string, TTestCaseComment[]> = {};
  const commentsById: Record<string, TTestCaseComment> = {};
  const roots: TTestCaseComment[] = [];

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

export const flattenCommentDescendants = (
  rootId: string,
  childrenByParent: Record<string, TTestCaseComment[]>
): TTestCaseComment[] => {
  const descendants: TTestCaseComment[] = [];
  const stack = [...(childrenByParent[rootId] ?? [])];

  while (stack.length > 0) {
    const current = stack.pop() as TTestCaseComment;
    descendants.push(current);
    stack.push(...(childrenByParent[current.id] ?? []));
  }

  return descendants.sort(compareByCreated);
};

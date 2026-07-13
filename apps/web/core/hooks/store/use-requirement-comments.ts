import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RequirementCommentService,
  type TRequirementComment,
  type TRequirementCommentPayload,
} from "@/services/requirement-comment.service";
import type { TRequirementType } from "@/services/requirement.service";

const requirementCommentService = new RequirementCommentService();

const sortByCreatedAt = (comments: TRequirementComment[]) => {
  const sortedComments = [...comments];
  sortedComments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return sortedComments;
};

const collectDescendantIds = (rootId: string, comments: TRequirementComment[]) => {
  const childrenByParent = new Map<string, string[]>();
  comments.forEach((comment) => {
    if (!comment.parent) return;
    childrenByParent.set(comment.parent, [...(childrenByParent.get(comment.parent) ?? []), comment.id]);
  });

  const descendants: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    (childrenByParent.get(current) ?? []).forEach((childId) => {
      descendants.push(childId);
      stack.push(childId);
    });
  }
  return descendants;
};

export const useRequirementComments = (
  workspaceSlug?: string,
  productId?: string,
  requirementId?: string,
  requirementType: TRequirementType = "user"
) => {
  const [comments, setComments] = useState<TRequirementComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    setComments([]);
  }, [productId, requirementId, requirementType, workspaceSlug]);

  const fetchComments = useCallback(async () => {
    if (!workspaceSlug || !productId || !requirementId) return [];
    setIsLoading(true);
    try {
      const response = await requirementCommentService.getComments(
        workspaceSlug,
        productId,
        requirementId,
        requirementType
      );
      const sorted = sortByCreatedAt(response ?? []);
      setComments(sorted);
      return sorted;
    } finally {
      setIsLoading(false);
    }
  }, [productId, requirementId, requirementType, workspaceSlug]);

  const createComment = useCallback(
    async (data: TRequirementCommentPayload) => {
      if (!workspaceSlug || !productId || !requirementId) throw new Error("缺少需求评论参数");
      setIsMutating(true);
      try {
        const response = await requirementCommentService.createComment(
          workspaceSlug,
          productId,
          requirementId,
          requirementType,
          data
        );
        setComments((current) => sortByCreatedAt([...current, response]));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementId, requirementType, workspaceSlug]
  );

  const removeComment = useCallback(
    async (commentId: string) => {
      if (!workspaceSlug || !productId || !requirementId) throw new Error("缺少需求评论参数");
      setIsMutating(true);
      try {
        await requirementCommentService.deleteComment(
          workspaceSlug,
          productId,
          requirementId,
          requirementType,
          commentId
        );
        setComments((current) => {
          const removedIds = new Set([commentId, ...collectDescendantIds(commentId, current)]);
          return current.filter((comment) => !removedIds.has(comment.id));
        });
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementId, requirementType, workspaceSlug]
  );

  return useMemo(
    () => ({ comments, isLoading, isMutating, fetchComments, createComment, removeComment }),
    [comments, createComment, fetchComments, isLoading, isMutating, removeComment]
  );
};

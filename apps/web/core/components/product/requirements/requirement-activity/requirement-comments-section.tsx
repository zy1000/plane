import { useMemo } from "react";
import { Loader } from "@plane/ui";
import type { TRequirementComment, TRequirementCommentPayload } from "@/services/requirement-comment.service";
import { buildRequirementCommentTree } from "./requirement-activity-utils";
import { RequirementCommentCard } from "./requirement-comment-card";
import { RequirementCommentCreate } from "./requirement-comment-create";

type Props = {
  comments: TRequirementComment[];
  isLoading: boolean;
  workspaceSlug: string;
  workspaceId: string;
  productId: string;
  requirementId: string;
  disabled?: boolean;
  onCreate: (data: TRequirementCommentPayload) => Promise<TRequirementComment | undefined>;
  onRemove: (commentId: string) => Promise<void>;
};

export function RequirementCommentComposer(props: Omit<Props, "comments" | "isLoading" | "onRemove">) {
  const { workspaceSlug, workspaceId, productId, requirementId, disabled = false, onCreate } = props;
  return (
    <RequirementCommentCreate
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      productId={productId}
      requirementId={requirementId}
      disabled={disabled}
      placeholder={disabled ? "你没有发表评论的权限" : "发表评论..."}
      onSubmit={onCreate}
    />
  );
}

export function RequirementCommentsSection(props: Props) {
  const {
    comments,
    isLoading,
    workspaceSlug,
    workspaceId,
    productId,
    requirementId,
    disabled = false,
    onCreate,
    onRemove,
  } = props;
  const { roots, childrenByParent, commentsById } = useMemo(() => buildRequirementCommentTree(comments), [comments]);

  return (
    <div className="space-y-4 pt-4">
      {isLoading && comments.length === 0 ? (
        <Loader className="space-y-3">
          <Loader.Item height="72px" />
          <Loader.Item height="72px" />
          <Loader.Item height="72px" />
        </Loader>
      ) : roots.length === 0 ? (
        <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-subtle px-6 text-center text-body-sm-regular text-placeholder">
          暂无评论，留下第一条想法吧
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {roots.map((comment) => (
            <RequirementCommentCard
              key={comment.id}
              comment={comment}
              childrenByParent={childrenByParent}
              commentsById={commentsById}
              depth={0}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              productId={productId}
              requirementId={requirementId}
              disabled={disabled}
              onRemove={onRemove}
              onReply={onCreate}
            />
          ))}
        </div>
      )}
      <div className="border-t border-subtle pt-3">
        <RequirementCommentComposer
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          productId={productId}
          requirementId={requirementId}
          disabled={disabled}
          onCreate={onCreate}
        />
      </div>
    </div>
  );
}

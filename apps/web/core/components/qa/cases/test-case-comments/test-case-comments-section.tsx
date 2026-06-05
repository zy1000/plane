import { useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Loader } from "@plane/ui";
import { useTestCaseComment } from "@/hooks/store/use-test-case-comment";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { TestCaseCommentCard } from "./test-case-comment-card";
import { TestCaseCommentCreate } from "./test-case-comment-create";
import { buildCommentTree } from "./test-case-comment-utils";

type Props = {
  workspaceSlug: string;
  projectId: string;
  caseId: string;
  disabled?: boolean;
};

export const TestCaseCommentsSection = observer(function TestCaseCommentsSection(props: Props) {
  const { workspaceSlug, projectId, caseId, disabled = false } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { getCommentsByCaseId, fetchComments, createComment, removeComment } = useTestCaseComment();
  const comments = getCommentsByCaseId(caseId);

  const { isLoading } = useSWR(
    workspaceSlug && caseId ? ["test-case-comments", workspaceSlug, caseId] : null,
    () => fetchComments(workspaceSlug, caseId)
  );

  const { roots, childrenByParent, commentsById } = useMemo(() => buildCommentTree(comments), [comments]);

  const handleCreate = async (data: { comment_html: string; comment_json?: unknown; parent?: string | null }) => {
    return createComment(workspaceSlug, caseId, {
      comment_html: data.comment_html,
      comment_json: (data.comment_json ?? undefined) as Record<string, unknown> | undefined,
      parent: data.parent ?? undefined,
    });
  };

  const handleRemove = async (commentId: string) => {
    await removeComment(workspaceSlug, caseId, commentId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {isLoading && comments.length === 0 ? (
          <Loader className="space-y-3">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        ) : roots.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-placeholder">暂无评论，留下第一条想法吧</div>
        ) : (
          <div className="flex flex-col gap-4">
            {roots.map((comment) => (
              <TestCaseCommentCard
                key={comment.id}
                comment={comment}
                childrenByParent={childrenByParent}
                commentsById={commentsById}
                depth={0}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                projectId={projectId}
                caseId={caseId}
                disabled={disabled}
                onRemove={handleRemove}
                onReply={handleCreate}
              />
            ))}
          </div>
        )}
      </div>

      {!disabled && (
        <div className="relative z-[2] shrink-0 border-t border-subtle bg-surface-1 px-6 py-3">
          <TestCaseCommentCreate
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            projectId={projectId}
            caseId={caseId}
            placeholder="发表评论..."
            autoFocus
            onSubmit={handleCreate}
          />
        </div>
      )}
    </div>
  );
});

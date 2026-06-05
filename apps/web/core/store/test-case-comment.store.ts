import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TTestCaseComment } from "@plane/types";
import { TestCaseCommentService } from "@/services/qa/test-case-comment.service";
import type { CoreRootStore } from "./root.store";

export interface ITestCaseCommentStore {
  commentsByCaseId: Record<string, TTestCaseComment[]>;
  loaderByCaseId: Record<string, boolean>;
  fetchedByCaseId: Record<string, boolean>;
  getCommentsByCaseId: (caseId: string) => TTestCaseComment[];
  getCommentById: (caseId: string, commentId: string) => TTestCaseComment | undefined;
  isLoadingByCaseId: (caseId: string) => boolean;
  fetchComments: (workspaceSlug: string, caseId: string) => Promise<TTestCaseComment[]>;
  createComment: (
    workspaceSlug: string,
    caseId: string,
    data: { comment_html: string; comment_json?: Record<string, unknown>; parent?: string }
  ) => Promise<TTestCaseComment>;
  removeComment: (workspaceSlug: string, caseId: string, commentId: string) => Promise<void>;
}

const collectDescendantIds = (rootId: string, comments: TTestCaseComment[]): string[] => {
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

export class TestCaseCommentStore implements ITestCaseCommentStore {
  commentsByCaseId: Record<string, TTestCaseComment[]> = {};
  loaderByCaseId: Record<string, boolean> = {};
  fetchedByCaseId: Record<string, boolean> = {};

  testCaseCommentService: TestCaseCommentService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      commentsByCaseId: observable,
      loaderByCaseId: observable,
      fetchedByCaseId: observable,
      fetchComments: action,
      createComment: action,
      removeComment: action,
    });
    this.testCaseCommentService = new TestCaseCommentService();
  }

  getCommentsByCaseId = computedFn((caseId: string): TTestCaseComment[] => this.commentsByCaseId[caseId] ?? []);

  getCommentById = computedFn(
    (caseId: string, commentId: string): TTestCaseComment | undefined =>
      this.commentsByCaseId[caseId]?.find((c) => c.id === commentId)
  );

  isLoadingByCaseId = computedFn((caseId: string): boolean => !!this.loaderByCaseId[caseId]);

  fetchComments = async (workspaceSlug: string, caseId: string): Promise<TTestCaseComment[]> => {
    runInAction(() => {
      this.loaderByCaseId[caseId] = true;
    });
    try {
      const response = await this.testCaseCommentService.getComments(workspaceSlug, caseId, { max_depth: 5 });
      const list = response?.data ?? [];
      const sorted = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      runInAction(() => {
        this.commentsByCaseId[caseId] = sorted;
        this.fetchedByCaseId[caseId] = true;
      });
      return sorted;
    } finally {
      runInAction(() => {
        this.loaderByCaseId[caseId] = false;
      });
    }
  };

  createComment = async (
    workspaceSlug: string,
    caseId: string,
    data: { comment_html: string; comment_json?: Record<string, unknown>; parent?: string }
  ): Promise<TTestCaseComment> => {
    const created = await this.testCaseCommentService.createComment(workspaceSlug, {
      case: caseId,
      ...data,
    });
    runInAction(() => {
      const existing = this.commentsByCaseId[caseId] ?? [];
      this.commentsByCaseId[caseId] = [...existing, created];
    });
    return created;
  };

  removeComment = async (workspaceSlug: string, caseId: string, commentId: string): Promise<void> => {
    await this.testCaseCommentService.deleteComment(workspaceSlug, commentId);
    runInAction(() => {
      const existing = this.commentsByCaseId[caseId] ?? [];
      const descendantIds = collectDescendantIds(commentId, existing);
      const idsToRemove = new Set<string>([commentId, ...descendantIds]);
      this.commentsByCaseId[caseId] = existing.filter((c) => !idsToRemove.has(c.id));
    });
  };
}

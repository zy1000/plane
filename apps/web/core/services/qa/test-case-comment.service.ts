import { API_BASE_URL } from "@plane/constants";
import type { TTestCaseComment } from "@plane/types";
import { APIService } from "@/services/api.service";

export class TestCaseCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getComments(
    workspaceSlug: string,
    caseId: string,
    params?: { page?: number; page_size?: number; max_depth?: number }
  ): Promise<{ data: TTestCaseComment[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/comments/`, {
      params: { case_id: caseId, ...params },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createComment(
    workspaceSlug: string,
    data: {
      case: string;
      comment_html: string;
      comment_json?: Record<string, unknown>;
      parent?: string;
    }
  ): Promise<TTestCaseComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/comments/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteComment(workspaceSlug: string, commentId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

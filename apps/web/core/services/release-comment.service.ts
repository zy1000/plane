import { API_BASE_URL } from "@plane/constants";
import type { TReleaseComment } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ReleaseCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getReleaseComments(
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ): Promise<TReleaseComment[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/comments/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createReleaseComment(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<TReleaseComment>
  ): Promise<TReleaseComment> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/comments/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteReleaseComment(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    commentId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/comments/${commentId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

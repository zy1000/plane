import { API_BASE_URL } from "@plane/constants";
import type { TCycleComment } from "@plane/types";
import { APIService } from "@/services/api.service";

export class CycleCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getCycleComments(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TCycleComment[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/comments/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCycleComment(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: Partial<TCycleComment>
  ): Promise<TCycleComment> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/comments/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCycleComment(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    commentId: string
  ): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/comments/${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

import { API_BASE_URL } from "@plane/constants";
import type { TReleaseActivity } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ReleaseActivityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getReleaseActivities(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    params?: { created_at__gt?: string }
  ): Promise<TReleaseActivity[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/activities/`,
      { params }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

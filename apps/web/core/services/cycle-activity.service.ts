import { API_BASE_URL } from "@plane/constants";
import type { TCycleActivity } from "@plane/types";
import { APIService } from "@/services/api.service";

export class CycleActivityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getCycleActivities(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    params?: { created_at__gt?: string }
  ): Promise<TCycleActivity[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/activities/`,
      { params }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

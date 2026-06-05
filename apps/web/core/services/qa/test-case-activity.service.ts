import { API_BASE_URL } from "@plane/constants";
import type { TTestCaseActivity } from "@plane/types";
import { APIService } from "@/services/api.service";

export class TestCaseActivityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getActivities(
    workspaceSlug: string,
    caseId: string,
    params?: { created_at__gt?: string }
  ): Promise<{ data: TTestCaseActivity[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/${caseId}/activities/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

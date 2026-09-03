import { API_BASE_URL } from "@plane/constants";
import type { TExternalIntegration, TExternalIntegrationSyncResponse } from "@plane/types";
import { APIService } from "@/services/api.service";

/** 工作区级第三方集成：列表 + 手动同步。失败体（含错误码与更新后的 integration）原样抛出。 */
export class ExternalIntegrationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TExternalIntegration[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/external-integrations/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async sync(workspaceSlug: string, key: string): Promise<TExternalIntegrationSyncResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/external-integrations/${key}/sync/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

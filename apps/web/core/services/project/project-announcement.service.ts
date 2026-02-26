import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TProjectAnnouncement = {
  id: string;
  name: string;
  description?: string | null;
  project: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | { id?: string; display_name?: string; email?: string } | null;
  updated_by?: string | { id?: string; display_name?: string; email?: string } | null;
};

export type TProjectAnnouncementListResponse = {
  count: number;
  data: TProjectAnnouncement[];
};

export class ProjectAnnouncementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchAnnouncements(
    workspaceSlug: string,
    projectId: string,
    params?: { page?: number; page_size?: number }
  ): Promise<TProjectAnnouncementListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/announcement/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createAnnouncement(
    workspaceSlug: string,
    projectId: string,
    data: Pick<TProjectAnnouncement, "name" | "description" | "project">
  ): Promise<TProjectAnnouncement> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/announcement/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteAnnouncements(
    workspaceSlug: string,
    projectId: string,
    ids: string[]
  ): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/announcement/`, { ids })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

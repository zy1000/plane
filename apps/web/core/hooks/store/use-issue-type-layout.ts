import useSWR, { mutate } from "swr";
import { ProjectIssueTypeService, type TIssueType } from "@/services/project/project-issue-type.service";

const service = new ProjectIssueTypeService();

export function useIssueTypeLayout(workspaceSlug?: string, projectId?: string | null, issueTypeId?: string | null) {
  const { data, error, isLoading } = useSWR(
    workspaceSlug && projectId && issueTypeId ? ["issue-type-layout", workspaceSlug, projectId, issueTypeId] : null,
    ([, slug, project, type]) => service.fetchProjectIssueType(slug, project, type),
    { keepPreviousData: false, revalidateOnFocus: true }
  );
  return { layout: data?.field_layout, typeName: data?.name, error, isLoading };
}

export async function synchronizeIssueTypeLayout(issueType: TIssueType) {
  await mutate((key) => Array.isArray(key) && key[0] === "issue-type-layout" && key[3] === issueType.id, issueType, {
    revalidate: false,
  });
}

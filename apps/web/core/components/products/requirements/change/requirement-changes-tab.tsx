/** 「变更记录」Tab：列表与对比页共用一个 Tab，靠 URL 上的变更单 ID 切换。 */
import type { TRequirementField, IUserLite } from "@plane/types";
import type { useRequirementChangeRequests } from "@/hooks/store/use-requirement-changes";
import { ChangeRequestDetail } from "./change-request-detail";
import { ChangeRequestList } from "./change-request-list";

type TProps = {
  workspaceSlug: string;
  requirementId: string;
  fields: TRequirementField[];
  members: IUserLite[];
  store: ReturnType<typeof useRequirementChangeRequests>;
  openedChangeRequestId: string | null;
  onOpenChangeRequest: (changeRequestId: string | null) => void;
  onSettled: () => void;
};

export function RequirementChangesTab(props: TProps) {
  const {
    workspaceSlug,
    requirementId,
    fields,
    members,
    store,
    openedChangeRequestId,
    onOpenChangeRequest,
    onSettled,
  } = props;

  if (openedChangeRequestId) {
    return (
      <ChangeRequestDetail
        workspaceSlug={workspaceSlug}
        requirementId={requirementId}
        changeRequestId={openedChangeRequestId}
        fields={fields}
        members={members}
        onBack={() => onOpenChangeRequest(null)}
        onSettled={onSettled}
      />
    );
  }

  return (
    <ChangeRequestList
      changeRequests={store.changeRequestsPage.results}
      totalCount={store.changeRequestsPage.total_count ?? 0}
      isLoading={store.isLoading}
      error={store.error}
      perPage={store.perPage}
      nextCursor={store.changeRequestsPage.next_cursor}
      prevCursor={store.changeRequestsPage.prev_cursor}
      nextPageResults={store.changeRequestsPage.next_page_results}
      prevPageResults={store.changeRequestsPage.prev_page_results}
      onPerPageChange={store.setPerPage}
      onCursorChange={store.setCursor}
      onRetry={() => void store.fetchChangeRequests().catch(() => undefined)}
      onOpen={(changeRequest) => onOpenChangeRequest(changeRequest.id)}
    />
  );
}

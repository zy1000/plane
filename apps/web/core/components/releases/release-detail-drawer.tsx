import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { Drawer } from "antd";
import { useAppRouter } from "@/hooks/use-app-router";
import { useParams } from "next/navigation";
import { DEFAULT_RELEASE_DETAIL_TAB, getReleaseDetailTabStorageKey } from "@/components/releases/release-overview";
import { ReleaseDetailContent } from "./release-detail-content";
import { useRelease } from "@/hooks/store/use-release";
import { setValueIntoLocalStorage } from "@/hooks/use-local-storage";

type Props = {
  releaseId: string;
  isOpen: boolean;
  onClose: () => void;
  isArchived?: boolean;
};

export const ReleaseDetailDrawer: React.FC<Props> = observer((props) => {
  const { releaseId, isOpen, onClose, isArchived } = props;
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const { fetchReleaseDetails } = useRelease();

  const handleFullscreen = () => {
    if (workspaceSlug && projectId && releaseId) {
      setValueIntoLocalStorage(getReleaseDetailTabStorageKey(releaseId.toString()), DEFAULT_RELEASE_DETAIL_TAB);
      router.push(`/${workspaceSlug}/projects/${projectId}/releases/${releaseId}/overview`);
    }
  };

  useEffect(() => {
    if (isOpen && workspaceSlug && projectId && releaseId) {
      fetchReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId.toString());
    }
  }, [isOpen, workspaceSlug, projectId, releaseId, fetchReleaseDetails]);

  return (
    <Drawer
      placement="right"
      onClose={onClose}
      open={isOpen}
      width="70vw"
      styles={{
        body: { padding: 0, backgroundColor: "var(--background-color-surface-1)" },
        header: { backgroundColor: "var(--background-color-surface-1)", borderBottom: "1px solid var(--border-color-subtle)" },
      }}
    >
      <div className="h-full overflow-y-auto px-6 py-4">
        <ReleaseDetailContent releaseId={releaseId} isArchived={!!isArchived} isOpen={isOpen} />
      </div>
    </Drawer>
  );
});

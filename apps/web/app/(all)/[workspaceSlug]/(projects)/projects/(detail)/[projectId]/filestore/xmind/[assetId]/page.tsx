"use client";

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import { PROJECT_ASSET_VIEW_PERMISSION_KEY } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import {
  XmindPreviewContent,
  type TXmindPreviewAsset,
} from "@/components/filestore/xmind-preview-content";
import { useUserPermissions } from "@/hooks/store/user";

function FilestoreXmindPage() {
  const { workspaceSlug, projectId, assetId } = useParams<{
    workspaceSlug: string;
    projectId: string;
    assetId: string;
  }>();
  const searchParams = useSearchParams();
  const name = searchParams?.get("name") ?? "";

  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const canViewFilestore = allowProjectPermissionKeys(
    [PROJECT_ASSET_VIEW_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  const asset = useMemo<TXmindPreviewAsset | null>(() => {
    const id = String(assetId ?? "");
    if (!id) return null;
    return { id, name };
  }, [assetId, name]);

  useEffect(() => {
    const displayName = name || "XMind";
    document.title = `预览：${displayName}`;
  }, [name]);

  if (workspaceUserInfo && workspaceSlug && projectId && !canViewFilestore) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-1">
      <XmindPreviewContent
        asset={asset}
        workspaceSlug={String(workspaceSlug ?? "")}
        projectId={String(projectId ?? "")}
        ready={Boolean(workspaceSlug && projectId && assetId)}
      />
    </div>
  );
}

export default observer(FilestoreXmindPage);

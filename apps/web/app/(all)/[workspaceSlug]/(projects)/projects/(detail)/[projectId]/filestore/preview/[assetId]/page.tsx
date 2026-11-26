"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PROJECT_ASSET_VIEW_PERMISSION_KEY } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { FilestoreFilePreview } from "@/components/filestore/filestore-file-preview";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * 文件模块「复制链接」指向的页面：只有这一个文件的预览，不带文件模块的界面。
 * 系统里点到这种链接走的是当前页面弹窗（FilestorePreviewHost），从系统外点开才到这一页。
 */
function FilestorePreviewPage() {
  const { workspaceSlug, projectId, assetId } = useParams<{
    workspaceSlug: string;
    projectId: string;
    assetId: string;
  }>();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const canView = allowProjectPermissionKeys(
    [PROJECT_ASSET_VIEW_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  if (!workspaceSlug || !projectId || !assetId) return null;
  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <div className="fixed inset-0 z-50">
      <FilestoreFilePreview
        workspaceSlug={String(workspaceSlug)}
        projectId={String(projectId)}
        assetId={String(assetId)}
      />
    </div>
  );
}

export default observer(FilestorePreviewPage);

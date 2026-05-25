/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent } from "react";
import { observer } from "mobx-react";
import { Download } from "lucide-react";

import { useTranslation } from "@plane/i18n";
import { TrashIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
import { convertBytesToSize, getFileExtension, getFileName, renderFormattedDate } from "@plane/utils";
// components
//
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { getFileIcon } from "@/components/icons";
// helpers
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { usePlatformOS } from "@/hooks/use-platform-os";

type TIssueAttachmentsListItem = {
  attachmentId: string;
  disabled?: boolean;
  issueServiceType?: TIssueServiceType;
  onDownload: (attachmentId: string) => Promise<void>;
  onPreview?: (attachmentId: string) => void;
};

export const IssueAttachmentsListItem = observer(function IssueAttachmentsListItem(props: TIssueAttachmentsListItem) {
  const { t } = useTranslation();
  // props
  const { attachmentId, disabled, issueServiceType = EIssueServiceType.ISSUES, onDownload, onPreview } = props;
  // store hooks
  const { getUserDetails } = useMember();
  const {
    attachment: { getAttachmentById },
    toggleDeleteAttachmentModal,
  } = useIssueDetail(issueServiceType);
  // derived values
  const attachment = attachmentId ? getAttachmentById(attachmentId) : undefined;
  const fileName = getFileName(attachment?.attributes.name ?? "");
  const fileExtension = getFileExtension(attachment?.attributes.name ?? "");
  const fileIcon = getFileIcon(fileExtension, 18);
  // hooks
  const { isMobile } = usePlatformOS();

  if (!attachment) return <></>;

  const handleRowClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onPreview) {
      onPreview(attachmentId);
      return;
    }
    void onDownload(attachmentId);
  };

  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  return (
    // 整行作为点击区域：避免点击在 button 周围的 padding/gap 时事件冒泡到外层 dropzone，导致误触发文件上传。
    <div
      role="button"
      tabIndex={0}
      className="group flex h-11 cursor-pointer items-center justify-between gap-3 pr-2 pl-9 hover:bg-surface-2"
      onClick={handleRowClick}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 truncate text-left">
        <div className="flex items-center gap-3 truncate text-13">
          <div className="flex items-center gap-3">{fileIcon}</div>
          <Tooltip tooltipContent={`${fileName}.${fileExtension}`} isMobile={isMobile}>
            <p className="truncate font-medium text-secondary">{`${fileName}.${fileExtension}`}</p>
          </Tooltip>
          <span className="flex size-1.5 rounded-full bg-layer-1" />
          <span className="flex-shrink-0 text-placeholder">{convertBytesToSize(attachment.attributes.size)}</span>
        </div>
      </div>

      {/* 右侧操作区：阻止点击冒泡到整行，避免点击 avatar / 菜单按钮时触发预览或上传。 */}
      <div className="flex items-center gap-3" onClick={stopPropagation}>
        {attachment?.created_by && (
          <Tooltip
            isMobile={isMobile}
            tooltipContent={`${
              getUserDetails(attachment?.created_by)?.display_name ?? ""
            } uploaded on ${renderFormattedDate(attachment.updated_at)}`}
          >
            <div className="flex items-center justify-center">
              <ButtonAvatars showTooltip userIds={attachment?.created_by} />
            </div>
          </Tooltip>
        )}

        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <CustomMenu ellipsis closeOnSelect placement="bottom-end" disabled={disabled}>
            <CustomMenu.MenuItem
              onClick={() => {
                void onDownload(attachmentId);
              }}
            >
              <div className="flex items-center gap-2">
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>下载</span>
              </div>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem
              onClick={() => {
                toggleDeleteAttachmentModal(attachmentId);
              }}
            >
              <div className="flex items-center gap-2">
                <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{t("common.actions.delete")}</span>
              </div>
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
      </div>
    </div>
  );
});

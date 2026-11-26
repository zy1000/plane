/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Modal, Typography } from "antd";
import { OnlyOfficePreviewContent } from "./onlyoffice-preview-content";

type TOnlyOfficePreviewModalProps = {
  open: boolean;
  onClose: () => void;
  afterOpenChange?: (open: boolean) => void;
  workspaceSlug: string;
  /** 不传 = 需求级附件：走工作区级只读预览端点（那类资产没有 project_id） */
  projectId?: string;
  assetId: string;
  fileName?: string;
};

export const OnlyOfficePreviewModal = observer(function OnlyOfficePreviewModal(props: TOnlyOfficePreviewModalProps) {
  const { open, onClose, afterOpenChange, workspaceSlug, projectId, assetId, fileName } = props;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={afterOpenChange}
      footer={null}
      modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
      width="100vw"
      style={{ top: 0, paddingBottom: 0 }}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
      title={
        <Typography.Text strong style={{ marginTop: -16, marginBottom: -16 }}>
          预览：{fileName ?? "文件"}
        </Typography.Text>
      }
    >
      <div style={{ height: "calc(100vh - 56px)" }}>
        {/* 关闭即卸载：预览本体随挂载加载、随卸载销毁；外层留着高度，关闭动画里弹窗不塌 */}
        {open && (
          <OnlyOfficePreviewContent
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            assetId={assetId}
            style={{ height: "100%" }}
          />
        )}
      </div>
    </Modal>
  );
});

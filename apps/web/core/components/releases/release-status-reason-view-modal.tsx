/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Input, Modal } from "antd";
import type { TReleaseStatus } from "@plane/types";
import { getReleaseStatusDetails } from "./release-status-config";

type Props = {
  open: boolean;
  reason: string;
  status?: TReleaseStatus | null;
  onClose: () => void;
};

export function ReleaseStatusReasonViewModal(props: Props) {
  const { open, reason, status, onClose } = props;
  const statusLabel = status ? getReleaseStatusDetails(status).label : "";
  const title = statusLabel ? `状态变更为「${statusLabel}」的原因` : "状态变更原因";

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
    >
      <div className="space-y-2 py-2">
        <Input.TextArea
          value={reason}
          autoSize={{ minRows: 14, maxRows: 40 }}
          readOnly
        />
      </div>
    </Modal>
  );
}

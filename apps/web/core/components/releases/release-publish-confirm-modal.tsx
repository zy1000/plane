/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "antd";
import { useTranslation } from "@plane/i18n";
import type { TProjectRequirement } from "@plane/types";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";

type Props = {
  open: boolean;
  loading?: boolean;
  /** 在途变更（is_locked）的关联需求，黄标列出 */
  requirements: TProjectRequirement[];
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 发布（completed）前的软提示：关联需求里还有在途变更的行时先确认一次。
 *
 * 铁律是「需求永不阻塞交付域」—— 这里只提示不拦截，确认后照常提交状态变更。
 * 与 ReleaseStatusReasonModal 同一套 antd Modal 形状，但用黄色警示而非必填原因。
 */
export function ReleasePublishConfirmModal(props: Props) {
  const { open, loading, requirements, onCancel, onConfirm } = props;
  const { t } = useTranslation();

  return (
    <Modal
      title={t("project_requirements.release_publish_confirm.title")}
      open={open}
      onOk={onConfirm}
      onCancel={onCancel}
      okText={t("project_requirements.release_publish_confirm.confirm")}
      cancelText={t("project_requirements.release_publish_confirm.cancel")}
      okButtonProps={{ loading }}
      destroyOnClose
      maskClosable={!loading}
      width={560}
    >
      <div className="space-y-3 py-2">
        <div className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-primary">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t("project_requirements.release_publish_confirm.body", { count: requirements.length })}</span>
        </div>
        <ul className="max-h-60 overflow-y-auto rounded-md border border-subtle px-3 py-1">
          {requirements.map((row) => (
            <li key={row.id} className="flex min-w-0 items-center gap-2 py-1.5 text-sm text-primary">
              <RequirementIdentifier displayId={row.display_id} />
              <span className="min-w-0 flex-1 truncate" title={row.title}>
                {row.title}
              </span>
              <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded bg-warning-subtle px-1.5 text-11 font-medium text-warning-primary">
                {t("requirement_approval.state.in_review")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

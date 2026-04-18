/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ComponentType, ReactNode } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal } from "antd";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** 标题旁灰色说明，如「共 N 条」 */
  badgeText?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
};

/**
 * 与项目统计页 StatisticExpandModal 一致的全屏弹层（仅外壳与关闭交互）。
 */
export function CycleOverviewFullscreenModal({ isOpen, onClose, title, badgeText, icon: Icon, children }: Props) {
  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-3 pr-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-placeholder" /> : null}
          <span className="text-base font-medium text-primary">{title}</span>
          {badgeText ? <span className="text-sm font-normal text-placeholder">{badgeText}</span> : null}
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      footer={null}
      closable
      closeIcon={
        <span className="inline-flex items-center gap-2 text-sm font-normal text-primary transition-colors">
          <CloseOutlined className="text-base text-inherit" />
          <span>退出全屏</span>
        </span>
      }
      centered={false}
      width="100%"
      style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
      className="[&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary [&_.ant-modal-close]:group [&_.ant-modal-close-x]:!h-auto [&_.ant-modal-close-x]:!w-auto"
      classNames={{ wrapper: "!p-0", header: "!mb-0 border-b border-subtle" }}
      styles={{
        content: {
          height: "100vh",
          maxHeight: "100vh",
          borderRadius: 0,
          boxShadow: "none",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          margin: 0,
        },
        header: {
          flexShrink: 0,
          margin: 0,
          borderRadius: 0,
          padding: "16px 20px",
          minHeight: 64,
          display: "flex",
          alignItems: "center",
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
      }}
      destroyOnClose
      getContainer={() => document.body}
    >
      {children}
    </Modal>
  );
}

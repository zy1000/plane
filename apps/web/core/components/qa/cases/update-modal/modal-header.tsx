"use client";
import React from "react";

type ModalHeaderProps = {
  onClose: () => void;
  caseId?: string;
};

export function ModalHeader({ onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
      <h3 className="text-base font-medium">用例详情</h3>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded p-1 text-tertiary hover:bg-layer-1-hover"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}

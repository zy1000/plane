"use client";
import React from "react";
import { message } from "antd";
import { Copy } from "lucide-react";

type ModalHeaderProps = {
  onClose: () => void;
  caseId?: string;
};

export function ModalHeader({ onClose }: ModalHeaderProps) {
  const [isCopying, setIsCopying] = React.useState(false);

  const copyLink = async () => {
    setIsCopying(true);
    try {
      if (typeof window === "undefined") throw new Error("复制链接失败");
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) throw new Error("复制失败，请手动复制");
      }
      message.success("链接已复制到剪贴板");
    } catch (err: any) {
      message.error(err?.message || "复制链接失败");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-medium">用例详情</h3>
        <button
          type="button"
          className={`rounded p-1 text-gray-600 hover:bg-gray-100 active:scale-95 transition-transform ${
            isCopying ? "opacity-70" : ""
          }`}
          onClick={copyLink}
          aria-label="复制链接"
          title="复制链接"
        >
          <Copy size={16} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded p-1 text-gray-500 hover:bg-gray-100"
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

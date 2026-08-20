"use client";
import React from "react";

type TitleInputProps = {
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  code?: string;
  onCodeChange?: (v: string) => void;
  onCodeBlur?: () => void;
};

export function TitleInput({
  disabled = false,
  value,
  onChange,
  onBlur,
  code,
  onCodeChange,
  onCodeBlur,
}: TitleInputProps) {
  return (
    <div className="mb-3">
      <input
        type="text"
        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold text-primary outline-none transition-colors hover:border-subtle focus:border-accent-strong disabled:cursor-not-allowed disabled:text-secondary disabled:hover:border-transparent"
        disabled={disabled}
        placeholder="请输入用例标题"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <input
        type="text"
        value={code ?? ""}
        onChange={(e) => onCodeChange?.(e.target.value)}
        onBlur={onCodeBlur}
        disabled={disabled}
        placeholder="用例编号"
        aria-label="用例编号"
        className="w-full bg-transparent px-2 text-xs text-tertiary outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}

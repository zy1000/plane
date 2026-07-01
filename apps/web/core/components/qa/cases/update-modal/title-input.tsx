"use client";
import React from "react";

type TitleInputProps = {
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
};

export function TitleInput({ disabled = false, value, onChange, onBlur }: TitleInputProps) {
  return (
    <div className="mb-5">
      <input
        type="text"
        className="focus:border-blue-500 focus:ring-blue-300 w-full rounded-md border border-transparent bg-white px-3 py-2 text-xl hover:border-black focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:text-secondary disabled:hover:border-transparent"
        disabled={disabled}
        placeholder="请输入用例标题"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

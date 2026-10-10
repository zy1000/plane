"use client";

import { useRef, useState } from "react";

type Props = {
  initialValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

/** 树里的行内输入框：回车 / 失焦提交，Esc 取消；自管 value，避免树重渲染打断输入法 */
export const ModuleTreeInput = ({ initialValue = "", placeholder = "模块名称", onCommit, onCancel }: Props) => {
  const [value, setValue] = useState(initialValue);
  const doneRef = useRef(false);
  const composingRef = useRef(false);

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      type="text"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-[26px] w-full min-w-0 rounded-md border border-accent-strong bg-surface-1 px-2 text-13 text-primary ring-2 ring-accent-subtle outline-none placeholder:text-placeholder"
      onChange={(e) => setValue(e.target.value)}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (composingRef.current) return;
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
};

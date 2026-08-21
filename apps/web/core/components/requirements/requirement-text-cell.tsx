/**
 * 单行文本的单元格：平时是普通输入框，点展开进弹窗用大文本框改。
 *
 * 值就是纯字符串，不像富文本要在 HTML 与文本之间转换；弹窗只解决「160px 列宽下
 * 一句稍长的话看不全」这一件事。
 */
import { useState } from "react";
import { DraftInput } from "./draft-input";
import {
  EXPANDABLE_CELL_INPUT_CLASS,
  ExpandableCell,
  ExpandableCellModal,
  type TExpandableCellVariant,
} from "./expandable-cell";

/** 单行文本不收换行：弹窗里 Enter 不插入，粘贴进来的换行折成空格 */
const toSingleLine = (text: string) => text.replace(/\r?\n/g, " ");

export const RequirementTextCell = ({
  value,
  onChange,
  placeholder,
  label,
  variant = "grid",
  deferCommit = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 弹窗标题里的字段名 */
  label: string;
  variant?: TExpandableCellVariant;
  /** 内联输入框失焦 / 回车才提交，给「onChange 即一次 PATCH」的场景用；与 deferTextCommit 同义 */
  deferCommit?: boolean;
}) => {
  // null = 弹窗关着
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <>
      <ExpandableCell variant={variant} onExpand={() => setDraft(value)}>
        {deferCommit ? (
          <DraftInput
            value={value}
            onCommit={onChange}
            className={EXPANDABLE_CELL_INPUT_CLASS}
            placeholder={placeholder}
          />
        ) : (
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={EXPANDABLE_CELL_INPUT_CLASS}
            placeholder={placeholder}
          />
        )}
      </ExpandableCell>
      <ExpandableCellModal
        open={draft !== null}
        label={label}
        onCancel={() => setDraft(null)}
        onOk={() => {
          if (draft !== null && draft !== value) onChange(draft);
          setDraft(null);
        }}
      >
        <textarea
          autoFocus
          value={draft ?? ""}
          onChange={(event) => setDraft(toSingleLine(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder={placeholder}
          className="min-h-[160px] w-full resize-y rounded-md border border-subtle bg-surface-1 p-3 text-13 leading-5 text-primary outline-none placeholder:text-placeholder focus:border-accent-primary"
        />
      </ExpandableCellModal>
    </>
  );
};

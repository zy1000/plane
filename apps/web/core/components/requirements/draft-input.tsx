/**
 * 文本输入的草稿层：敲字只落本地，失焦 / 回车才提交一次。
 *
 * 需求的每次提交都是一整行 PATCH，后端还带严格的乐观锁（version 不等即 409），
 * 逐字符提交既会把输入拖卡，也会让并发请求互相撞版本。仓库里标题
 * （requirement-detail-content.tsx）和富文本（requirement-rich-text.tsx）早就这么做了，
 * 这里把同一套约定收成一个组件，给自定义文本字段和子表单文本单元格共用。
 *
 * 与工作项那侧的分流一致（issues/issue-detail/extra-fields-section.tsx）：
 * 文本类走草稿，select / date / boolean 这类离散值仍然 onChange 即提交 —— 后者
 * 一次点击就是一个完整意图，压后提交反而让人以为没生效。
 */
import { useEffect, useRef, useState } from "react";

type TProps = {
  value: string;
  /** 只在草稿与 value 真的不同时才会被调用 */
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** 段落型文本要能换行，就把回车提交关掉 */
  commitOnEnter?: boolean;
  /** 挂载时抢焦点。网格里内联新增一行后，让光标直接落在新行的标题上 */
  autoFocus?: boolean;
};

export const DraftInput = ({
  value,
  onCommit,
  className,
  placeholder,
  maxLength,
  disabled,
  commitOnEnter = true,
  autoFocus = false,
}: TProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // null = 没有草稿，直接显示服务端值
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  // 已经提交、还在等服务端回话的那份内容
  const committedRef = useRef<string | null>(null);

  const clearDraft = () => {
    draftRef.current = null;
    committedRef.current = null;
    setDraft(null);
  };

  // 卸载时要读到最新的 value / onCommit，不能用捕获那一帧的闭包
  const commitRef = useRef<() => void>(() => {});
  commitRef.current = () => {
    const next = draftRef.current;
    if (next === null) return;
    if (next === value) {
      clearDraft();
      return;
    }
    // 草稿留到服务端值回来再撤：立刻清会让输入框闪回旧值，等一个 RTT 才跳成新的
    committedRef.current = next;
    onCommit(next);
  };

  // 敲完直接关抽屉 / 切换需求时不能把没提交的字丢掉
  useEffect(() => () => commitRef.current(), []);

  /*
   * 用 effect 而不是 input 的 autoFocus 属性：新增的行是异步落库后才出现的，
   * 挂载时机跟着接口回话走，原生 autoFocus 在这种场景下不稳。顺带把行滚进视野。
   */
  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [autoFocus]);

  useEffect(() => {
    // 提交后又接着敲了新内容，这次回话不该把它盖掉
    if (committedRef.current === null || draftRef.current !== committedRef.current) return;
    clearDraft();
  }, [value]);

  return (
    <input
      ref={inputRef}
      value={draft ?? value}
      onChange={(event) => {
        draftRef.current = event.target.value;
        setDraft(event.target.value);
      }}
      onBlur={() => commitRef.current()}
      onKeyDown={(event) => {
        if (commitOnEnter && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          // 先丢草稿再失焦，否则 blur 会把刚撤销的内容又提交上去
          clearDraft();
          event.currentTarget.blur();
        }
      }}
      className={className}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
    />
  );
};

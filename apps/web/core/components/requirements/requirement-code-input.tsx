/**
 * 标准库条目编号的行内输入。
 *
 * 编号是手填文本：不校验格式，但必填非空、库内唯一（服务端查重）。这里只管
 * 提交时机与空值兜底 —— blur / 回车提交，trim 后为空或与原值相同则**还原不提交**
 * （清空不是合法操作，重复由服务端按行报错）。网格编号列与详情抽屉共用。
 *
 * 不复用 DraftInput：它对「提交空值」的处理是照发（标题允许留空），而编号的空值
 * 必须回弹显示原值，语义装不进同一个组件。
 */
import { useEffect, useRef, useState } from "react";

type TProps = {
  value: string;
  /** 只在 trim 后非空且与 value 不同的情况下被调用 */
  onCommit: (code: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
};

export const RequirementCodeInput = ({ value, onCommit, className, placeholder, disabled }: TProps) => {
  const [draft, setDraft] = useState(value);
  // blur 在 Escape 的 setState 重渲染之前同步触发，提交必须读 ref 里的当下值
  const draftRef = useRef(value);

  const applyDraft = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };

  // 服务端回填（保存成功 / 别处改动）后同步显示值。编辑中的提交只发生在 blur，
  // 而 value 只会因我们自己的提交回话而变，不会冲掉正在敲的字
  useEffect(() => {
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draftRef.current.trim();
    if (!next || next === value) {
      applyDraft(value);
      return;
    }
    onCommit(next);
  };

  return (
    <input
      value={draft}
      onChange={(event) => applyDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          applyDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={255}
    />
  );
};

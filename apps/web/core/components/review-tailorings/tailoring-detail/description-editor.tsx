import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlignLeft, Check, ChevronDown, Pencil } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

const I18N = "review_tailoring.detail";

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border border-b-2 border-strong bg-surface-1 px-1 font-sans text-11 text-tertiary">
    {children}
  </kbd>
);

/** 输入框高度跟着内容走：先塌到 auto 再按 scrollHeight 撑开 */
const fitHeight = (element: HTMLTextAreaElement | null) => {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
};

/**
 * 标题下的描述：一段可以就地改的正文。
 *
 * - 没写时是一行浅色「添加描述…」，悬停出浅底；
 * - 点正文（或悬停出现的铅笔）原地变输入框，字号行高不变、高度随内容长；
 * - 没有按钮：点空白处或 Ctrl/Cmd + Enter 保存，Esc 放弃；保存后行尾闪一下「已保存」；
 * - 超过两行默认折叠；只读时只是一段字，没描述就整块不显示。
 *
 * 只收发纯文本，HTML 的转换留给调用方。
 */
export const DescriptionEditor = ({
  value,
  editable,
  onSave,
}: {
  value: string;
  editable: boolean;
  onSave: (text: string) => void;
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  /** Esc 走的也是 blur，靠这个标记区分「放弃」和「保存」 */
  const isCancellingRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  // 折叠时量一下是否真的超过两行，没超过就不给「展开全部」
  useLayoutEffect(() => {
    if (isEditing || isExpanded || !textRef.current) return;
    setIsClamped(textRef.current.scrollHeight > textRef.current.clientHeight + 1);
  }, [value, isEditing, isExpanded]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  // 进编辑：聚焦、光标放到末尾、按内容撑开高度
  useLayoutEffect(() => {
    if (!isEditing || !areaRef.current) return;
    const element = areaRef.current;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    fitHeight(element);
  }, [isEditing]);

  const startEditing = () => {
    if (!editable) return;
    isCancellingRef.current = false;
    setDraft(value);
    setIsEditing(true);
  };

  const finishEditing = () => {
    const next = draft.trim();
    if (!isCancellingRef.current && next !== value) {
      onSave(next);
      setJustSaved(true);
    }
    isCancellingRef.current = false;
    setIsEditing(false);
  };

  if (!editable && !value) return null;

  if (isEditing) {
    return (
      <div className="relative -mx-2.5 max-w-[720px] rounded-lg border border-accent-strong bg-surface-1 px-2.5 pt-1.5 pb-8 shadow-[0_0_0_3px_color-mix(in_srgb,var(--background-color-accent-primary)_16%,transparent)]">
        <textarea
          ref={areaRef}
          id="review-tailoring-description"
          rows={1}
          value={draft}
          placeholder={t(`${I18N}.description_placeholder`)}
          onChange={(event) => {
            setDraft(event.target.value);
            fitHeight(event.target);
          }}
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              isCancellingRef.current = true;
              event.currentTarget.blur();
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="block w-full resize-none overflow-hidden bg-transparent text-14 leading-[1.65] text-primary outline-none placeholder:text-placeholder"
        />
        <div className="absolute inset-x-2.5 bottom-1.5 flex items-center gap-1 text-12 text-placeholder">
          <Kbd>Ctrl</Kbd>
          <span>+</span>
          <Kbd>Enter</Kbd>
          <span>{t(`${I18N}.description_save_hint`)}</span>
          <span className="mx-0.5">·</span>
          <Kbd>Esc</Kbd>
          <span>{t("cancel")}</span>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        className="-mx-2.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-14 text-placeholder transition-colors hover:bg-layer-transparent-hover hover:text-tertiary"
        onClick={startEditing}
      >
        <AlignLeft className="size-3.5" />
        {t(`${I18N}.description_placeholder`)}
      </button>
    );
  }

  return (
    <div className="group/desc relative -mx-2.5 max-w-[720px]">
      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        className={cn(
          "rounded-lg px-2.5 py-1.5",
          editable && "cursor-text pr-10 transition-colors hover:bg-layer-transparent-hover"
        )}
        onClick={startEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter") startEditing();
        }}
      >
        <p
          ref={textRef}
          className={cn("text-14 leading-[1.65] whitespace-pre-line text-secondary", !isExpanded && "line-clamp-2")}
        >
          {value}
          {justSaved && (
            <span className="ml-2.5 inline-flex items-center gap-1 align-[1px] text-12 text-success-primary">
              <Check className="size-3" strokeWidth={2.6} />
              {t(`${I18N}.description_saved`)}
            </span>
          )}
        </p>
      </div>
      {editable && (
        <button
          type="button"
          aria-label={t(`${I18N}.description_placeholder`)}
          className="absolute top-1.5 right-2 grid size-6 place-items-center rounded-md bg-surface-1 text-tertiary opacity-0 shadow-raised-100 transition-opacity group-hover/desc:opacity-100 hover:text-primary focus-visible:opacity-100"
          onClick={startEditing}
        >
          <Pencil className="size-3" />
        </button>
      )}
      {(isClamped || isExpanded) && (
        <button
          type="button"
          className="mt-0.5 ml-2.5 inline-flex items-center gap-1 text-13 font-medium text-tertiary hover:text-secondary"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {t(isExpanded ? `${I18N}.description_collapse` : `${I18N}.description_expand`)}
          <ChevronDown className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
};

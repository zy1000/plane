/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CheckIcon, CloseIcon, SearchIcon } from "@plane/propel/icons";
import type { IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
// helpers
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { buildMemberOptionRows, getDepartmentLeafName } from "./member-option-rows";
import type { TMemberOptionHeaderRow, TMemberOptionMemberRow, TMemberOptionRow } from "./member-option-rows";

const MEMBER_ROW_HEIGHT = 36;
const HEADER_ROW_HEIGHT = 30;
/** 非首个分组标题上方的留白（分隔线画在留白下面） */
const HEADER_GAP = 6;
const LIST_PADDING = 6;
const LIST_MAX_HEIGHT = 384;

const getRowSize = (row: TMemberOptionRow | undefined, index: number) =>
  row?.type === "header" ? HEADER_ROW_HEIGHT + (index === 0 ? 0 : HEADER_GAP) : MEMBER_ROW_HEIGHT;

/** 从后往前找第一个满足条件的元素（apps/web 的 lib 没有 Array.prototype.findLast） */
const findLastIndexValue = (indexes: number[], predicate: (index: number) => boolean) => {
  for (let i = indexes.length - 1; i >= 0; i--) if (predicate(indexes[i])) return indexes[i];
  return undefined;
};

type TActiveState = { index: number | null; source: "keyboard" | "pointer" };

function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  const index = keyword ? text.toLowerCase().indexOf(keyword) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <span className="font-semibold text-accent-primary">{text.slice(index, index + keyword.length)}</span>
      {text.slice(index + keyword.length)}
    </>
  );
}

function MemberOptionHeader(props: { row: TMemberOptionHeaderRow; keyword: string; showDivider: boolean }) {
  const { row, keyword, showDivider } = props;
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col justify-end">
      <div
        className={cn(
          "flex h-[30px] flex-shrink-0 items-center gap-1.5 px-2.5 text-12 font-medium text-tertiary",
          showDivider && "border-t border-subtle"
        )}
      >
        <span className="min-w-0 truncate" title={row.department ?? undefined}>
          {row.department === null ? (
            t("member_dropdown.no_department")
          ) : row.isSameDepartment ? (
            <>
              <span className="text-secondary">{t("member_dropdown.same_department")} · </span>
              {getDepartmentLeafName(row.department)}
            </>
          ) : (
            <HighlightedText text={row.department} keyword={keyword} />
          )}
        </span>
        <span className="ml-auto flex-shrink-0 font-normal text-placeholder tabular-nums">{row.count}</span>
      </div>
    </div>
  );
}

type TMemberOptionItemProps = {
  row: TMemberOptionMemberRow;
  user: IUserLite | undefined;
  isCurrentUser: boolean;
  isActive: boolean;
  isSelected: boolean;
  keyword: string;
  viewOnly: boolean;
};

function MemberOptionItem(props: TMemberOptionItemProps) {
  const { row, user, isCurrentUser, isActive, isSelected, keyword, viewOnly } = props;
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex h-full w-full items-center gap-2.5 rounded-md px-2.5 select-none",
        !viewOnly && "cursor-pointer",
        isActive && "bg-layer-transparent-hover"
      )}
    >
      <Avatar
        name={user?.display_name}
        src={getFileURL(user?.avatar_url ?? "")}
        size={22}
        showTooltip={false}
        fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(user)}
      />
      <span className={cn("min-w-0 truncate text-13 font-medium", isSelected ? "text-accent-primary" : "text-primary")}>
        {isCurrentUser ? t("you") : <HighlightedText text={user?.display_name ?? ""} keyword={keyword} />}
      </span>
      <span className="ml-auto flex max-w-[55%] min-w-0 flex-shrink-0 items-center gap-1.5">
        {row.departmentLabel && (
          <span className="truncate text-12 text-tertiary" title={row.department ?? undefined}>
            {row.departmentLabel}
          </span>
        )}
        {row.employeeId && (
          <span className="flex-shrink-0 rounded-sm bg-layer-1 px-1.5 text-11 leading-5 text-secondary tabular-nums">
            {row.employeeId}
          </span>
        )}
      </span>
      <span className="flex size-4 flex-shrink-0 items-center justify-center text-accent-primary">
        {isSelected && <CheckIcon className="size-3.5" />}
      </span>
    </div>
  );
}

interface Props {
  className?: string;
  getUserDetails: (userId: string) => IUserLite | undefined;
  /** 候选人是整个工作区时按部门分组；项目成员等小名单保持平铺 */
  groupByDepartment?: boolean;
  isOpen: boolean;
  memberIds?: string[];
  multiple?: boolean;
  onDropdownOpen?: () => void;
  onSelect: (val: string | string[]) => void;
  optionsClassName?: string;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string[] | string | null;
  viewOnly?: boolean;
  caption?: string;
}

/**
 * 人员下拉的弹层。列表只挂载可视区附近的几十行（成员同步后工作区有 800+ 人），
 * 不再用 Headless UI 的 Combobox.Option：它每注册一个选项都要把全部选项按 DOM 位置重排，800 项打开要卡数秒。
 */
export const MemberOptions = observer(function MemberOptions(props: Props) {
  const {
    getUserDetails,
    groupByDepartment = false,
    isOpen,
    memberIds,
    multiple = false,
    onDropdownOpen,
    onSelect,
    optionsClassName = "",
    placement,
    referenceElement,
    value,
    viewOnly = false,
    caption,
  } = props;
  // router
  const { workspaceSlug } = useParams();
  // refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickyIndexRef = useRef<number | null>(null);
  // states
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<TActiveState>({ index: null, source: "pointer" });
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const listboxId = useId();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { data: currentUser } = useUser();
  const {
    workspace: { isUserSuspended },
  } = useMember();
  const { isMobile } = usePlatformOS();
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  useEffect(() => {
    if (isOpen) {
      onDropdownOpen?.();
      if (!isMobile) {
        inputRef.current && inputRef.current.focus();
      }
    }
  }, [isOpen, isMobile]);

  const selectedIds = Array.isArray(value) ? value : value ? [value] : [];
  const keyword = viewOnly ? "" : query.trim().toLowerCase();

  // 停用成员不能再被选，选择器里直接不列；只读回显仍保留已选中的人
  const workspaceSlugValue = workspaceSlug?.toString();
  const candidateIds = memberIds?.filter((userId) => viewOnly || !isUserSuspended(userId, workspaceSlugValue));
  const rows = candidateIds
    ? buildMemberOptionRows({
        memberIds: candidateIds,
        getUserDetails,
        query: keyword,
        selectedIds,
        currentUserId: currentUser?.id,
        groupByDepartment: groupByDepartment && !viewOnly,
      })
    : undefined;
  const rowCount = rows?.length ?? 0;
  const headerIndexes: number[] = [];
  const memberIndexes: number[] = [];
  rows?.forEach((row, index) => (row.type === "header" ? headerIndexes : memberIndexes).push(index));

  // 没有活动项时：输入了关键字就把第一个结果当作活动项，回车直接选中；没输入则不高亮
  const activeIndex =
    active.index !== null && rows?.[active.index]?.type === "member"
      ? active.index
      : keyword
        ? (memberIndexes[0] ?? null)
        : null;

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rowCount,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => getRowSize(rows?.[index], index),
    // 行高按行类型变化，key 跟着行走，行变了（搜索、勾选置顶）就重新算位置
    getItemKey: (index) => rows?.[index]?.key ?? index,
    initialRect: { width: 0, height: LIST_MAX_HEIGHT },
    paddingStart: LIST_PADDING,
    paddingEnd: LIST_PADDING,
    overscan: 8,
    // 所在部门的标题吸顶：始终把它放进渲染范围
    rangeExtractor: (range: Range) => {
      const stickyIndex = findLastIndexValue(headerIndexes, (index) => index <= range.startIndex) ?? null;
      stickyIndexRef.current = stickyIndex;
      const indexes = defaultRangeExtractor(range);
      return stickyIndex === null || indexes.includes(stickyIndex) ? indexes : [stickyIndex, ...indexes];
    },
  });

  // 键盘移动活动项时跟随滚动；鼠标悬停不滚
  useEffect(() => {
    if (active.index !== null && active.source === "keyboard") virtualizer.scrollToIndex(active.index);
  }, [active, virtualizer]);

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setActive({ index: null, source: "pointer" });
    listRef.current?.scrollTo({ top: 0 });
  };

  const selectMember = (userId: string) => {
    if (!multiple) {
      onSelect(userId);
      return;
    }
    onSelect(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  };

  const moveActive = (index: number | undefined) => {
    if (index !== undefined) setActive({ index, source: "keyboard" });
  };

  const searchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        moveActive(
          activeIndex === null ? memberIndexes[0] : memberIndexes.find((index) => index > activeIndex)
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        moveActive(
          activeIndex === null
            ? memberIndexes[memberIndexes.length - 1]
            : findLastIndexValue(memberIndexes, (index) => index < activeIndex)
        );
        break;
      case "Home":
      case "PageUp":
        e.preventDefault();
        e.stopPropagation();
        moveActive(memberIndexes[0]);
        break;
      case "End":
      case "PageDown":
        e.preventDefault();
        e.stopPropagation();
        moveActive(memberIndexes[memberIndexes.length - 1]);
        break;
      case "Enter": {
        if (e.nativeEvent.isComposing) return;
        const activeRow = activeIndex !== null ? rows?.[activeIndex] : undefined;
        if (activeRow?.type === "member") {
          e.preventDefault();
          e.stopPropagation();
          selectMember(activeRow.userId);
        } else if (keyword) {
          // 搜索无结果时回车不关闭下拉
          e.preventDefault();
          e.stopPropagation();
        }
        // 没输入也没高亮任何人时交给外层，回车关闭下拉
        break;
      }
      case "Escape":
        if (query !== "") {
          e.stopPropagation();
          handleQueryChange("");
        }
        break;
    }
  };

  return createPortal(
    <div
      data-prevent-outside-click
      className={cn(
        "z-30 my-1 w-[340px] overflow-hidden rounded-lg border-[0.5px] border-strong bg-surface-1 shadow-raised-200 focus:outline-none",
        optionsClassName
      )}
      ref={setPopperElement}
      style={{
        ...styles.popper,
      }}
      {...attributes.popper}
    >
      {viewOnly && caption ? <div className="truncate px-3 pt-2.5 text-11 text-tertiary">{caption}</div> : null}
      {!viewOnly && (
        <div className="border-b border-subtle p-2">
          <div className="flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-2 pr-1.5 pl-2.5 focus-within:border-accent-strong">
            <SearchIcon className="size-3.5 flex-shrink-0 text-placeholder" strokeWidth={1.5} />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex !== null ? `${listboxId}-${activeIndex}` : undefined}
              aria-label={t("member_dropdown.search_placeholder")}
              className="w-full min-w-0 bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={t("member_dropdown.search_placeholder")}
              onKeyDown={searchInputKeyDown}
            />
            {query !== "" && (
              <button
                type="button"
                aria-label={t("member_dropdown.clear_search")}
                className="grid size-6 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover"
                onClick={() => {
                  handleQueryChange("");
                  inputRef.current?.focus();
                }}
              >
                <CloseIcon className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      {!rows ? (
        <p className="px-3 py-2.5 text-12 text-placeholder italic">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-2.5 text-12 text-placeholder italic">{t("no_matching_results")}</p>
      ) : (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable={multiple || undefined}
          ref={listRef}
          className="vertical-scrollbar scrollbar-xs max-h-96 overflow-y-auto"
          onMouseLeave={() => setActive({ index: null, source: "pointer" })}
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (row.type === "header") {
                // 标题本身已经滚出顶部时才吸顶，原位可见时照常排在列表里
                const scrollOffset = virtualizer.scrollOffset ?? 0;
                const isStuck = item.index === stickyIndexRef.current && item.start < scrollOffset;
                // 下一个部门标题滚上来时把吸顶标题往上顶走，而不是从它底下穿过去
                const nextHeaderIndex = headerIndexes.find((index) => index > item.index);
                const nextHeaderStart =
                  nextHeaderIndex !== undefined ? virtualizer.measurementsCache[nextHeaderIndex]?.start : undefined;
                const stuckTop =
                  nextHeaderStart !== undefined
                    ? Math.min(0, nextHeaderStart + HEADER_GAP - scrollOffset - HEADER_ROW_HEIGHT)
                    : 0;
                return (
                  <div
                    key={row.key}
                    role="presentation"
                    className={cn(
                      "left-0 w-full px-1.5",
                      isStuck ? "sticky z-10 border-b border-subtle bg-surface-1" : "absolute top-0"
                    )}
                    style={
                      isStuck
                        ? { height: HEADER_ROW_HEIGHT, top: stuckTop }
                        : { height: item.size, transform: `translateY(${item.start}px)` }
                    }
                  >
                    <MemberOptionHeader row={row} keyword={keyword} showDivider={item.index > 0 && !isStuck} />
                  </div>
                );
              }
              const isSelected = selectedIds.includes(row.userId);
              return (
                <div
                  key={row.key}
                  id={`${listboxId}-${item.index}`}
                  role="option"
                  aria-selected={isSelected}
                  className="absolute top-0 left-0 w-full px-1.5"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  // 点选时不让搜索框失焦，多选连续勾人还能接着用键盘
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => {
                    if (!viewOnly && active.index !== item.index) setActive({ index: item.index, source: "pointer" });
                  }}
                  onClick={() => {
                    if (!viewOnly) selectMember(row.userId);
                  }}
                >
                  <MemberOptionItem
                    row={row}
                    user={getUserDetails(row.userId)}
                    isCurrentUser={currentUser?.id === row.userId}
                    isActive={!viewOnly && activeIndex === item.index}
                    isSelected={isSelected}
                    keyword={keyword}
                    viewOnly={viewOnly}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
});

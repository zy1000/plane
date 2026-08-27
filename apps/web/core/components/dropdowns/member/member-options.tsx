/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import type { IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, sortByCurrentUserThenSelected } from "@plane/utils";
// helpers
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { usePlatformOS } from "@/hooks/use-platform-os";

interface Props {
  className?: string;
  getUserDetails: (userId: string) => IUserLite | undefined;
  isOpen: boolean;
  memberIds?: string[];
  onDropdownOpen?: () => void;
  optionsClassName?: string;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string[] | string | null;
  viewOnly?: boolean;
}

export const MemberOptions = observer(function MemberOptions(props: Props) {
  const {
    getUserDetails,
    isOpen,
    memberIds,
    onDropdownOpen,
    optionsClassName = "",
    placement,
    referenceElement,
    value,
    viewOnly = false,
  } = props;
  // router
  const { workspaceSlug } = useParams();
  // refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  // states
  const [query, setQuery] = useState("");
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
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

  const searchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (query !== "" && e.key === "Escape") {
      e.stopPropagation();
      setQuery("");
    }
  };

  // 停用成员不能再被选，选择器里直接不列；只读回显仍保留已选中的人
  const workspaceSlugValue = workspaceSlug?.toString();
  const options = memberIds
    ?.filter((userId) => viewOnly || !isUserSuspended(userId, workspaceSlugValue))
    .map((userId) => {
      const userDetails = getUserDetails(userId);
      return {
        value: userId,
        query: `${userDetails?.display_name} ${userDetails?.first_name} ${userDetails?.last_name}`,
        content: (
          <div className="flex items-center gap-2">
            <div className="w-4">
              <Avatar
                name={userDetails?.display_name}
                src={getFileURL(userDetails?.avatar_url ?? "")}
                fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(userDetails)}
              />
            </div>
            <span className="flex-grow truncate">
              {currentUser?.id === userId ? t("you") : userDetails?.display_name}
            </span>
          </div>
        ),
      };
    })
    .filter((o) => !!o);

  const filteredOptions = sortByCurrentUserThenSelected(
    query === "" ? options : options?.filter((o) => o?.query.toLowerCase().includes(query.toLowerCase())),
    value,
    currentUser?.id
  );

  return createPortal(
    <Combobox.Options data-prevent-outside-click static>
      <div
        className={cn(
          "z-30 my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none",
          optionsClassName
        )}
        ref={setPopperElement}
        style={{
          ...styles.popper,
        }}
        {...attributes.popper}
      >
        {!viewOnly && (
          <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
            <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
            <Combobox.Input
              as="input"
              ref={inputRef}
              className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              displayValue={(assigned: any) => assigned?.name}
              onKeyDown={searchInputKeyDown}
            />
          </div>
        )}
        <div className={cn("max-h-48 space-y-1 overflow-y-scroll", !viewOnly && "mt-2")}>
          {filteredOptions ? (
            filteredOptions.length > 0 ? (
              filteredOptions.map(
                (option) =>
                  option &&
                  (viewOnly ? (
                    <div
                      key={option.value}
                      className="flex w-full items-center gap-2 truncate rounded-sm px-1 py-1.5 text-secondary select-none"
                    >
                      {option.content}
                    </div>
                  ) : (
                    <Combobox.Option
                      key={option.value}
                      value={option.value}
                      className={({ active, selected }) =>
                        cn(
                          "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                          active && "bg-layer-transparent-hover",
                          selected ? "text-primary" : "text-secondary"
                        )
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span className="flex-grow truncate">{option.content}</span>
                          {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                        </>
                      )}
                    </Combobox.Option>
                  ))
              )
            ) : (
              <p className="px-1.5 py-1 text-placeholder italic">{t("no_matching_results")}</p>
            )
          ) : (
            <p className="px-1.5 py-1 text-placeholder italic">{t("loading")}</p>
          )}
        </div>
      </div>
    </Combobox.Options>,
    document.body
  );
});

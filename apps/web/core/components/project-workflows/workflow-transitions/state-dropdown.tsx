/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
import { cn } from "@plane/utils";
import { DropdownPanel } from "./dropdown-panel";

type TStateDropdownProps = {
  states: IState[];
  value: string | null;
  onChange: (stateId: string) => void;
  excludeStateIds?: string[];
  placeholder?: string;
  disabled?: boolean;
};

export const StateDropdown: FC<TStateDropdownProps> = ({
  states,
  value,
  onChange,
  excludeStateIds = [],
  placeholder = "选择状态",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);

  const selectedState = value ? states.find((s) => s.id === value) : null;
  const availableStates = states.filter((s) => !excludeStateIds.includes(s.id));
  const filteredStates = search
    ? availableStates.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : availableStates;

  const handleSelect = (stateId: string) => {
    onChange(stateId);
    setIsOpen(false);
    setSearch("");
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div className="relative">
      <button
        ref={setReferenceElement}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? handleClose() : setIsOpen(true))}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent-primary/50 hover:bg-surface-2",
          isOpen && "border-accent-primary/50"
        )}
      >
        {selectedState ? (
          <>
            <StateGroupIcon stateGroup={selectedState.group} color={selectedState.color} size={EIconSize.SM} />
            <span className="flex-1 truncate text-left text-primary">{selectedState.name}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-tertiary">{placeholder}</span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 text-secondary transition-transform", isOpen && "rotate-180")} />
      </button>

      <DropdownPanel isOpen={isOpen} referenceElement={referenceElement} onClose={handleClose} minWidth={200}>
        <div>
          <div className="p-1.5">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索状态..."
              className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {filteredStates.length === 0 ? (
              <p className="px-2 py-2 text-center text-xs text-tertiary">无匹配状态</p>
            ) : (
              filteredStates.map((state) => (
                <button
                  key={state.id}
                  type="button"
                  onClick={() => handleSelect(state.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1",
                    value === state.id && "bg-accent-subtle text-accent-primary"
                  )}
                >
                  <StateGroupIcon stateGroup={state.group} color={state.color} size={EIconSize.SM} />
                  <span className="truncate">{state.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </DropdownPanel>
    </div>
  );
};

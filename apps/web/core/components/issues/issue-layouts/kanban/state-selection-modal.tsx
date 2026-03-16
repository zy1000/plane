/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IState } from "@plane/types";
import { ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  statesInGroup: IState[];
  onSelect: (stateId: string) => void;
  onCancel: () => void;
};

export const StateSelectionModal = ({ isOpen, statesInGroup, onSelect, onCancel }: Props) => (
  <ModalCore isOpen={isOpen} handleClose={onCancel} className="w-full max-w-sm">
    <div className="p-5">
      <h3 className="text-base font-semibold text-custom-text-100 mb-1">选择目标状态</h3>
      <p className="text-sm text-custom-text-300 mb-4">目标状态组中有多个状态，请选择要切换到的状态：</p>
      <div className="flex flex-col gap-1">
        {statesInGroup.map((state) => (
          <button
            key={state.id}
            type="button"
            onClick={() => onSelect(state.id)}
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-custom-text-200 hover:bg-custom-background-80 hover:text-custom-text-100 transition-colors text-left w-full"
          >
            <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: state.color }} />
            <span>{state.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-custom-text-300 hover:text-custom-text-200 transition-colors px-3 py-1.5"
        >
          取消
        </button>
      </div>
    </div>
  </ModalCore>
);

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Expand, Shrink } from "lucide-react";
import { CloseIcon } from "@plane/propel/icons";
import { ModalPortal, EPortalWidth, EPortalPosition } from "@plane/propel/portal";
import type { TOverdueRecord, TOverdueSummary, TOverdueTrendPoint } from "@plane/types";
import { OverdueCharts } from "./overdue-charts";
import { OverdueSummaryCards } from "./overdue-summary-cards";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  summary?: TOverdueSummary;
  records: TOverdueRecord[];
  trend: TOverdueTrendPoint[];
  isLoading?: boolean;
};

export const OverdueAnalyticsModal = observer(function OverdueAnalyticsModal(props: Props) {
  const { isOpen, onClose, summary, records, trend, isLoading = false } = props;
  const [fullScreen, setFullScreen] = useState(false);

  const handleClose = () => {
    setFullScreen(false);
    onClose();
  };

  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={handleClose}
      width={fullScreen ? EPortalWidth.FULL : EPortalWidth.THREE_QUARTER}
      position={EPortalPosition.RIGHT}
      fullScreen={fullScreen}
      contentClassName={fullScreen ? undefined : "w-[86%] max-w-[1440px]"}
    >
      <div
        className={`flex h-full flex-col overflow-hidden border-subtle bg-surface-1 text-left ${
          fullScreen ? "rounded-lg border" : "border-l"
        }`}
      >
        <div className="flex items-center justify-between gap-4 bg-surface-1 px-5 py-4 text-13">
          <h3 className="break-words">延期分析</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden place-items-center p-1 text-secondary hover:text-primary md:grid"
              onClick={() => setFullScreen((prev) => !prev)}
            >
              {fullScreen ? <Shrink size={14} strokeWidth={2} /> : <Expand size={14} strokeWidth={2} />}
            </button>
            <button
              type="button"
              className="grid place-items-center p-1 text-secondary hover:text-primary"
              onClick={handleClose}
            >
              <CloseIcon height={14} width={14} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-8 p-5">
            <OverdueSummaryCards summary={summary} isLoading={isLoading} />
            <OverdueCharts records={records} trend={trend} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { CalendarDays, SquareUser, Timer } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, MembersPropertyIcon } from "@plane/propel/icons";
import { Avatar, AvatarGroup, CircularProgressIndicator } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { formatDateLabel } from "./release-format";

type Member = {
  display_name?: string;
  avatar_url?: string | null;
};

type StatusInfo = {
  label: string;
  color: string;
};

type Props = {
  name: string | null | undefined;
  description: string | null | undefined;
  progress: number;
  statusInfo: StatusInfo | null;
  startDate: Date | null;
  targetDate: Date | null;
  daysLeft: number | undefined;
  lead: Member | undefined;
  memberIds: string[] | undefined;
  getMemberById: (id: string) => Member | undefined;
};

export const ReleaseHero: React.FC<Props> = ({
  name,
  description,
  progress,
  statusInfo,
  startDate,
  targetDate,
  daysLeft,
  lead,
  memberIds,
  getMemberById,
}) => {
  const { t } = useTranslation();
  const memberCount = memberIds?.length ?? 0;
  const dateRangeLabel =
    startDate && targetDate ? `${formatDateLabel(startDate)} → ${formatDateLabel(targetDate)}` : null;

  return (
    <section
      aria-label="发布概览"
      className="relative overflow-hidden rounded-2xl border border-subtle bg-gradient-to-br from-surface-1 via-surface-1 to-surface-2 px-6 py-5"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {statusInfo && (
              <span
                className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ color: statusInfo.color, backgroundColor: `${statusInfo.color}20` }}
              >
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: statusInfo.color }}
                />
                {statusInfo.label}
              </span>
            )}
            {dateRangeLabel && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <CalendarDays className="h-3.5 w-3.5 text-placeholder" aria-hidden />
                <span className="tabular-nums text-secondary">{dateRangeLabel}</span>
              </span>
            )}
          </div>

          <h1 className="truncate text-2xl font-semibold leading-tight text-primary">{name || "发布概览"}</h1>

          {description && (
            <p className="line-clamp-2 text-sm leading-relaxed text-secondary">{description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            {lead && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <SquareUser className="h-3.5 w-3.5 text-placeholder" aria-hidden />
                <Avatar size="sm" name={lead.display_name ?? ""} src={getFileURL(lead.avatar_url ?? "")} />
                <span className="text-secondary">{lead.display_name}</span>
              </span>
            )}
            {memberCount > 0 && memberIds && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <MembersPropertyIcon className="h-3.5 w-3.5 text-placeholder" />
                <AvatarGroup showTooltip>
                  {memberIds.map((id) => {
                    const m = getMemberById(id);
                    return (
                      <Avatar key={id} name={m?.display_name ?? ""} src={getFileURL(m?.avatar_url ?? "")} />
                    );
                  })}
                </AvatarGroup>
                <span className="text-secondary">
                  {memberCount} {t("members")}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 self-stretch rounded-xl border border-subtle bg-surface-1/70 px-5 py-4 backdrop-blur md:items-end md:self-auto">
          <div className="flex items-center gap-4">
            <CircularProgressIndicator size={72} percentage={progress} strokeWidth={6}>
              {progress === 100 ? (
                <CheckIcon className="h-5 w-5 stroke-2 text-success-primary" />
              ) : (
                <span className="text-lg font-semibold tabular-nums leading-none text-primary">{`${progress}%`}</span>
              )}
            </CircularProgressIndicator>
            <div className="flex flex-col">
              <span className="text-xs text-placeholder">完成度</span>
              <span className="text-base font-medium text-primary">
                {progress === 100 ? "已完成" : "进行中"}
              </span>
            </div>
          </div>
          {typeof daysLeft === "number" && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-layer-2 px-2.5 py-1.5 text-xs text-secondary">
              <Timer className="h-3.5 w-3.5 text-placeholder" aria-hidden />
              距离发布还有
              <span className="text-sm font-semibold tabular-nums text-primary">{daysLeft}</span>
              <span>天</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

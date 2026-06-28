/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserProfileData } from "@plane/types";

export type TWorkHealthLevel = "excellent" | "good" | "fair" | "poor" | "no_data";
export type TWorkHealthTone = "success" | "accent" | "warning" | "danger" | "muted";

export type TWorkHealth = {
  completionRate: number;
  level: TWorkHealthLevel;
  onTimeRate: number;
  score: number | null;
  tone: TWorkHealthTone;
};

const getHealthLevel = (score: number): Exclude<TWorkHealthLevel, "no_data"> => {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
};

const getHealthTone = (level: TWorkHealthLevel): TWorkHealthTone => {
  if (level === "excellent") return "success";
  if (level === "good") return "accent";
  if (level === "fair") return "warning";
  if (level === "poor") return "danger";
  return "muted";
};

export const getWorkHealth = (userProfile: IUserProfileData | undefined): TWorkHealth => {
  const completedIssues = userProfile?.completed_issues ?? 0;
  const pendingIssues = userProfile?.pending_issues ?? 0;
  const activeIssues = completedIssues + pendingIssues;

  if (activeIssues === 0) {
    return {
      completionRate: 0,
      level: "no_data",
      onTimeRate: 0,
      score: null,
      tone: "muted",
    };
  }

  const completionRate = completedIssues / activeIssues;
  const onTimeRate = pendingIssues > 0 ? 1 - Math.min((userProfile?.overdue_issues ?? 0) / pendingIssues, 1) : 1;
  const score = Math.round(completionRate * 70 + onTimeRate * 30);
  const level = getHealthLevel(score);

  return {
    completionRate,
    level,
    onTimeRate,
    score,
    tone: getHealthTone(level),
  };
};

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, CloudCog, GitPullRequest, Rocket, ShieldCheck, Users, UsersRound, Zap } from "lucide-react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import {
  CycleIcon,
  EstimatePropertyIcon,
  IntakeIcon,
  LabelPropertyIcon,
  LayersIcon,
  ModuleIcon,
  PageIcon,
  StatePropertyIcon,
  ViewsIcon,
} from "@plane/propel/icons";
import type { TProjectSettingsTabs } from "@plane/types";
// components
import { SettingIcon } from "@/components/icons/attachment";

const WorkflowIcon = (props: ComponentProps<typeof GitPullRequest>) => (
  <GitPullRequest {...props} className={`rotate-90 ${props.className ?? ""}`} />
);

export const PROJECT_SETTINGS_ICONS: Record<TProjectSettingsTabs, LucideIcon | React.FC<ISvgIcons>> = {
  general: SettingIcon,
  members: Users,
  teams: UsersRound,
  roles: ShieldCheck,
  features_cycles: CycleIcon,
  features_modules: ModuleIcon,
  // 与侧栏 tab 用同一个图标：发布 Rocket、评审 ClipboardList
  features_releases: Rocket,
  features_views: ViewsIcon,
  features_pages: PageIcon,
  features_intake: IntakeIcon,
  features_reviews: ClipboardList,
  states: StatePropertyIcon,
  issue_types: LayersIcon,
  labels: LabelPropertyIcon,
  estimates: EstimatePropertyIcon,
  automations: Zap,
  workflow: WorkflowIcon,
  pms_sync: CloudCog,
};

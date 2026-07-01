/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import type { TFileUploadStatus } from "@/hooks/use-file-upload-progress";
import { ReleaseCyclesSection, ReleaseFilesSection, ReleasePlansSection } from "./release-scope-tab";

type Cycle = {
  id: string;
  name: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type Plan = {
  id: string;
  name?: string | null;
  state?: string | null;
  begin_time?: string | null;
  end_time?: string | null;
  pass_rate?: Record<string, number> | null;
};

type FileItem = {
  id: string;
  name: string;
  size: number;
  created_at: string;
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycles: Cycle[];
  cyclesLoading: boolean;
  cyclesError: string | null;
  plans: Plan[];
  plansLoading: boolean;
  plansError: string | null;
  cancelingPlanId: string | null;
  files: FileItem[];
  filesLoading: boolean;
  filesError: string | null;
  filesUploading: boolean;
  filesDeletingId: string | null;
  filesDownloadingId: string | null;
  filesUploadStatuses?: TFileUploadStatus[];
  canManageReleaseCycles: boolean;
  canManageReleasePlans: boolean;
  canUploadReleaseFile: boolean;
  canDeleteReleaseFile: boolean;
  canDownloadReleaseFile: boolean;
  onOpenCycleAssociate: () => void;
  onCancelCycleAssociation: (cycleId: string) => Promise<void> | void;
  onOpenPlanAssociate: () => void;
  onCancelPlanAssociation: (planId: string) => Promise<void> | void;
  onTriggerUploadFile: () => void;
  onDeleteFile: (fileId: string) => Promise<void> | void;
  onDownloadFile: (fileId: string, fileName: string) => Promise<void> | void;
};

export const ReleaseMaterialsTab: React.FC<Props> = ({
  workspaceSlug,
  projectId,
  cycles,
  cyclesLoading,
  cyclesError,
  plans,
  plansLoading,
  plansError,
  cancelingPlanId,
  files,
  filesLoading,
  filesError,
  filesUploading,
  filesDeletingId,
  filesDownloadingId,
  filesUploadStatuses,
  canManageReleaseCycles,
  canManageReleasePlans,
  canUploadReleaseFile,
  canDeleteReleaseFile,
  canDownloadReleaseFile,
  onOpenCycleAssociate,
  onCancelCycleAssociation,
  onOpenPlanAssociate,
  onCancelPlanAssociation,
  onTriggerUploadFile,
  onDeleteFile,
  onDownloadFile,
}) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <ReleaseFilesSection
      className="md:col-span-2"
      files={files}
      filesLoading={filesLoading}
      filesError={filesError}
      filesUploading={filesUploading}
      filesDeletingId={filesDeletingId}
      filesDownloadingId={filesDownloadingId}
      uploadStatuses={filesUploadStatuses}
      canUploadReleaseFile={canUploadReleaseFile}
      canDeleteReleaseFile={canDeleteReleaseFile}
      canDownloadReleaseFile={canDownloadReleaseFile}
      onTriggerUploadFile={onTriggerUploadFile}
      onDeleteFile={onDeleteFile}
      onDownloadFile={onDownloadFile}
    />
    <ReleaseCyclesSection
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      cycles={cycles}
      cyclesLoading={cyclesLoading}
      cyclesError={cyclesError}
      canManageReleaseCycles={canManageReleaseCycles}
      onOpenCycleAssociate={onOpenCycleAssociate}
      onCancelCycleAssociation={onCancelCycleAssociation}
    />
    <ReleasePlansSection
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      plans={plans}
      plansLoading={plansLoading}
      plansError={plansError}
      cancelingPlanId={cancelingPlanId}
      canManageReleasePlans={canManageReleasePlans}
      onOpenPlanAssociate={onOpenPlanAssociate}
      onCancelPlanAssociation={onCancelPlanAssociation}
    />
  </div>
);

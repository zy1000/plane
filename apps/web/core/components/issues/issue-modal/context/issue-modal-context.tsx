/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext } from "react";
// ce imports
import type { UseFormReset } from "react-hook-form";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import type { ISearchIssueResponse, TIssue } from "@plane/types";
export type TCreateSubWorkItemProps = {
  workspaceSlug: string;
  projectId: string;
  parentId: string;
};

export type THandleTemplateChangeProps = {
  workspaceSlug: string;
  reset: UseFormReset<TIssue>;
  editorRef: React.MutableRefObject<EditorRefApi | null>;
};

export type THandleProjectEntitiesFetchProps = {
  workItemProjectId: string | null | undefined;
  workItemTypeId: string | undefined;
  workspaceSlug: string;
};

export type THandleParentWorkItemDetailsProps = {
  workspaceSlug: string;
  parentId: string | undefined;
  parentProjectId: string | undefined;
  isParentEpic: boolean;
};

export type TIssueModalContext = {
  allowedProjectIds: string[];
  workItemTemplateId: string | null;
  setWorkItemTemplateId: React.Dispatch<React.SetStateAction<string | null>>;
  isApplyingTemplate: boolean;
  setIsApplyingTemplate: React.Dispatch<React.SetStateAction<boolean>>;
  selectedParentIssue: ISearchIssueResponse | null;
  setSelectedParentIssue: React.Dispatch<React.SetStateAction<ISearchIssueResponse | null>>;
  getIssueTypeIdOnProjectChange: (projectId: string) => string | null;
  handleProjectEntitiesFetch: (props: THandleProjectEntitiesFetchProps) => Promise<void>;
  handleTemplateChange: (props: THandleTemplateChangeProps) => Promise<void>;
  handleConvert: (workspaceSlug: string, data: Partial<TIssue>) => Promise<void>;
  handleCreateSubWorkItem: (props: TCreateSubWorkItemProps) => Promise<void>;
};

export const IssueModalContext = createContext<TIssueModalContext | undefined>(undefined);

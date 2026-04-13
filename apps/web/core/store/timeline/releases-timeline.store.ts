/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { autorun } from "mobx";
import type { RootStore } from "@/plane-web/store/root.store";
import { BaseTimeLineStore } from "@/plane-web/store/timeline/base-timeline.store";
import type { IBaseTimelineStore } from "@/plane-web/store/timeline/base-timeline.store";

export interface IReleasesTimeLineStore extends IBaseTimelineStore {
  isDependencyEnabled: boolean;
}

export class ReleasesTimeLineStore extends BaseTimeLineStore implements IReleasesTimeLineStore {
  constructor(_rootStore: RootStore) {
    super(_rootStore);

    autorun(() => {
      const getReleaseById = this.rootStore.release.getReleaseById;
      this.updateBlocks(getReleaseById);
    });
  }
}

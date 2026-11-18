/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CircleAlert } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
// helpers
import type React from "react";

type TAuthBanner = {
  message: React.ReactNode;
  handleBannerData?: (bannerData: undefined) => void;
};

export function AuthBanner(props: TAuthBanner) {
  const { message, handleBannerData } = props;
  // translation
  const { t } = useTranslation();

  if (!message) return <></>;
  return (
    <div
      role="alert"
      className="relative flex items-center gap-2.5 rounded-lg border border-danger-subtle bg-danger-subtle py-2.5 pr-2.5 pl-3.5"
    >
      <CircleAlert size={18} className="flex-shrink-0 text-danger-primary" />
      <p className="w-full text-14 text-danger-primary">{message}</p>
      <button
        type="button"
        className="relative ml-auto grid size-6 flex-shrink-0 place-items-center rounded-xs text-danger-primary transition-all hover:bg-danger-subtle-hover"
        onClick={() => handleBannerData?.(undefined)}
        aria-label={t("aria_labels.auth_forms.close_alert")}
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}

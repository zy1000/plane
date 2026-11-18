/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { useTranslation } from "@plane/i18n";
import { AuthRoot } from "@/components/account/auth-forms/auth-root";
import { PageHead } from "@/components/core/page-title";
import { EAuthModes } from "@/helpers/authentication.helper";
import { AuthBackdrop } from "./backdrop";
import { AuthFooter } from "./footer";

type AuthBaseProps = {
  authType: EAuthModes;
};

export function AuthBase({ authType }: AuthBaseProps) {
  const { t } = useTranslation();
  const pageTitle = t(authType === EAuthModes.SIGN_UP ? "auth.common.create_account" : "auth.common.login");

  return (
    <div className="relative flex h-screen w-screen flex-col items-center overflow-hidden overflow-y-auto bg-layer-1 px-4 pt-6 pb-7 sm:px-6">
      <PageHead title={`${pageTitle} - PMS`} />
      <AuthBackdrop />
      <AuthRoot authMode={authType} />
      <AuthFooter />
    </div>
  );
}

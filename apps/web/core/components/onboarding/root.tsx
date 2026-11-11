/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceMemberInvitation, TOnboardingStep, TOnboardingSteps, TUserProfile } from "@plane/types";
import { EOnboardingSteps } from "@plane/types";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserProfile } from "@/hooks/store/user";
// local components
import { OnboardingHeader } from "./header";
import { OnboardingStepRoot } from "./steps";

type Props = {
  invitations?: IWorkspaceMemberInvitation[];
};

export const OnboardingRoot = observer(function OnboardingRoot({ invitations = [] }: Props) {
  const [currentStep, setCurrentStep] = useState<TOnboardingStep>(EOnboardingSteps.PROFILE_SETUP);
  // store hooks
  const { data: user } = useUser();
  const { data: userProfile, updateUserProfile, finishUserOnboarding } = useUserProfile();
  const { workspaces } = useWorkspace();

  const workspacesList = Object.values(workspaces ?? {});

  // the workspace step only exists for users who are not in any workspace yet
  const totalSteps = workspacesList.length > 0 && currentStep === EOnboardingSteps.PROFILE_SETUP ? 1 : 2;

  // complete onboarding
  const finishOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      await finishUserOnboarding();
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Failed",
        message: "Failed to finish onboarding, Please try again later.",
      });
    }
  }, [user, finishUserOnboarding]);

  // handle step change
  const stepChange = useCallback(
    async (steps: Partial<TOnboardingSteps>) => {
      if (!user) return;

      const payload: Partial<TUserProfile> = {
        onboarding_step: {
          ...userProfile.onboarding_step,
          ...steps,
        },
      };

      await updateUserProfile(payload);
    },
    [user, userProfile, updateUserProfile]
  );

  const handleStepChange = useCallback(
    (step: EOnboardingSteps) => {
      switch (step) {
        case EOnboardingSteps.PROFILE_SETUP:
          if (workspacesList.length > 0) finishOnboarding();
          else {
            stepChange({ profile_complete: true });
            setCurrentStep(EOnboardingSteps.WORKSPACE_CREATE_OR_JOIN);
          }
          break;
        case EOnboardingSteps.WORKSPACE_CREATE_OR_JOIN:
          finishOnboarding();
          break;
      }
    },
    [stepChange, finishOnboarding, workspacesList]
  );

  const updateCurrentStep = (step: EOnboardingSteps) => setCurrentStep(step);

  useEffect(() => {
    const handleInitialStep = () => {
      if (
        userProfile?.onboarding_step?.profile_complete &&
        !userProfile?.onboarding_step?.workspace_create &&
        !userProfile?.onboarding_step?.workspace_join
      ) {
        setCurrentStep(EOnboardingSteps.WORKSPACE_CREATE_OR_JOIN);
      }
    };

    handleInitialStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header with progress */}
      <OnboardingHeader currentStep={currentStep} updateCurrentStep={updateCurrentStep} totalSteps={totalSteps} />

      {/* Main content area */}
      <OnboardingStepRoot currentStep={currentStep} invitations={invitations} handleStepChange={handleStepChange} />
    </div>
  );
});

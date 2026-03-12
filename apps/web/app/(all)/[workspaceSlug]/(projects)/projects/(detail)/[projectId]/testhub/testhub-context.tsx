"use client";

import React, { createContext, useContext, useRef } from "react";

type TTestHubContext = {
  registerOpenNewModal: (fn: () => void) => void;
  triggerOpenNewModal: () => void;
  registerOpenNewPlanModal: (fn: () => void) => void;
  triggerOpenNewPlanModal: () => void;
  registerOpenNewReviewModal: (fn: () => void) => void;
  triggerOpenNewReviewModal: () => void;
};

const TestHubContext = createContext<TTestHubContext>({
  registerOpenNewModal: () => {},
  triggerOpenNewModal: () => {},
  registerOpenNewPlanModal: () => {},
  triggerOpenNewPlanModal: () => {},
  registerOpenNewReviewModal: () => {},
  triggerOpenNewReviewModal: () => {},
});

export const TestHubProvider = ({ children }: { children: React.ReactNode }) => {
  const openNewModalRef = useRef<(() => void) | null>(null);
  const openNewPlanModalRef = useRef<(() => void) | null>(null);
  const openNewReviewModalRef = useRef<(() => void) | null>(null);

  const registerOpenNewModal = (fn: () => void) => {
    openNewModalRef.current = fn;
  };
  const triggerOpenNewModal = () => {
    openNewModalRef.current?.();
  };

  const registerOpenNewPlanModal = (fn: () => void) => {
    openNewPlanModalRef.current = fn;
  };
  const triggerOpenNewPlanModal = () => {
    openNewPlanModalRef.current?.();
  };

  const registerOpenNewReviewModal = (fn: () => void) => {
    openNewReviewModalRef.current = fn;
  };
  const triggerOpenNewReviewModal = () => {
    openNewReviewModalRef.current?.();
  };

  return (
    <TestHubContext.Provider
      value={{
        registerOpenNewModal,
        triggerOpenNewModal,
        registerOpenNewPlanModal,
        triggerOpenNewPlanModal,
        registerOpenNewReviewModal,
        triggerOpenNewReviewModal,
      }}
    >
      {children}
    </TestHubContext.Provider>
  );
};

export const useTestHub = () => useContext(TestHubContext);

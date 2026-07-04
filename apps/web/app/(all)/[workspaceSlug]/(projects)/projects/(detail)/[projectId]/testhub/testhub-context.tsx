"use client";

import React, { createContext, useContext, useRef, useState } from "react";

type TTestHubContext = {
  registerOpenNewModal: (fn: () => void) => void;
  triggerOpenNewModal: () => void;
  registerOpenNewPlanModal: (fn: () => void) => void;
  triggerOpenNewPlanModal: () => void;
  registerOpenNewReviewModal: (fn: () => void) => void;
  triggerOpenNewReviewModal: () => void;
  registerOpenNewReportModal: (fn: () => void) => void;
  triggerOpenNewReportModal: () => void;
  registerReviewSearch: (fn: (query: string) => void) => void;
  triggerReviewSearch: (query: string) => void;
  reviewSearchValue: string;
  setReviewSearchValue: (value: string) => void;
};

const TestHubContext = createContext<TTestHubContext>({
  registerOpenNewModal: () => {},
  triggerOpenNewModal: () => {},
  registerOpenNewPlanModal: () => {},
  triggerOpenNewPlanModal: () => {},
  registerOpenNewReviewModal: () => {},
  triggerOpenNewReviewModal: () => {},
  registerOpenNewReportModal: () => {},
  triggerOpenNewReportModal: () => {},
  registerReviewSearch: () => {},
  triggerReviewSearch: () => {},
  reviewSearchValue: "",
  setReviewSearchValue: () => {},
});

export const TestHubProvider = ({ children }: { children: React.ReactNode }) => {
  const openNewModalRef = useRef<(() => void) | null>(null);
  const openNewPlanModalRef = useRef<(() => void) | null>(null);
  const openNewReviewModalRef = useRef<(() => void) | null>(null);
  const openNewReportModalRef = useRef<(() => void) | null>(null);
  const reviewSearchRef = useRef<((query: string) => void) | null>(null);
  const [reviewSearchValue, setReviewSearchValue] = useState<string>("");

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

  const registerOpenNewReportModal = (fn: () => void) => {
    openNewReportModalRef.current = fn;
  };
  const triggerOpenNewReportModal = () => {
    openNewReportModalRef.current?.();
  };

  const registerReviewSearch = (fn: (query: string) => void) => {
    reviewSearchRef.current = fn;
  };
  const triggerReviewSearch = (query: string) => {
    reviewSearchRef.current?.(query);
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
        registerOpenNewReportModal,
        triggerOpenNewReportModal,
        registerReviewSearch,
        triggerReviewSearch,
        reviewSearchValue,
        setReviewSearchValue,
      }}
    >
      {children}
    </TestHubContext.Provider>
  );
};

export const useTestHub = () => useContext(TestHubContext);

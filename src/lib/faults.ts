// Words for fault reasons and statuses, shared by the student and staff screens.
export type FaultReason = "door_did_not_open" | "wrong_item" | "damaged" | "missing_part" | "other";
export type FaultStatus = "open" | "in_progress" | "closed";

export const REASON_LABEL: Record<FaultReason, string> = {
  door_did_not_open: "The door didn't open",
  wrong_item: "Wrong item in the compartment",
  damaged: "Item is damaged",
  missing_part: "Part is missing",
  other: "Something else",
};

// Reasons that make sense for something you have on loan, and for a locker.
export const LOAN_REASONS: FaultReason[] = ["damaged", "missing_part", "other"];
export const LOCKER_REASONS: FaultReason[] = ["door_did_not_open", "wrong_item", "other"];

/** How students see a report's progress. */
export const STUDENT_STATUS: Record<FaultStatus, string> = {
  open: "Reported",
  in_progress: "Being fixed",
  closed: "Fixed",
};

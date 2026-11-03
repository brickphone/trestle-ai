export const PRODUCT_NAME = "Product";
export const PAYMENT_RULES = {
  progressDays: 14,
  subcontractorDays: 7,
  retainageBps: 500,
  source: "https://www.acquisition.gov/far/52.232-27",
  retainageSource: "https://www.acquisition.gov/far/52.232-5",
  verify: "Verify against your contract",
  progressNote:
    "14 calendar days from receipt of a proper progress payment request. Submission-based dates are estimates. Contract conditions may differ.",
  interestNote:
    "Prompt Payment Act interest may apply, subject to applicable conditions. Verify with your contracting officer.",
  // Operational reminders, not legal deadlines.
  subDueSoonDays: 3,
  retainageReminderDays: 60,
};

/** Operational estimates, not statutory payment terms. Editable for each job. */
export const FORECAST_DEFAULTS = {
  paymentLagDays: 30,
  costRatioBps: 8500,
  costProfile: "even" as const,
  costMode: "modeled" as const,
};

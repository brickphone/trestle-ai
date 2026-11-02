# Cash-gap scenarios

`calculateCashGap` is pure and uses integer cents. All timing and retainage inputs are
explicit assumptions supplied by the caller; there are no federal regulatory defaults.
Missing or invalid inputs fail validation rather than produce invented estimates.

- Months are fixed 30-day periods, not calendar months.
- Billings are even. Costs are paid at each month end. This aggregate model does
  not model weekly payroll or upfront purchases within a month.
- Even costs have equal weights; front-loaded costs have descending weights
  `N, N-1, ..., 1`, normalized to the same total. This is a scenario, not observed data.
- Progress receipts equal billed amounts minus retained amounts and arrive exactly
  `paymentLagDays` after billing. Lag includes whatever approval/payment delay the caller assumes.
- All retainage is received on completion plus `retainageReleaseDays`, independently
  of progress receipts. Supply the expected cash receipt delay, not an eligibility date.
- Each invoice's retainage rounds to the nearest cent. Cumulative allocation preserves
  total billings and total costs exactly, even when they do not divide evenly.
- Same-day cash flows are netted. The peak gap is the maximum negative balance on
  the event timeline, starting from zero cash. Monthly summaries include the entire
  payment and retainage tail. No financing, tax or interest is included.
- Supported bounds: 1–1,200 months, 0–36,500 delay days, contract value up to $10B,
  cost ratio 0–10 (including loss-making jobs), retainage ratio 0–1.

The hand-calculated test uses a $1M contract, 10 months, 85% costs, 45-day lag,
5% retainage, and an explicitly assumed 60-day release delay. Monthly billing is
$100,000, costs $85,000, and progress receipts $95,000. The first receipt is day 75;
day 60 has the peak deficit of **$170,000**. Retainage of $50,000 arrives day 360,
leaving $150,000 after all receipts and costs. Front-loaded weights increase the
peak to **$335,454.55 on day 120**, with the same final margin.

The timing of within-month costs materially affects the gap. This module is not
the future 13-week forecast and must not be presented as an actual job forecast.
Any future regulation-based presets belong in a separate sourced configuration.

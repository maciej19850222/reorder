import { buildCancelSubscriptionAnalyticsRebuildInput } from "../cancel-subscription"

describe("buildCancelSubscriptionAnalyticsRebuildInput", () => {
  it("targets the cancellation day for incremental analytics rebuild", () => {
    const result = buildCancelSubscriptionAnalyticsRebuildInput({
      cancelled_at: "2026-05-25T09:15:00.000Z",
      triggered_by: "user_456",
    })

    expect(result).toEqual({
      date_from: new Date("2026-05-25T00:00:00.000Z"),
      date_to: new Date("2026-05-25T23:59:59.999Z"),
      trigger_type: "incremental",
      triggered_by: "user_456",
      reason: "cancel_subscription",
      correlation_id: null,
    })
  })
})

import { buildPauseSubscriptionAnalyticsRebuildInput } from "../pause-subscription"

describe("buildPauseSubscriptionAnalyticsRebuildInput", () => {
  it("targets the paused day for incremental analytics rebuild", () => {
    const result = buildPauseSubscriptionAnalyticsRebuildInput({
      paused_at: "2026-05-25T14:22:11.000Z",
      triggered_by: "user_123",
    })

    expect(result).toEqual({
      date_from: new Date("2026-05-25T00:00:00.000Z"),
      date_to: new Date("2026-05-25T23:59:59.999Z"),
      trigger_type: "incremental",
      triggered_by: "user_123",
      reason: "pause_subscription",
      correlation_id: null,
    })
  })
})

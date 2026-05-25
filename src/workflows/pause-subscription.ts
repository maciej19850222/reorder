import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createSubscriptionLogEventStep } from "./steps/create-subscription-log-event"
import { ensureNextRenewalCycleStep } from "./steps/ensure-next-renewal-cycle"
import {
  pauseSubscriptionStep,
  PauseSubscriptionStepInput,
} from "./steps/pause-subscription"
import { normalizeActivityLogEvent } from "../modules/activity-log/utils/normalize-log-event"
import {
  ActivityLogActorType,
  ActivityLogEventType,
} from "../modules/activity-log/types"
import { rebuildAnalyticsDailySnapshotsWorkflow } from "./rebuild-analytics-daily-snapshots"
import { toISOStringOrNull } from "./utils/date-output"
import { buildAnalyticsIncrementalRebuildInput } from "./utils/analytics-incremental"

export function buildPauseSubscriptionAnalyticsRebuildInput(input: {
  paused_at: Date | string | null
  triggered_by?: string | null
}) {
  return buildAnalyticsIncrementalRebuildInput({
    occurred_at: input.paused_at ?? new Date(),
    trigger_source: "pause_subscription",
    correlation_id: null,
    triggered_by: input.triggered_by ?? null,
  })
}

export const pauseSubscriptionWorkflow = createWorkflow(
  "pause-subscription",
  function (input: PauseSubscriptionStepInput) {
    const subscriptionChange = pauseSubscriptionStep(input)
    const logInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return {
          log_event: normalizeActivityLogEvent({
            subscription_id: subscriptionChange.current.id,
            customer_id: subscriptionChange.current.customer_id,
            event_type: ActivityLogEventType.SUBSCRIPTION_PAUSED,
            actor_type: ActivityLogActorType.USER,
            actor_id: input.triggered_by ?? null,
            display: {
              subscription_reference: subscriptionChange.current.reference,
              customer_name:
                subscriptionChange.current.customer_snapshot?.full_name ?? null,
              product_title:
                subscriptionChange.current.product_snapshot?.product_title ?? null,
              variant_title:
                subscriptionChange.current.product_snapshot?.variant_title ?? null,
            },
            previous_state: {
              status: subscriptionChange.previous.status,
              paused_at: toISOStringOrNull(subscriptionChange.previous.paused_at),
            },
            new_state: {
              status: subscriptionChange.current.status,
              paused_at: toISOStringOrNull(subscriptionChange.current.paused_at),
            },
            reason: input.reason ?? null,
            metadata: {
              source: "admin",
              effective_at: toISOStringOrNull(subscriptionChange.current.paused_at),
            },
            dedupe: {
              scope: "subscription",
              target_id: subscriptionChange.current.id,
              qualifier: toISOStringOrNull(subscriptionChange.current.paused_at),
            },
          }),
        }
      }
    )
    createSubscriptionLogEventStep(logInput)
    const ensureInput = transform({ subscriptionChange }, function ({ subscriptionChange }) {
      return {
        subscription_id: subscriptionChange.current.id,
      }
    })
    const renewal_cycle = ensureNextRenewalCycleStep(ensureInput)
    const incrementalAnalyticsInput = transform(
      { subscriptionChange, input },
      function ({ subscriptionChange, input }) {
        return buildPauseSubscriptionAnalyticsRebuildInput({
          paused_at: subscriptionChange.current.paused_at,
          triggered_by: input.triggered_by ?? null,
        })
      }
    )
    rebuildAnalyticsDailySnapshotsWorkflow.runAsStep({
      input: incrementalAnalyticsInput,
    })

    return new WorkflowResponse({
      subscription: subscriptionChange.current,
      renewal_cycle,
    })
  }
)

export default pauseSubscriptionWorkflow

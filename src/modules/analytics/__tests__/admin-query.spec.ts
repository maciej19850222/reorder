import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  AnalyticsGroupBy,
  AnalyticsMetricKey,
  type AnalyticsSubscriptionStatus,
} from "../../../admin/types/analytics"
import {
  getAdminAnalyticsExport,
  getAdminAnalyticsKpis,
  getAdminAnalyticsTrends,
} from "../utils/admin-query"

type SubscriptionMetricsDailyRecord = {
  id: string
  metric_date: string
  subscription_id: string
  customer_id: string
  product_id: string
  variant_id: string
  status: AnalyticsSubscriptionStatus
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  currency_code: string | null
  is_active: boolean
  active_subscriptions_count: number
  mrr_amount: number | null
  churned_subscriptions_count: number
  churn_reason_category: string | null
  source_snapshot: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

type SubscriptionRecord = {
  id: string
  product_id: string
  status: AnalyticsSubscriptionStatus
  frequency_interval: "week" | "month" | "year"
  frequency_value: number
  created_at: string
}

type QueryGraphInput = {
  entity?: string
  fields?: string[]
  filters?: Record<string, unknown>
  pagination?: {
    take?: number
    skip?: number
    order?: Record<string, string>
  }
}

function buildRow(
  id: string,
  overrides: Partial<SubscriptionMetricsDailyRecord>
): SubscriptionMetricsDailyRecord {
  return {
    id,
    metric_date: "2026-04-01T00:00:00.000Z",
    subscription_id: `sub_${id}`,
    customer_id: `cus_${id}`,
    product_id: "prod_coffee",
    variant_id: "variant_monthly",
    status: "active",
    frequency_interval: "month",
    frequency_value: 1,
    currency_code: "USD",
    is_active: true,
    active_subscriptions_count: 1,
    mrr_amount: 100,
    churned_subscriptions_count: 0,
    churn_reason_category: null,
    source_snapshot: null,
    metadata: null,
    ...overrides,
  }
}

function createSubscription(
  id: string,
  overrides: Partial<SubscriptionRecord> = {}
): SubscriptionRecord {
  return {
    id,
    product_id: "prod_coffee",
    status: "active",
    frequency_interval: "month",
    frequency_value: 1,
    created_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  }
}

function createContainer(
  rows: SubscriptionMetricsDailyRecord[],
  subscriptions: SubscriptionRecord[] = []
) {
  const graph = jest.fn(async (input: QueryGraphInput) => {
    const take = input.pagination?.take ?? 500
    const skip = input.pagination?.skip ?? 0
    const source =
      input.entity === "subscription"
        ? subscriptions
            .filter((subscription) =>
              matchesSubscriptionFilters(subscription, input.filters ?? {})
            )
            .sort((left, right) =>
              left.created_at === right.created_at
                ? left.id.localeCompare(right.id)
                : left.created_at.localeCompare(right.created_at)
            )
        : rows
            .filter((row) => matchesMetricsFilters(row, input.filters ?? {}))
            .sort((left, right) => left.metric_date.localeCompare(right.metric_date))
    const filtered = source
    const batch = filtered.slice(skip, skip + take)

    return {
      data: batch,
      metadata: {
        count: filtered.length,
        take,
        skip,
      },
    }
  })

  const container = {
    resolve: jest.fn((key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) {
        return { graph }
      }

      if (key === "logger") {
        return {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }
      }

      throw new Error(`Unexpected container key: ${key}`)
    }),
  } as unknown as MedusaContainer

  return {
    container,
    graph,
  }
}

function matchesMetricsFilters(
  row: SubscriptionMetricsDailyRecord,
  filters: Record<string, unknown>
) {
  const metricDateFilter = filters.metric_date as
    | { $gte?: string; $lte?: string }
    | undefined

  if (metricDateFilter?.$gte && row.metric_date < metricDateFilter.$gte) {
    return false
  }

  if (metricDateFilter?.$lte && row.metric_date > metricDateFilter.$lte) {
    return false
  }

  const statusFilter = filters.status as AnalyticsSubscriptionStatus[] | undefined

  if (statusFilter?.length && !statusFilter.includes(row.status)) {
    return false
  }

  const productFilter = filters.product_id as string[] | undefined

  if (productFilter?.length && !productFilter.includes(row.product_id)) {
    return false
  }

  return true
}

function matchesSubscriptionFilters(
  row: SubscriptionRecord,
  filters: Record<string, unknown>
) {
  const createdAtFilter = filters.created_at as
    | { $gte?: string; $lte?: string }
    | undefined

  if (createdAtFilter?.$gte && row.created_at < createdAtFilter.$gte) {
    return false
  }

  if (createdAtFilter?.$lte && row.created_at > createdAtFilter.$lte) {
    return false
  }

  const statusFilter = filters.status as AnalyticsSubscriptionStatus[] | undefined

  if (statusFilter?.length && !statusFilter.includes(row.status)) {
    return false
  }

  const productFilter = filters.product_id as string[] | undefined

  if (productFilter?.length && !productFilter.includes(row.product_id)) {
    return false
  }

  const frequencyOrFilter = filters.$or as
    | Array<{
        frequency_interval?: SubscriptionRecord["frequency_interval"]
        frequency_value?: number
      }>
    | undefined

  if (frequencyOrFilter?.length) {
    return frequencyOrFilter.some(
      (frequency) =>
        frequency.frequency_interval === row.frequency_interval &&
        frequency.frequency_value === row.frequency_value
    )
  }

  return true
}

describe("analytics admin-query read model", () => {
  beforeEach(() => {
    jest.useRealTimers()
  })

  it("computes KPI summaries for recurring revenue, churn, ltv, and active subscriptions", async () => {
    const rows = [
      buildRow("current_day_one", {
        metric_date: "2026-04-01T00:00:00.000Z",
        subscription_id: "sub_a",
        mrr_amount: 100,
      }),
      buildRow("current_day_two", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_a",
        mrr_amount: 120,
      }),
      buildRow("current_day_three", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_b",
        mrr_amount: 80,
      }),
      buildRow("previous_day_one", {
        metric_date: "2026-03-30T00:00:00.000Z",
        subscription_id: "sub_prev_a",
        mrr_amount: 90,
      }),
      buildRow("previous_day_two", {
        metric_date: "2026-03-31T00:00:00.000Z",
        subscription_id: "sub_prev_a",
        mrr_amount: 100,
      }),
      buildRow("previous_day_three", {
        metric_date: "2026-03-31T00:00:00.000Z",
        subscription_id: "sub_prev_b",
        mrr_amount: 50,
        churned_subscriptions_count: 1,
      }),
    ]
    const { container, graph } = createContainer(rows)

    const response = await getAdminAnalyticsKpis(container, {
      date_from: "2026-04-01T00:00:00.000Z",
      date_to: "2026-04-02T23:59:59.999Z",
      group_by: AnalyticsGroupBy.DAY,
      timezone: "UTC",
    })

    expect(graph).toHaveBeenCalled()
    expect(graph).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        entity: "subscription_metrics_daily",
        filters: expect.objectContaining({
          metric_date: {
            $gte: "2026-04-01T00:00:00.000Z",
            $lte: "2026-04-02T23:59:59.999Z",
          },
        }),
      })
    )

    expect(response.filters.group_by).toBe(AnalyticsGroupBy.DAY)
    expect(response.kpis).toEqual([
      expect.objectContaining({
        key: AnalyticsMetricKey.MRR,
        value: 200,
        previous_value: 150,
        currency_code: "USD",
      }),
      expect.objectContaining({
        key: AnalyticsMetricKey.CHURN_RATE,
        value: 0,
        previous_value: 66.67,
      }),
      expect.objectContaining({
        key: AnalyticsMetricKey.LTV,
        value: null,
        previous_value: 225,
        currency_code: "USD",
      }),
      expect.objectContaining({
        key: AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT,
        value: 2,
        previous_value: 2,
      }),
    ])
  })

  it("builds trend series for day, week, and month bucket groupings", async () => {
    const rows = [
      buildRow("day_one_a", {
        metric_date: "2026-04-01T00:00:00.000Z",
        subscription_id: "sub_a",
        mrr_amount: 100,
      }),
      buildRow("day_one_b", {
        metric_date: "2026-04-01T00:00:00.000Z",
        subscription_id: "sub_b",
        mrr_amount: 40,
      }),
      buildRow("day_two_a", {
        metric_date: "2026-04-08T00:00:00.000Z",
        subscription_id: "sub_a",
        mrr_amount: 110,
      }),
      buildRow("day_two_b", {
        metric_date: "2026-04-08T00:00:00.000Z",
        subscription_id: "sub_b",
        mrr_amount: 50,
        churned_subscriptions_count: 1,
      }),
      buildRow("day_three_a", {
        metric_date: "2026-05-01T00:00:00.000Z",
        subscription_id: "sub_a",
        mrr_amount: 125,
      }),
    ]
    const { container } = createContainer(rows)

    const dayResponse = await getAdminAnalyticsTrends(container, {
      date_from: "2026-04-01T00:00:00.000Z",
      date_to: "2026-05-01T23:59:59.999Z",
      group_by: AnalyticsGroupBy.DAY,
      timezone: "UTC",
    })
    const weekResponse = await getAdminAnalyticsTrends(container, {
      date_from: "2026-04-01T00:00:00.000Z",
      date_to: "2026-05-01T23:59:59.999Z",
      group_by: AnalyticsGroupBy.WEEK,
      timezone: "UTC",
    })
    const monthResponse = await getAdminAnalyticsTrends(container, {
      date_from: "2026-04-01T00:00:00.000Z",
      date_to: "2026-05-01T23:59:59.999Z",
      group_by: AnalyticsGroupBy.MONTH,
      timezone: "UTC",
    })

    expect(
      dayResponse.series.find((series) => series.metric === AnalyticsMetricKey.MRR)
        ?.points
    ).toHaveLength(3)
    expect(
      weekResponse.series.find((series) => series.metric === AnalyticsMetricKey.MRR)
        ?.points
    ).toHaveLength(3)
    expect(
      monthResponse.series.find((series) => series.metric === AnalyticsMetricKey.MRR)
        ?.points
    ).toHaveLength(2)

    expect(
      weekResponse.series.find(
        (series) => series.metric === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT
      )?.points[1]
    ).toEqual(
      expect.objectContaining({
        value: 2,
      })
    )

    expect(
      dayResponse.series.find(
        (series) => series.metric === AnalyticsMetricKey.CREATED_SUBSCRIPTIONS_COUNT
      )?.points
    ).toHaveLength(31)
  })

  it("builds a daily created subscriptions series from subscription.created_at", async () => {
    const subscriptions = [
      createSubscription("sub_created_a", {
        created_at: "2026-04-01T08:15:00.000Z",
        product_id: "prod_target",
        status: "cancelled",
      }),
      createSubscription("sub_created_b", {
        created_at: "2026-04-01T14:45:00.000Z",
        product_id: "prod_other",
        status: "paused",
      }),
      createSubscription("sub_created_c", {
        created_at: "2026-04-03T09:30:00.000Z",
        frequency_interval: "year",
        frequency_value: 1,
      }),
    ]
    const { container } = createContainer([], subscriptions)

    const response = await getAdminAnalyticsTrends(container, {
      date_from: "2026-04-01T00:00:00.000Z",
      date_to: "2026-04-04T23:59:59.999Z",
      status: ["active"],
      product_id: ["prod_target"],
      frequency: ["month:1"],
      group_by: AnalyticsGroupBy.MONTH,
      timezone: "UTC",
    })

    expect(
      response.series.find(
        (series) => series.metric === AnalyticsMetricKey.CREATED_SUBSCRIPTIONS_COUNT
      )
    ).toEqual(
      expect.objectContaining({
        unit: "count",
        precision: 0,
        points: [
          expect.objectContaining({
            bucket_start: "2026-04-01T00:00:00.000Z",
            value: 2,
          }),
          expect.objectContaining({
            bucket_start: "2026-04-02T00:00:00.000Z",
            value: 0,
          }),
          expect.objectContaining({
            bucket_start: "2026-04-03T00:00:00.000Z",
            value: 1,
          }),
          expect.objectContaining({
            bucket_start: "2026-04-04T00:00:00.000Z",
            value: 0,
          }),
        ],
      })
    )
  })

  it("overrides the active trend point for the current UTC bucket with the live count", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-25T10:00:00.000Z"))

    const rows = [
      buildRow("prior_day_a", {
        metric_date: "2026-05-24T00:00:00.000Z",
        subscription_id: "sub_prior_a",
        active_subscriptions_count: 2,
      }),
      buildRow("prior_day_b", {
        metric_date: "2026-05-24T00:00:00.000Z",
        subscription_id: "sub_prior_b",
        active_subscriptions_count: 0,
      }),
      buildRow("today_snapshot", {
        metric_date: "2026-05-25T00:00:00.000Z",
        subscription_id: "sub_today_a",
        active_subscriptions_count: 1,
      }),
    ]
    const subscriptions = [
      createSubscription("sub_today_a"),
      createSubscription("sub_today_b"),
      createSubscription("sub_today_c"),
    ]
    const { container } = createContainer(rows, subscriptions)

    const response = await getAdminAnalyticsTrends(container, {
      date_from: "2026-05-24T00:00:00.000Z",
      date_to: "2026-05-25T23:59:59.999Z",
      group_by: AnalyticsGroupBy.DAY,
      timezone: "UTC",
    })

    expect(
      response.series.find(
        (series) => series.metric === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT
      )?.points
    ).toEqual([
      expect.objectContaining({
        bucket_start: "2026-05-24T00:00:00.000Z",
        value: 2,
      }),
      expect.objectContaining({
        bucket_start: "2026-05-25T00:00:00.000Z",
        value: 3,
      }),
    ])
  })

  it("applies status, product, and frequency filters before computing metrics", async () => {
    const rows = [
      buildRow("keep_a", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_keep_a",
        product_id: "prod_target",
        status: "active",
        frequency_interval: "month",
        frequency_value: 1,
        mrr_amount: 100,
      }),
      buildRow("keep_b", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_keep_b",
        product_id: "prod_target",
        status: "active",
        frequency_interval: "month",
        frequency_value: 1,
        mrr_amount: 50,
      }),
      buildRow("filter_by_status", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_pause",
        product_id: "prod_target",
        status: "paused",
        is_active: false,
        active_subscriptions_count: 0,
        mrr_amount: 999,
      }),
      buildRow("filter_by_product", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_other_product",
        product_id: "prod_other",
        mrr_amount: 999,
      }),
      buildRow("filter_by_frequency", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_yearly",
        product_id: "prod_target",
        frequency_interval: "year",
        frequency_value: 1,
        mrr_amount: 999,
      }),
    ]
    const { container } = createContainer(rows)

    const response = await getAdminAnalyticsKpis(container, {
      date_from: "2026-04-02T00:00:00.000Z",
      date_to: "2026-04-02T23:59:59.999Z",
      status: ["active"],
      product_id: ["prod_target"],
      frequency: ["month:1"],
      timezone: "UTC",
    })

    expect(response.kpis).toEqual([
      expect.objectContaining({
        key: AnalyticsMetricKey.MRR,
        value: 150,
      }),
      expect.objectContaining({
        key: AnalyticsMetricKey.CHURN_RATE,
        value: 0,
      }),
      expect.objectContaining({
        key: AnalyticsMetricKey.LTV,
        value: null,
      }),
      expect.objectContaining({
        key: AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT,
        value: 2,
      }),
    ])
  })

  it("returns null revenue metrics for mixed-currency datasets and empty series for empty datasets", async () => {
    const mixedCurrencyRows = [
      buildRow("usd", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_usd",
        currency_code: "USD",
        mrr_amount: 100,
      }),
      buildRow("eur", {
        metric_date: "2026-04-02T00:00:00.000Z",
        subscription_id: "sub_eur",
        currency_code: "EUR",
        mrr_amount: 80,
      }),
    ]
    const mixedCurrencyContainer = createContainer(mixedCurrencyRows).container

    const kpis = await getAdminAnalyticsKpis(mixedCurrencyContainer, {
      date_from: "2026-04-02T00:00:00.000Z",
      date_to: "2026-04-02T23:59:59.999Z",
      timezone: "UTC",
    })

    expect(
      kpis.kpis.find((metric) => metric.key === AnalyticsMetricKey.MRR)
    ).toEqual(
      expect.objectContaining({
        value: null,
        currency_code: null,
      })
    )
    expect(
      kpis.kpis.find((metric) => metric.key === AnalyticsMetricKey.LTV)
    ).toEqual(
      expect.objectContaining({
        value: null,
        currency_code: null,
      })
    )

    const emptyContainer = createContainer([]).container
    const trends = await getAdminAnalyticsTrends(emptyContainer, {
      date_from: "2026-04-02T00:00:00.000Z",
      date_to: "2026-04-02T23:59:59.999Z",
      timezone: "UTC",
    })
    const exportResponse = await getAdminAnalyticsExport(emptyContainer, {
      date_from: "2026-04-02T00:00:00.000Z",
      date_to: "2026-04-02T23:59:59.999Z",
      format: "csv",
      timezone: "UTC",
    })

    expect(
      trends.series
        .filter(
          (series) => series.metric !== AnalyticsMetricKey.CREATED_SUBSCRIPTIONS_COUNT
        )
        .every((series) => series.points.length === 0)
    ).toBe(true)
    expect(
      trends.series.find(
        (series) => series.metric === AnalyticsMetricKey.CREATED_SUBSCRIPTIONS_COUNT
      )?.points
    ).toEqual([
      expect.objectContaining({
        bucket_start: "2026-04-02T00:00:00.000Z",
        value: 0,
      }),
    ])
    expect(exportResponse.columns).toEqual([
      "bucket_start",
      "bucket_end",
      "mrr",
      "churn_rate",
      "ltv",
      "active_subscriptions_count",
    ])
    expect(exportResponse.rows).toEqual([])
  })

  it("uses live active subscription count when the requested window includes the current UTC day", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-25T10:00:00.000Z"))

    const rows = [
      buildRow("current_live_snapshot", {
        metric_date: "2026-05-25T00:00:00.000Z",
        subscription_id: "sub_live_a",
        active_subscriptions_count: 1,
        mrr_amount: 100,
      }),
      buildRow("previous_live_snapshot_a", {
        metric_date: "2026-05-24T00:00:00.000Z",
        subscription_id: "sub_prev_a",
        active_subscriptions_count: 1,
        mrr_amount: 100,
      }),
      buildRow("previous_live_snapshot_b", {
        metric_date: "2026-05-24T00:00:00.000Z",
        subscription_id: "sub_prev_b",
        active_subscriptions_count: 1,
        mrr_amount: 100,
      }),
    ]
    const subscriptions = [
      createSubscription("sub_live_a"),
      createSubscription("sub_live_b"),
      createSubscription("sub_live_c"),
    ]
    const { container } = createContainer(rows, subscriptions)

    const response = await getAdminAnalyticsKpis(container, {
      date_from: "2026-05-25T00:00:00.000Z",
      date_to: "2026-05-25T23:59:59.999Z",
      timezone: "UTC",
    })

    expect(
      response.kpis.find(
        (metric) => metric.key === AnalyticsMetricKey.ACTIVE_SUBSCRIPTIONS_COUNT
      )
    ).toEqual(
      expect.objectContaining({
        value: 3,
        previous_value: 2,
      })
    )
  })

  it("throws invalid_data for invalid ranges and unsupported filters", async () => {
    const { container } = createContainer([])

    await expect(
      getAdminAnalyticsKpis(container, {
        date_from: "2026-04-03T00:00:00.000Z",
        date_to: "2026-04-02T23:59:59.999Z",
        timezone: "UTC",
      })
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    })

    await expect(
      getAdminAnalyticsKpis(container, {
        date_from: "2026-04-01T00:00:00.000Z",
        date_to: "2028-04-05T23:59:59.999Z",
        timezone: "UTC",
      })
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    })

    await expect(
      getAdminAnalyticsKpis(container, {
        date_from: "2026-04-02T00:00:00.000Z",
        date_to: "2026-04-02T23:59:59.999Z",
        timezone: "Europe/Warsaw",
      })
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    })

    await expect(
      getAdminAnalyticsKpis(container, {
        date_from: "2026-04-02T00:00:00.000Z",
        date_to: "2026-04-02T23:59:59.999Z",
        frequency: ["fortnight:1"],
        timezone: "UTC",
      })
    ).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    })
  })
})

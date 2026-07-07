import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { Modules } from "@medusajs/framework/utils"
import { WorkflowManager } from "@medusajs/framework/orchestration"
import { createSubscriptionFromCartWorkflow } from "../../src/subscription-flows/create-subscription-from-cart"

type CartModuleService = {
  createCarts(data: Record<string, unknown>): Promise<{ id: string }>
  retrieveCart(
    id: string,
    config?: Record<string, unknown>
  ): Promise<{ id: string; completed_at: Date | null }>
  updateCarts(
    id: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>>
}

type FlowNode = {
  action?: string
  next?: FlowNode | FlowNode[]
  [key: string]: unknown
}

function collectActions(node: FlowNode | FlowNode[] | undefined): string[] {
  if (!node) {
    return []
  }

  const nodes = Array.isArray(node) ? node : [node]

  return nodes.flatMap((entry) => [
    ...(entry.action ? [entry.action] : []),
    ...collectActions(entry.next as FlowNode | FlowNode[] | undefined),
  ])
}

function findNode(
  node: FlowNode | FlowNode[] | undefined,
  predicate: (entry: FlowNode) => boolean
): FlowNode | null {
  if (!node) {
    return null
  }

  const nodes = Array.isArray(node) ? node : [node]

  for (const entry of nodes) {
    if (predicate(entry)) {
      return entry
    }

    const found = findNode(
      entry.next as FlowNode | FlowNode[] | undefined,
      predicate
    )

    if (found) {
      return found
    }
  }

  return null
}

medusaIntegrationTestRunner({
  medusaConfigFile: path.resolve(process.cwd(), "integration-tests"),
  env: {
    JWT_SECRET: "supersecret",
    COOKIE_SECRET: "supersecret",
  },
  testSuite: ({ getContainer }) => {
    describe("issue #4 regression: failed validation must not complete the cart", () => {
      it("orders complete-cart strictly after validate-subscription-cart in the workflow graph", () => {
        // The workflow DAG is built from data dependencies. The regression in
        // issue #4 was that complete-cart had no dependency on validation, so
        // both ran as independent siblings. This asserts the ordering at the
        // graph level, deterministically (no race involved).
        const definition = WorkflowManager.getWorkflow(
          createSubscriptionFromCartWorkflow.getName()
        )

        expect(definition).toBeTruthy()

        const flow = definition!.flow_ as FlowNode

        const validationNode = findNode(flow, (entry) =>
          Boolean(entry.action?.includes("validate-subscription-cart"))
        )

        expect(validationNode).toBeTruthy()

        const actionsAfterValidation = collectActions(
          validationNode!.next as FlowNode | FlowNode[] | undefined
        )

        expect(
          actionsAfterValidation.some((action) =>
            action.includes("complete-cart")
          )
        ).toBe(true)
      })

      it("leaves the cart usable when subscription validation rejects it", async () => {
        const container = getContainer()
        const cartModule = container.resolve<CartModuleService>(Modules.CART)

        // Cart with a subscription line item but NO customer linked — the
        // validation step rejects it with "requires a cart linked to a
        // customer". Before the fix, complete-cart could still run and mark
        // the cart completed.
        const cart = await cartModule.createCarts({
          currency_code: "eur",
          email: "issue4-regression@example.com",
          metadata: {
            purchase_mode: "subscription",
          },
          items: [
            {
              title: "Subscription Item",
              quantity: 1,
              unit_price: 0,
              metadata: {
                is_subscription: true,
              },
            },
          ],
        })

        await expect(
          createSubscriptionFromCartWorkflow(container).run({
            input: {
              cart_id: cart.id,
            },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining(
            "requires a cart linked to a customer"
          ),
        })

        const reloaded = await cartModule.retrieveCart(cart.id)

        expect(reloaded.completed_at).toBeFalsy()

        // The cart must still accept mutations — a completed cart rejects them.
        await expect(
          cartModule.updateCarts(cart.id, {
            email: "issue4-regression-updated@example.com",
          })
        ).resolves.toBeTruthy()
      })
    })
  },
})

jest.setTimeout(60 * 1000)

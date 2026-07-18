/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children?: React.ReactNode
    to?: string
  }) => (
    <a data-testid="link" href={typeof to === "string" ? to : "#"} {...props}>
      {children}
    </a>
  ),
}))

import { ObserveOnboarding } from "./onboarding"

afterEach(() => {
  cleanup()
})

const SETUP = {
  dsn: "https://key@example/1",
  otelEndpoint: "https://example/otlp",
  otelHeaders: "x-sentry-auth=test",
  snippet: "Sentry.init({})",
}

describe("ObserveOnboarding", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it("places content under header grid without vertical centering", () => {
    const { container } = render(
      <ObserveOnboarding
        projectId="00000000-0000-0000-0000-000000000001"
        initialSetup={SETUP}
        disablePolling
      />,
    )
    const root = container.querySelector("[data-testid=observe-onboarding]")
    expect(root).toBeTruthy()
    expect(root?.className).not.toMatch(/justify-center/)
    expect(root?.className).not.toMatch(/min-h-\[min/)
    expect(screen.getByText("Send your first telemetry")).toBeTruthy()
  })

  it("switches integration methods", () => {
    const { container } = render(
      <ObserveOnboarding
        projectId="00000000-0000-0000-0000-000000000001"
        initialSetup={SETUP}
        disablePolling
      />,
    )
    expect(
      container.querySelector("[data-testid=onboarding-method-tabs]"),
    ).toBeTruthy()
    expect(screen.getAllByText("SENTRY_DSN").length).toBeGreaterThan(0)
    const otelTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent?.includes("OpenTelemetry"),
    )
    expect(otelTab).toBeTruthy()
    fireEvent.click(otelTab!)
    expect(screen.getAllByText("OTLP endpoint").length).toBeGreaterThan(0)
  })

  it("shows waiting verification state", () => {
    const { container } = render(
      <ObserveOnboarding
        projectId="00000000-0000-0000-0000-000000000001"
        initialSetup={SETUP}
        disablePolling
        listServices={async () => []}
      />,
    )
    expect(
      container.querySelector("[data-testid=onboarding-verification]"),
    ).toBeTruthy()
    expect(screen.getAllByText(/Waiting for traces/i).length).toBeGreaterThan(0)
  })

  it("shows success verification when telemetry is received", async () => {
    const listServices = vi.fn(async () => [
      {
        service: "api",
        last_seen: "2026-07-17T12:00:00.000Z",
      },
    ])
    render(
      <ObserveOnboarding
        projectId="00000000-0000-0000-0000-000000000001"
        initialSetup={SETUP}
        disablePolling
        listServices={listServices}
      />,
    )
    // Waiting first (polling disabled, empty until Check now)
    expect(screen.getByText(/Waiting for traces/i)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /check now/i }))
    await waitFor(() => {
      expect(listServices).toHaveBeenCalled()
      expect(
        screen.getByTestId("onboarding-verification-success"),
      ).toBeTruthy()
    })
    expect(screen.getByText(/Telemetry received/i)).toBeTruthy()
    expect(screen.getByText(/Latest activity/i)).toBeTruthy()
    // Link-as-button from the design system may expose as link or button
    expect(
      screen.getByText(/open traces/i) ||
        screen.queryByRole("link", { name: /open traces/i }),
    ).toBeTruthy()
  })
})


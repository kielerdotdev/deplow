import { createFileRoute, redirect } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { PageContent, PageHeader } from "@/components/page-layout"
import { MessageChannelsPanel } from "@/components/settings/message-channels-panel"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/auth.functions"

export const Route = createFileRoute("/settings/notifications")({
  loader: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: undefined } })
    }
    return { session }
  },
  component: NotificationsPage,
})

function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Slack, Discord, email, and webhook channels for Observe alerts."
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              document
                .querySelector<HTMLButtonElement>("[data-add-channel]")
                ?.click()
            }}
          >
            <PlusIcon className="size-3.5" />
            Add channel
          </Button>
        }
      />
      <PageContent width="narrow">
        <MessageChannelsPanel pageMode />
      </PageContent>
    </>
  )
}

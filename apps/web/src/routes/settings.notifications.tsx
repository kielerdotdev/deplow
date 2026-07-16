import { useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { SettingsPage } from "@/components/page-layout"
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
  const [addOpen, setAddOpen] = useState(false)

  return (
    <SettingsPage
      title="Notifications"
      description="Slack, Discord, email, and webhook channels for Observe alerts."
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <PlusIcon className="size-3.5" />
          Add channel
        </Button>
      }
    >
      <MessageChannelsPanel
        pageMode
        addOpen={addOpen}
        onAddOpenChange={setAddOpen}
      />
    </SettingsPage>
  )
}

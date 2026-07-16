import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { PageContent, PageHeader } from "@/components/page-layout"

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center gap-6 p-6">
      <PageHeader
        title="Page not found"
        description="That URL doesn’t match anything in Hostrig. Check the path or go back home."
      />
      <PageContent width="narrow">
        <Button render={<Link to="/" />}>Go home</Button>
      </PageContent>
    </main>
  )
}

export function RouteErrorPage({ error }: { error: Error }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center gap-6 p-6">
      <PageHeader
        title="Something went wrong"
        description="This page hit an unexpected error. Try again, or return home."
      />
      <PageContent width="narrow" className="gap-3">
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground break-words">
          {error.message || "Unknown error"}
        </p>
        <Button render={<Link to="/" />}>Go home</Button>
      </PageContent>
    </main>
  )
}

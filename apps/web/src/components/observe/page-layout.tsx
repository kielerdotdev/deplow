import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { SlidersHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type ObservePageLayoutContextValue = {
  filterSheetOpen: boolean
  setFilterSheetOpen: (open: boolean) => void
  /** Below `lg`, filters render as a sheet instead of an inline aside. */
  filterSidebarCollapsed: boolean
}

const ObservePageLayoutContext =
  createContext<ObservePageLayoutContextValue | null>(null)

function useObservePageLayout() {
  const ctx = useContext(ObservePageLayoutContext)
  if (!ctx) {
    throw new Error(
      "ObservePageLayout.* must be used within <ObservePageLayout>",
    )
  }
  return ctx
}

function useIsBelowLg() {
  const [below, setBelow] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1023px)").matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)")
    const onChange = () => setBelow(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return below
}

function Root({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const filterSidebarCollapsed = useIsBelowLg()

  const value = useMemo(
    () => ({
      filterSheetOpen,
      setFilterSheetOpen,
      filterSidebarCollapsed,
    }),
    [filterSheetOpen, filterSidebarCollapsed],
  )

  return (
    <ObservePageLayoutContext.Provider value={value}>
      <div
        data-slot="observe-page-layout"
        data-testid="observe-page-layout"
        className={cn("flex flex-col", className)}
      >
        {children}
      </div>
    </ObservePageLayoutContext.Provider>
  )
}

function Body({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="observe-page-body"
      // Content-sized: clipping here with overflow-hidden + flex-1 made long
      // explore/logs/traces pages unscrollable under the Atlasflow shell.
      className={cn("flex gap-0", className)}
    >
      {children}
    </div>
  )
}

function FilterSidebarTrigger({ className }: { className?: string }) {
  const { filterSidebarCollapsed, setFilterSheetOpen } = useObservePageLayout()
  if (!filterSidebarCollapsed) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => setFilterSheetOpen(true)}
      data-testid="observe-filter-sidebar-trigger"
    >
      <SlidersHorizontalIcon className="size-3.5" />
      Filters
    </Button>
  )
}

function FilterSidebar({
  children,
  className,
  title = "Filters",
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  const {
    filterSidebarCollapsed,
    filterSheetOpen,
    setFilterSheetOpen,
  } = useObservePageLayout()

  if (filterSidebarCollapsed) {
    return (
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="left"
          className="w-[min(100vw-2rem,20rem)] p-4"
          data-testid="observe-filter-sidebar-sheet"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>Filter the current explorer view</SheetDescription>
          </SheetHeader>
          <div className={cn("flex h-full flex-col", className)}>{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      data-slot="observe-filter-sidebar"
      data-testid="observe-filter-sidebar"
      className={cn(
        "flex w-48 shrink-0 flex-col border-r border-border/70 pr-4 lg:w-52",
        className,
      )}
    >
      {children}
    </aside>
  )
}

function Content({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="observe-page-content"
      className={cn("min-w-0 flex-1 space-y-4", className)}
    >
      {children}
    </div>
  )
}

/** Close the filter sheet after applying a filter on mobile. */
function useCloseFilterSheet() {
  const { setFilterSheetOpen, filterSidebarCollapsed } = useObservePageLayout()
  return useCallback(() => {
    if (filterSidebarCollapsed) setFilterSheetOpen(false)
  }, [filterSidebarCollapsed, setFilterSheetOpen])
}

export const ObservePageLayout = {
  Root,
  Body,
  FilterSidebar,
  FilterSidebarTrigger,
  Content,
  useCloseFilterSheet,
}

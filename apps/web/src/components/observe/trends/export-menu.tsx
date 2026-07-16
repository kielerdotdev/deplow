import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { TrendsQuery } from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

function download(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportMenu({
  projectId,
  query,
}: {
  projectId: string
  query: TrendsQuery
}) {
  async function exportFmt(format: "csv" | "json") {
    const res = await client.observe.trends.export({
      projectId,
      query,
      format,
    })
    download(
      format === "csv" ? "trends.csv" : "trends.json",
      res.body,
      res.mime,
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1">
            <DownloadIcon className="size-3.5" />
            Export
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void exportFmt("csv")}>
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportFmt("json")}>
          Query + result JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            download(
              "trends-query.json",
              JSON.stringify(query, null, 2),
              "application/json",
            )
          }
        >
          Query JSON only
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

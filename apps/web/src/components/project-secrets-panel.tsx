import { CopyIcon, DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

export function SecretsPanel({
  secretsYaml,
  copied,
  onCopy,
  onDownload,
}: {
  secretsYaml?: string | null
  copied: boolean
  onCopy: () => void
  onDownload: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>secrets.yaml</CardTitle>
        <CardDescription>
          Host-facing connection material. Containers receive rewritten Docker
          DNS URLs on deploy.
        </CardDescription>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCopy}>
            <CopyIcon data-icon="inline-start" />
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" onClick={onDownload}>
            <DownloadIcon data-icon="inline-start" />
            Download
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72 rounded-lg border bg-muted/40">
          <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre">
            {secretsYaml || "(no secrets)"}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

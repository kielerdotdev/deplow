/**
 * Short Hostrig marketing demo — AI-agent-native pitch.
 * 1080p + OpenRouter TTS + animated agent scenes.
 *
 * Default voice (2026): Deepgram Aura-2 — natural, less “AI narrator”
 * than Gemini Flash TTS. Alternatives via env:
 *   TTS_MODEL=x-ai/grok-voice-tts-1.0 DEMO_VOICE=leo
 *   TTS_MODEL=mistralai/voxtral-mini-tts-2603 DEMO_VOICE=en_paul_excited
 *   TTS_MODEL=google/gemini-3.1-flash-tts-preview DEMO_VOICE=Puck
 *
 * For max produced-audio quality outside OpenRouter: ElevenLabs v3.
 *
 *   OPENROUTER_API_KEY in .env.demo
 *   pnpm demo:video
 */
import { mkdir, writeFile, rm, readFile, access } from "node:fs/promises"
import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "tmp/marketing-demo")
const PUBLIC_OUT = path.join(ROOT, "apps/site/public/demo")
const SCENE_HTML = path.join(ROOT, "scripts/demo-scenes/agent-native.html")

await loadEnvFile(path.join(ROOT, ".env.demo"))

const BASE = process.env.BASE_URL ?? "https://hostrig.waitforit.cc"
const SITE = process.env.SITE_URL ?? "https://hostrig.com"
const EMAIL = process.env.SCREENSHOT_EMAIL ?? "marketing@hostrig.local"
const PASS = process.env.SCREENSHOT_PASSWORD ?? "marketing-screenshots-1"
const PROJECT_NAME = process.env.SCREENSHOT_PROJECT ?? "showcase"
const OR_KEY = process.env.OPENROUTER_API_KEY
const TTS_MODEL = process.env.TTS_MODEL ?? "deepgram/aura-2"
const VOICE = process.env.DEMO_VOICE ?? "aura-2-orion-en"
const W = 1920
const H = 1080

// Spoken copy — energy in the words. No [emotion] tags (Gemini-only; other
// models will read them aloud or flatten the delivery).
const SCRIPT = [
  "Hostrig.",
  "Tell an agent what you want deployed — and watch it ship.",
  "It spins up the project, wires Postgres, and puts your app on a public URL.",
  "Under a minute.",
  "No catalogs. No Compose. Just the loop.",
  "Start at hostrig.com.",
].join(" ")

const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

async function loadEnvFile(file) {
  try {
    await access(file)
  } catch {
    return
  }
  const text = await readFile(file, "utf8")
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "")
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let err = ""
    child.stderr.on("data", (d) => {
      err += d
    })
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} failed\n${err.slice(-1200)}`))
    })
  })
}

function probeDuration(file) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { encoding: "utf8" },
  )
  return Number.parseFloat(r.stdout.trim()) || 0
}

async function browserLogin(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 })
  const status = await page.evaluate(
    async ({ email, password }) => {
      let res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        res = await fetch("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: "Marketing", email, password }),
        })
      }
      return res.status
    },
    { email: EMAIL, password: PASS },
  )
  if (status >= 400) throw new Error(`Auth failed on ${BASE}: ${status}`)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90_000 })
  if (page.url().includes("/login")) {
    throw new Error("Session did not stick on deployed app")
  }
}

async function resolveProjectId(page) {
  const listed = await page.evaluate(async () => {
    const res = await fetch("/api/rpc/projects/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ json: {} }),
    })
    return res.json()
  })
  const projects = Array.isArray(listed.json)
    ? listed.json
    : (listed.json?.projects ?? [])
  const project = projects.find(
    (p) => p.name === PROJECT_NAME || p.slug === PROJECT_NAME,
  )
  if (!project) throw new Error(`Project "${PROJECT_NAME}" not found on ${BASE}`)
  return project.id
}

function ttsResponseFormat(model) {
  // Gemini speech endpoint returns 24kHz s16le PCM; others return mp3.
  if (model.includes("gemini")) return "pcm"
  return "mp3"
}

async function synthesizeVoice(outWav) {
  if (!OR_KEY) {
    throw new Error("OPENROUTER_API_KEY missing (.env.demo)")
  }
  const format = ttsResponseFormat(TTS_MODEL)
  const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OR_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hostrig.com",
      "X-Title": "Hostrig Marketing Demo",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: SCRIPT,
      voice: VOICE,
      response_format: format,
    }),
  })
  if (!res.ok) {
    throw new Error(`OpenRouter TTS ${res.status}: ${(await res.text()).slice(0, 400)}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength < 1000) throw new Error("TTS returned empty audio")

  const af =
    "loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo"
  if (format === "pcm") {
    const pcmPath = path.join(OUT, "voice.pcm")
    await writeFile(pcmPath, buf)
    await run("ffmpeg", [
      "-y",
      "-f",
      "s16le",
      "-ar",
      "24000",
      "-ac",
      "1",
      "-i",
      pcmPath,
      "-af",
      af,
      outWav,
    ])
  } else {
    const mp3Path = path.join(OUT, "voice.mp3")
    await writeFile(mp3Path, buf)
    await run("ffmpeg", ["-y", "-i", mp3Path, "-af", af, outWav])
  }
}

async function savePageVideo(page, dest) {
  const video = page.video()
  await page.close()
  if (!video) throw new Error(`No video for ${dest}`)
  await run("cp", [await video.path(), dest])
}

async function cinematicZoom(page, scale = 1.12, ms = 1600) {
  await page.evaluate(
    async ({ scale, ms }) => {
      const root = document.documentElement
      root.style.transformOrigin = "50% 42%"
      root.style.transition = `transform ${ms}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
      root.style.transform = `scale(${scale})`
      await new Promise((r) => setTimeout(r, ms))
    },
    { scale, ms },
  )
}

async function recordClips(projectId) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  })

  {
    const authCtx = await browser.newContext({
      viewport: { width: W, height: H },
      ignoreHTTPSErrors: true,
    })
    const authPage = await authCtx.newPage()
    await browserLogin(authPage)
    await writeFile(
      path.join(OUT, "state.json"),
      JSON.stringify(await authCtx.storageState()),
    )
    await authCtx.close()
  }

  // Animations NEED motion — never reducedMotion
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    ignoreHTTPSErrors: true,
    storageState: path.join(OUT, "state.json"),
    recordVideo: { dir: path.join(OUT, "raw"), size: { width: W, height: H } },
  })

  const ordered = []
  const sceneUrl = pathToFileURL(SCENE_HTML).href

  // 1 — Full agent-native animation (prompt → DB → live)
  {
    const page = await context.newPage()
    await page.goto(sceneUrl, { waitUntil: "networkidle", timeout: 60_000 })
    await page.waitForFunction(() => document.body.dataset.done === "1", null, {
      timeout: 20_000,
    })
    await page.waitForTimeout(400)
    const dest = path.join(OUT, "raw", "01-agent.webm")
    await savePageVideo(page, dest)
    ordered.push(dest)
  }

  // 2 — Live dashboard (healthy project, no error noise)
  {
    const page = await context.newPage()
    await page.goto(`${BASE}/projects/${projectId}`, {
      waitUntil: "networkidle",
      timeout: 90_000,
    })
    await page
      .getByText(/showcase|Add service|Services|Healthy|running/i)
      .first()
      .waitFor({ timeout: 45_000 })
    await page.evaluate(() => {
      document
        .querySelectorAll("[data-sonner-toaster], [role='alertdialog']")
        .forEach((el) => el.remove())
    })
    await page.waitForTimeout(900)
    await page.evaluate(() => {
      const el =
        document.querySelector("[data-service], .service-card, article") ||
        document.body
      el?.scrollIntoView({ block: "center", behavior: "instant" })
    })
    await page.waitForTimeout(400)
    await cinematicZoom(page, 1.18, 1800)
    await page.waitForTimeout(1400)
    const dest = path.join(OUT, "raw", "02-dashboard.webm")
    await savePageVideo(page, dest)
    ordered.push(dest)
  }

  // 3 — Deployed product (real test site on public URL)
  {
    const page = await context.newPage()
    await page.goto("https://showcase.waitforit.cc/", {
      waitUntil: "networkidle",
      timeout: 60_000,
    })
    await page.getByText(/Acme Shop|Live on Hostrig/i).first().waitFor({
      timeout: 20_000,
    })
    await page.waitForTimeout(700)
    await cinematicZoom(page, 1.12, 1600)
    await page.waitForTimeout(1400)
    const dest = path.join(OUT, "raw", "03-product.webm")
    await savePageVideo(page, dest)
    ordered.push(dest)
  }

  // 4 — Marketing site brand beat
  {
    const page = await context.newPage()
    await page.goto(SITE, { waitUntil: "networkidle", timeout: 90_000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(700)
    await cinematicZoom(page, 1.1, 1400)
    await page.waitForTimeout(900)
    const dest = path.join(OUT, "raw", "04-site.webm")
    await savePageVideo(page, dest)
    ordered.push(dest)
  }

  await context.close()
  await browser.close()
  return ordered
}

async function normalizeClip(input, output, seconds, startSec = 0, pushIn = true) {
  const scale = pushIn ? W * 1.1 : W
  const vf = [
    `scale=${scale}:${H * (pushIn ? 1.1 : 1)}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
    `fps=30`,
    `setpts=PTS-STARTPTS`,
    `eq=contrast=1.05:saturation=1.08:brightness=0.01`,
    `unsharp=5:5:0.4:5:5:0.0`,
    `format=yuv420p`,
  ].join(",")
  const args = ["-y"]
  if (startSec > 0) args.push("-ss", String(startSec))
  args.push(
    "-i",
    input,
    "-vf",
    vf,
    "-t",
    String(seconds),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "17",
    "-r",
    "30",
    "-vsync",
    "cfr",
    output,
  )
  await run("ffmpeg", args)
}

async function makeEndcard(output, seconds) {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x09090b:s=${W}x${H}:d=${seconds}:r=30`,
    "-vf",
    [
      `fps=30`,
      `setpts=PTS-STARTPTS`,
      `drawtext=fontfile=${FONT}:text='AI Agent Native':fontsize=32:fontcolor=0xa1a1aa:x=(w-text_w)/2:y=(h/2)-150`,
      `drawtext=fontfile=${FONT}:text='Hostrig':fontsize=96:fontcolor=0xfafafa:x=(w-text_w)/2:y=(h/2)-90`,
      `drawtext=fontfile=${FONT}:text='One prompt. Live product.':fontsize=36:fontcolor=0xa1a1aa:x=(w-text_w)/2:y=(h/2)+20`,
      `drawtext=fontfile=${FONT}:text='hostrig.com':fontsize=44:fontcolor=0xfafafa:x=(w-text_w)/2:y=(h/2)+100`,
      `format=yuv420p`,
    ].join(","),
    "-c:v",
    "libx264",
    "-r",
    "30",
    "-vsync",
    "cfr",
    "-t",
    String(seconds),
    output,
  ])
}

async function fadeClip(input, output, seconds) {
  const fadeOut = Math.max(seconds - 0.32, 0.1).toFixed(2)
  await run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-vf",
    `fade=t=in:st=0:d=0.25,fade=t=out:st=${fadeOut}:d=0.32,fps=30,format=yuv420p`,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "17",
    "-r",
    "30",
    "-vsync",
    "cfr",
    "-t",
    String(seconds),
    output,
  ])
}

async function compose(clips, voiceWav, finalMp4, audioDur) {
  const endcardSec = 2.4
  // Agent story first, then dashboard → live product → brand
  const agentDur = Math.max(probeDuration(clips[0]) - 0.15, 11.2)
  const rest = Math.max(audioDur + endcardSec - agentDur, 8.5)
  const durations = [
    agentDur,
    rest * 0.28,
    rest * 0.42,
    rest * 0.3,
  ]
  const startOffsets = [0.02, 0.7, 0.05, 0.1]
  const pushIns = [false, true, true, true]

  const parts = []
  for (let i = 0; i < Math.min(clips.length, 4); i++) {
    const raw = path.join(OUT, `clip-${i}-raw.mp4`)
    const faded = path.join(OUT, `clip-${i}.mp4`)
    await normalizeClip(
      clips[i],
      raw,
      durations[i],
      startOffsets[i],
      pushIns[i],
    )
    await fadeClip(raw, faded, durations[i])
    parts.push(faded)
  }

  const endcard = path.join(OUT, "endcard.mp4")
  await makeEndcard(endcard, endcardSec)
  const endFaded = path.join(OUT, "endcard-faded.mp4")
  await fadeClip(endcard, endFaded, endcardSec)
  parts.push(endFaded)

  const listFile = path.join(OUT, "concat.txt")
  await writeFile(
    listFile,
    parts.map((f) => `file '${f}'`).join("\n") + "\n",
  )

  const silent = path.join(OUT, "video-silent.mp4")
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "17",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-vsync",
    "cfr",
    silent,
  ])

  const videoDur = probeDuration(silent)
  const total = Math.max(videoDur, audioDur) + 0.45
  const fadeOutAt = Math.max(total - 0.7, 1).toFixed(2)
  const audioFade = Math.max(audioDur - 0.5, 0).toFixed(2)

  await run("ffmpeg", [
    "-y",
    "-i",
    silent,
    "-i",
    voiceWav,
    "-filter_complex",
    `[0:v]fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutAt}:d=0.65,tpad=stop_mode=clone:stop_duration=0.4[v];` +
      `[1:a]afade=t=in:st=0:d=0.1,afade=t=out:st=${audioFade}:d=0.45,apad=pad_dur=0.6[a]`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "17",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-t",
    String(total),
    "-movflags",
    "+faststart",
    finalMp4,
  ])
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(path.join(OUT, "raw"), { recursive: true })
  await mkdir(PUBLIC_OUT, { recursive: true })

  console.log("Base:", BASE)
  console.log("Site:", SITE)
  console.log("TTS:", TTS_MODEL, "voice:", VOICE)
  console.log("Script:", SCRIPT)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await browserLogin(page)
  const projectId = await resolveProjectId(page)
  console.log("Project:", projectId)
  await browser.close()

  const voiceWav = path.join(OUT, "voice.wav")
  console.log("Synthesizing voice…")
  await synthesizeVoice(voiceWav)
  const audioDur = probeDuration(voiceWav)
  console.log("Voice duration:", audioDur.toFixed(2), "s")

  console.log("Recording clips (agent anim + dashboard zooms)…")
  const clips = await recordClips(projectId)
  console.log(
    "Clips:",
    clips.map((c) => path.basename(c)).join(", "),
  )

  const finalMp4 = path.join(OUT, "hostrig-demo.mp4")
  console.log("Composing…")
  await compose(clips, voiceWav, finalMp4, audioDur)

  const publicMp4 = path.join(PUBLIC_OUT, "hostrig-demo.mp4")
  await run("cp", [finalMp4, publicMp4])

  const publicPoster = path.join(PUBLIC_OUT, "hostrig-demo-poster.jpg")
  await run("ffmpeg", [
    "-y",
    "-ss",
    "8",
    "-i",
    finalMp4,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    publicPoster,
  ])

  const dur = probeDuration(finalMp4)
  await writeFile(
    path.join(OUT, "manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        pitch: "AI agent native — bare project to live product under 1 minute",
        baseUrl: BASE,
        siteUrl: SITE,
        script: SCRIPT,
        ttsModel: TTS_MODEL,
        voice: VOICE,
        durationSec: dur,
        files: { final: finalMp4, public: publicMp4 },
      },
      null,
      2,
    ) + "\n",
  )

  console.log("\nDone.")
  console.log("  ", finalMp4)
  console.log("  ", publicMp4)
  console.log("  duration:", dur.toFixed(1), "s")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

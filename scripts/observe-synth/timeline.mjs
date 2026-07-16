/**
 * Timeline engine — diurnal curve + named incidents (PostHog historical seed style).
 * progress ∈ [0,1] over the backfill window.
 */

export function sampleTime(rng, from, now) {
  // Importance sampling toward recent + peak business hours (UTC 13–20)
  if (rng() < 0.55) {
    // recent 30% of window
    const span = (now - from) * 0.3
    return now - Math.floor(rng() * span)
  }
  // diurnal: prefer "daytime" buckets
  for (let attempt = 0; attempt < 6; attempt++) {
    const t = from + Math.floor(rng() * (now - from))
    const hour = new Date(t).getUTCHours()
    const dayWeight = hour >= 13 && hour <= 20 ? 1 : hour >= 8 && hour < 13 ? 0.55 : 0.2
    if (rng() < dayWeight) return t
  }
  return from + Math.floor(rng() * (now - from))
}

export function timelineAt(t, from, now) {
  const progress = (t - from) / Math.max(now - from, 1)
  const hour = new Date(t).getUTCHours()
  const trafficMul =
    hour >= 13 && hour <= 20 ? 1.35 : hour >= 8 && hour < 13 ? 1.0 : 0.45

  // Named incidents along the window (Sentry demo narrative)
  const slowBand = progress > 0.38 && progress < 0.62
  const regression = progress > 0.5 && progress < 0.78 // 1.3.0 rollout
  const errorStorm = progress > 0.68 && progress < 0.8
  const canary = progress > 0.82
  const deployBlip = progress > 0.48 && progress < 0.52

  return {
    progress,
    hour,
    trafficMul,
    slowBand,
    regression,
    errorStorm,
    canary,
    deployBlip,
    latencyMul: slowBand ? 2.4 : regression ? 1.6 : deployBlip ? 1.9 : 1,
    errorMul: errorStorm ? 3.2 : regression ? 2.2 : deployBlip ? 1.5 : 1,
  }
}

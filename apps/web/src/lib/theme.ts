export type ThemeMode = "light" | "dark"

const STORAGE_KEY = "deplow.theme"

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === "light" || v === "dark") return v
  } catch {
    /* ignore */
  }
  return null
}

/** Product default is light (“Instrument white”); only explicit storage overrides. */
export function resolveTheme(stored: ThemeMode | null): ThemeMode {
  return stored ?? "light"
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.classList.toggle("dark", mode === "dark")
  root.style.colorScheme = mode
  root.dataset.theme = mode
}

export function setTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
  applyTheme(mode)
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark"
  setTheme(next)
  return next
}

/** Inline boot script — keep in sync with STORAGE_KEY / class names. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(STORAGE_KEY)};var s=localStorage.getItem(k);var m=s==="dark"?"dark":"light";var r=document.documentElement;r.classList.toggle("dark",m==="dark");r.style.colorScheme=m;r.dataset.theme=m}catch(e){}})();`

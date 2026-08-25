export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "blast-radius-theme";

/**
 * Theme state lives in localStorage and on the `data-theme` attribute, not in
 * React state.
 *
 * It is read through `useSyncExternalStore` rather than an effect, which means
 * no state is set during render or in an effect body, the server render has a
 * defined snapshot, and a change in one browser tab reaches the others through
 * the native `storage` event.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Fires when another tab writes the key.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Private browsing and blocked site data both throw here.
    return "system";
  }
}

/** The server has no viewer preference, so it always renders the system state. */
export function getServerSnapshot(): Theme {
  return "system";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can fail; the attribute below still applies for this page view.
  }
  applyTheme(theme);
  notify();
}

/**
 * Runs before first paint, inlined into the document head.
 *
 * Without this the page renders with the default palette and then corrects
 * itself once React hydrates, which is a visible flash of the wrong theme.
 * Kept as a string so it can be injected synchronously.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

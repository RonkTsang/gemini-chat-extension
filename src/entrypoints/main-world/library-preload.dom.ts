export function findLibraryPreloadScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"][data-bg3-relay-preload]',
  ))
}

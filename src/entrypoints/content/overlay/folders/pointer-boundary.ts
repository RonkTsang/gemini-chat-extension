/**
 * Uses the composed event path so an element inside our Shadow DOM is not
 * mistaken for an outside press after the browser retargets event.target to
 * the Shadow host for document listeners.
 */
export function isEventInsideElement(event: Event, element: Element | null): boolean {
  if (!element) return false
  return event.composedPath().some((target) => (
    target instanceof Node && (target === element || element.contains(target))
  ))
}

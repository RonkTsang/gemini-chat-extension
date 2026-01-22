/**
 * Tab Title Sync Service
 * Automatically syncs Gemini chat title to browser tab title using layered MutationObserver strategy
 */

class TabTitleSync {
  private domTreeObserver: MutationObserver | null = null      // Outer: monitors DOM tree
  private titleContentObserver: MutationObserver | null = null // Inner: monitors title content
  private currentTitleElement: HTMLElement | null = null       // Current title element reference
  private lastTitle: string = ''                               // Cache for debouncing
  private fallbackTitle: string = ''                           // Fallback title when no chat title exists
  private isActive = false

  /**
   * Start monitoring tab title
   */
  start(): void {
    if (this.isActive) return
    
    this.isActive = true
    console.log('[TabTitleSync] Starting tab title sync...')
    
    // Setup outer observer to monitor DOM tree
    this.setupDomTreeObserver()
    
    // Initial check for existing title element
    this.checkAndAttachTitleObserver()
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    if (!this.isActive) return
    
    this.isActive = false
    console.log('[TabTitleSync] Stopping tab title sync...')
    
    // Disconnect outer observer
    if (this.domTreeObserver) {
      this.domTreeObserver.disconnect()
      this.domTreeObserver = null
    }
    
    // Cleanup inner observer
    this.detachTitleObserver()
  }

  /**
   * Setup outer observer to monitor DOM tree for title element appearance/disappearance
   */
  private setupDomTreeObserver(): void {
    // Choose root node: prefer #app-root, fallback to body
    const rootNode = document.getElementById('app-root') || document.body
    
    // Create outer observer
    this.domTreeObserver = new MutationObserver(this.onDOMTreeChange)
    
    // Observer config: monitor structure changes
    const config: MutationObserverInit = {
      childList: true,  // Monitor child node addition/removal
      subtree: true     // Recursively monitor entire subtree
    }
    
    this.domTreeObserver.observe(rootNode, config)
    console.log('[TabTitleSync] DOM tree observer attached to:', rootNode.tagName)
  }

  /**
   * Outer observer callback: check if title element appeared/disappeared
   */
  private onDOMTreeChange = (): void => {
    this.checkAndAttachTitleObserver()
  }

  /**
   * Check for title element and attach inner observer if found
   */
  private checkAndAttachTitleObserver(): void {
    // Priority 1: Chat conversation title
    let titleElement = document.querySelector('.conversation-title.gds-title-m') as HTMLElement | null
    let titleType = 'chat'
    
    // Priority 2: MyStuff page title (with parent container for precision)
    if (!titleElement) {
      titleElement = document.querySelector('library-sections-overview-page .library-overview-page-container .headline.gds-headline-m') as HTMLElement | null
      titleType = 'mystuff'
    }

    // Priority 3: Document page title
    if (!titleElement) {
      titleElement = document.querySelector('library-page .headline.gds-headline-m') as HTMLElement | null
      titleType = 'document'
    }
    
    if (titleElement && titleElement !== this.currentTitleElement) {
      // Title element appeared or was replaced
      console.log(`[TabTitleSync] Title element appeared (${titleType})`)
      this.detachTitleObserver()  // Cleanup old observer
      this.attachTitleObserver(titleElement)
      
      // Immediately sync current title
      const currentTitle = titleElement.textContent?.trim() || ''
      this.updateTabTitle(currentTitle)
    } else if (!titleElement && this.currentTitleElement) {
      // Title element disappeared
      console.log('[TabTitleSync] Title element disappeared')
      this.detachTitleObserver()
    }
  }

  /**
   * Attach inner observer to monitor title element content changes
   */
  private attachTitleObserver(element: HTMLElement): void {
    this.currentTitleElement = element
    
    // Create inner observer
    this.titleContentObserver = new MutationObserver(this.onTitleContentChange)
    
    // Observer config: monitor content changes
    const config: MutationObserverInit = {
      childList: true,      // Monitor child node replacement
      characterData: true,  // Monitor text node content changes
      subtree: true         // Recursively monitor all descendants
    }
    
    this.titleContentObserver.observe(element, config)
    console.log('[TabTitleSync] Title content observer attached')
  }

  /**
   * Detach inner observer and cleanup
   */
  private detachTitleObserver(): void {
    if (this.titleContentObserver) {
      this.titleContentObserver.disconnect()
      this.titleContentObserver = null
    }
    this.currentTitleElement = null
    this.lastTitle = ''  // Clear cache to force update on next title appearance
    
    // Restore fallback title when chat title element disappears
    if (this.fallbackTitle) {
      document.title = this.fallbackTitle
      console.log('[TabTitleSync] Restored fallback title:', this.fallbackTitle)
    }
  }

  /**
   * Inner observer callback: handle title content changes
   */
  private onTitleContentChange = (): void => {
    // Read latest title from current element
    const currentTitle = this.currentTitleElement?.textContent?.trim() || ''
    
    // Debounce: only update if title actually changed
    if (currentTitle && currentTitle !== this.lastTitle) {
      this.updateTabTitle(currentTitle)
    }
  }

  /**
   * Update tab title with debouncing
   */
  private updateTabTitle(title: string): void {
    if (!title) return  // Skip empty titles
    
    // Save current document.title as fallback on first update
    if (!this.fallbackTitle) {
      this.fallbackTitle = document.title
      console.log('[TabTitleSync] Fallback title saved:', this.fallbackTitle)
    }
    
    if (title !== this.lastTitle) {
      document.title = title
      this.lastTitle = title
      console.log('[TabTitleSync] Tab title updated:', title)
    }
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.isActive
  }
}

// Global instance
export const tabTitleSync = new TabTitleSync()

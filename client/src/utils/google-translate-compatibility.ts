/**
 * Google Translate Compatibility Handler
 * 
 * Handles DOM manipulation conflicts between Google Translate and React's virtual DOM.
 * This utility provides silent error handling for translation-related DOM issues.
 */

let isTranslateActive = false;
let originalInsertBefore: (typeof Node.prototype.insertBefore) | undefined;
let originalRemoveChild: (typeof Node.prototype.removeChild) | undefined;
let originalReplaceChild: (typeof Node.prototype.replaceChild) | undefined;
let originalAppendChild: (typeof Node.prototype.appendChild) | undefined;

/**
 * Detects if Google Translate is active on the page
 */
function detectGoogleTranslate(): boolean {
  return !!(
    document.querySelector('.goog-te-banner-frame') ||
    document.querySelector('.skiptranslate') ||
    document.querySelector('[class*="goog-te"]') ||
    document.documentElement.classList.contains('translated-ltr') ||
    document.documentElement.classList.contains('translated-rtl') ||
    document.body.classList.contains('translated-ltr') ||
    document.body.classList.contains('translated-rtl')
  );
}


/**
 * Initialize Google Translate compatibility handling
 */
export function initializeGoogleTranslateCompatibility(): void {

  if (originalInsertBefore) return;


  originalInsertBefore = Node.prototype.insertBefore;
  originalRemoveChild = Node.prototype.removeChild;
  originalReplaceChild = Node.prototype.replaceChild;
  originalAppendChild = Node.prototype.appendChild;


  Node.prototype.insertBefore = function<T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    try {
      return (originalInsertBefore as any).call(this, newNode, referenceNode);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'HierarchyRequestError')) {
        try {
          return (originalAppendChild as any).call(this, newNode);
        } catch {
          return newNode;
        }
      }
      throw error;
    }
  } as any;

  Node.prototype.removeChild = function<T extends Node>(this: Node, child: T): T {
    try {
      return (originalRemoveChild as any).call(this, child);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return child;
      }
      throw error;
    }
  } as any;

  Node.prototype.replaceChild = function<T extends Node>(this: Node, newChild: Node, oldChild: T): T {
    try {
      return (originalReplaceChild as any).call(this, newChild, oldChild);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'HierarchyRequestError')) {
        try {
          (originalAppendChild as any).call(this, newChild);
          return oldChild;
        } catch {
          return oldChild;
        }
      }
      throw error;
    }
  } as any;


  const checkTranslateStatus = () => {
    const wasActive = isTranslateActive;
    isTranslateActive = detectGoogleTranslate();
    

    if (!wasActive && isTranslateActive) {
      setTimeout(() => {

        window.dispatchEvent(new Event('resize'));
      }, 100);
    }
  };


  checkTranslateStatus();


  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    
    for (const mutation of mutations) {

      if (mutation.type === 'attributes' && 
          (mutation.target as Element).className?.includes('goog-te')) {
        shouldCheck = true;
        break;
      }
      
      if (mutation.type === 'childList') {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.className?.includes('goog-te') || 
                element.tagName === 'FONT' || 
                element.getAttribute('class')?.includes('translated')) {
              shouldCheck = true;
              break;
            }
          }
        }
      }
      
      if (shouldCheck) break;
    }
    
    if (shouldCheck) {
      checkTranslateStatus();
    }
  });


  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: false, // Only watch top level to minimize performance impact
    attributeFilter: ['class', 'lang'] // Only watch relevant attributes
  });


  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(checkTranslateStatus, 50);
    }
  });
}

/**
 * Cleanup function (optional, for testing or special cases)
 */
export function cleanupGoogleTranslateCompatibility(): void {
  if (originalInsertBefore && originalRemoveChild && originalReplaceChild) {
    Node.prototype.insertBefore = originalInsertBefore;
    Node.prototype.removeChild = originalRemoveChild;
    Node.prototype.replaceChild = originalReplaceChild;

    originalInsertBefore = undefined;
    originalRemoveChild = undefined;
    originalReplaceChild = undefined;
  }
}

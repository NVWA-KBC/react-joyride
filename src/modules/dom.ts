function isScrolling(node: Element) {
  const overflow = getComputedStyle(node, null).getPropertyValue('overflow');

  return overflow.includes('scroll') || overflow.includes('auto');
}

function scrollParent(node: Element): HTMLElement | undefined {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) {
    return undefined;
  }

  let current = node.parentNode;

  while (current?.parentNode) {
    if (isScrolling(current as HTMLElement)) {
      return current as HTMLElement;
    }

    current = current.parentNode;
  }

  return (document.scrollingElement || document.documentElement) as HTMLElement;
}

export function canUseDOM() {
  return !!(typeof window !== 'undefined' && window.document?.createElement);
}

/**
 * Find the bounding client rect
 */
export function getClientRect(element: HTMLElement | null) {
  if (!element) {
    return null;
  }

  return element.getBoundingClientRect();
}

/**
 * Helper function to get the browser-normalized "document height"
 */
export function getDocumentHeight(median = false): number {
  const { body, documentElement } = document;

  if (!body || !documentElement) {
    return 0;
  }

  if (median) {
    const heights = [
      body.scrollHeight,
      body.offsetHeight,
      documentElement.clientHeight,
      documentElement.scrollHeight,
      documentElement.offsetHeight,
    ].sort((a, b) => a - b);
    const middle = Math.floor(heights.length / 2);

    if (heights.length % 2 === 0) {
      return (heights[middle - 1] + heights[middle]) / 2;
    }

    return heights[middle];
  }

  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    documentElement.clientHeight,
    documentElement.scrollHeight,
    documentElement.offsetHeight,
  );
}

/**
 * Find and return the target DOM element based on a step's 'target'.
 */
export function getElement(
  element?: string | HTMLElement,
  parentElement?: string | HTMLElement,
): HTMLElement | null {
  if (!element) {
    return null;
  }

  let rootElement: Document | ShadowRoot = document;

  if (parentElement) {
    rootElement =
      typeof parentElement === 'string'
        ? document.getElementById(parentElement)?.shadowRoot || document
        : parentElement.shadowRoot || document;
  }

  if (typeof element === 'string') {
    try {
      return rootElement.querySelector(element);
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error(error);
      }

      return null;
    }
  }

  return element;
}

/**
 * Find and return the target DOM element based on a step's 'target'.
 */
export function getElementPosition(
  element: HTMLElement | null,
  offset: number,
  skipFix: boolean,
): number {
  const elementRect = getClientRect(element);
  const parent = getScrollParent(element, skipFix);
  const hasScrollParent = hasCustomScrollParent(element, skipFix);
  const isFixedTarget = hasPosition(element);
  let parentTop = 0;
  let top = elementRect?.top ?? 0;

  if (hasScrollParent && isFixedTarget) {
    const offsetTop = element?.offsetTop ?? 0;
    const parentScrollTop = (parent as HTMLElement)?.scrollTop ?? 0;

    top = offsetTop - parentScrollTop;
  } else if (parent instanceof HTMLElement) {
    parentTop = parent.scrollTop;

    if (!hasScrollParent && !hasPosition(element)) {
      top += parentTop;
    }

    if (!parent.isSameNode(scrollDocument())) {
      top += scrollDocument().scrollTop;
    }
  }

  return Math.floor(top - offset);
}

/**
 * Get scroll parent with fix
 */
export function getScrollParent(
  element: HTMLElement | null,
  skipFix: boolean,
  forListener?: boolean,
) {
  if (!element) {
    return scrollDocument();
  }

  const parent = scrollParent(element) as HTMLElement;

  if (parent) {
    if (parent.isSameNode(scrollDocument())) {
      if (forListener) {
        return document;
      }

      return scrollDocument();
    }

    const hasScrolling = parent.scrollHeight > parent.offsetHeight;

    if (!hasScrolling && !skipFix) {
      parent.style.overflow = 'initial';

      return scrollDocument();
    }
  }

  return parent;
}

/**
 * Get the scrollTop position
 */
export function getScrollTo(element: HTMLElement | null, offset: number, skipFix: boolean): number {
  if (!element) {
    return 0;
  }

  const { offsetTop = 0, scrollTop = 0 } = scrollParent(element) ?? {};
  let top = element.getBoundingClientRect().top + scrollTop;

  if (!!offsetTop && (hasCustomScrollParent(element, skipFix) || hasCustomOffsetParent(element))) {
    top -= offsetTop;
  }

  const output = Math.floor(top - offset);

  return output < 0 ? 0 : output;
}

/**
 *  Get computed style property
 */
export function getStyleComputedProperty(el: HTMLElement): CSSStyleDeclaration | null {
  if (!el || el.nodeType !== 1) {
    return null;
  }

  return getComputedStyle(el);
}

/**
 * Check if the element has custom offset parent
 */
export function hasCustomOffsetParent(element: HTMLElement): boolean {
  return element.offsetParent !== document.body;
}

/**
 * Check if the element has custom scroll parent
 */
export function hasCustomScrollParent(element: HTMLElement | null, skipFix: boolean): boolean {
  if (!element) {
    return false;
  }

  const parent = getScrollParent(element, skipFix);

  return parent ? !parent.isSameNode(scrollDocument()) : false;
}

/**
 * Check if an element has fixed/sticky position
 */
export function hasPosition(el: HTMLElement | Node | null, type: string = 'fixed'): boolean {
  if (!el || !(el instanceof HTMLElement)) {
    return false;
  }

  const { nodeName } = el;
  const styles = getStyleComputedProperty(el);

  if (nodeName === 'BODY' || nodeName === 'HTML') {
    return false;
  }

  if (styles && styles.position === type) {
    return true;
  }

  if (!el.parentNode) {
    return false;
  }

  return hasPosition(el.parentNode, type);
}

/**
 * Check if the element is visible
 */
export function isElementVisible(element: HTMLElement): element is HTMLElement {
  if (!element) {
    return false;
  }

  let parentElement: HTMLElement | null = element;

  while (parentElement) {
    if (parentElement === document.body) {
      break;
    }

    if (parentElement instanceof HTMLElement) {
      const { display, visibility } = getComputedStyle(parentElement);

      if (display === 'none' || visibility === 'hidden') {
        return false;
      }
    }

    parentElement = parentElement.parentElement ?? null;
  }

  return true;
}

export function scrollDocument(): Element | HTMLElement {
  return document.scrollingElement ?? document.documentElement;
}

import {CSSProperties, useCallback, useEffect, useMemo, useRef} from 'react';
import {useIsMounted, useMount, useSetState, useUnmount} from '@gilbarbara/hooks';
import useTreeChanges from 'tree-changes-hook';

import {LIFECYCLE} from '~/literals';
import {
  getClientRect,
  getDocumentHeight,
  getElement,
  getElementPosition,
  getScrollParent,
  hasCustomScrollParent,
  hasPosition,
} from '~/modules/dom';
import {getBrowser, isLegacy, log} from '~/modules/helpers';

import {Lifecycle, OverlayProps} from '~/types';

import Spotlight from './Spotlight';

interface SpotlightStyles extends CSSProperties {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface State {
  isScrolling: boolean;
  mouseOverSpotlight: boolean;
  resizedAt: number;
  showSpotlight: boolean;
}

export default function JoyrideOverlay(props: Readonly<OverlayProps>) {
  const {
    continuous,
    debug,
    disableOverlay,
    disableOverlayClose,
    disableScrolling,
    disableScrollParentFix = false,
    lifecycle,
    onClickOverlay,
    placement,
    shadowRootTarget,
    spotlightClicks,
    spotlightPadding = 0,
    styles,
    target,
  } = props;
  const isMounted = useIsMounted();

  const { changed } = useTreeChanges(props);
  const resizeTimeoutRef = useRef<number>();
  const scrollTimeoutRef = useRef<number>();
  const scrollParentRef = useRef<Element | Document | null>(null);

  const [{ isScrolling, mouseOverSpotlight, showSpotlight }, setState] = useSetState<State>({
    isScrolling: false,
    mouseOverSpotlight: false,
    resizedAt: 0,
    showSpotlight: true,
  });

  const updateState = useCallback(
    (state: Partial<State>) => {
      setState(state);
    },
    [setState],
  );

  const overlayStyles = useMemo(() => {
    let baseStyles = styles.overlay;

    if (isLegacy()) {
      baseStyles = placement === 'center' ? styles.overlayLegacyCenter : styles.overlayLegacy;
    }

    return {
      cursor: disableOverlayClose ? 'default' : 'pointer',
      height: getDocumentHeight(),
      pointerEvents: mouseOverSpotlight ? 'none' : 'auto',
      ...baseStyles,
    } as CSSProperties;
  }, [
    disableOverlayClose,
    mouseOverSpotlight,
    placement,
    styles.overlay,
    styles.overlayLegacy,
    styles.overlayLegacyCenter,
  ]);

  const spotlightStyles = useMemo(() => {
    const element = getElement(target, shadowRootTarget);
    const elementRect = getClientRect(element);
    const isFixedTarget = hasPosition(element);
    const top = getElementPosition(element, spotlightPadding, disableScrollParentFix);

    return {
      height: Math.round((elementRect?.height ?? 0) + spotlightPadding * 2),
      left: Math.round((elementRect?.left ?? 0) - spotlightPadding),
      opacity: showSpotlight ? 1 : 0,
      pointerEvents: spotlightClicks ? 'none' : 'auto',
      top,
      transition: 'opacity 0.2s',
      width: Math.round((elementRect?.width ?? 0) + spotlightPadding * 2),
      ...(isLegacy() ? styles.spotlightLegacy : styles.spotlight),
      position: isFixedTarget ? 'fixed' : 'absolute',
    } satisfies SpotlightStyles;
  }, [
    disableScrollParentFix,
    showSpotlight,
    spotlightClicks,
    spotlightPadding,
    styles.spotlight,
    styles.spotlightLegacy,
    target,
    shadowRootTarget,
  ]);

  // Use a ref to track current mouseOverSpotlight value to avoid circular dependencies
  const mouseOverSpotlightRef = useRef(mouseOverSpotlight);
  
  // Update ref when state changes
  useEffect(() => {
    mouseOverSpotlightRef.current = mouseOverSpotlight;
  }, [mouseOverSpotlight]);



  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const { height, left, position, top, width } = spotlightStyles;

      const offsetY = position === 'fixed' ? event.clientY : event.pageY;
      const offsetX = position === 'fixed' ? event.clientX : event.pageX;
      
      // Account for spotlightPadding - exclude padding area from clickable region
      const clickableTop = top + spotlightPadding;
      const clickableLeft = left + spotlightPadding;
      const clickableHeight = height - (spotlightPadding * 2);
      const clickableWidth = width - (spotlightPadding * 2);
      
      const inSpotlightHeight = offsetY >= clickableTop && offsetY <= clickableTop + clickableHeight;
      const inSpotlightWidth = offsetX >= clickableLeft && offsetX <= clickableLeft + clickableWidth;
      const inSpotlight = inSpotlightWidth && inSpotlightHeight;

      if (inSpotlight !== mouseOverSpotlightRef.current) {
        updateState({ mouseOverSpotlight: inSpotlight });
      }
    },
    [spotlightStyles, updateState, spotlightPadding],
  );

  const handleResize = useCallback(() => {
    clearTimeout(resizeTimeoutRef.current);

    resizeTimeoutRef.current = window.setTimeout(() => {
      if (!isMounted) {
        return;
      }

      setState({ resizedAt: Date.now() });
    }, 100);
  }, [isMounted, setState]);

  const handleScroll = useCallback(() => {
    const element = getElement(target, shadowRootTarget);

    if (scrollParentRef.current !== document) {
      if (!isScrolling) {
        updateState({ isScrolling: true, showSpotlight: false });
      }

      clearTimeout(scrollTimeoutRef.current);

      scrollTimeoutRef.current = window.setTimeout(() => {
        updateState({ isScrolling: false, showSpotlight: true });
      }, 50);
    } else if (hasPosition(element, 'sticky')) {
      updateState({});
    }
  }, [isScrolling, target, updateState, shadowRootTarget]);

  useMount(() => {
    const element = getElement(target, shadowRootTarget);

    scrollParentRef.current = getScrollParent(
      element ?? document.body,
      disableScrollParentFix,
      true,
    );

    if (process.env.NODE_ENV !== 'production') {
      if (!disableScrolling && hasCustomScrollParent(element, true)) {
        log({
          title: 'step has a custom scroll parent and can cause trouble with scrolling',
          data: [{ key: 'parent', value: scrollParentRef }],
          debug,
        });
      }
    }

    window.addEventListener('resize', handleResize);
  });

  useUnmount(() => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('resize', handleResize);

    clearTimeout(resizeTimeoutRef.current);
    clearTimeout(scrollTimeoutRef.current);

    scrollParentRef?.current?.removeEventListener('scroll', handleScroll);
  });

  useEffect(() => {
    if (changed('lifecycle', LIFECYCLE.TOOLTIP)) {
      scrollParentRef?.current?.addEventListener('scroll', handleScroll, { passive: true });

      setTimeout(() => {
        if (!isScrolling) {
          updateState({ showSpotlight: true });
        }
      }, 100);
    }
  }, [changed, handleScroll, isScrolling, updateState]);

  useEffect(() => {
    if (changed('spotlightClicks') || changed('disableOverlay') || changed('lifecycle')) {
      if (spotlightClicks && lifecycle === LIFECYCLE.TOOLTIP) {
        window.addEventListener('mousemove', handleMouseMove, false);
      } else if (lifecycle !== LIFECYCLE.TOOLTIP) {
        window.removeEventListener('mousemove', handleMouseMove);
      }
    }
  }, [changed, handleMouseMove, lifecycle, spotlightClicks]);

  useEffect(() => {
    if (changed('target') || changed('disableScrollParentFix')) {
      const element = getElement(target, shadowRootTarget);

      scrollParentRef.current = getScrollParent(
        element ?? document.body,
        disableScrollParentFix,
        true,
      );
    }
  }, [changed, disableScrollParentFix, target, shadowRootTarget]);

  const hiddenLifecycles = [
    LIFECYCLE.INIT,
    LIFECYCLE.BEACON,
    LIFECYCLE.COMPLETE,
    LIFECYCLE.ERROR,
  ] as Lifecycle[];

  if (
    disableOverlay ||
    (continuous ? hiddenLifecycles.includes(lifecycle) : lifecycle !== LIFECYCLE.TOOLTIP)
  ) {
    return null;
  }

  let spotlight = placement !== 'center' && showSpotlight && <Spotlight styles={spotlightStyles} />;
  const actualOverlayStyles = { ...overlayStyles };

  // Hack for Safari bug with mix-blend-mode with z-index
  if (getBrowser() === 'safari') {
    const { mixBlendMode, zIndex, ...safariOverlay } = overlayStyles;

    spotlight = <div style={{ ...safariOverlay }}>{spotlight}</div>;
    delete actualOverlayStyles.backgroundColor;
  }

  return (
    <div
      className="react-joyride__overlay"
      data-test-id="overlay"
      onClick={onClickOverlay}
      role="presentation"
      style={actualOverlayStyles}
    >
      {spotlight}
    </div>
  );
}

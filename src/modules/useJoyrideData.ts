import { MutableRefObject, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import isEqual from '@gilbarbara/deep-equal';
import {
  useDeepCompareEffect,
  useMount,
  usePrevious,
  useSetState,
  useSingleton,
  useUpdateEffect,
} from '@gilbarbara/hooks';
import is from 'is-lite';
import useTreeChanges from 'tree-changes-hook';

import { defaultProps } from '~/defaults';
import { ACTIONS, EVENTS, LIFECYCLE, STATUS } from '~/literals';
import { getElement, isElementVisible } from '~/modules/dom';
import { hideBeacon, log, mergeProps, shouldScroll } from '~/modules/helpers';
import { getMergedStep, validateSteps } from '~/modules/step';
import createStore from '~/modules/store';

import { Actions, Props, State, Status } from '~/types';

export default function useJoyrideData(
  props: ReturnType<typeof mergeProps<typeof defaultProps, Props>>,
): MutableRefObject<ReturnType<typeof createStore>> {
  const {
    callback,
    continuous,
    debug,
    lockPageScroll,
    disableScrollParentFix,
    getHelpers,
    run,
    scrollDuration,
    scrollOffset,
    scrollToFirstStep,
    stepIndex,
    steps,
  } = props;

  const store = useRef(createStore(props));
  const [state, setState] = useSetState<State>(store.current.getState());

  const { action, controlled, index, lifecycle, size, status } = state;
  const lastAction = useRef<Actions | null>(null);

  // Add DOM stability detection
  const [stableElement, setStableElement] = useState<HTMLElement | null>(null);
  const elementPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll control
  const disablePageScroll = useCallback(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${window.scrollY}px`;
  }, []);

  const enablePageScroll = useCallback(() => {
    const scrollY = document.body.style.top;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    if (scrollY) {
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  }, []);

  const previousProps = usePrevious(props);
  const previousState = usePrevious(state);
  const { changed: changedProps } = useTreeChanges(props);
  const { changed: changedState, changedFrom: changedStateFrom } = useTreeChanges(state);

  const step = useMemo(() => getMergedStep(props, steps[index]), [index, props, steps]);

  const previousStep = useMemo(() => getMergedStep(props, steps[index - 1]), [index, props, steps]);

  // DOM stability polling logic
  useEffect(() => {
    // Clear any existing polling
    if (elementPollingRef.current) {
      clearTimeout(elementPollingRef.current);
      elementPollingRef.current = null;
    }

    if (!step?.target) {
      setStableElement(null);
      return;
    }

    let attempts = 0;
    const maxAttempts = 20; // 1 second max (20 * 50ms)

    const checkElement = () => {
      const foundElement = getElement(step.target, step.shadowRootTarget);

      if (foundElement && isElementVisible(foundElement)) {
        setStableElement(foundElement);
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        elementPollingRef.current = setTimeout(checkElement, 50);
      } else {
        // Element not found after max attempts
        setStableElement(null);
      }
    };

    checkElement();

    // Cleanup function
    return () => {
      if (elementPollingRef.current) {
        clearTimeout(elementPollingRef.current);
        elementPollingRef.current = null;
      }
    };
  }, [step?.target, step?.shadowRootTarget]);

  useSingleton(() => {
    store.current.addListener(newState => {
      setState(newState);
    });
  });

  const scrollToStep = useCallback(
    (lastState: State) => {
      if (!step) {
        return;
      }

      // Use stable element if available, otherwise fall back to regular element detection
      const targetElement = stableElement || getElement(step.target, step.shadowRootTarget);

      if (!targetElement) {
        return;
      }

      const shouldScrollToStep = shouldScroll({
        isFirstStep: index === 0,
        lifecycle,
        previousLifecycle: lastState.lifecycle,
        scrollToFirstStep,
        step,
        target: targetElement,
      });
      const beaconPopper = store.current.getPopper('beacon');
      const tooltipPopper = store.current.getPopper('tooltip');

      if (status === STATUS.RUNNING && shouldScrollToStep) {
        // Since page scrolling is disabled, focus only on positioning updates
        setTimeout(() => {
          // Update popper positioning
          if (beaconPopper) {
            beaconPopper.update();
          }
          if (tooltipPopper) {
            tooltipPopper.update();
          }

          // Force a resize event to trigger repositioning
          window.dispatchEvent(new Event('resize'));
        }, 100);
      }
    },
    [
      debug,
      disableScrollParentFix,
      index,
      lifecycle,
      scrollDuration,
      scrollOffset,
      scrollToFirstStep,
      status,
      step,
      stableElement,
    ],
  );

  useMount(() => {
    if (run && size && validateSteps(steps, debug)) {
      store.current.start();
    }

    if (getHelpers) {
      getHelpers(store.current.getHelpers());
    }
  });

  // Disable page scrolling when tour is active
  useEffect(() => {
    if (status === STATUS.RUNNING && lockPageScroll) {
      disablePageScroll();
    } else if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      enablePageScroll();
    }

    // Cleanup on unmount
    return () => {
      if (status === STATUS.RUNNING && lockPageScroll) {
        enablePageScroll();
      }
    };
  }, [status, lockPageScroll, disablePageScroll, enablePageScroll]);

  /**
   * Handle updated status
   */
  useUpdateEffect(() => {
    if (run && size && status === STATUS.IDLE) {
      store.current.updateState({ status: STATUS.READY });
    }

    if (getHelpers) {
      getHelpers(store.current.getHelpers());
    }
  }, [getHelpers, run, size, status]);

  useDeepCompareEffect(() => {
    if (!previousProps || !previousState) {
      return;
    }

    /**
     * Handle step changes
     */

    const isAfterAction = changedState('action', [
      ACTIONS.NEXT,
      ACTIONS.PREV,
      ACTIONS.SKIP,
      ACTIONS.CLOSE,
    ]);

    // Set the last action if it's an after action, but not if it's a CLOSE action when the current action is START
    if (isAfterAction || (lastAction.current === ACTIONS.CLOSE && action === ACTIONS.START)) {
      lastAction.current = action;
    }

    if (status === STATUS.RUNNING && step && lifecycle === LIFECYCLE.INIT) {
      store.current.updateState({
        action: lastAction.current ?? ACTIONS.UPDATE,
        lifecycle: LIFECYCLE.READY,
      });
    }

    if (size && !step && lifecycle === LIFECYCLE.INIT) {
      store.current.updateState({
        action: ACTIONS.UPDATE,
        lifecycle: LIFECYCLE.COMPLETE,
        status: STATUS.FINISHED,
      });
    }

    /**
     * Handle placement "center"
     */
    if (
      status === STATUS.RUNNING &&
      step?.placement === 'center' &&
      changedState('lifecycle', LIFECYCLE.COMPLETE)
    ) {
      store.current.updateState({ action: ACTIONS.UPDATE, lifecycle: LIFECYCLE.INIT });
    }

    const element = getElement(step?.target, step?.shadowRootTarget);
    const elementExists = !!element;

    if (step && elementExists && isElementVisible(element)) {
      if (changedStateFrom('lifecycle', LIFECYCLE.INIT, LIFECYCLE.READY)) {
        callback?.({
          ...state,
          action: lastAction.current ?? action,
          step,
          type: EVENTS.STEP_BEFORE,
        });
      }
    } else if (step && status === STATUS.RUNNING) {
      // eslint-disable-next-line no-console
      console.warn(elementExists ? 'Target not visible' : 'Target not mounted', step);

      callback?.({
        ...state,
        type: EVENTS.TARGET_NOT_FOUND,
        step,
      });

      if (!controlled) {
        store.current.updateState({
          action: ACTIONS.UPDATE,
          index: index + (action === ACTIONS.PREV ? -1 : 1),
        });
      }
    }

    if (step && changedState('lifecycle', LIFECYCLE.READY)) {
      store.current.updateState({
        action: ACTIONS.UPDATE,
        lifecycle: hideBeacon(step, state, continuous) ? LIFECYCLE.TOOLTIP : LIFECYCLE.BEACON,
      });
    }

    if (step && changedState('lifecycle', LIFECYCLE.BEACON)) {
      callback?.({
        ...state,
        step,
        type: EVENTS.BEACON,
      });
    }

    if (step && changedState('lifecycle', LIFECYCLE.TOOLTIP)) {
      callback?.({
        ...state,
        step,
        type: EVENTS.TOOLTIP,
      });
    }

    const isRunningOrPausedWithStep =
      status === STATUS.RUNNING || (controlled && status === STATUS.PAUSED && !!step);
    const callbackStep = step ?? previousStep;
    const shouldSendCallback =
      isRunningOrPausedWithStep &&
      callbackStep &&
      changedState('lifecycle', LIFECYCLE.COMPLETE, LIFECYCLE.TOOLTIP) &&
      (elementExists || !step);

    if (shouldSendCallback) {
      callback?.({
        ...state,
        action: lastAction.current ?? ACTIONS.UPDATE,
        index: previousState.index ?? index,
        lifecycle,
        step: callbackStep,
        type: EVENTS.STEP_AFTER,
      });
    }

    /**
     * Handle tour changes
     */

    // Handle tours without initial steps
    if (status === STATUS.WAITING) {
      store.current.updateState({ status: STATUS.RUNNING });
    }

    if (changedProps()) {
      const { stepIndex: previousStepIndex, steps: previousSteps } = previousProps;

      if (!isEqual(previousSteps, steps)) {
        if (validateSteps(steps, debug)) {
          store.current.updateState({ size: steps.length });
        } else {
          // eslint-disable-next-line no-console
          console.warn('Steps are not valid', steps);
        }
      }

      if (changedProps('run')) {
        if (run) {
          if (store.current.getState().size) {
            store.current.start(stepIndex);
          }
        } else {
          store.current.stop();
        }
      } else if (is.number(stepIndex) && changedProps('stepIndex')) {
        const nextAction: Actions =
          is.number(previousStepIndex) && previousStepIndex < stepIndex
            ? ACTIONS.NEXT
            : ACTIONS.PREV;

        if (!([STATUS.FINISHED, STATUS.SKIPPED] as Array<Status>).includes(status)) {
          store.current.updateState({ action: nextAction, index: stepIndex }, true);
        }
      }
    }

    if (changedState('index')) {
      log({
        title: `step:${lifecycle}`,
        data: [{ key: 'props', value: props }],
        debug,
      });
    }

    if (changedState('lifecycle', LIFECYCLE.COMPLETE) && index && index >= size) {
      store.current.updateState({
        action: ACTIONS.UPDATE,
        lifecycle: LIFECYCLE.COMPLETE,
        status: STATUS.FINISHED,
      });
    }

    if (previousStep && changedState('status', [STATUS.FINISHED, STATUS.SKIPPED])) {
      callback?.({
        ...state,
        index: index - 1,
        // Return the last step when the tour is finished
        step: previousStep,
        type: EVENTS.TOUR_END,
      });
      store.current.reset();
    }

    if (
      step &&
      changedStateFrom('status', [STATUS.IDLE, STATUS.READY, STATUS.PAUSED], STATUS.RUNNING)
    ) {
      callback?.({
        ...state,
        step,
        type: EVENTS.TOUR_START,
      });
    }

    if (step && changedState('action', ACTIONS.STOP)) {
      callback?.({
        ...state,
        step,
        type: EVENTS.TOUR_STATUS,
      });
    }

    if (step && changedState('action', ACTIONS.RESET)) {
      callback?.({
        ...state,
        step,
        type: EVENTS.TOUR_STATUS,
      });
    }

    scrollToStep(previousState);
  }, [
    action,
    callback,
    changedProps,
    changedState,
    changedStateFrom,
    continuous,
    controlled,
    debug,
    index,
    lifecycle,
    previousProps,
    previousState,
    previousStep,
    props,
    run,
    scrollToStep,
    size,
    state,
    status,
    step,
    stepIndex,
    steps,
  ]);

  return store;
}

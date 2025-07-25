import {Props as FloaterProps} from 'react-floater';
import {SetRequired} from '@gilbarbara/types';
import deepmerge from 'deepmerge';
import is from 'is-lite';

import {defaultFloaterProps, defaultLocale, defaultStep} from '~/defaults';
import getStyles from '~/styles';

import {Props, Step, StepMerged} from '~/types';

import {getElement, hasCustomScrollParent} from './dom';
import {log, omit, pick} from './helpers';

function getTourProps(props: Props) {
  return pick(
    props,
    'beaconComponent',
    'disableCloseOnEsc',
    'disableOverlay',
    'disableOverlayClose',
    'disableScrolling',
    'disableScrollParentFix',
    'lockPageScroll',
    'floaterProps',
    'hideBackButton',
    'hideCloseButton',
    'hideNextButton',
    'locale',
    'showProgress',
    'showSkipButton',
    'spotlightClicks',
    'spotlightPadding',
    'styles',
    'tooltipComponent',
  );
}

export function getMergedStep(props: Props, currentStep?: Step): StepMerged | null {
  if (!currentStep) {
    return null;
  }

  const step = currentStep ?? {};
  const mergedStep = deepmerge.all([defaultStep, getTourProps(props), step], {
    isMergeableObject: is.plainObject,
  }) as StepMerged;

  const mergedStyles = getStyles(props, mergedStep);
  const scrollParent = hasCustomScrollParent(
    getElement(mergedStep.target, mergedStep.shadowRootTarget),
    mergedStep.disableScrollParentFix,
  );
  const floaterProps = deepmerge.all([
    defaultFloaterProps,
    props.floaterProps ?? {},
    mergedStep.floaterProps ?? {},
  ]) as SetRequired<FloaterProps, 'modifiers' | 'wrapperOptions'>;

  // Set react-floater props
  floaterProps.offset = mergedStep.offset;
  floaterProps.styles = deepmerge(floaterProps.styles ?? {}, mergedStyles.floaterStyles);

  floaterProps.offset += props.spotlightPadding ?? mergedStep.spotlightPadding ?? 0;

  if (mergedStep.placementBeacon && floaterProps.wrapperOptions) {
    floaterProps.wrapperOptions.placement = mergedStep.placementBeacon;
  }

  if (scrollParent && floaterProps.modifiers.preventOverflow) {
    floaterProps.modifiers.preventOverflow.options = {
      ...floaterProps.modifiers.preventOverflow.options,
      rootBoundary: 'viewport',
      boundary: 'clippingParents',
    };
  }

  return {
    ...mergedStep,
    locale: deepmerge.all([defaultLocale, props.locale ?? {}, mergedStep.locale || {}]),
    floaterProps,
    styles: omit(mergedStyles, 'floaterStyles'),
  };
}

/**
 * Validate if a step is valid
 */
export function validateStep(step: Step, debug: boolean = false): boolean {
  if (!is.plainObject(step)) {
    log({
      title: 'validateStep',
      data: 'step must be an object',
      warn: true,
      debug,
    });

    return false;
  }

  if (!step.target) {
    log({
      title: 'validateStep',
      data: 'target is missing from the step',
      warn: true,
      debug,
    });

    return false;
  }

  return true;
}

/**
 * Validate if steps are valid
 */
export function validateSteps(steps: Array<Step>, debug: boolean = false): boolean {
  if (!is.array(steps)) {
    log({
      title: 'validateSteps',
      data: 'steps must be an array',
      warn: true,
      debug,
    });

    return false;
  }

  return steps.every(d => validateStep(d, debug));
}

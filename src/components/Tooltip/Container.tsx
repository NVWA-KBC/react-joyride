import {ReactNode} from 'react';

import {getReactNodeText} from '~/modules/helpers';

import {TooltipRenderProps} from '~/types';

import CloseButton from './CloseButton';

export default function JoyrideTooltipContainer(props: Readonly<TooltipRenderProps>) {
  const { backProps, closeProps, index, isLastStep, primaryProps, skipProps, step, tooltipProps } =
    props;
  const { content, hideBackButton, hideCloseButton, hideFooter, hideNextButton, showSkipButton, styles, title, showProgress  } =
    step;
  const output: Record<string, ReactNode> = {};

  if (!hideNextButton) {
    output.primary = (
      <button
        data-test-id="button-primary"
        style={styles.buttonNext}
        type="button"
        {...primaryProps}
      />
    );
  } else {
    output.primary = <span></span>;
  }

  if (showSkipButton && !isLastStep) {
    output.skip = (
      <button
        aria-live="off"
        data-test-id="button-skip"
        style={styles.buttonSkip}
        type="button"
        {...skipProps}
      />
    );
  }

  if (!hideBackButton && index > 0) {
    output.back = (
      <button data-test-id="button-back" style={styles.buttonBack} type="button" {...backProps} />
    );
  } else {
    output.back = <span></span>;
  }

  output.close = !hideCloseButton && (
    <CloseButton data-test-id="button-close" styles={styles.buttonClose} {...closeProps} />
  );

  return (
    <div
      key="JoyrideTooltip"
      aria-label={getReactNodeText(title ?? content)}
      className="react-joyride__tooltip"
      style={styles.tooltip}
      {...tooltipProps}
    >
      <div style={styles.tooltipContainer}>
        {title && (
          <h1 aria-label={getReactNodeText(title)} style={styles.tooltipTitle}>
            {title}
          </h1>
        )}
        <div style={styles.tooltipContent}>{content}</div>
      </div>
      {!hideFooter && (
        <div style={styles.tooltipFooter}>
          {output.back}
          {showProgress && <div style={styles.tooltipFooterProgress}>{`${index + 1} / ${props.size}`}</div>}
          {showSkipButton && <div style={styles.tooltipFooterSpacer}>{output.skip}</div>}
          {output.primary}
        </div>
      )}
      {output.close}
    </div>
  );
}

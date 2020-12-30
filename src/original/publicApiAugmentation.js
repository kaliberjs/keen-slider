/**
 * @template {{}} T
 * @param {{ strategy: StrategyDetails<T>, slider: InternalKeenSliderType }} props
 */
export function detailsFromStrategy({ strategy, slider }) {
  return {
    /** @returns {Details & T} */
    get details() {
      const { details } = slider
      return { ...details, ...strategy.getDetails(details) }
    }
  }
}

// I am using these complicated typescript definitions to keep track of deprecation
// The two methods in this file cause a lot more complication than value while I question
// their actual use outside of existing 'buggy' situations
// So I went ahead and deprecated them to make this clear

/** @typedef {ReturnType<import('../modules/BreakpointBasedOptions').BreakpointBasedOptions<TOptionsEvents>>} BreakpointBasedOptions */
/** @typedef {ReturnType<import('../modules/DynamicOptionsWrapper').DynamicOptionsWrapper<TOptionsEvents>>} DynamicOptionsWrapper */

/**
 * @deprecated
 * @param {{
 *   optionsWrapper: { update: BreakpointBasedOptions['update'] }
 *   sliderWrapper: { replaceKeepIndex: DynamicOptionsWrapper['replaceKeepIndex'] }
 * }} props
 */
export function controlsApi({ optionsWrapper, sliderWrapper }) {
  return {
    /**
     * @deprecated
     * @param {boolean} active
     */
    controls(active) {
      const newOptions = optionsWrapper.update({ controls: active })
      sliderWrapper.replaceKeepIndex(newOptions)
    }
  }
}

/**
 * @deprecated
 * @param {{
 *   optionsWrapper: { replace: BreakpointBasedOptions['replace'] }
 *   sliderWrapper: { replace: DynamicOptionsWrapper['replace'] }
 *   convertBreakpoints: (breakpoints?: TBreakpoints['breakpoints']) => Array<[string, TOptionsEvents]>
 *   initialOptions: TOptionsEvents
 * }} props
 */
export function refreshApi({ optionsWrapper, sliderWrapper, convertBreakpoints, initialOptions }) {
  return {
    /** @param {TOptionsEventsBreakpoints} [options] */
    refresh({ breakpoints, ...options } = initialOptions) {
      const newOptions = optionsWrapper.replace(options, convertBreakpoints(breakpoints))
      sliderWrapper.replace(newOptions)
    }
  }
}

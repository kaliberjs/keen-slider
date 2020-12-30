const { EventBookKeeper } = require('../machinery')

/**
 * @template {{}} T
 * @param {{
 *   initialOptions: T,
 *   breakpoints?: Array<[string, T]>
 *   onOptionsChanged: (options: T) => void
 * }} props
 */
export function BreakpointBasedOptions({ initialOptions, breakpoints = [], onOptionsChanged }) {
  const { eventAdd, eventsRemove } = EventBookKeeper()

  let optionsWrapper = OptionsWrapper(initialOptions, breakpoints)

  eventAdd(window, 'resize', handleResize)

  return {
    get options() {
      return optionsWrapper.options
    },
    /**
     * @deprecated
     * @param {T} newOptions
     */
    update(newOptions) {
      optionsWrapper = OptionsWrapper({ ...initialOptions, ...newOptions }, breakpoints)
      return optionsWrapper.options
    },
    /**
     * @deprecated
     * @param {T} newOptions
     * @param {Array<[string, T]>} newBreakpoints
     */
    replace(newOptions, newBreakpoints) {
      optionsWrapper = OptionsWrapper(newOptions, newBreakpoints)
      return optionsWrapper.options
    },
    destroy() {
      eventsRemove()
    },
  }

  function handleResize() {
    // TODO: checking if a breakpoint matches should not be done on resize, but as a listener to matchMedia
    if (optionsWrapper.refresh().optionsChanged) {
      onOptionsChanged(optionsWrapper.options)
    }
  }
}

/**
 * @template {{}} T
 * @param {T} initialOptions
 * @param {Array<[string, T]>} breakpoints
 */
function OptionsWrapper(initialOptions, breakpoints) {
  let currentBreakpointOptions = null
  let options = determineOptions({ currentOptions: initialOptions })

  return {
    get options() { return options },
    refresh() {
      const currentOptions = options
      options = determineOptions({ currentOptions })
      return { optionsChanged: currentOptions !== options }
    },
  }

  /** @param {{ currentOptions: T }} props */
  function determineOptions({ currentOptions }) {
    const breakpointOptions = determineLastValidBreakpointOptions()
    if (breakpointOptions === currentBreakpointOptions) return currentOptions

    currentBreakpointOptions = breakpointOptions
    const newOptions = { ...initialOptions, ...breakpointOptions }
    return newOptions
  }

  function determineLastValidBreakpointOptions() {
    return breakpoints.reduce(
      /** @param {T} result */
      (result, [breakpoint, options]) => window.matchMedia(breakpoint).matches ? options : result,
      null
    )
  }
}

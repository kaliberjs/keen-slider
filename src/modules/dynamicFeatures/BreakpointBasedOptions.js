/**
 * @template {{}} T
 * @param {T} initialOptions
 * @param {{ onOptionsChanged: (options: T) => void }} props
 */
export function BreakpointBasedOptions(initialOptions, { onOptionsChanged }) {
  const { eventAdd, eventsRemove } = EventBookKeeper()

  let optionsWrapper = OptionsWrapper(initialOptions)

  eventAdd(window, 'resize', handleResize)

  return {
    get options() {
      return optionsWrapper.options
    },
    /** @param {T} newOptions */
    update(newOptions) {
      optionsWrapper = OptionsWrapper({ ...initialOptions, ...newOptions })
      return optionsWrapper.options
    },
    /** @param {T} newOptions */
    replace(newOptions) {
      optionsWrapper = OptionsWrapper(newOptions)
      return optionsWrapper.options
    },
    destroy() {
      eventsRemove()
    },
  }

  function handleResize() {
    // checking if a breakpoint matches should not be done on resize, but as a listener to matchMedia
    if (optionsWrapper.refresh().optionsChanged) {
      onOptionsChanged(optionsWrapper.options)
    }
  }
}

/**
 * @template {{}} T
 * @param {T} initialOptions */
function OptionsWrapper(initialOptions) {
  let currentBreakpoint = null
  let options = determineOptions(initialOptions)

  return {
    get options() { return options },
    refresh() {
      const previousOptions = options;
      options = determineOptions(initialOptions, options)
      return { optionsChanged: previousOptions !== options }
    },
  }

  /**
   * @param {T} initialOptions
   * @param {T} currentOptions
   * @returns {T}
   */
  function determineOptions(initialOptions, currentOptions = initialOptions) {
    const breakpoints = initialOptions.breakpoints || {}
    const breakpoint = determineLastValidBreakpoint(breakpoints)
    if (breakpoint === currentBreakpoint) return currentOptions

    currentBreakpoint = breakpoint
    const breakpointOptions = breakpoints[currentBreakpoint] || initialOptions
    const newOptions = { ...defaultOptions, ...initialOptions, ...breakpointOptions }
    return newOptions
  }

  function determineLastValidBreakpoint(breakpoints) {
    let lastValid
    for (let value in breakpoints) { // there is no guarantee that this will have the correct order, breakpoints should be in an array
      if (window.matchMedia(value).matches) lastValid = value
    }
    return lastValid
  }
}

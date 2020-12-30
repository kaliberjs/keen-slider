/**
 * @template {{}} T
 * @template {(
 *  options: T,
 *  wrapper: {
 *    replace(options: T): void
 *    replaceKeepIndex(options: T): void
 *  }) => any} S
 * @param {S} createSlider
 */
export function DynamicOptionsWrapper(createSlider) {
  /** @type {{ current: ReturnType<S> }} */
  const slider = { current: null }

  return {
    create,
    replace,
    replaceKeepIndex,
    destroy,

    get current() { return slider.current }
  }

  /** @param {T} options */
  function create(options) {
    slider.current = createSlider(options, { replace, replaceKeepIndex })
    slider.current.mount()
  }
  /** @param {T} options */
  function replace(options) {
    slider.current.unmount()
    create(options)
  }
  /** @param {T} options */
  function replaceKeepIndex(options) {
    const newOptions = {
      ...options,
      initial: slider.current.details().absoluteSlide
    }
    create(newOptions)
  }
  function destroy() {
    slider.current = null
    slider.current.unmount()
  }
}

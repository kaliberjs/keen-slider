import { BaseSlider } from './BaseSlider';
import { clampValue } from './machinery';
import { BreakpointBasedOptions } from './modules/dynamicFeatures/BreakpointBasedOptions';
import { DynamicOptionsWrapper } from './modules/DynamicOptionsWrapper';
import { FixedWidthSlides } from './modules/FixedWidthStrategy';

/**
 * @param {TContainer} initialContainer
 * @param {TOptionsEvents} initialOptions
 * @returns {KeenSlider}
 */
export function OriginalSlider(initialContainer, initialOptions) {

  const sliderWrapper = DynamicOptionsWrapper(
    /** @param {TOptionsEvents} options */
    (options, sliderWrapper) => {

      const translatedContainer = translateContainer(
        initialContainer, [
          resolveContainer,
        ]
      )
      const translatedOptions = translateOptions(
        options, [
          baseOptions,
          touchMultiplicator,
          slidesAndNumberOfSlides(translatedContainer),
          slidesPerView,
          containerBasedOptions(translatedContainer),
          fixedWidthStrategy,
        ]
      )
      const slider = BaseSlider(translatedContainer, translatedOptions)

      return augmentPublicApi(
        slider, [
          controlsApi({ optionsWrapper, sliderWrapper }),
          refreshApi({ sliderWrapper, optionsWrapper, initialOptions }),
        ]
      )
    }
  )

  const optionsWrapper = BreakpointBasedOptions(
    initialOptions,
    {
      onOptionsChanged(options) {
        if (options.resetSlide) sliderWrapper.replace(options)
        else sliderWrapper.replaceKeepIndex(options)
      }
    }
  )

  sliderWrapper.create(optionsWrapper.options)

  return {
    destroy() {
      optionsWrapper.destroy()
      sliderWrapper.destroy()
    },

    /*
      sliderWrapper.current will change, that is why we forward these methods instead of
      simply returning the current slider
    */
    next()   { sliderWrapper.current.next() },
    prev()   { sliderWrapper.current.prev() },
    resize() { sliderWrapper.current.resize() },

    refresh(options) { sliderWrapper.current.refresh(options) },
    controls(active) { sliderWrapper.current.controls(active) },

    moveToSlideRelative( slide, nearest, duration) {
      sliderWrapper.current.moveToSlideRelative(slide, nearest, duration)
    },
    moveToSlide(slide, duration) {
      sliderWrapper.current.moveToSlide(slide, duration)
    },

    details() { return sliderWrapper.current.details() }
  }
}

/** @template {Tuple} S, T
 *  @type {TranslateWaterfall<T, S>} */
function translateContainer(input, translations) {
  return
}
/** @template {Tuple} S, T
 *  @type {TranslateComposite<T, S>} */
function translateOptions(input, translations) {
  return
}


/** @template {Tuple} S, T
 *  @type {Augment<T, S>} */
function augmentPublicApi(input, augmentations) {
  return
}

/** @param {TContainer} initialContainer */
function resolveContainer(initialContainer) {
  const [container] = getElements(initialContainer, document)
  return container
}

function baseOptions({
  loop, rubberband, vertical, rtl, centered,
  initial, controls, cancelOnLeave, preventEvent, duration, friction, mode,
}) {
  return {
    isLoop:           !!loop,
    isRubberband:     !loop && rubberband,
    isVerticalSlider: !!vertical,
    isRtl:            !!rtl,
    isCentered:       !!centered,

    initialIndex:              initial,
    enableDragging:            !!controls,
    cancelOnLeave:             !!cancelOnLeave,
    preventEventAttributeName: preventEvent,
    duration:                  duration,
    friction:                  friction,
    dragEndMove:               mode,
  }
}

function touchMultiplicator({ dragSpeed, rtl }) {
  // TODO: get public API
  const publicApi = {}
  const dragSpeedMultiplicator = typeof dragSpeed === 'function'
    ? val => dragSpeed(val, publicApi)
    : val => val * dragSpeed

  return {
    /** @param {number} val */
    touchMultiplicator(val) {
      return dragSpeedMultiplicator(val) * (!rtl ? 1 : -1)
    }
  }
}

function slidesAndNumberOfSlides(container) { // side effects should be removed in a later stage
  return ({ slides: slidesOption }) => {
    if (typeof slidesOption === 'number')
      return { slides: null, numberOfSlides: slidesOption }
    else {
      const slides = getElements(slidesOption, container)
      return { slides, numberOfSlides: slides ? slides.length : 0 }
    }
  }
}

function slidesPerView({ slidesPerView, loop }, { numberOfSlides }) {
  return {
    slidesPerView: typeof slidesPerView === 'function'
      ? slidesPerView()
      : clampValue(slidesPerView, 1, Math.max(loop ? numberOfSlides - 1 : numberOfSlides, 1))
  }
}

function containerBasedOptions(container) {
  return ({ vertical, spacing: spacingOption }, { slidesPerView }) => {
    const containerSize   = vertical ? container.offsetHeight : container.offsetWidth
    // so, this does not make much sense, in the default values sliderPerView === 1, that means we
    // clamp the value between 0 and infinity...
    // even with 2 slides per view we clamp it between 0 and the containerSize - 1
    const spacing         = clampValue(spacingOption, 0, containerSize / (slidesPerView - 1) - 1)
    const widthOrHeight   = containerSize + spacing

    return { containerSize, widthOrHeight }
  }
}

// If you are wondering why I am destructuring the arguments and then simply put them back in an
// object: it's because of type inference. It will warn me when I make a typeo. It also clearly
// declares which properties are required
function fixedWidthStrategy(
  { spacing },
  { slidesPerView, widthOrHeight, numberOfSlides, isLoop, isRtl, isCentered }) {
  return {
    strategy: FixedWidthSlides({
      spacing, slidesPerView, widthOrHeight, numberOfSlides,
      isLoop, isRtl, isCentered,
    })
  }
}

/* We should deprecate this */
export function controlsApi({ optionsWrapper, sliderWrapper }) {
  return {
    controls(active) {
      const newOptions = optionsWrapper.update({ controls: active })
      sliderWrapper.replaceKeepIndex(newOptions)
    }
  }
}

/** We should depricate this API */
export function refreshApi({ optionsWrapper, sliderWrapper, initialOptions }) {
  return {
    refresh(options) {
      const newOptions = optionsWrapper.replaceOptions(options || initialOptions)
      sliderWrapper.sliderReplace(newOptions)
    }
  }
}

/** @returns {Array<HTMLElement>} */
function getElements(element, wrapper) {
  return (
    typeof element === 'function'  ? convertToArray(element()) :
    typeof element === 'string'    ? convertToArray(wrapper.querySelectorAll(element)) :
    element instanceof HTMLElement ? [element] :
    element instanceof NodeList    ? convertToArray(element) :
    []
  )
}

/** @param {NodeList} nodeList
 *  @returns {Array<HTMLElement>} */
function convertToArray(nodeList) {
  return Array.prototype.slice.call(nodeList)
}

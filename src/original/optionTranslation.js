import { clampValue, getElements } from '../machinery'
import { FixedWidthSlides } from '../modules/FixedWidthStrategy'

export function renameOptions({
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

export function touchMultiplicator(publicApi) {
  return ({ dragSpeed }, { isRtl }) => {
    const dragSpeedMultiplicator = typeof dragSpeed === 'function'
      ? val => dragSpeed(val, publicApi)
      : val => val * dragSpeed

    return {
      /** @param {number} val */
      touchMultiplicator(val) {
        return dragSpeedMultiplicator(val) * (!isRtl ? 1 : -1)
      }
    }
  }
}

export function slidesAndNumberOfSlides(container) { // side effects should be removed in a later stage
  return ({ slides: slidesOption }) => {
    if (typeof slidesOption === 'number')
      return { slides: null, numberOfSlides: slidesOption }
    else {
      const slides = getElements(slidesOption, container)
      return { slides, numberOfSlides: slides ? slides.length : 0 }
    }
  }
}

export function slidesPerView({ slidesPerView }, { isLoop, numberOfSlides }) {
  return {
    slidesPerView: typeof slidesPerView === 'function'
      ? slidesPerView()
      : clampValue(slidesPerView, 1, Math.max(isLoop ? numberOfSlides - 1 : numberOfSlides, 1))
  }
}

export function containerSize(container) {
  return ({ vertical }) => {
    const containerSize   = vertical ? container.offsetHeight : container.offsetWidth

    return { containerSize }
  }
}

export function widthOrHeight({ spacing: spacingOption }, { slidesPerView, containerSize }) {
  // so, this does not make much sense, in the default values sliderPerView === 1, that means we
  // clamp the value between 0 and infinity...
  // even with 2 slides per view we clamp it between 0 and the containerSize - 1
  const spacing         = clampValue(spacingOption, 0, containerSize / (slidesPerView - 1) - 1)
  const widthOrHeight   = containerSize + spacing

  return { widthOrHeight }
}

// If you are wondering why I am destructuring the arguments and then simply put them back in an
// object: it's because of type inference. It will warn me when I make a typeo. It also clearly
// declares which properties are required
export function fixedWidthSlidesStrategy(
  { spacing },
  { slidesPerView, widthOrHeight, numberOfSlides, isLoop, isRtl, isCentered }) {
  return {
    strategy: FixedWidthSlides({
      spacing, slidesPerView, widthOrHeight, numberOfSlides,
      isLoop, isRtl, isCentered,
    })
  }
}

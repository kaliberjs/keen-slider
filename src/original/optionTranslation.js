import { clampValue, getElements } from '../machinery'
import { FixedWidthSlides } from '../modules/FixedWidthStrategy'

export function renameOptions({
  loop, rubberband, vertical, rtl, centered,
  initial, controls, cancelOnLeave, preventEvent, duration, friction, mode,
}) {
  return {
    initialIndex: initial,

    isLoop:           !!loop,
    isRubberband:     !loop && rubberband,
    isVerticalSlider: !!vertical,
    isRtl:            !!rtl,
    isCentered:       !!centered,

    isDragEnabled:             !!controls,
    isDragCancelledOnLeave:    !!cancelOnLeave,
    preventTouchAttributeName: preventEvent,
    dragEndMove:               mode,

    defaultDuration: duration,
    defaultFriction: friction,
  }
}

// TODO: The version with dragSpeed = 1 can be a default for the base slider
export function dragSpeedToTouchMultiplicator(publicApi) {
  return ({ dragSpeed }, { isRtl }) => {
    const dragSpeedMultiplicator = typeof dragSpeed === 'function'
      ? val => dragSpeed(val, publicApi) // We should deprecate passing the public API here
      : val => val * dragSpeed

    return {
      /** @param {number} val */
      touchMultiplicator(val) {
        return dragSpeedMultiplicator(val) * (!isRtl ? 1 : -1)
      }
    }
  }
}

export function slidesAndNumberOfSlides(container) {
  return ({ slides: slidesOption }) => {
    if (typeof slidesOption === 'number')
      return { slides: null, numberOfSlides: slidesOption }
    else {
      const slides = getElements(slidesOption, container)
      return { slides, numberOfSlides: slides ? slides.length : 0 }
    }
  }
}

/** @param {HTMLElement} container */
export function fixedWidthSlidesStrategy(container) {
  // If you are wondering why I am destructuring the arguments and then simply put them back in an
  // object: it's because of type inference. It will warn me when I make a typeo. It also clearly
  // declares which properties are required
  return ({ spacing, rtl, centered, slidesPerView }, { numberOfSlides, isLoop, isVerticalSlider }) => {
    return {
      strategy: FixedWidthSlides(container, {
        spacing, numberOfSlides, slidesPerView,
        isLoop, rtl, centered, isVerticalSlider,
      })
    }
  }
}

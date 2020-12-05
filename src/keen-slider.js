import './polyfills'
import KeenSliderType, { TOptionsEvents } from '../index'

/** @type {TOptionsEvents} */
const defaultOptions = {
  centered: false,
  breakpoints: null,
  controls: true,
  dragSpeed: 1,
  friction: 0.0025,
  loop: false,
  initial: 0,
  duration: 500,
  preventEvent: 'data-keen-slider-pe',
  slides: '.keen-slider__slide',
  vertical: false,
  resetSlide: false,
  slidesPerView: 1,
  spacing: 0,
  mode: 'snap',
  rtl: false,
  rubberband: true,
  cancelOnLeave: true
}

/**
 * @template T
 * @typedef {(keyof T)[]} ObjectKeys
 */

/**
 *
 * @param {HTMLElement} initialContainer
 * @param {TOptionsEvents} initialOptions
 *
 * @returns {KeenSliderType}
 */
export default function PublicKeenSlider(initialContainer, initialOptions = {}) {
  const { eventAdd, eventsRemove } = EventBookKeeper()

  let resizeLastWidth = null
  let breakpointBasedOptions = BreakpointBasedOptions(initialOptions)

  const pubfuncs = {
    destroy() {
      eventsRemove()
      slider.current.destroy()
    },
    resize() {
      sliderResize(true)
    },
    controls: active => { // not sure if this is a valuable API
      const newOptions = {
        ...breakpointBasedOptions.options,
        initial: slider.current.details().absoluteSlide,
        controls: active,
      }
      slider.current.destroy()
      slider.current = KeenSlider(initialContainer, newOptions, pubfuncs)
    },
    refresh(options) { // this function should probably removed, it is simpler to just destroy and create a new instance
      slider.current.destroy()
      breakpointBasedOptions = BreakpointBasedOptions(options || initialOptions)
      slider.current = KeenSlider(initialContainer, breakpointBasedOptions.options, pubfuncs)
    },
    next() { return slider.next() },
    prev() { return slider.prev() },
    moveToSlide(idx, duration) {
      return slider.current.moveToSlide(idx, duration)
    },
    moveToSlideRelative(idx, nearest = false, duration) {
      return slider.current.moveToSlideRelative(idx, nearest, duration)
    },
    details() { return slider.current.details() },
  }
  const slider = { current: KeenSlider(initialContainer, breakpointBasedOptions.options, pubfuncs) }

  sliderInit()

  return pubfuncs

  function sliderInit() {
    eventAdd(window, 'resize', sliderResize)
    slider.current.hook('created')
  }

  function sliderResize(force = false) {
     // checking if a breakpoint matches should not be done on resize, but as a listener to matchMedia
     // once this switch to matchMedia('...').addListener is complete, you can move functionality out
     // of this function and the resize function can live inside the slider
    const { optionsChanged } = breakpointBasedOptions.refresh()
    if (optionsChanged) {
      const { options } = breakpointBasedOptions
      const newOptions = options.resetSlide
        ? options
        : { ...options, initial: slider.current.details().absoluteSlide }

      slider.current.destroy()
      slider.current = KeenSlider(initialContainer, newOptions, pubfuncs)
    } else {
      const windowWidth = window.innerWidth
      if (!force && windowWidth === resizeLastWidth) return
      resizeLastWidth = windowWidth
      slider.current.resize()
    }
  }
}

/**
 *
 * @param {HTMLElement} initialContainer
 * @param {TOptionsEvents} initialOptions
 * @param {KeenSliderType} pubfuncs // This is a complication, it is used for hooks and some other method calls, what if one of those methods decides to call 'destroy' or 'refresh'?
 *                                  // If people want to use this, they could easily do it by keeping track of the slider instance, no need for us to supply it
 */
function KeenSlider(initialContainer, initialOptions, pubfuncs) {
  const attributeMoving = 'data-keen-slider-moves'
  const attributeVertical = 'data-keen-slider-v'

  const { eventAdd, eventsRemove } = EventBookKeeper()

  const [container] = getElements(initialContainer)
  const options = Options(initialOptions, {
    container,
    moveModes: {
      'free': moveFree,
      'free-snap': moveSnapFree,
      'snap': moveSnapOne,
      'default': moveSnapOne,
    }
  })
  let origin
  let width
  let spacing

  let trackCurrentIdx = options.initialIndex
  let trackPosition = 0
  let trackMeasurePoints = []
  let trackDirection
  let trackMeasureTimeout
  let trackSpeed
  let trackSlidePositions
  let trackProgress

  // touch/swipe helper
  let touchIndexStart
  let touchActive
  let touchIdentifier
  let touchLastX
  let touchLastClientX
  let touchLastClientY
  let touchJustStarted

  // animation
  let reqId
  let startTime
  let moveDistance
  let moveDuration
  let moveEasing
  let moved
  let moveForceFinish
  let moveCallBack

  sliderInit()

  return {
    destroy: sliderUnbind,
    next() {
      moveToIdx(trackCurrentIdx + 1, true)
    },
    prev() {
      moveToIdx(trackCurrentIdx - 1, true)
    },
    moveToSlide(idx, duration) {
      moveToIdx(idx, true, duration)
    },
    moveToSlideRelative(idx, nearest = false, duration) {
      moveToIdx(idx, true, duration, true, nearest)
    },
    details() {
      return trackGetDetails()
    },
    resize: sliderResize,
    // exposed for now, during refactor, should probably be moved to wrapper
    hook,
  }

  function sliderInit() {
    if (!container) return // this should probably throw an error
    sliderResize()
    eventsAdd()
    hook('mounted')
  }

  function eventDrag(e) {
    if (
      !touchActive ||
      touchIdentifier !== eventGetIdentifier(e) ||
      !options.isTouchable
    )
      return
    const x = eventGetX(e).x
    if (!eventIsSlide(e) && touchJustStarted) {
      return eventDragStop(e)
    }
    if (touchJustStarted) {
      trackMeasureReset()
      touchLastX = x
      container.setAttribute(attributeMoving, 'true') // note: not sure if this is backwards compatible, I changed it from true to 'true', but I don't know if browsers do the same behind the scenes
      touchJustStarted = false
    }
    if (e.cancelable) e.preventDefault()
    const touchDistance = touchLastX - x
    trackAdd(options.touchMultiplicator(touchDistance, pubfuncs) * (!options.isRtl ? 1 : -1), e.timeStamp)
    touchLastX = x
  }

  function eventDragStart(e) {
    if (touchActive || !options.isTouchable || eventIsIgnoreTarget(e.target)) return
    touchActive = true
    touchJustStarted = true
    touchIdentifier = eventGetIdentifier(e)
    eventIsSlide(e)
    moveAnimateAbort()
    touchIndexStart = trackCurrentIdx
    touchLastX = eventGetX(e).x
    trackAdd(0, e.timeStamp)
    hook('dragStart')
  }

  function eventDragStop(e) {
    if (
      !touchActive ||
      touchIdentifier !== eventGetIdentifier(e, true) ||
      !options.isTouchable
    )
      return
    container.removeAttribute(attributeMoving)
    touchActive = false
    moveWithSpeed()

    hook('dragEnd')
  }

  function eventGetChangedTouches(e) {
    return e.changedTouches
  }

  function eventGetIdentifier(e, changedTouches = false) {
    const touches = changedTouches
      ? eventGetChangedTouches(e)
      : eventGetTargetTouches(e)
    return !touches ? 'default' : touches[0] ? touches[0].identifier : 'error'
  }

  function eventGetTargetTouches(e) {
    return e.targetTouches
  }

  function eventGetX(e) {
    const touches = eventGetTargetTouches(e)
    return {
      x: options.isVerticalSlider
        ? !touches
          ? e.pageY
          : touches[0].screenY
        : !touches
        ? e.pageX
        : touches[0].screenX,
      timestamp: e.timeStamp,
    }
  }

  function eventIsIgnoreTarget(target) {
    return target.hasAttribute(options.preventEventAttributeName)
  }

  function eventIsSlide(e) {
    const touches = eventGetTargetTouches(e)
    if (!touches) return true
    const touch = touches[0]
    const x = options.isVerticalSlider ? touch.clientY : touch.clientX
    const y = options.isVerticalSlider ? touch.clientX : touch.clientY
    const isSlide =
      touchLastClientX !== undefined &&
      touchLastClientY !== undefined &&
      Math.abs(touchLastClientY - y) <= Math.abs(touchLastClientX - x)

    touchLastClientX = x
    touchLastClientY = y
    return isSlide
  }

  function eventWheel(e) {
    if (!options.isTouchable) return
    if (touchActive) e.preventDefault()
  }

  function eventsAdd() {
    eventAdd(container, 'dragstart', function (e) {
      if (!options.isTouchable) return
      e.preventDefault()
    })
    eventAdd(container, 'mousedown', eventDragStart)
    eventAdd(options.cancelOnLeave ? container : window, 'mousemove', eventDrag)
    if (options.cancelOnLeave) eventAdd(container, 'mouseleave', eventDragStop)
    eventAdd(window, 'mouseup', eventDragStop)
    eventAdd(container, 'touchstart', eventDragStart, {
      passive: true,
    })
    eventAdd(container, 'touchmove', eventDrag, {
      passive: false,
    })
    eventAdd(container, 'touchend', eventDragStop, {
      passive: true,
    })
    eventAdd(container, 'touchcancel', eventDragStop, {
      passive: true,
    })
    eventAdd(window, 'wheel', eventWheel, {
      passive: false,
    })
  }

  function hook(hook) {
    if (options[hook]) options[hook](pubfuncs)
  }

  function moveAnimate() {
    reqId = window.requestAnimationFrame(moveAnimateUpdate)
  }

  function moveAnimateAbort() {
    if (reqId) {
      window.cancelAnimationFrame(reqId)
      reqId = null
    }
    startTime = null
  }

  function moveAnimateUpdate(timestamp) {
    if (!startTime) startTime = timestamp
    const duration = timestamp - startTime
    let add = moveCalcValue(duration)
    if (duration >= moveDuration) {
      trackAdd(moveDistance - moved, false)
      if (moveCallBack) return moveCallBack()
      hook('afterChange')
      return
    }

    const offset = trackCalculateOffset(add)
    if (offset !== 0 && !options.isLoop && !options.isRubberband && !moveForceFinish) {
      trackAdd(add - offset, false)
      return
    }
    if (offset !== 0 && options.isRubberband && !moveForceFinish) {
      return moveRubberband()
    }
    moved += add
    trackAdd(add, false)
    moveAnimate()
  }

  function moveCalcValue(progress) {
    const value = moveDistance * moveEasing(progress / moveDuration) - moved
    return value
  }

  function moveWithSpeed() {
    hook('beforeChange')
    const moveMode = options.moveMode
    moveMode()
  }

  function moveSnapOne() {
    const startIndex =
      options.slidesPerView === 1 && trackDirection !== 0
        ? touchIndexStart
        : trackCurrentIdx
    moveToIdx(startIndex + Math.sign(trackDirection))
  }

  function moveToIdx(
    idx,
    forceFinish,
    duration = options.duration,
    relative = false,
    nearest = false
  ) {
    // forceFinish is used to ignore boundaries when rubberband movement is active

    idx = trackGetIdx(idx, relative, nearest)
    const easing = t => 1 + --t * t * t * t * t
    moveTo(trackGetIdxDistance(idx), duration, easing, forceFinish)
  }

  function moveFree() {
    // todo: refactor!
    if (trackSpeed === 0)
      return trackCalculateOffset(0) && !options.isLoop
        ? moveToIdx(trackCurrentIdx)
        : false
    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance =
      (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)
    const duration = Math.abs(trackSpeed / friction) * 6
    const easing = function (t) {
      return 1 - Math.pow(1 - t, 5)
    }
    moveTo(distance, duration, easing)
  }

  function moveSnapFree() {
    // todo: refactor!
    if (trackSpeed === 0) return moveToIdx(trackCurrentIdx)
    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance =
      (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)
    const duration = Math.abs(trackSpeed / friction) * 6
    const easing = function (t) {
      return 1 - Math.pow(1 - t, 5)
    }
    const idx_trend = (trackPosition + distance) / (width / options.slidesPerView)
    const idx =
      trackDirection === -1 ? Math.floor(idx_trend) : Math.ceil(idx_trend)
    moveTo(idx * (width / options.slidesPerView) - trackPosition, duration, easing)
  }

  function moveRubberband() {
    moveAnimateAbort()
    // todo: refactor!
    if (trackSpeed === 0) return moveToIdx(trackCurrentIdx, true)
    const friction = 0.04 / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance =
      (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)

    const easing = function (t) {
      return --t * t * t + 1
    }

    const speed = trackSpeed
    const cb = () => {
      moveTo(
        trackGetIdxDistance(trackGetIdx(trackCurrentIdx)),
        500,
        easing,
        true
      )
    }
    moveTo(distance, Math.abs(speed / friction) * 3, easing, true, cb)
  }

  function moveTo(distance, duration, easing, forceFinish, cb) {
    moveAnimateAbort()
    moveDistance = distance
    moved = 0
    moveDuration = duration
    moveEasing = easing
    moveForceFinish = forceFinish
    moveCallBack = cb
    startTime = null
    moveAnimate()
  }

  function sliderResize() {
    options.updateSlidesAndLength()
    options.updateSlidesPerView()

    width = options.isVerticalSlider ? container.offsetHeight : container.offsetWidth
    // move these to options, note that they all depend on slidesPerView, which might be changed here
    spacing = clampValue(options.spacing, 0, width / (options.slidesPerView - 1) - 1)
    width += spacing
    origin = options.isCenterMode
      ? (width / 2 - width / options.slidesPerView / 2) / width
      : 0
    if (options.slides) slidesSetWidths()

    const currentIdx = trackCurrentIdx
    trackSetPositionByIdx(options.isLoop ? currentIdx : trackClampIndex(currentIdx))

    if (options.isVerticalSlider) {
      container.setAttribute(attributeVertical, 'true') // changed from true to 'true'
    }
  }

  function sliderUnbind() {
    eventsRemove()
    if (options.slides) slidesRemoveStyles()
    if (container && container.hasAttribute(attributeVertical))
      container.removeAttribute(attributeVertical)
    hook('destroyed')
  }

  function slidesSetPositions() {
    options.slides.forEach((slide, idx) => {
      const absoluteDistance = trackSlidePositions[idx].distance * width
      const pos =
        absoluteDistance -
        idx *
          (width / options.slidesPerView -
            spacing / options.slidesPerView -
            (spacing / options.slidesPerView) * (options.slidesPerView - 1))

      const x = options.isVerticalSlider ? 0 : pos
      const y = options.isVerticalSlider ? pos : 0
      const transformString = `translate3d(${x}px, ${y}px, 0)`
      slide.style.transform = transformString
      slide.style['-webkit-transform'] = transformString
    })
  }

  function slidesSetWidths() {
    const prop = options.isVerticalSlider ? 'height' : 'width'
    options.slides.forEach(slide => {
      // TODO: we don't need to calculate the size of a slide when it is already known, that would allow slides of a different size
      const style = `calc(${100 / options.slidesPerView}% - ${
        (spacing / options.slidesPerView) * (options.slidesPerView - 1)
      }px)`
      slide.style[`min-${prop}`] = style
      slide.style[`max-${prop}`] = style
    })
  }

  function slidesRemoveStyles() {
    const prop = options.isVerticalSlider ? 'height' : 'width'
    const styles = ['transform', '-webkit-transform', `min-${prop}`, `max-${prop}`]
    options.slides.forEach(slide => {
      styles.forEach(style => {
        slide.style.removeProperty(style)
      })
    })
  }

  function trackAdd(val, drag = true, timestamp = Date.now()) {
    trackMeasure(val, timestamp)
    if (drag) val = trackrubberband(val)
    trackPosition += val
    trackMove()
  }

  function trackCalculateOffset(add) {
    const trackLength =
      (width * (length - 1 * (options.isCenterMode ? 1 : options.slidesPerView))) /
      options.slidesPerView
    const position = trackPosition + add
    return position > trackLength
      ? position - trackLength
      : position < 0
      ? position
      : 0
  }

  function trackClampIndex(idx) {
    return clampValue(
      idx,
      0,
      length - 1 - (options.isCenterMode ? 0 : options.slidesPerView - 1)
    )
  }

  function trackGetDetails() {
    const trackProgressAbs = Math.abs(trackProgress)
    const progress = trackPosition < 0 ? 1 - trackProgressAbs : trackProgressAbs
    return {
      direction: trackDirection,
      progressTrack: progress,
      progressSlides: (progress * length) / (length - 1),
      positions: trackSlidePositions,
      position: trackPosition,
      speed: trackSpeed,
      relativeSlide: ((trackCurrentIdx % length) + length) % length,
      absoluteSlide: trackCurrentIdx,
      size: length,
      slidesPerView: options.slidesPerView,
      widthOrHeight: width,
    }
  }

  function trackGetIdx(idx, relative = false, nearest = false) {
    return !options.isLoop
      ? trackClampIndex(idx)
      : !relative
      ? idx
      : trackGetRelativeIdx(idx, nearest)
  }

  function trackGetIdxDistance(idx) {
    return -(-((width / options.slidesPerView) * idx) + trackPosition)
  }

  function trackGetRelativeIdx(idx, nearest) {
    idx = ((idx % length) + length) % length
    const current = ((trackCurrentIdx % length) + length) % length
    const left = current < idx ? -current - length + idx : -(current - idx)
    const right = current > idx ? length - current + idx : idx - current
    const add = nearest
      ? Math.abs(left) <= right
        ? left
        : right
      : idx < current
      ? left
      : right
    return trackCurrentIdx + add
  }

  function trackMeasure(val, timestamp) {
    // todo - improve measurement - it could be better for ios
    clearTimeout(trackMeasureTimeout)
    const direction = Math.sign(val)
    if (direction !== trackDirection) trackMeasureReset()
    trackDirection = direction
    trackMeasurePoints.push({
      distance: val,
      time: timestamp,
    })
    trackMeasureTimeout = setTimeout(() => {
      trackMeasurePoints = []
      trackSpeed = 0
    }, 50)
    trackMeasurePoints = trackMeasurePoints.slice(-6)
    if (trackMeasurePoints.length <= 1 || trackDirection === 0)
      return (trackSpeed = 0)

    const distance = trackMeasurePoints
      .slice(0, -1)
      .reduce((acc, next) => acc + next.distance, 0)
    const end = trackMeasurePoints[trackMeasurePoints.length - 1].time
    const start = trackMeasurePoints[0].time
    trackSpeed = clampValue(distance / (end - start), -10, 10)
  }

  function trackMeasureReset() {
    trackMeasurePoints = []
  }

  // todo - option for not calculating slides that are not in sight
  function trackMove() {
    trackProgress = options.isLoop
      ? (trackPosition % ((width * length) / options.slidesPerView)) /
        ((width * length) / options.slidesPerView)
      : trackPosition / ((width * length) / options.slidesPerView)

    trackSetCurrentIdx()
    const slidePositions = []
    for (let idx = 0; idx < length; idx++) {
      let distance =
        (((1 / length) * idx -
          (trackProgress < 0 && options.isLoop ? trackProgress + 1 : trackProgress)) *
          length) /
          options.slidesPerView +
        origin
      if (options.isLoop)
        distance +=
          distance > (length - 1) / options.slidesPerView
            ? -(length / options.slidesPerView)
            : distance < -(length / options.slidesPerView) + 1
            ? length / options.slidesPerView
            : 0

      const slideWidth = 1 / options.slidesPerView
      const left = distance + slideWidth
      const portion =
        left < slideWidth
          ? left / slideWidth
          : left > 1
          ? 1 - ((left - 1) * options.slidesPerView) / 1
          : 1
      slidePositions.push({
        portion: portion < 0 || portion > 1 ? 0 : portion,
        distance: !options.isRtl
        ? distance
        : distance * -1 + 1 - slideWidth
      })
    }
    trackSlidePositions = slidePositions
    if (options.slides) slidesSetPositions()
    hook('move')
  }

  function trackrubberband(add) {
    if (options.isLoop) return add
    const offset = trackCalculateOffset(add)
    if (!options.isRubberband) return add - offset
    if (offset === 0) return add
    const easing = t => (1 - Math.abs(t)) * (1 - Math.abs(t))
    return add * easing(offset / width)
  }

  function trackSetCurrentIdx() {
    const new_idx = Math.round(trackPosition / (width / options.slidesPerView))
    if (new_idx === trackCurrentIdx) return
    if (!options.isLoop && (new_idx < 0 || new_idx > length - 1)) return
    trackCurrentIdx = new_idx
    hook('slideChanged')
  }

  function trackSetPositionByIdx(idx) {
    hook('beforeChange')
    trackAdd(trackGetIdxDistance(idx), false)
    hook('afterChange')
  }
}

// helper functions

/**
 * @param {NodeList} nodeList
 * @returns {Array<Node>}
 */
function convertToArray(nodeList) {
  return Array.prototype.slice.call(nodeList)
}

/**
 * @returns {Array<HTMLElement>}
 */
function getElements(element, wrapper = document) {
  return typeof element === 'function'
    ? convertToArray(element())
    : typeof element === 'string'
    ? convertToArray(wrapper.querySelectorAll(element))
    : element instanceof HTMLElement !== false
    ? [element]
    : element instanceof NodeList !== false
    ? element
    : []
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function EventBookKeeper() {
  let events = []

  return { eventAdd, eventsRemove }

  function eventAdd(element, event, handler, options = {}) {
    element.addEventListener(event, handler, options)
    events.push([element, event, handler, options])
  }

  function eventsRemove() {
    events.forEach(event => {
      event[0].removeEventListener(event[1], event[2], event[3])
    })
    events = []
  }
}

/**
 * @template T
 * @param {T} o
 *
 * @returns {ObjectKeys<T>}
 */
function keys(o) {
  // @ts-ignore
  return Object.keys(o)
}

/**
 *
 * @param {ObjectKeys<ReturnType<KeenSlider>>} keys
 * @param {{ current: ReturnType<KeenSlider> }} slider
 *
 * @returns {ReturnType<KeenSlider>}
 */
function pipeMethods(keys, slider) {
  // @ts-ignore
  return keys.reduce(
    (result, method) => ({ ...result, [method]: (...args) => slider.current[method](...args) }),
    {}
  )
}

/**
 * @param {TOptionsEvents} options
 * @param {{
 *  container: any,
 *  moveModes: Record<TOptionsEvents['mode'] | 'default', () => void>
 * }} x
 *
 * @returns {{
 *  isCenterMode: boolean,
 *  isTouchable: boolean,
 *  isLoop: boolean,
 *  isRtl: boolean,
 *  isRubberband: boolean,
 *  isVerticalSlider: boolean,
 *  initialIndex: number,
 *  preventEventAttributeName: string,
 *  cancelOnLeave: boolean,
 *  moveMode: () => void,
 *  duration: number,
 *  friction: number,
 *  updateSlidesAndLength(): void,
 *  slides: Array<HTMLElement> | null,
 *  length: number,
 *  touchMultiplicator: (val: number, instance: KeenSliderType) => number,
 *  updateSlidesPerView(): void,
 *  slidesPerView: number,
 *  spacing: number,
 * }} // only here to help with refactoring
 */
function Options(options, { moveModes, container }) {
  // TODO: the functions in options make stuff complicated. We should probably remove them if they influence behavior
  // an example is the fact that options.slides can be a function. It would be better to destroy and recreate the slider,
  // at the moment of writing this comment, determining the slides is done during resize

  // these constructs will probably be removed, but they make some side effects more obvious
  let slides, length = null
  updateSlidesAndLength()
  let slidesPerView = null
  updateSlidesPerView()

  return {
    get isCenterMode() {
      return options.centered
    },
    get isTouchable() {
      return options.controls
    },
    get isLoop() {
      return options.loop
    },
    get isRtl() {
      return options.rtl
    },
    get isRubberband() {
      return !options.loop && options.rubberband
    },
    get isVerticalSlider() {
      return !!options.vertical
    },
    get initialIndex() {
      return options.initial
    },
    get preventEventAttributeName() {
      return options.preventEvent
    },
    get cancelOnLeave() {
      return options.cancelOnLeave
    },
    get moveMode() {
      return moveModes[options.mode] || moveModes.default
    },
    get duration() {
      return options.duration
    },
    get friction() {
      return options.friction
    },
    updateSlidesAndLength,
    get slides() {
      return slides
    },
    get length() {
      return length
    },
    get touchMultiplicator() {
      const { dragSpeed } = options
      return typeof dragSpeed === 'function' ? dragSpeed : val => val * dragSpeed
    },
    updateSlidesPerView,
    get slidesPerView() {
      return slidesPerView
    },
    get spacing() {
      return options.spacing
    }
  }

  function updateSlidesAndLength() { // side effects should go later on
    const optionSlides = options.slides
    if (typeof optionSlides === 'number') {
      slides = null
      length = optionSlides
    } else {
      slides = getElements(optionSlides, container)
      length = slides ? slides.length : 0
    }
  }

  function updateSlidesPerView() {
    const option = options.slidesPerView
    slidesPerView = typeof option === 'function'
      ? option()
      : clampValue(option, 1, Math.max(options.loop ? length - 1 : length, 1))
  }
}

/**
 * @param {TOptionsEvents} initialOptions
 */
function BreakpointBasedOptions(initialOptions) {
  let currentBreakpoint = null
  let options = determineOptions(initialOptions)

  return {
    get options() { return options },
    refresh() {
      const previousOptions = options;
      options = determineOptions(initialOptions, options)
      return { optionsChanged: previousOptions !== options }
    }
  }

  /**
   * @param {TOptionsEvents} initialOptions
   * @param {TOptionsEvents} currentOptions
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

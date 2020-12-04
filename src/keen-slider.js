import './polyfills'
import KeenSliderType, { TOptionsEvents } from '../index'

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
  const slider = { current: KeenSlider(initialContainer, breakpointBasedOptions.options) }

  sliderInit()
  return {
    destroy() {
      eventsRemove()
      slider.current.destroy()
    },
    resize() {
      sliderResize(true)
    },
    refresh(options) { // this function should probably removed, it is simpler to just destroy and create a new instance
      slider.current.destroy()
      breakpointBasedOptions = BreakpointBasedOptions(options || initialOptions)
      slider.current = KeenSlider(initialContainer, breakpointBasedOptions.options)
    },
    // temporary construct, forward all methods to the current slider
    ...pipeMethods(keys(slider.current), slider)
  }

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
      slider.current.destroy()
      slider.current = KeenSlider(initialContainer, breakpointBasedOptions.options)
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
 * @param {TOptionsEvents} options
 */
function KeenSlider(initialContainer, options) {
  const attributeMoving = 'data-keen-slider-moves'
  const attributeVertical = 'data-keen-slider-v'

  const { eventAdd, eventsRemove } = EventBookKeeper()

  const [container] = getElements(initialContainer)
  let touchControls
  let length
  let origin
  let slides
  let width
  let slidesPerView
  let spacing
  let optionsChanged = false
  // let sliderCreated = false

  let trackCurrentIdx
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
  let touchMultiplicator
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

  const pubfuncs = {
    controls: active => {
      touchControls = active
    },
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
    // exposed for now, during refactor
    hook,
  }

  sliderInit()

  return pubfuncs

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
      !isTouchable()
    )
      return
    const x = eventGetX(e).x
    if (!eventIsSlide(e) && touchJustStarted) {
      return eventDragStop(e)
    }
    if (touchJustStarted) {
      trackMeasureReset()
      touchLastX = x
      container.setAttribute(attributeMoving, true)
      touchJustStarted = false
    }
    if (e.cancelable) e.preventDefault()
    const touchDistance = touchLastX - x
    trackAdd(touchMultiplicator(touchDistance, pubfuncs) * (!isRtl() ? 1 : -1), e.timeStamp)
    touchLastX = x
  }

  function eventDragStart(e) {
    if (touchActive || !isTouchable() || eventIsIgnoreTarget(e.target)) return
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
      !isTouchable()
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
      x: isVertialSlider()
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
    return target.hasAttribute(options.preventEvent)
  }

  function eventIsSlide(e) {
    const touches = eventGetTargetTouches(e)
    if (!touches) return true
    const touch = touches[0]
    const x = isVertialSlider() ? touch.clientY : touch.clientX
    const y = isVertialSlider() ? touch.clientX : touch.clientY
    const isSlide =
      touchLastClientX !== undefined &&
      touchLastClientY !== undefined &&
      Math.abs(touchLastClientY - y) <= Math.abs(touchLastClientX - x)

    touchLastClientX = x
    touchLastClientY = y
    return isSlide
  }

  function eventWheel(e) {
    if (!isTouchable()) return
    if (touchActive) e.preventDefault()
  }

  function eventsAdd() {
    eventAdd(container, 'dragstart', function (e) {
      if (!isTouchable()) return
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

  function isCenterMode() {
    return options.centered
  }

  function isTouchable() {
    return touchControls !== undefined ? touchControls : options.controls
  }

  function isLoop() {
    return options.loop
  }

  function isRtl() {
    return options.rtl
  }

  function isRubberband() {
    return !options.loop && options.rubberband
  }

  function isVertialSlider() {
    return !!options.vertical
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
    if (offset !== 0 && !isLoop() && !isRubberband() && !moveForceFinish) {
      trackAdd(add - offset, false)
      return
    }
    if (offset !== 0 && isRubberband() && !moveForceFinish) {
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
    switch (options.mode) {
      case 'free':
        moveFree()
        break
      case 'free-snap':
        moveSnapFree()
        break
      case 'snap':
      default:
        moveSnapOne()
        break
    }
  }

  function moveSnapOne() {
    const startIndex =
      slidesPerView === 1 && trackDirection !== 0
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
      return trackCalculateOffset(0) && !isLoop()
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
    const idx_trend = (trackPosition + distance) / (width / slidesPerView)
    const idx =
      trackDirection === -1 ? Math.floor(idx_trend) : Math.ceil(idx_trend)
    moveTo(idx * (width / slidesPerView) - trackPosition, duration, easing)
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

  function sliderGetSlidesPerView(option) {
    return typeof option === 'function'
      ? option()
      : clampValue(option, 1, Math.max(isLoop() ? length - 1 : length, 1))
  }

  function sliderResize() {
    const optionSlides = options.slides
    if (typeof optionSlides === 'number') {
      slides = null
      length = optionSlides
    } else {
      slides = getElements(optionSlides, container)
      length = slides ? slides.length : 0
    }
    const dragSpeed = options.dragSpeed
    touchMultiplicator =
      typeof dragSpeed === 'function' ? dragSpeed : val => val * dragSpeed
    width = isVertialSlider() ? container.offsetHeight : container.offsetWidth
    slidesPerView = sliderGetSlidesPerView(options.slidesPerView)
    spacing = clampValue(options.spacing, 0, width / (slidesPerView - 1) - 1)
    width += spacing
    origin = isCenterMode()
      ? (width / 2 - width / slidesPerView / 2) / width
      : 0
    slidesSetWidths()

    const currentIdx =
      (optionsChanged && options.resetSlide)
        ? options.initial
        : trackCurrentIdx
    trackSetPositionByIdx(isLoop() ? currentIdx : trackClampIndex(currentIdx))

    if (isVertialSlider()) {
      container.setAttribute(attributeVertical, true)
    }
    optionsChanged = false
  }

  function sliderUnbind() {
    eventsRemove()
    slidesRemoveStyles()
    if (container && container.hasAttribute(attributeVertical))
      container.removeAttribute(attributeVertical)
    hook('destroyed')
  }

  function slidesSetPositions() {
    if (!slides) return
    slides.forEach((slide, idx) => {
      const absoluteDistance = trackSlidePositions[idx].distance * width
      const pos =
        absoluteDistance -
        idx *
          (width / slidesPerView -
            spacing / slidesPerView -
            (spacing / slidesPerView) * (slidesPerView - 1))

      const x = isVertialSlider() ? 0 : pos
      const y = isVertialSlider() ? pos : 0
      const transformString = `translate3d(${x}px, ${y}px, 0)`
      slide.style.transform = transformString
      slide.style['-webkit-transform'] = transformString
    })
  }

  function slidesSetWidths() {
    if (!slides) return
    slides.forEach(slide => {
      const style = `calc(${100 / slidesPerView}% - ${
        (spacing / slidesPerView) * (slidesPerView - 1)
      }px)`
      if (isVertialSlider()) {
        slide.style['min-height'] = style
        slide.style['max-height'] = style
      } else {
        slide.style['min-width'] = style
        slide.style['max-width'] = style
      }
    })
  }

  function slidesRemoveStyles() {
    if (!slides) return
    let styles = ['transform', '-webkit-transform']
    styles = isVertialSlider
      ? [...styles, 'min-height', 'max-height']
      : [...styles, 'min-width', 'max-width']
    slides.forEach(slide => {
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
      (width * (length - 1 * (isCenterMode() ? 1 : slidesPerView))) /
      slidesPerView
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
      length - 1 - (isCenterMode() ? 0 : slidesPerView - 1)
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
      slidesPerView,
      widthOrHeight: width,
    }
  }

  function trackGetIdx(idx, relative = false, nearest = false) {
    return !isLoop()
      ? trackClampIndex(idx)
      : !relative
      ? idx
      : trackGetRelativeIdx(idx, nearest)
  }

  function trackGetIdxDistance(idx) {
    return -(-((width / slidesPerView) * idx) + trackPosition)
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
    trackProgress = isLoop()
      ? (trackPosition % ((width * length) / slidesPerView)) /
        ((width * length) / slidesPerView)
      : trackPosition / ((width * length) / slidesPerView)

    trackSetCurrentIdx()
    const slidePositions = []
    for (let idx = 0; idx < length; idx++) {
      let distance =
        (((1 / length) * idx -
          (trackProgress < 0 && isLoop() ? trackProgress + 1 : trackProgress)) *
          length) /
          slidesPerView +
        origin
      if (isLoop())
        distance +=
          distance > (length - 1) / slidesPerView
            ? -(length / slidesPerView)
            : distance < -(length / slidesPerView) + 1
            ? length / slidesPerView
            : 0

      const slideWidth = 1 / slidesPerView
      const left = distance + slideWidth
      const portion =
        left < slideWidth
          ? left / slideWidth
          : left > 1
          ? 1 - ((left - 1) * slidesPerView) / 1
          : 1
      slidePositions.push({
        portion: portion < 0 || portion > 1 ? 0 : portion,
        distance: !isRtl()
        ? distance
        : distance * -1 + 1 - slideWidth
      })
    }
    trackSlidePositions = slidePositions
    slidesSetPositions()
    hook('move')
  }

  function trackrubberband(add) {
    if (isLoop()) return add
    const offset = trackCalculateOffset(add)
    if (!isRubberband()) return add - offset
    if (offset === 0) return add
    const easing = t => (1 - Math.abs(t)) * (1 - Math.abs(t))
    return add * easing(offset / width)
  }

  function trackSetCurrentIdx() {
    const new_idx = Math.round(trackPosition / (width / slidesPerView))
    if (new_idx === trackCurrentIdx) return
    if (!isLoop() && (new_idx < 0 || new_idx > length - 1)) return
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

function convertToArray(nodeList) {
  return Array.prototype.slice.call(nodeList)
}

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

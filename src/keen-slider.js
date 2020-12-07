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
    moveToSlide(idx, duration = undefined) {
      return slider.current.moveToSlide(idx, duration)
    },
    moveToSlideRelative(idx, nearest = false, duration = undefined) {
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
  const dragHandling = DragHandling(container, options, {
    isValidDragEvent: e => eventIsSlide(e),
    onDragStart: handleDragStart,
    onFirstDrag: handleFirstDrag,
    onDrag: handleDrag,
    onDragStop: handleDragStop,
  })

  let trackCurrentIdx = options.initialIndex
  let trackPosition = 0
  const trackSpeedAndDirection = SpeedAndDirection()
  let trackSlidePositions
  let trackProgress

  // touch/swipe helper
  let touchIndexStart
  let clientTouchPoints

  // animation
  let reqId
  let startTime

  sliderInit()

  return {
    destroy: sliderDestroy,
    next() {
      moveToIdx(trackCurrentIdx + 1, { forceFinish: true })
    },
    prev() {
      moveToIdx(trackCurrentIdx - 1, { forceFinish: true })
    },
    moveToSlide(idx, duration = options.duration) {
      moveToIdx(idx, { forceFinish: true , duration })
    },
    moveToSlideRelative(idx, nearest = false, duration = options.duration) {
      moveToIdx(idx, { forceFinish: true, duration, relative: true, nearest })
    },
    details() {
      return trackGetDetails()
    },
    resize: sliderResize,
    // exposed for now, during refactor, should probably be moved to wrapper
    hook,
  }

  function sliderInit() {
    if (!container) return // this should probably throw an error, but there might be a use case, not sure
    if (options.isVerticalSlider) container.setAttribute(attributeVertical, 'true') // changed from true to 'true'
    sliderResize()
    if (options.isTouchable) dragHandling.startListening()
    hook('mounted')
  }

  function sliderDestroy() {
    dragHandling.destroy()
    if (options.slides) slidesRemoveStyles()
    if (container && container.hasAttribute(attributeVertical))
      container.removeAttribute(attributeVertical) // this should also be in a request animation frame
    hook('destroyed')
  }

  function sliderResize() {
    options.updateSlidesAndNumberOfSlides()
    options.updateSlidesPerView()
    options.measureContainer()
    if (options.slides) slidesSetWidthsOrHeights()

    trackSetPositionByIdx(options.isLoop ? trackCurrentIdx : options.clampIndex(trackCurrentIdx))
  }

  function handleDragStart(e) {
    const [touch] = e.targetTouches || []
    if (touch) clientTouchPoints = ClientTouchPoints(options, touch)

    moveAnimateAbort()
    touchIndexStart = trackCurrentIdx
    trackAdd(0, { timestamp: e.timeStamp }) // note: was `drag: e.timeStamp`
    hook('dragStart')
  }

  function handleFirstDrag(e) {
    trackSpeedAndDirection.reset()
    container.setAttribute(attributeMoving, 'true') // note: not sure if this is backwards compatible, I changed it from true to 'true', but I don't know if browsers do the same behind the scenes
  }

  function handleDrag(e, { distance }) {
    trackAdd(options.touchMultiplicator(distance, pubfuncs), { timestamp: e.timeStamp }) // note: was `drag: e.timeStamp`
  }

  function handleDragStop(e) {
    container.removeAttribute(attributeMoving)

    hook('beforeChange')
    options.dragEndMovement()

    hook('dragEnd')
  }

  function eventIsSlide(e) {
    const [touch] = e.targetTouches || []
    if (!touch) return true
    if (!clientTouchPoints) return false

    const { current: [a, b], previous: [previousA, previousB] } = clientTouchPoints.fromTouch(touch)
    const isSlide = Math.abs(previousB - b) <= Math.abs(previousA - a)

    return isSlide
  }

  function hook(hook) {
    if (options[hook]) options[hook](pubfuncs)
  }

  function moveAnimate(moveData) {
    reqId = window.requestAnimationFrame(timestamp => moveAnimateUpdate(timestamp, moveData))
  }

  function moveAnimateAbort() {
    if (reqId) {
      window.cancelAnimationFrame(reqId)
      reqId = null
    }
    startTime = null
  }

  function moveAnimateUpdate(timestamp, moveData) {
    // question: should timestamp be passed to `trackAdd`?
    const { moveDistance, moved, moveDuration, moveEasing, moveForceFinish, moveCallBack, } = moveData
    // TODO: make sure there is no DOM reading here (also check option calls)
    if (!startTime) startTime = timestamp
    const duration = timestamp - startTime
    if (duration >= moveDuration) {
      trackAdd(moveDistance - moved, { drag: false })
      if (moveCallBack) return moveCallBack()
      hook('afterChange')
      return
    }

    const add = moveDistance * moveEasing(duration / moveDuration) - moved
    const offset = options.calculateOffset(trackPosition + add)
    if (offset !== 0 && !options.isLoop && !options.isRubberband && !moveForceFinish) {
      trackAdd(add - offset, { drag: false })
      return
    }
    if (offset !== 0 && options.isRubberband && !moveForceFinish) {
      moveRubberband()
      return
    }
    trackAdd(add, { drag: false })
    moveAnimate({ ...moveData, moved: moved + add })
  }

  function moveSnapOne() {
    const trackDirection = trackSpeedAndDirection.direction
    const startIndex =
      options.slidesPerView === 1 && trackDirection !== 0
        ? touchIndexStart
        : trackCurrentIdx
    moveToIdx(startIndex + trackDirection)
  }

  function moveToIdx(
    idx,
    { forceFinish = false, duration = options.duration, relative = false, nearest = false }
  ) {
    // forceFinish is used to ignore boundaries when rubberband movement is active
    moveTo({
      distance: trackGetIdxDistance(trackGetIdx(idx, relative, nearest)),
      duration,
      easing: t => 1 + --t * t * t * t * t,
      forceFinish,
    })
  }

  function moveFree() {
    // todo: refactor! working on it
    const trackSpeed = trackSpeedAndDirection.speed
    if (trackSpeed === 0) {
      if (options.calculateOffset(trackPosition) && !options.isLoop) moveToIdx(trackCurrentIdx)
      return
    }
    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)

    moveTo({
      distance: (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed),
      duration: Math.abs(trackSpeed / friction) * 6,
      easing: t => 1 - Math.pow(1 - t, 5),
    })
  }

  function moveSnapFree() {
    // todo: refactor! working on it
    const { speed: trackSpeed, direction: trackDirection } = trackSpeedAndDirection
    if (trackSpeed === 0) {
      moveToIdx(trackCurrentIdx)
      return
    }

    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance = (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)
    const idx_trend = (trackPosition + distance) / (options.widthOrHeight / options.slidesPerView)
    const idx = trackDirection === -1 ? Math.floor(idx_trend) : Math.ceil(idx_trend)

    moveTo({
      distance: idx * (options.widthOrHeight / options.slidesPerView) - trackPosition,
      duration: Math.abs(trackSpeed / friction) * 6,
      easing: t => 1 - Math.pow(1 - t, 5),
    })
  }

  function moveRubberband() {
    // todo: refactor! working on it
    const trackSpeed = trackSpeedAndDirection.speed
    if (trackSpeed === 0) {
      moveToIdx(trackCurrentIdx, { forceFinish: true })
      return
    }

    const friction = 0.04 / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance = (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)

    const easing = t => --t * t * t + 1

    moveTo({
      distance,
      duration: Math.abs(trackSpeed / friction) * 3,
      easing,
      forceFinish: true,
      cb: () => {
        moveTo({
          distance: trackGetIdxDistance(trackGetIdx(trackCurrentIdx)),
          duration: 500,
          easing,
          forceFinish: true,
        })
      }
    })
  }

  function moveTo({ distance, duration, easing, forceFinish = false, cb = undefined }) {
    moveAnimateAbort()
    moveAnimate({
      moveDistance: distance,
      moved: 0,
      moveDuration: duration,
      moveEasing: easing,
      moveForceFinish: forceFinish,
      moveCallBack: cb,
    })
  }

  function slidesSetPositions(slides, slidePositions) {
    slides.forEach((slide, idx) => {
      const { distance } = slidePositions[idx]

      const absoluteDistance = distance * options.widthOrHeight
      const pos =
        absoluteDistance -
        idx *
          // this bit can be moved to options as soon as I can think of a name:
          (
            options.widthOrHeight / options.slidesPerView -
            options.spacing / options.slidesPerView -
            (options.spacing / options.slidesPerView) *
            (options.slidesPerView - 1)
          )

      const [a, b] = options.isVerticalSlider ? [0, pos] : [pos, 0]

      const transformString = `translate3d(${a}px, ${b}px, 0)`
      // these writes should be in a request animation frame
      slide.style.transform = transformString
      slide.style['-webkit-transform'] = transformString
    })
  }

  function slidesSetWidthsOrHeights() {
    const prop = options.isVerticalSlider ? 'height' : 'width'
    options.slides.forEach(slide => {
      // TODO: we don't need to calculate the size of a slide when it is already known, that would allow slides of a different size
      const style = `calc(${100 / options.slidesPerView}% - ${
        (options.spacing / options.slidesPerView) * (options.slidesPerView - 1)
      }px)`
      // these writes should be in a request animation frame
      slide.style[`min-${prop}`] = style
      slide.style[`max-${prop}`] = style
    })
  }

  function slidesRemoveStyles() {
    const prop = options.isVerticalSlider ? 'height' : 'width'
    const styles = ['transform', '-webkit-transform', `min-${prop}`, `max-${prop}`]
    options.slides.forEach(slide => {
      styles.forEach(style => {
        // this write should be in a request animation frame
        slide.style.removeProperty(style)
      })
    })
  }

  function trackAdd(val, { drag = true, timestamp = Date.now() }) {
    trackSpeedAndDirection.measure(val, timestamp)
    trackPosition += drag ? trackRubberband(val) : val
    trackSetCurrentIdx(trackPosition)
    trackProgress = options.calculateTrackProgress(trackPosition)
    // todo - option for not calculating slides that are not in sight
    trackSlidePositions = options.calculateSlidePositions(trackProgress)
    if (options.slides) slidesSetPositions(options.slides, trackSlidePositions)
    hook('move')
  }

  function trackGetDetails() {
    const trackProgressAbs = Math.abs(trackProgress)
    const progress = trackPosition < 0 ? 1 - trackProgressAbs : trackProgressAbs
    return {
      direction: trackSpeedAndDirection.direction,
      progressTrack: progress,
      progressSlides: (progress * options.numberOfSlides) / (options.numberOfSlides - 1), // what if length is 1? devision by 0
      positions: trackSlidePositions,
      position: trackPosition,
      speed: trackSpeedAndDirection.speed,
      relativeSlide: options.ensureIndexInBounds(trackCurrentIdx),
      absoluteSlide: trackCurrentIdx,
      size: options.numberOfSlides,
      slidesPerView: options.slidesPerView,
      widthOrHeight: options.widthOrHeight,
    }
  }

  function trackGetIdx(idx, relative = false, nearest = false) {
    return (
      !options.isLoop ? options.clampIndex(idx) :
      !relative ? idx :
      trackGetRelativeIdx(idx, nearest)
    )
  }

  function trackGetIdxDistance(idx) {
    return -(-((options.widthOrHeight / options.slidesPerView) * idx) + trackPosition)
  }

  // reduce side effects in function that do other stuff as well
  // it should not return a value AND perform a side effect
  function trackGetRelativeIdx(idx, nearest) {
    const boundedIdx = options.ensureIndexInBounds(idx)
    const current = options.ensureIndexInBounds(trackCurrentIdx)
    const left = current < boundedIdx
      ? -current - options.numberOfSlides + boundedIdx
      : -(current - boundedIdx)
    const right = current > boundedIdx
      ? options.numberOfSlides - current + boundedIdx
      : boundedIdx - current
    const add = (
      nearest ? (Math.abs(left) <= right ? left : right) :
      boundedIdx < current ? left :
      right
    )
    return trackCurrentIdx + add
  }

  function trackRubberband(add) {
    if (options.isLoop) return add

    const offset = options.calculateOffset(trackPosition + add)

    if (!options.isRubberband) return add - offset
    if (offset === 0) return add

    const easing = t => (1 - Math.abs(t)) * (1 - Math.abs(t))
    return add * easing(offset / options.widthOrHeight)
  }

  function trackSetCurrentIdx(trackPosition) {
    const new_idx = options.calculateIndex(trackPosition)
    if (new_idx === trackCurrentIdx || options.isIndexOutOfBounds(new_idx)) return

    trackCurrentIdx = new_idx
    hook('slideChanged')
  }

  function trackSetPositionByIdx(idx) {
    hook('beforeChange')
    trackAdd(trackGetIdxDistance(idx), { drag: false })
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
  *  dragEndMovement: () => void,
  *  duration: number,
  *  friction: number,
  *  updateSlidesAndNumberOfSlides(): void,
  *  slides: Array<HTMLElement> | null,
  *  numberOfSlides: number,
  *  touchMultiplicator: (val: number, instance: KeenSliderType) => number,
  *  updateSlidesPerView(): void,
  *  slidesPerView: number,
  *  spacing: number,
  *  measureContainer(): void,
  *  widthOrHeight: number,
  *  spacing: number,
  *  origin: number,
  *  clampIndex(idx: number): number,
  *  calculateOffset(position: number): number,
  *  calculateTrackProgress(trackPosition: number): number,
  *  calculateIndex(trackPosition: number): number,
  *  isIndexOutOfBounds(idx: number): boolean,
  *  ensureIndexInBounds(idx: number): number,
  *  calculateSlidePositions(trackProgress: number): Array<{ portion: number, distance: number }>,
  * }} // only here to help with refactoring
  */
 function Options(options, { moveModes, container }) {
   // TODO: the functions in options make stuff complicated. We should probably remove them if they influence behavior
   // an example is the fact that options.slides can be a function. It would be better to destroy and recreate the slider,
   // at the moment of writing this comment, determining the slides is done during resize

   // these constructs will probably be removed, but they make some side effects more obvious in this stage
   // note to self: check if you can refactor them to the outside of this component, so that the option functions
   // are used in the appropriate times to create new instance
   let slides, numberOfSlides = null
   updateSlidesAndNumberOfSlides()
   let slidesPerView = null
   updateSlidesPerView()
   let containerSize = null
   measureContainer()

   const dynamicOptions = {
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
     get dragEndMovement() {
       return moveModes[options.mode] || moveModes.default
     },
     get duration() {
       return options.duration
     },
     get friction() {
       return options.friction
     },
     updateSlidesAndNumberOfSlides,
     get slides() {
       return slides
     },
     get numberOfSlides() {
       return numberOfSlides
     },
     get touchMultiplicator() {
       const { dragSpeed } = options
       const multiplicator = typeof dragSpeed === 'function' ? dragSpeed : val => val * dragSpeed
       return (val, instance) => multiplicator(val, instance) * (!options.rtl ? 1 : -1)
     },
     updateSlidesPerView,
     get slidesPerView() {
       return slidesPerView
     },
     measureContainer,
     get widthOrHeight() {
       return containerSize + dynamicOptions.spacing
     },
     get spacing() {
       return clampValue(options.spacing, 0, containerSize / (slidesPerView - 1) - 1)
     },
     get origin() {
       const { widthOrHeight } = dynamicOptions
       return options.centered
         ? (widthOrHeight / 2 - widthOrHeight / slidesPerView / 2) / widthOrHeight
         : 0
     },
     clampIndex(idx) {
       return clampValue(idx, 0, numberOfSlides - 1 - (options.centered ? 0 : slidesPerView - 1))
     },
     calculateOffset(position) {
       const trackLength =
         (
           dynamicOptions.widthOrHeight * (
             numberOfSlides - 1 /* <- check if we need parentheses here */ * (options.centered ? 1 : slidesPerView)
           )
         ) / slidesPerView
       return (
         position > trackLength ? position - trackLength :
         position < 0           ? position :
         0
       )
     },
     calculateTrackProgress(trackPosition) {
       // should give this variable a better name, however brain is now in refactor mode and I can't think of one
       const x = (dynamicOptions.widthOrHeight * numberOfSlides) / slidesPerView
       return options.loop
         ? (trackPosition % x) / x
         : trackPosition / x
     },
     calculateIndex(trackPosition) {
       return Math.round(trackPosition / (dynamicOptions.widthOrHeight / slidesPerView))
     },
     isIndexOutOfBounds(idx) {
       return !options.loop && (idx < 0 || idx > numberOfSlides - 1)
     },
     ensureIndexInBounds(idx) {
       return ((idx % numberOfSlides) + numberOfSlides) % numberOfSlides
     },
     calculateSlidePositions(trackProgress) {
       const slidePositions = []

       const progress = (trackProgress < 0 && options.loop ? trackProgress + 1 : trackProgress)
       for (let idx = 0; idx < numberOfSlides; idx++) {
         let distance =
           (((1 / numberOfSlides) * idx - progress) * numberOfSlides) /
             slidesPerView +
             dynamicOptions.origin
         if (options.loop)
           distance +=
             distance > (numberOfSlides - 1) / slidesPerView  ? -(numberOfSlides / slidesPerView) :
             distance < -(numberOfSlides / slidesPerView) + 1 ? numberOfSlides / slidesPerView :
             0

         const slideWidth = 1 / slidesPerView
         const left = distance + slideWidth
         const portion = (
           left < slideWidth ? left / slideWidth :
           left > 1          ? 1 - ((left - 1) * slidesPerView) / 1 :
           1
         )
         slidePositions.push({
           portion: portion < 0 || portion > 1 ? 0 : portion,
           distance: !options.rtl ? distance : distance * -1 + 1 - slideWidth
         })
       }
       return slidePositions
     }
   }

   return dynamicOptions

   function measureContainer() {
     containerSize = options.vertical ? container.offsetHeight : container.offsetWidth
   }

   function updateSlidesAndNumberOfSlides() { // side effects should go later on
     const optionSlides = options.slides
     if (typeof optionSlides === 'number') {
       slides = null
       numberOfSlides = optionSlides
     } else {
       slides = getElements(optionSlides, container)
       numberOfSlides = slides ? slides.length : 0
     }
   }

   function updateSlidesPerView() {
     const option = options.slidesPerView
     slidesPerView = typeof option === 'function'
       ? option()
       : clampValue(option, 1, Math.max(options.loop ? numberOfSlides - 1 : numberOfSlides, 1))
   }
 }

function SpeedAndDirection() {

  let trackMeasurePoints = []
  let trackDirection
  let trackMeasureTimeout
  let trackSpeed

  return {
    measure,
    reset,
    get speed() { return trackSpeed },
    get direction() { return trackDirection },
  }

  function measure(val, timestamp) {
    // todo - improve measurement - it could be better for ios
    clearTimeout(trackMeasureTimeout)
    const direction = Math.sign(val)
    if (direction !== trackDirection) reset()
    trackDirection = direction
    trackMeasurePoints.push({
      distance: val,
      time: timestamp,
    })
    trackMeasureTimeout = setTimeout(
      () => {
        trackMeasurePoints = []
        trackSpeed = 0
      },
      50
    )
    trackMeasurePoints = trackMeasurePoints.slice(-6)
    if (trackMeasurePoints.length <= 1 || trackDirection === 0) {
      trackSpeed = 0
      return
    }

    const distance = trackMeasurePoints
      .slice(0, -1)
      .reduce((acc, next) => acc + next.distance, 0)
    const end = trackMeasurePoints[trackMeasurePoints.length - 1].time
    const start = trackMeasurePoints[0].time
    trackSpeed = clampValue(distance / (end - start), -10, 10)
  }

  function reset() {
    trackMeasurePoints = []
  }
}

function ClientTouchPoints(options, initialTouch) {
  let previous = eventGetClientTouchPoints(initialTouch)

  return {
    fromTouch(touch) {
      const current = eventGetClientTouchPoints(touch)
      const result = {
        previous,
        current,
      }
      previous = current
      return result
    }
  }

  function eventGetClientTouchPoints(touch) {
    return options.isVerticalSlider
      ? [touch.clientY, touch.clientX]
      : [touch.clientX, touch.clientY]
  }
}

function DragHandling(container, options, {
  isValidDragEvent,
  onDragStart,
  onFirstDrag,
  onDrag,
  onDragStop,
}) {
  const { eventAdd, eventsRemove } = EventBookKeeper()

  let isDragging = false
  let dragJustStarted = false
  let touchIdentifier = null
  let touchLastXOrY = 0

  return {
    startListening() { eventsAdd() },
    destroy() { eventsRemove() },
  }

  function eventsAdd() {
    eventAdd(container, 'dragstart', e => { e.preventDefault() })
    eventAdd(window, 'wheel', e => { if (isDragging) e.preventDefault() }, { passive: false })

    eventAdd(container, 'mousedown', eventDragStart)
    eventAdd(container, 'touchstart', eventDragStart, { passive: true })

    eventAdd(options.cancelOnLeave ? container : window, 'mousemove', eventDrag)
    eventAdd(container, 'touchmove', eventDrag, { passive: false })

    if (options.cancelOnLeave) eventAdd(container, 'mouseleave', eventDragStop)
    eventAdd(window, 'mouseup', eventDragStop)
    eventAdd(container, 'touchend', eventDragStop, { passive: true })
    eventAdd(container, 'touchcancel', eventDragStop, { passive: true })
  }

  function eventDragStart(e) {
    if (isDragging || eventIsIgnoreTarget(e.target)) return
    isDragging = true
    dragJustStarted = true
    touchIdentifier = eventGetIdentifier(e.targetTouches)

    onDragStart(e)
  }

  function eventDrag(e) {
    if (!isDragging || touchIdentifier !== eventGetIdentifier(e.targetTouches)) return
    if (dragJustStarted && !isValidDragEvent(e)) {
      eventDragStop(e)
      return
    }
    if (e.cancelable) e.preventDefault()

    const xOrY = eventGetXOrY(e)
    const distance = dragJustStarted ? 0 : touchLastXOrY - xOrY
    if (dragJustStarted) {
      onFirstDrag(e)
      //trackSpeedAndDirection.reset()
      //container.setAttribute(attributeMoving, 'true') // note: not sure if this is backwards compatible, I changed it from true to 'true', but I don't know if browsers do the same behind the scenes
      dragJustStarted = false
    }
    onDrag(e, { distance })
    // trackAdd(options.touchMultiplicator(touchDistance, pubfuncs), { timestamp: e.timeStamp }) // note: was `drag: e.timeStamp`
    touchLastXOrY = xOrY
  }

  function eventDragStop(e) {
    if (!isDragging || touchIdentifier !== eventGetIdentifier(e.changedTouches)) return
    isDragging = false

    onDragStop(e)
  }

  function eventGetIdentifier(touches) {
    return (
      !touches ? 'default' :
      touches[0] ? touches[0].identifier :
      'error'
    )
  }

  function eventGetXOrY(e) {
    const [touch] = e.targetTouches || []
    return options.isVerticalSlider
      ? (!touch ? e.pageY : touch.screenY)
      : (!touch ? e.pageX : touch.screenX)
  }

  function eventIsIgnoreTarget(target) {
    return target.hasAttribute(options.preventEventAttributeName)
  }
}

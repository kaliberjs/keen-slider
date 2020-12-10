import './polyfills'
import KeenSliderType, { TOptionsEvents, TOptions, TEvents } from '../index'

/** @type {TOptions} */
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
      sliderDestroy()
    },
    resize() {
      sliderResize(true)
    },
    controls: active => { // not sure if this is a valuable API, seems to break on breakpoint change
      const newOptions = {
        ...breakpointBasedOptions.options,
        initial: slider.current.details().absoluteSlide,
        controls: active,
      }
      sliderReplace(newOptions)
    },
    refresh(options) { // this function should probably removed, it is simpler to just destroy and create a new instance
      breakpointBasedOptions = BreakpointBasedOptions(options || initialOptions)
      sliderReplace(breakpointBasedOptions.options)
    },
    next() { return slider.current.next() },
    prev() { return slider.current.prev() },
    moveToSlide(idx, duration = undefined) {
      return slider.current.moveToSlide(idx, duration)
    },
    moveToSlideRelative(idx, nearest = false, duration = undefined) {
      return slider.current.moveToSlideRelative(idx, nearest, duration)
    },
    details() { return slider.current.details() },
  }
  const slider = { current: null }

  sliderInit()

  return pubfuncs

  function sliderInit() {
    sliderCreate(breakpointBasedOptions.options)
    eventAdd(window, 'resize', sliderResize)
    fireEvent('created')
  }

  function sliderDestroy() {
    eventsRemove()
    slider.current.destroy()
    fireEvent('destroyed')
  }

  /** @param {TOptions} options */
  function sliderCreate({ dragSpeed, ...options }) {
    const modifiedOptions = {
      ...options,
      dragSpeed: typeof dragSpeed === 'function' ? val => dragSpeed(val, pubfuncs) : dragSpeed
    }
    slider.current = KeenSlider(initialContainer, modifiedOptions, fireEvent)
    slider.current.mount()
  }

  function sliderReplace(options) {
    slider.current.destroy()
    sliderCreate(options)
  }

  /** @param {keyof TEvents} event */
  function fireEvent(event) {
    const { options } = breakpointBasedOptions
    if (options[event]) options[event](pubfuncs)
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

      sliderReplace(newOptions)
    } else {
      const windowWidth = window.innerWidth
      if (!force && windowWidth === resizeLastWidth) return
      resizeLastWidth = windowWidth
      slider.current.resize()
    }
  }
}

/**
 * @param {HTMLElement} initialContainer
 * @param {TOptions} initialOptions
 * @param {(event: keyof TEvents) => void} fireEvent
 */
function KeenSlider(initialContainer, initialOptions, fireEvent) {
  const attributeMoving = 'data-keen-slider-moves'
  const attributeVertical = 'data-keen-slider-v'

  /*
    Thinking out loud (talking to myself)

    - split the slider into a few more sections, class, components (whatever you want to call them)
      - something to handle user movement
      - something to handle movement after a user lets go
      - something to handle manual (public API) movement
      - something to handle tracking (getDetails)
      - something to handle positioning, maybe split virtual (without slides) and concrete
        (with slides)
    - move calculations out of options, the options object only expose getters, so the maximum
      complexity will be getter functions. If these getters require calculations it should depend
      on another object. Note to self: don't introduce cyclic dependencies

    Important note to self: keep functionality that belongs together (will change at the same rate
    and for the same reasons) close together. Once you think you are done, re-read this line and
    evaluate.

    Once the code is clean think about your ideal design:
    - no function options (unless they are callbacks or hooks)
    - only one way to do something
    - no contrasting options (for example rubberband with loop)
    - behavior as an option (easings, movement, timing, ...)
    - framework friendly writes (only think about this when everything else is in order)
    - have the option to set attributes on the html (maybe in the shape of a callback)

    With the thought of the ideal design in mind, move everything else outside and provide it as
    a backwards compatibility layer. It's ok if 'weird' or 'undefined' logic is lost, it's not ok
    if we lose 'normal use' backwards compatibility.
  */

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
    onDragStart: handleDragStart,
    onFirstDrag: handleFirstDrag,
    onDrag: handleDrag,
    onDragStop: handleDragStop,
  })
  const animation = Animation()
  const track = Track({
    options,
    onIndexChanged() {
      fireEvent('slideChanged')
    },
    onMove(trackSlidePositions) {
      if (options.slides) slidesSetPositions(options.slides, trackSlidePositions)
      fireEvent('move')
    }
  })

  const trackSpeedAndDirection = SpeedAndDirection()

  // touch/swipe helper
  let touchIndexStart

  return {
    mount: sliderInit,
    destroy: sliderDestroy,
    next() {
      moveToIdx(track.currentIdx + 1, { forceFinish: true })
    },
    prev() {
      moveToIdx(track.currentIdx - 1, { forceFinish: true })
    },
    moveToSlide(idx, duration = options.duration) {
      moveToIdx(idx, { forceFinish: true , duration })
    },
    moveToSlideRelative(relativeIdx, nearest = false, duration = options.duration) {
      const idx = trackGetRelativeIdx(relativeIdx, nearest)
      moveToIdx(idx, { forceFinish: true, duration })
    },
    details() {
      return trackGetDetails()
    },
    resize: sliderResize,
  }

  function sliderInit() {
    if (!container) return // this should probably throw an error, but there might be a use case, not sure
    if (options.isVerticalSlider) container.setAttribute(attributeVertical, 'true') // changed from true to 'true'
    sliderResize()
    if (options.isTouchable) dragHandling.startListening()
    fireEvent('mounted')
  }

  function sliderDestroy() {
    dragHandling.destroy()
    if (options.slides) slidesRemoveStyles()
    if (container && container.hasAttribute(attributeVertical))
      container.removeAttribute(attributeVertical) // this should also be in a request animation frame
  }

  function sliderResize() {
    options.updateSlidesAndNumberOfSlides()
    options.updateSlidesPerView()
    options.measureContainer()
    if (options.slides) slidesSetWidthsOrHeights()

    fireEvent('beforeChange')
    trackAdd(trackGetIdxDistance(options.clampIndex(track.currentIdx)), { isDrag: false })
    fireEvent('afterChange')
  }

  function handleDragStart(e) {
    animation.cancel()
    touchIndexStart = track.currentIdx
    trackAdd(0, { isDrag: true, timestamp: e.timeStamp }) // note: was `drag: e.timeStamp`
    fireEvent('dragStart')
  }

  function handleFirstDrag(e) {
    trackSpeedAndDirection.reset()
    container.setAttribute(attributeMoving, 'true') // note: not sure if this is backwards compatible, I changed it from true to 'true', but I don't know if browsers do the same behind the scenes
  }

  function handleDrag(e, { distance }) {
    trackAdd(options.touchMultiplicator(distance), { isDrag: true, timestamp: e.timeStamp }) // note: was `drag: e.timeStamp`
  }

  function handleDragStop(e) {
    container.removeAttribute(attributeMoving)

    fireEvent('beforeChange')
    options.dragEndMovement()

    fireEvent('dragEnd')
  }

  function moveTo({ distance, duration, easing, forceFinish, cb = undefined }) {
    animation.move({ distance, duration, easing,
      // These callbacks are executed in an animation frame and should not perform DOM reads
      onMoveComplete: ({ moved }) => {
        trackAdd(distance - moved, { isDrag: false })
        if (cb) return cb()
        fireEvent('afterChange')
      },
      onMove: ({ delta, stop }) => {
        // The 'stop' variants only occur in certain scenario's, we should eventually find a way
        // figure out which scenario's. That would allow us to run all animations to completion
        // unless they actually need to be canceled.
        //
        // To my naive brain it does not make sense to start an animation and decide midway:
        // "oops, we should actually do something else"
        const offset = track.calculateOutOfBoundsOffset(delta)
        const isOutOfBounds = offset !== 0

        if (isOutOfBounds && !forceFinish) {

          if (!options.isRubberband && !options.isLoop) {
            trackAdd(delta - offset, { isDrag: false })
            return stop
          }

          if (options.isRubberband) {
            moveRubberband()
            return stop
          }
        }

        trackAdd(delta, { isDrag: false })
      }
    })
  }

  function moveRubberband() {
    // todo: refactor! working on it
    const trackSpeed = trackSpeedAndDirection.speed
    if (trackSpeed === 0) {
      moveToIdx(track.currentIdx, { forceFinish: true })
      return
    }

    const friction = 0.04 / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance = (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)

    const easing = function cubicOut(t) { return --t * t * t + 1 }

    moveTo({
      distance,
      duration: Math.abs(trackSpeed / friction) * 3,
      easing,
      forceFinish: true,
      cb: () => {
        moveTo({
          distance: trackGetIdxDistance(options.clampIndex(track.currentIdx)),
          duration: 500,
          easing,
          forceFinish: true,
        })
      }
    })
  }

  function moveSnapOne() {
    const trackDirection = trackSpeedAndDirection.direction
    const startIndex =
      options.slidesPerView === 1 && trackDirection !== 0
        ? touchIndexStart
        : track.currentIdx
    moveToIdx(startIndex + trackDirection, { forceFinish: false })
  }

  function moveFree() {
    // todo: refactor! working on it
    const trackSpeed = trackSpeedAndDirection.speed
    if (trackSpeed === 0) {
      if (track.calculateOutOfBoundsOffset(0) && !options.isLoop) moveToIdx(track.currentIdx, { forceFinish: false })
      return
    }
    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)

    moveTo({
      distance: (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed),
      duration: Math.abs(trackSpeed / friction) * 6,
      easing: function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5) },
      forceFinish: false,
    })
  }

  function moveSnapFree() {
    // todo: refactor! working on it
    const { speed: trackSpeed, direction: trackDirection } = trackSpeedAndDirection
    if (trackSpeed === 0) {
      moveToIdx(track.currentIdx, { forceFinish: false })
      return
    }

    const friction = options.friction / Math.pow(Math.abs(trackSpeed), -0.5)
    const distance = (Math.pow(trackSpeed, 2) / friction) * Math.sign(trackSpeed)
    const idx_trend = (track.position + distance) / options.sizePerSlide
    const idx = trackDirection === -1 ? Math.floor(idx_trend) : Math.ceil(idx_trend)

    moveTo({
      distance: idx * options.sizePerSlide - track.position,
      duration: Math.abs(trackSpeed / friction) * 6,
      easing: function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5) },
      forceFinish: false,
    })
  }

  function moveToIdx(
    idx,
    { forceFinish, duration = options.duration }
  ) {
    // forceFinish is used to ignore boundaries when rubberband movement is active
    moveTo({
      distance: trackGetIdxDistance(options.clampIndex(idx)),
      duration,
      easing: function easeOutQuint(t) { return 1 + --t * t * t * t * t },
      forceFinish,
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
            options.sizePerSlide -
            options.spacing / options.slidesPerView -
            (options.spacing / options.slidesPerView) *
            (options.slidesPerView - 1)
          )

      const [a, b] = options.isVerticalSlider ? [0, pos] : [pos, 0]

      const transformString = `translate3d(${a}px, ${b}px, 0)`
      // these writes should be in a request animation frame
      // they might be depending on who is moving
      // if it is by drag they are not in an animation frame, if it is by animation they are
      // so we need some form of construct to handle this
      slide.style.transform = transformString
      slide.style['-webkit-transform'] = transformString
    })
  }

  function slidesSetWidthsOrHeights() {
    const prop = options.isVerticalSlider ? 'height' : 'width'
    options.slides.forEach(slide => {
      // TODO: we don't need to calculate the size of a slide when it is already known, that would allow slides of a different size
      // hmm, it seems this is not really how it currently works. The number of slides, slidesPerView and container size determines this
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

  function trackAdd(delta, { isDrag, timestamp = Date.now() }) {
    trackSpeedAndDirection.measure(delta, timestamp)
    track.move(delta, { isDrag })
  }

  function trackGetDetails() {
    const trackProgressAbs = Math.abs(track.progress)
    const progress = track.position < 0 ? 1 - trackProgressAbs : trackProgressAbs
    return {
      direction: trackSpeedAndDirection.direction,
      progressTrack: progress,
      progressSlides: (progress * options.numberOfSlides) / (options.numberOfSlides - 1), // what if length is 1? devision by 0
      positions: track.slidePositions,
      position: track.position,
      speed: trackSpeedAndDirection.speed,
      relativeSlide: options.ensureIndexInBounds(track.currentIdx),
      absoluteSlide: track.currentIdx,
      size: options.numberOfSlides,
      slidesPerView: options.slidesPerView,
      widthOrHeight: options.widthOrHeight,
    }
  }

  function trackGetIdxDistance(idx) {
    return -(-(options.sizePerSlide * idx) + track.position)
  }

  // The logic in this function does not seem quite right, it seems to wrongly decide between
  // left and right by comparing (the normalized) idx to the current position
  function trackGetRelativeIdx(idx, nearest) {
    const relativeIdx = options.ensureIndexInBounds(idx) // here we lose the direction
    const current = options.ensureIndexInBounds(track.currentIdx)
    const left = current < relativeIdx
      ? -current - options.numberOfSlides + relativeIdx
      : -(current - relativeIdx)
    const right = current > relativeIdx
      ? options.numberOfSlides - current + relativeIdx
      : relativeIdx - current
    const add = (
      nearest ? (Math.abs(left) <= right ? left : right) :
      relativeIdx < current ? left :  right // here we decide left or right based on the abs value of the relative index
    )
    return track.currentIdx + add
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
  *  isTouchable: boolean,
  *  isLoop: boolean,
  *  isRubberband: boolean,
  *  isVerticalSlider: boolean,
  *  isRtl: boolean,
  *  initialIndex: number,
  *  preventEventAttributeName: string,
  *  cancelOnLeave: boolean,
  *  dragEndMovement: () => void,
  *  duration: number,
  *  friction: number,
  *  trackLength: number,
  *  updateSlidesAndNumberOfSlides(): void,
  *  slides: Array<HTMLElement> | null,
  *  numberOfSlides: number,
  *  touchMultiplicator: (val: number) => number,
  *  updateSlidesPerView(): void,
  *  slidesPerView: number,
  *  spacing: number,
  *  measureContainer(): void,
  *  widthOrHeight: number,
  *  spacing: number,
  *  origin: number,
  *  clampIndex(idx: number): number,
  *  isIndexOutOfBounds(idx: number): boolean,
  *  ensureIndexInBounds(idx: number): number,
  *  sizePerSlide: number,
  *  maxPosition: number,
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
    get isTouchable() {
      return !!options.controls
    },
    get isLoop() {
      return !!options.loop
    },
    get isRubberband() {
      return !options.loop && options.rubberband
    },
    get isVerticalSlider() {
      return !!options.vertical
    },
    get isRtl() {
      return options.rtl
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
    get trackLength() {
      return (
        dynamicOptions.widthOrHeight * (
          numberOfSlides - 1 /* <- check if we need parentheses here */ * (options.centered ? 1 : slidesPerView)
        )
      ) / slidesPerView
    },
    get touchMultiplicator() {
      const { dragSpeed } = options
      const multiplicator = typeof dragSpeed === 'function' ? dragSpeed : val => val * dragSpeed
      return val =>
        // @ts-ignore - we need to change the the types, we wrap the `dragSpeed` function so it does not require an instance anymore at this point
        multiplicator(val) *
        (!options.rtl ? 1 : -1)
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
        ? (widthOrHeight / 2 - dynamicOptions.sizePerSlide / 2) / widthOrHeight
        : 0
    },
    clampIndex(idx) {
      return options.loop
        ? idx
        : clampValue(idx, 0, numberOfSlides - 1 - (options.centered ? 0 : slidesPerView - 1))
    },
    isIndexOutOfBounds(idx) {
      return !options.loop && (idx < 0 || idx > numberOfSlides - 1)
    },
    ensureIndexInBounds(idx) {
      return ((idx % numberOfSlides) + numberOfSlides) % numberOfSlides
    },
    get sizePerSlide() {
      return dynamicOptions.widthOrHeight / slidesPerView
    },
    get maxPosition() {
      // what is the difference between maxPosition and trackLength?
      return (dynamicOptions.widthOrHeight * numberOfSlides) / slidesPerView
    },
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
    if (direction !== trackDirection) trackMeasurePoints = []

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
  let clientTouchPoints

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

    const [touch] = e.targetTouches || []
    if (touch) clientTouchPoints = ClientTouchPoints(options, touch)

    onDragStart(e)
  }

  function eventDrag(e) {
    if (!isDragging || touchIdentifier !== eventGetIdentifier(e.targetTouches)) return
    if (dragJustStarted && !eventIsSlideMovement(e)) {
      eventDragStop(e)
      return
    }
    if (e.cancelable) e.preventDefault()

    const xOrY = eventGetXOrY(e)
    const distance = dragJustStarted ? 0 : touchLastXOrY - xOrY
    if (dragJustStarted) {
      onFirstDrag(e)
      dragJustStarted = false
    }
    onDrag(e, { distance })

    touchLastXOrY = xOrY
  }

  function eventDragStop(e) {
    if (!isDragging || touchIdentifier !== eventGetIdentifier(e.changedTouches)) return
    isDragging = false

    // should we clear clientTouchPoints?

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

  function eventIsSlideMovement(e) {
    const [touch] = e.targetTouches || []
    if (!touch) return true
    if (!clientTouchPoints) return false

    const { current: [a, b], previous: [previousA, previousB] } = clientTouchPoints.fromTouch(touch)
    const isSlide = Math.abs(previousB - b) <= Math.abs(previousA - a)

    return isSlide
  }
}

function Animation() {
  // I don't think this is the right way, maybe a `stop` method might be better
  //   we need this for the current implementation, but we might eventually find a better way that
  //   does not need this kind of construct at all. It's now used because we have certain positional
  //   conditions that require the animation to be canceled mid-way. See `moveTo` for details.
  // It's choosing (conceptually) between canceling an async request and stopping an iteration by returning a specific value
  const stopSignal = Symbol('stop')

  let reqId
  let startTime
  let inAnimationFrame = false

  return {
    move,
    cancel,
  }

  function move({
    distance,
    duration,
    easing,
    // TODO: make sure there is no DOM reading here (also check option calls)
    onMove,
    onMoveComplete = undefined,
  }) {
    cancelAnimationFrame()
    requestAnimationFrame({ distance, moved: 0, duration, easing, onMove, onMoveComplete })
  }

  function cancel() {
    // depending on the requirements this might change later on
    if (inAnimationFrame) throw new Error(`Currently can not cancel from within 'onMove' or 'onMoveComplete'`)
    cancelAnimationFrame()
  }

  function cancelAnimationFrame() {
    if (reqId) {
      window.cancelAnimationFrame(reqId)
      reqId = null
    }
    startTime = null
  }

  function requestAnimationFrame(moveData) {
    reqId = window.requestAnimationFrame(timestamp => moveAnimateUpdate(timestamp, moveData))
  }

  function moveAnimateUpdate(timestamp, moveData) {
    inAnimationFrame = true

    const { distance, moved, duration, easing, onMove, onMoveComplete } = moveData
    if (!startTime) startTime = timestamp
    const elapsedTime = timestamp - startTime
    if (elapsedTime >= duration) {
      if (onMoveComplete) onMoveComplete({ moved })
    } else {
      const delta = distance * easing(elapsedTime / duration) - moved
      const result = onMove({ delta, stop: stopSignal })
      if (result !== stopSignal) requestAnimationFrame({ ...moveData, moved: moved + delta })
    }

    inAnimationFrame = false
  }
}

/**
 * @param {{
 *  options: ReturnType<Options>,
 *  onIndexChanged: (newIndex: number) => void,
 *  onMove: (slidePositions: Array<{ portion: number, distance: number }>) => void
 * }} params
 */
function Track({ options, onIndexChanged, onMove }) {
  const {
    initialIndex,
    isLoop, isRubberband, isRtl,
    origin,
    sizePerSlide,
    widthOrHeight, slidesPerView,
    trackLength, maxPosition,
    isIndexOutOfBounds, numberOfSlides
  } = options

  let currentIdx = initialIndex
  let position = 0
  let slidePositions
  let progress

  return {
    move,
    calculateOutOfBoundsOffset,
    get currentIdx() { return currentIdx },
    get position() { return position },
    get slidePositions() { return slidePositions },
    get progress() { return progress },
  }

  function move(delta, { isDrag }) {
    position += isDrag && !isLoop ? adjustDragMovement(delta) : delta

    const new_idx = calculateIndex(position)
    if (new_idx !== currentIdx && !isIndexOutOfBounds(new_idx)) {
      currentIdx = new_idx
      onIndexChanged(new_idx)
    }

    progress = calculateTrackProgress(position)
    slidePositions = calculateSlidePositions(progress)

    onMove(slidePositions)
  }

  function adjustDragMovement(delta) {
    const offset = calculateOutOfBoundsOffset(delta)

    return (
      offset === 0 ? delta :
      isRubberband ? rubberband(delta) :
      delta - offset
    )

    function rubberband(delta) {
      return delta * easingQuadLike(Math.abs(offset / widthOrHeight))
      function easingQuadLike(t) { return (1 - t) * (1 - t) }
    }
  }

  function calculateOutOfBoundsOffset(delta) {
    const newPosition = position + delta

    return (
      newPosition > trackLength ? newPosition - trackLength :
      newPosition < 0           ? newPosition :
      0
    )
  }

  function calculateTrackProgress(position) {
    return isLoop
      ? (position % maxPosition) / maxPosition
      : position / maxPosition
  }

  function calculateIndex(position) {
    return Math.round(position / sizePerSlide)
  }

  function calculateSlidePositions(progress) {
    // todo - option for not calculating slides that are not in sight
    const slidePositions = []

    const normalizedrogress = progress < 0 && isLoop ? progress + 1 : progress
    for (let idx = 0; idx < numberOfSlides; idx++) {
      let distance =
        (((1 / numberOfSlides) * idx - normalizedrogress) * numberOfSlides) /
          slidesPerView +
          origin

      if (isLoop)
        distance +=
          distance > (numberOfSlides - 1) / slidesPerView  ? -(numberOfSlides / slidesPerView) :
          distance < -(numberOfSlides / slidesPerView) + 1 ? numberOfSlides / slidesPerView :
          0

      const slideFactor = 1 / slidesPerView
      const left = distance + slideFactor
      const portion = (
        left < slideFactor ? left / slideFactor :
        left > 1           ? 1 - ((left - 1) * slidesPerView) / 1 :
        1
      )
      slidePositions.push({
        portion: portion < 0 || portion > 1 ? 0 : portion,
        distance: !isRtl ? distance : distance * -1 + 1 - slideFactor
      })
    }
    return slidePositions
  }
}

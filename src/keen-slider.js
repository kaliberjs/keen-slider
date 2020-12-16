import './polyfills'
import KeenSliderType, { TOptionsEvents, TOptions, TEvents, TContainer } from '../index'
import { TranslatedOptionsType, StrategyType, BaseOptionType } from './internal'

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
const attributeDragging = 'data-keen-slider-moves'
const attributeVertical = 'data-keen-slider-v'

/*
  This construct is here to make sure we think about the context when writing to the DOM.

  The general rule is:
  - do not read from the DOM inside of an animation frame
  - do not write to the DOM outside of an animation frame

  The reason for this is that reads from the DOM could cause a trigger of expensive layout
  calculations. This is because the browser will ensure that the values you read are actually
  correct. The expensive calculation will only be triggered if the related values are actually
  changed since the last paint.

  So to ensure we never have this problem, we ensure the writes (changing values) to be in the
  part of the frame that is executed right before the layout / paint. Reads should never be done
  from inside of an animation frame; you never know what other animation frames have been requested
  and have performed writes already.

  This shows the effect of calling `requestAnimationFrame` at different positions:

  | non animation frame | animation frame | layout / paint | non animation frame | animation frame |
  |         1->         |    ->1 2->      | -------------- |                     |       ->2       |

  Calling `requestAnimationFrame` from a non animation frame causes the code to be executed in the
  same frame, but at the end of the frame, right before layout / paint.
  Calling `requestAnimationFrame` from an animation frame casues the code the be executed at the
  end of the next frame.
*/
const writeToDOM = {
  fromAnimationFrame(f) { f() },
  fromNonAnimationFrame(f) { window.requestAnimationFrame(f) }
}

/** @param {TContainer} initialContainer
 *  @param {TOptionsEvents} initialOptions
 *  @returns {KeenSliderType} */
export default function PublicKeenSlider(initialContainer, initialOptions = {}) {
  const { eventAdd, eventsRemove } = EventBookKeeper()

  let resizeLastWidth = null
  let breakpointBasedOptions = BreakpointBasedOptions(initialOptions)

  const publicApi = {
    destroy() {
      sliderDestroy()
    },
    resize() {
      sliderResize(true)
    },
    controls: active => { // not sure if this is a valuable API
      breakpointBasedOptions = breakpointBasedOptions.update({ controls: active })
      sliderReplaceKeepIndex(breakpointBasedOptions.options)
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

  return publicApi

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

  function sliderCreate(options) {
    const [container] = getElements(initialContainer, document)
    const translatedOptions = translateOptions(options, container)
    slider.current = KeenSlider(container, translatedOptions, fireEvent)
    slider.current.mount()
  }

  // this breaks some of the backwards compatibility because it triggers a lot more mounts and unmounts
  // than in the previous version
  function sliderReplace(options) {
    slider.current.destroy()
    sliderCreate(options)
  }

  function sliderReplaceKeepIndex(options) {
    const newOptions = {
      ...options,
      initial: slider.current.details().absoluteSlide
    }
    sliderReplace(newOptions)
  }

  /** @param {TOptions} options
   *  @returns {TranslatedOptionsType} */
  function translateOptions({ dragSpeed, ...options }, container) {
    const touchMultiplicator         = getTouchMultiplicator()
    const { slides, numberOfSlides } = getSlidesAndNumberOfSlides()
    const slidesPerView              = getSlidesPerView(numberOfSlides)
    const {
      containerSize, widthOrHeight,
    } = getContainerBasedOptions(container, slidesPerView)

    // Note to self, determine how these options are used.
    // It's a bit vague, but it might be possible to add the concept of 'behavior' and have
    // different options result in different behaviors. An example would be having settings
    // based on num slides and container size vs measured slide size and container size
    const baseOptions = {
      isLoop:                    !!options.loop,
      isRubberband:              !options.loop && options.rubberband,
      isVerticalSlider:          !!options.vertical,
      isRtl:                     options.rtl,
      isCentered:                options.centered,
    }
    const strategy = StrategyX(baseOptions, {
      spacing: options.spacing,
      numberOfSlides,
      slidesPerView,
      widthOrHeight,
    })
    const translatedOptions = {
      ...baseOptions,
      initialIndex:              options.initial,
      enableDragControls:        !!options.controls,
      cancelOnLeave:             options.cancelOnLeave,
      preventEventAttributeName: options.preventEvent,
      duration:                  options.duration,
      friction:                  options.friction,
      dragEndMove:               options.mode,

      touchMultiplicator, slides, numberOfSlides, containerSize,
      widthOrHeight, strategy,

      isIndexOutOfBounds(idx) {
        return !options.loop && (idx < 0 || idx > numberOfSlides - 1)
      },
      ensureIndexInBounds(idx) {
        return ((idx % numberOfSlides) + numberOfSlides) % numberOfSlides
      },
    }
    return translatedOptions

    function getTouchMultiplicator() {
      const dragSpeedMultiplicator = typeof dragSpeed === 'function'
        ? val => dragSpeed(val, publicApi)
        : val => val * dragSpeed

      return val => dragSpeedMultiplicator(val) * (!options.rtl ? 1 : -1)
    }

    function getSlidesAndNumberOfSlides() { // side effects should be removed in a later stage
      if (typeof options.slides === 'number')
        return { slides: null, numberOfSlides: options.slides }
      else {
        const slides = getElements(options.slides, container)
        return { slides, numberOfSlides: slides ? slides.length : 0 }
      }
    }

    /*
      We could have the functions below without arguments, this however would be very fragile
      because it would hide the fact that they depend on each other. Giving them arguments
      ensures the correct order.
    */

    function getSlidesPerView(numberOfSlides) {
      const option = options.slidesPerView
      return typeof option === 'function'
        ? option()
        : clampValue(option, 1, Math.max(options.loop ? numberOfSlides - 1 : numberOfSlides, 1))
    }

    function getContainerBasedOptions(container, slidesPerView) {
      const containerSize   = options.vertical ? container.offsetHeight : container.offsetWidth
      const spacing         = clampValue(options.spacing, 0, containerSize / (slidesPerView - 1) - 1)
      const widthOrHeight   = containerSize + spacing

      return { containerSize, widthOrHeight }
    }
  }

  /** @param {keyof TEvents} event */
  function fireEvent(event) {
    const { options } = breakpointBasedOptions
    if (options[event]) options[event](publicApi)
  }

  function sliderResize(force = false) {
     // checking if a breakpoint matches should not be done on resize, but as a listener to matchMedia
     // once this switch to matchMedia('...').addListener is complete, you can move functionality out
     // of this function and the resize function can live inside the slider
    if (breakpointBasedOptions.refresh().optionsChanged) {
      const { options } = breakpointBasedOptions
      if (options.resetSlide) sliderReplace(options)
      else sliderReplaceKeepIndex(options)
    } else {
      const windowWidth = window.innerWidth
      if (!force && windowWidth === resizeLastWidth) return
      resizeLastWidth = windowWidth

      // It feels a bit weird to do this, while it is similar to the original behavior, we should
      // probably (in the final version) make this controllable. The question is: when will those
      // dynamic options need to be refreshed?
      //
      // In some cases the options don't change and in other cases there aren't any dynamic options
      //
      // Anyway, we'll revisit this later
      sliderReplaceKeepIndex(breakpointBasedOptions.options)
      slider.current.resize()
    }
  }
}

/** @param {BaseOptionType} options
 *  @returns {StrategyType} */
function StrategyX(options, { spacing, slidesPerView, widthOrHeight, numberOfSlides }) {
  const {
    isLoop, isRtl, isCentered,
  } = options

  // only used for positioning and sizing
  const spacingPerSlide = spacing / slidesPerView
  const visibleSpacing  = spacingPerSlide * (slidesPerView - 1)
  const sizePerSlide    = widthOrHeight / slidesPerView
  // only used to calculate slide positions
  const origin          = isCentered
    ? (widthOrHeight / 2 - sizePerSlide / 2) / widthOrHeight
    : 0
  // what is the difference between maxPosition and trackLength? They should be related
  const maxPosition     = (widthOrHeight * numberOfSlides) / slidesPerView
  const trackLength     = (
    widthOrHeight * (
      numberOfSlides - 1 /* <- check if we need parentheses here */ * (isCentered ? 1 : slidesPerView)
    )
  ) / slidesPerView

  return {
    maxPosition,
    trackLength,
    calculateIndexPosition,
    calculateSlidePositions,
    calculateIndex,
    calculateIndexTrend,
    getDetails,
    getSizeStyle,
    getSlidePosition,
  }

  // hmmm, this has to move out. It's greatly tied to the way slides are represented.
  // This library provides great freedom in how slides are represented, the different types of
  // slides require different approaches:
  // - number of slides requires people to use the 'details' to position stuff themselves
  // - slides from html elements uses this method. And here we could imagine a different approach
  //   using slides that have different sizes for example. Instead of giving them a size we could
  //   read their size
  // Anyway, it would be helpful if these 'strategies' could be plugged in
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

  function getDetails() {
    return {
      slidesPerView,
    }
  }

  function calculateIndexTrend(position) {
    return position / sizePerSlide
  }

  function calculateIndex(position) {
    return Math.round(calculateIndexTrend(position))
  }

  function getSizeStyle() {
    return `calc(${100 / slidesPerView}% - ${visibleSpacing}px)`
  }

  function getSlidePosition(idx, { distance }) {
      const absoluteDistance = distance * widthOrHeight
      const pos =
        absoluteDistance -
        idx *
          (sizePerSlide - spacingPerSlide - visibleSpacing)
  }

  function calculateIndexPosition(idx) {
    return sizePerSlide * clampIndex(idx)
  }

  function clampIndex(idx) {
    return isLoop
      ? idx
      : clampValue(idx, 0, numberOfSlides - 1 - (isCentered ? 0 : slidesPerView - 1))
  }
}

/**
 * @param {HTMLElement} container
 * @param {TranslatedOptionsType} options
 * @param {(event: keyof TEvents) => void} fireEvent
 */
function KeenSlider(container, options, fireEvent) {
  /*
    Thinking out loud (talking to myself)

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

  const slideManipulation = SlideManipulation({ options })
  const { readOnly: track, ...trackManipulation } = Track({
    options,
    onIndexChanged() {
      fireEvent('slideChanged')
    },
    onMove({ slidePositions, currentlyInAnimationFrame }) {
      if (options.slides) {
        const context = currentlyInAnimationFrame ? 'fromAnimationFrame' : 'fromNonAnimationFrame'
        writeToDOM[context](() => slideManipulation.setPositions(slidePositions))
      }
      fireEvent('move')
    }
  })
  const animatedMovement = AnimatedMovement({
    options, track,
    onMovement(distance) {
      measureAndMove(distance, { isDrag: false, currentlyInAnimationFrame: true })
    },
    onMovementComplete() {
      fireEvent('afterChange')
    }
  })
  const dragHandling = options.enableDragControls && DragHandling({
    container, options, track,
    onDragStart({ timeStamp }) {
      animatedMovement.cancel()
      trackManipulation.measureSpeedAndDirection(0, timeStamp)
      fireEvent('dragStart')
    },
    onFirstDrag() {
      trackManipulation.resetSpeedAndDirectionTracking()
      writeToDOM.fromNonAnimationFrame(() => container.setAttribute(attributeDragging, 'true')) // note: not sure if this is backwards compatible, I changed it from true to 'true', but I don't know if browsers do the same behind the scenes
    },
    onDrag({ distance, timeStamp }) {
      measureAndMove(distance, { isDrag: true, timeStamp, currentlyInAnimationFrame: false }) // note: was `drag: e.timeStamp`
    },
    onDragStop({ moveTo: { distance, duration } }) {
      writeToDOM.fromNonAnimationFrame(() => container.removeAttribute(attributeDragging))
      if (distance) {
        fireEvent('beforeChange')
        animatedMovement.moveTo({
          distance,
          duration,
          forceFinish: false
        })
      }

      fireEvent('dragEnd')
    }
  })

  return {
    mount: sliderInit,
    destroy: sliderDestroy,
    resize: sliderResize,

    next() { animatedMovement.moveToIdx(track.currentIdx + 1) },
    prev() { animatedMovement.moveToIdx(track.currentIdx - 1) },

    moveToSlide(idx, duration = options.duration) {
      animatedMovement.moveToIdx(idx, { duration })
    },
    moveToSlideRelative(relativeIdx, nearest = false, duration = options.duration) {
      animatedMovement.moveToIdx(track.getRelativeIdx(relativeIdx, nearest), { duration })
    },

    details() { return track.details },
  }

  function sliderInit() {
    if (!container) return // this should probably throw an error, but there might be a use case, not sure

    if (options.isVerticalSlider)
      writeToDOM.fromNonAnimationFrame(() => container.setAttribute(attributeVertical, 'true'))

    sliderResize()

    if (dragHandling) dragHandling.startListening()

    fireEvent('mounted')
  }

  function sliderDestroy() {
    if (dragHandling) dragHandling.stopListening()

    writeToDOM.fromNonAnimationFrame(() => {
      if (options.slides) slideManipulation.removeStyles()
      if (container && container.hasAttribute(attributeVertical))
        container.removeAttribute(attributeVertical)
    })
  }

  function sliderResize() {
    if (options.slides) writeToDOM.fromNonAnimationFrame(slideManipulation.setWidthsOrHeights)

    fireEvent('beforeChange')
    measureAndMove(track.currentIndexDistance, { isDrag: false, currentlyInAnimationFrame: false })
    fireEvent('afterChange')
  }

  function measureAndMove(delta, { isDrag, timeStamp = Date.now(), currentlyInAnimationFrame }) {
    trackManipulation.measureSpeedAndDirection(delta, timeStamp)
    trackManipulation.move(delta, { isDrag, currentlyInAnimationFrame })
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

/**
 * @param {object} _
 * @param {TranslatedOptionsType} _.options */
function SlideManipulation({ options }) {
  const { strategy } = options
  const slides = options.slides || []

  return {
    setPositions,
    setWidthsOrHeights,
    removeStyles,
  }

  function setPositions(slidePositions) {
    slides.forEach((slide, idx) => {
      const pos = strategy.getSlidePosition(idx, slidePositions[idx])
      const [a, b] = options.isVerticalSlider ? [0, pos] : [pos, 0]

      const transformString = `translate3d(${a}px, ${b}px, 0)`
      slide.style.transform = transformString
      slide.style['-webkit-transform'] = transformString
    })
  }

  function setWidthsOrHeights() {
    const prop = options.isVerticalSlider ? 'height' : 'width'
    slides.forEach(slide => {
      // TODO: we don't need to calculate the size of a slide when it is already known, that would allow slides of a different size
      // hmm, it seems this is not really how it currently works. The number of slides, slidesPerView and container size determines this
      const style = strategy.getSizeStyle()
      slide.style[`min-${prop}`] = style
      slide.style[`max-${prop}`] = style
    })
  }

  function removeStyles() {
    const prop = options.isVerticalSlider ? 'height' : 'width'
    const styles = ['transform', '-webkit-transform', `min-${prop}`, `max-${prop}`]
    slides.forEach(slide => {
      styles.forEach(style => {
        slide.style.removeProperty(style)
      })
    })
  }
}

/**
 * @param {{
 *  options: TranslatedOptionsType,
 *  onIndexChanged(newIndex: number): void,
 *  onMove(_: {
 *    slidePositions: Array<{ portion: number, distance: number }>,
 *    currentlyInAnimationFrame: boolean,
 *  }): void
 * }} params
 */
function Track({ options, onIndexChanged, onMove }) {
  const {
    initialIndex,
    isLoop, isRubberband, isRtl, isCentered,
    widthOrHeight,
    isIndexOutOfBounds, numberOfSlides,
    ensureIndexInBounds,
    strategy,
  } = options
  const speedAndDirectionTracking = SpeedAndDirectionTracking()
  let currentIdx = initialIndex
  let position = 0
  let slidePositions
  let progress
  return {
    move,
    measureSpeedAndDirection:       speedAndDirectionTracking.measure,
    resetSpeedAndDirectionTracking: speedAndDirectionTracking.reset,
    get readOnly() {
      return {
        calculateOutOfBoundsOffset,
        calculateIndexDistance,
        getRelativeIdx,
        get currentIndexDistance() { return calculateIndexDistance(currentIdx) },
        get currentIdx()     { return currentIdx },
        get position()       { return position },
        get slidePositions() { return slidePositions },
        get progress()       { return progress },
        get speed()     { return speedAndDirectionTracking.speed },
        get direction() { return speedAndDirectionTracking.direction },
        get details() { return getDetails() },
      }
    }
  }
  function move(delta, { isDrag, currentlyInAnimationFrame }) {
    position += isDrag && !isLoop ? adjustDragMovement(delta) : delta
    const newIndex = strategy.calculateIndex(position)
    if (newIndex !== currentIdx && !isIndexOutOfBounds(newIndex)) {
      currentIdx = newIndex
      onIndexChanged(newIndex)
    }
    progress = calculateTrackProgress(position)
    slidePositions = strategy.calculateSlidePositions(progress)
    onMove({ slidePositions, currentlyInAnimationFrame })
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
      newPosition > strategy.trackLength ? newPosition - strategy.trackLength :
      newPosition < 0           ? newPosition :
      0
    )
  }
  function calculateIndexDistance(idx) {
    return -(-strategy.calculateIndexPosition(idx) + position)
  }
  function calculateTrackProgress(position) {
    return isLoop
      ? (position % strategy.maxPosition) / strategy.maxPosition
      : position / strategy.maxPosition
  }
  /** @returns {import('..').TDetails} */
  function getDetails() {
    const trackProgressAbs = Math.abs(progress)
    const normalizedProgress = position < 0 ? 1 - trackProgressAbs : trackProgressAbs
    // note to self: check these properties, you broke backwards compatibility (for example widthOrHeight)
    const { slidesPerView } = strategy.getDetails()
    return {
      direction:      speedAndDirectionTracking.direction,
      progressTrack:  normalizedProgress,
      progressSlides: (normalizedProgress * numberOfSlides) / (numberOfSlides - 1), // what if length is 1? devision by 0
      positions:      slidePositions,
      position,
      speed:          speedAndDirectionTracking.speed,
      relativeSlide:  ensureIndexInBounds(currentIdx),
      absoluteSlide:  currentIdx,
      size:           numberOfSlides,
      widthOrHeight,
      slidesPerView,
    }
  }
  // The logic in this function does not seem quite right, it seems to wrongly decide between
  // left and right by comparing (the normalized) idx to the current position
  function getRelativeIdx(idx, nearest) {
    const relativeIdx = options.ensureIndexInBounds(idx) // here we lose the direction
    const current = options.ensureIndexInBounds(currentIdx)
    const left = current < relativeIdx
      ? -current - options.numberOfSlides + relativeIdx
      : -(current - relativeIdx)
    const right = current > relativeIdx
      ? options.numberOfSlides - current + relativeIdx
      : relativeIdx - current
    const add = (
      nearest ? (Math.abs(left) <= right ? left : right) :
      relativeIdx < current ? left : right // here we decide left or right based on the abs value of the relative index
    )
    return currentIdx + add
  }
}

/**
 * @param {{
 *   options: TranslatedOptionsType,
 *   track: ReturnType<Track>['readOnly'],
 *   onMovementComplete(): void,
 *   onMovement(distance: number): void,
 * }} params
 */
function AnimatedMovement({ options, track, onMovementComplete, onMovement }) {
  const animation = Animation()

  return {
    moveTo,
    moveToIdx,
    cancel: animation.cancel,
  }

  function moveTo({
    distance, duration,
    easing = function easeOutQuint(t) { return 1 + --t * t * t * t * t },
    forceFinish, onMoveComplete = undefined
  }) {
    animation.move({ distance, duration, easing,
      onMoveComplete: ({ moved }) => {
        onMovement(distance - moved)
        if (onMoveComplete) return onMoveComplete()
        onMovementComplete()
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
            onMovement(delta - offset)
            return stop
          }

          if (options.isRubberband) {
            if (track.speed === 0) moveToIdx(track.currentIdx)
            else moveRubberband(track.speed)

            return stop
          }
        }

        onMovement(delta)
      }
    })
  }

  function moveRubberband(speed) {
    // todo: refactor! working on it
    const friction = 0.04 / Math.pow(Math.abs(speed), -0.5)
    const distance = (Math.pow(speed, 2) / friction) * Math.sign(speed)

    const easing = function cubicOut(t) { return --t * t * t + 1 }

    moveTo({
      distance,
      duration: Math.abs(speed / friction) * 3,
      easing,
      forceFinish: true,
      onMoveComplete() {
        moveTo({
          distance: track.currentIndexDistance,
          duration: 500,
          easing,
          forceFinish: true,
        })
      }
    })
  }

  function moveToIdx(idx, { duration = options.duration } = {}) {
    // forceFinish is used to ignore boundaries when rubberband movement is active
    moveTo({ distance: track.calculateIndexDistance(idx), duration, forceFinish: true })
  }
}

/**
 * @param {{
 *   container: any,
 *   options: TranslatedOptionsType,
 *   track: ReturnType<Track>['readOnly'],
 *   onDragStart(_: { timeStamp: number }): void,
 *   onFirstDrag(_: { timeStamp: number }): void,
 *   onDrag(_: { distance: number, timeStamp: number }): void,
 *   onDragStop(_: { moveTo: { distance: number, duration: number } }): void,
 * }} params
 */
function DragHandling({
  container, options, track,
  onDragStart, onFirstDrag, onDrag, onDragStop,
}) {
  let touchIndexStart

  const dragEndMoves = {
    'free':      moveFree,
    'free-snap': moveSnapFree,
    'snap':      moveSnapOne,
    'default':   moveSnapOne,
  }

  const touchHandling = TouchHandling(container, options, {
    onDragStart({ timeStamp }) {
      touchIndexStart = track.currentIdx
      onDragStart({ timeStamp })
    },
    onFirstDrag,
    onDrag({ distance, timeStamp }) {
      onDrag({ distance: options.touchMultiplicator(distance), timeStamp })
    },
    onDragStop: handleDragStop,
  })

  return {
    startListening: touchHandling.startListening,
    stopListening : touchHandling.stopListening,
  }

  function handleDragStop() {
    const dragEndMove = dragEndMoves[options.dragEndMove] || dragEndMoves.default

    const { distance = 0, duration = options.duration } = dragEndMove()
    onDragStop({ moveTo: { distance, duration } })
  }

  function moveSnapOne() {
    const direction = track.direction
    // TODO: this is currently broken, slidesPerView is a strategy, figuring out the meaning requires more thought
    const startIndex = options.slidesPerView === 1 && direction !== 0
        ? touchIndexStart
        : track.currentIdx
    return { distance: track.calculateIndexDistance(startIndex + direction) }
  }

  function moveFree() {
    // todo: refactor! working on it
    const speed = track.speed
    if (speed === 0) {
      const isOutOfBounds = track.calculateOutOfBoundsOffset(0) !== 0
      return isOutOfBounds && !options.isLoop
        ? { distance: track.currentIndexDistance }
        : { distance: 0 }
    }

    const friction = options.friction / Math.pow(Math.abs(speed), -0.5)
    return {
      distance: (Math.pow(speed, 2) / friction) * Math.sign(speed),
      duration: Math.abs(speed / friction) * 6,
    }
  }

  function moveSnapFree() {
    if (track.speed === 0) return { distance: track.currentIndexDistance }

    const friction = options.friction / Math.pow(Math.abs(track.speed), -0.5)
    const distance = (Math.pow(track.speed, 2) / friction) * Math.sign(track.speed)
    const idxTrend = options.strategy.calculateIndexTrend(track.position + distance)
    const idx      = track.direction === -1 ? Math.floor(idxTrend) : Math.ceil(idxTrend)
    return {
      distance: options.strategy.calculateIndexPosition(idx) - track.position,
      duration: Math.abs(track.speed / friction) * 6,
    }
  }
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function EventBookKeeper() {
  let events = []

  return {
    eventAdd(element, event, handler, options = {}) {
      element.addEventListener(event, handler, options)
      events.push([element, event, handler, options])
    },
    eventsRemove() {
      events.forEach(event => {
        event[0].removeEventListener(event[1], event[2], event[3])
      })
      events = []
    }
  }
}

/** @param {TOptionsEvents} initialOptions */
function BreakpointBasedOptions(initialOptions) {
  let currentBreakpoint = null
  let options = determineOptions(initialOptions)

  return {
    get options() { return options },
    refresh() {
      const previousOptions = options;
      options = determineOptions(initialOptions, options)
      return { optionsChanged: previousOptions !== options }
    },
    update(newOptions) {
      return BreakpointBasedOptions({ ...initialOptions, ...newOptions })
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

function SpeedAndDirectionTracking() {

  let measurePoints = []
  let direction
  let measureTimeout
  let speed

  return {
    measure,
    reset,
    get speed()     { return speed },
    get direction() { return direction },
  }

  function measure(val, timeStamp) {
    // todo - improve measurement - it could be better for ios
    clearTimeout(measureTimeout)

    const newDirection = Math.sign(val)
    if (direction !== newDirection) {
      measurePoints = []
      direction = newDirection
    }

    measurePoints.push({
      distance: val,
      time: timeStamp,
    })
    measurePoints = measurePoints.slice(-6)

    measureTimeout = setTimeout(
      () => {
        measurePoints = []
        speed = 0
      },
      50
    )

    speed = (measurePoints.length <= 1 || direction === 0) ? 0 : determineSpeed(measurePoints)
  }

  function reset() {
    measurePoints = []
    // should we reset the speed and direction as well?
  }

  function determineSpeed(measurePoints) {
    const distance = measurePoints
      .slice(0, -1)
      .reduce((acc, next) => acc + next.distance, 0)
    const end = measurePoints[measurePoints.length - 1].time
    const start = measurePoints[0].time
    return clampValue(distance / (end - start), -10, 10)
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
  let currentlyInAnimationFrame = false

  return { move, cancel }

  function move({ distance, duration, easing, onMove, onMoveComplete = undefined }) {
    cancelAnimationFrame()
    requestAnimationFrame({ distance, moved: 0, duration, easing, onMove, onMoveComplete })
  }

  function cancel() {
    // depending on the requirements this might change later on
    if (currentlyInAnimationFrame) throw new Error(`Currently can not cancel from within 'onMove' or 'onMoveComplete'`)
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
    reqId = window.requestAnimationFrame(timeStamp => moveAnimateUpdate(timeStamp, moveData))
  }

  function moveAnimateUpdate(timeStamp, moveData) {
    currentlyInAnimationFrame = true

    const { distance, moved, duration, easing, onMove, onMoveComplete } = moveData
    if (!startTime) startTime = timeStamp
    const elapsedTime = timeStamp - startTime
    if (elapsedTime >= duration) {
      if (onMoveComplete) onMoveComplete({ moved })
    } else {
      const delta = distance * easing(elapsedTime / duration) - moved
      const result = onMove({ delta, stop: stopSignal })
      if (result !== stopSignal) requestAnimationFrame({ ...moveData, moved: moved + delta })
    }

    currentlyInAnimationFrame = false
  }
}

function TouchHandling(container, options, {
  onDragStart,
  onFirstDrag,
  onDrag,
  onDragStop,
}) {
  const { eventAdd, eventsRemove } = EventBookKeeper()

  let isDragging      = false
  let dragJustStarted = false
  let touchIdentifier = null
  let touchLastXOrY   = 0
  let clientTouchPoints

  return {
    startListening: eventsAdd,
    stopListening : eventsRemove,
  }

  function eventsAdd() {
    eventAdd(container, 'dragstart', e => { e.preventDefault() })
    eventAdd(window   , 'wheel', e => { if (isDragging) e.preventDefault() }, { passive: false })

    eventAdd(container, 'mousedown', eventDragStart)
    eventAdd(container, 'touchstart', eventDragStart, { passive: true })

    eventAdd(options.cancelOnLeave ? container : window, 'mousemove', eventDrag)
    eventAdd(container, 'touchmove', eventDrag, { passive: false })

    if (options.cancelOnLeave) eventAdd(container, 'mouseleave', eventDragStop)
    eventAdd(window   , 'mouseup', eventDragStop)
    eventAdd(container, 'touchend', eventDragStop, { passive: true })
    eventAdd(container, 'touchcancel', eventDragStop, { passive: true })
  }

  function eventDragStart(e) {
    if (isDragging || eventIsIgnoreTarget(e.target)) return

    isDragging      = true
    dragJustStarted = true
    touchIdentifier = eventGetIdentifier(e.targetTouches)

    const [touch] = e.targetTouches || []
    if (touch) clientTouchPoints = ClientTouchPoints(options, touch)

    onDragStart({ timeStamp: e.timeStamp })
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
      onFirstDrag({ timeStamp: e.timeStamp })
      dragJustStarted = false
    }
    onDrag({ distance, timeStamp: e.timeStamp })

    touchLastXOrY = xOrY
  }

  function eventDragStop(e) {
    if (!isDragging || touchIdentifier !== eventGetIdentifier(e.changedTouches)) return
    isDragging = false

    // should we clear clientTouchPoints?

    onDragStop({ timeStamp: e.timeStamp })
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

function ClientTouchPoints(options, initialTouch) {
  let previous = eventGetClientTouchPoints(initialTouch)

  return {
    fromTouch(touch) {
      const current = eventGetClientTouchPoints(touch)
      const result = { previous, current }
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

/** @param {NodeList} nodeList
 *  @returns {Array<HTMLElement>} */
function convertToArray(nodeList) {
  return Array.prototype.slice.call(nodeList)
}

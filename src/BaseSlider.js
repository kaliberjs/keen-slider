import { AnimatedMovement } from './internals/AnimatedMovement'
import { DragHandling } from './internals/DragHandling'
import { Track } from './internals/Track'

/**
 * @param {HTMLElement} container
 * @param {OptionsType} options
 * @param {<T extends keyof Events>(event: T, info: EventInfo<T>) => void} fireEvent
 * @returns {InternalKeenSliderType}
 */
export function BaseSlider(container, options, fireEvent) {
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

  const { readOnly: track, ...trackManipulation } = Track({
    options,
    onIndexChanged({ newIndex, currentlyInAnimationFrame }) {
      fireEvent('slideChanged', { newIndex, currentlyInAnimationFrame })
    },
    onMove({ progress, currentlyInAnimationFrame }) {
      fireEvent('move', { progress, currentlyInAnimationFrame })
    }
  })
  const animatedMovement = AnimatedMovement({
    options, track,
    onMovement(distance) {
      measureAndMove(distance, { currentlyInAnimationFrame: true })
    },
    onMovementComplete() {
      fireEvent('afterChange', { currentlyInAnimationFrame: true })
    }
  })
  const dragHandling = options.isDragEnabled && DragHandling({
    container, options, track,
    onDragStart({ timeStamp }) {
      animatedMovement.cancel()
      trackManipulation.measureSpeedAndDirection(0, timeStamp) // does this even make sense? Seems we reset it on first drag
      fireEvent('dragStart', { currentlyInAnimationFrame: false })
    },
    onFirstDrag() {
      trackManipulation.resetSpeedAndDirectionTracking()
      fireEvent('firstDrag', { currentlyInAnimationFrame: false })
    },
    onDrag({ distance, timeStamp }) {
      measureAndMove(distance, { timeStamp, currentlyInAnimationFrame: false }) // note: was `drag: e.timeStamp`
    },
    onDragStop({ moveTo: { distance, duration } }) {
      if (distance) {
        fireEvent('beforeChange', { currentlyInAnimationFrame: false })
        animatedMovement.moveTo({
          distance,
          duration,
          forceFinish: false
        })
      }

      fireEvent('dragEnd', { currentlyInAnimationFrame: false })
    }
  })

  return {
    mount: sliderInit,
    unmount: sliderDestroy,
    resize: sliderResize,

    next() { animatedMovement.moveToIdx(track.currentIdx + 1) },
    prev() { animatedMovement.moveToIdx(track.currentIdx - 1) },

    moveToSlide(idx, duration) {
      animatedMovement.moveToIdx(idx, { duration })
    },
    moveToSlideRelative(relativeIdx, nearest = false, duration) {
      animatedMovement.moveToIdx(track.getRelativeIdx(relativeIdx, nearest), { duration })
    },

    get details() { return track.details },
  }

  function sliderInit() {
    if (!container) return // this should probably throw an error, but there might be a use case, not sure

    sliderResize()

    if (dragHandling) dragHandling.startListening()

    fireEvent('mounted', { currentlyInAnimationFrame: false })
  }

  function sliderDestroy() {
    if (dragHandling) dragHandling.stopListening()

    fireEvent('unmounted', { currentlyInAnimationFrame: false })
  }

  function sliderResize() {
    fireEvent('sliderResize', { currentlyInAnimationFrame: false })

    fireEvent('beforeChange', { currentlyInAnimationFrame: false })
    measureAndMove(track.currentIndexDistance, { currentlyInAnimationFrame: false })
    fireEvent('afterChange', { currentlyInAnimationFrame: false })
  }

  function measureAndMove(delta, { timeStamp = Date.now(), currentlyInAnimationFrame }) {
    trackManipulation.measureSpeedAndDirection(delta, timeStamp)
    trackManipulation.move(delta, { currentlyInAnimationFrame })
  }
}

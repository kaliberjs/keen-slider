import { EventBookKeeper } from '../machinery'

/**
 * @param {{
 *   container: any,
 *   options: OptionsType,
 *   track: ReturnType<import('./Track').Track>['readOnly'],
 *   onDragStart(_: { timeStamp: number }): void,
 *   onFirstDrag(_: { timeStamp: number }): void,
 *   onDrag(_: { distance: number, timeStamp: number }): void,
 *   onDragStop(_: { moveTo: { distance: number, duration?: number } }): void,
 * }} params
 */
export function DragHandling({
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
        const adjustedDistance = options.touchMultiplicator(distance)
        const outOfBoundsOffset = track.calculateOutOfBoundsOffset(adjustedDistance)

        const newDistance = !options.isLoop && options.isRubberband
          ? rubberband(adjustedDistance, outOfBoundsOffset)
          : adjustedDistance - outOfBoundsOffset

        onDrag({ distance: newDistance, timeStamp })
      },
      onDragStop() {
        const dragEndMove = dragEndMoves[options.dragEndMove] || dragEndMoves.default

        const { distance = 0, duration } = dragEndMove()
        onDragStop({ moveTo: { distance, duration } })
      },
  })

  return {
    startListening: touchHandling.startListening,
    stopListening : touchHandling.stopListening,
  }

  function rubberband(delta, outOfBoundsOffset) {
    const containerSize = options.isVerticalSlider ? container.offsetHeight : container.offsetWidth
    return delta * easingQuadLike(Math.abs(outOfBoundsOffset / containerSize))
    function easingQuadLike(t) { return (1 - t) * (1 - t) }
  }

  function moveSnapOne() {
    const direction = track.direction
    // TODO: hmm, this below should be refined. If we drag past the start index, stop moving and release, it should snap to
    // the nearest index of the start, the direction could be calculated by the position relative to the starting index
    const startIndex = direction !== 0
        ? touchIndexStart
        : track.currentIdx
    return { distance: track.calculateIndexDistance(startIndex + direction) }
  }

  function moveFree() {
    // TODO: refactor! working on it (Note to self: ask the author what he has in mind)
    const speed = track.speed
    if (speed === 0) {
      const isOutOfBounds = track.calculateOutOfBoundsOffset(0) !== 0
      return isOutOfBounds && !options.isLoop
        ? { distance: track.currentIndexDistance }
        : { distance: 0 }
    }

    const friction = options.defaultFriction / Math.pow(Math.abs(speed), -0.5)
    return {
      distance: (Math.pow(speed, 2) / friction) * Math.sign(speed),
      duration: Math.abs(speed / friction) * 6,
    }
  }

  function moveSnapFree() {
    if (track.speed === 0) return { distance: track.currentIndexDistance }

    const friction = options.defaultFriction / Math.pow(Math.abs(track.speed), -0.5)
    const distance = (Math.pow(track.speed, 2) / friction) * Math.sign(track.speed)
    const idxTrend = options.strategy.calculateIndexTrend(track.position + distance)
    const idx      = track.direction === -1 ? Math.floor(idxTrend) : Math.ceil(idxTrend)
    return {
      distance: options.strategy.calculateIndexPosition(idx) - track.position,
      duration: Math.abs(track.speed / friction) * 6,
    }
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

    eventAdd(options.isDragCancelledOnLeave ? container : window, 'mousemove', eventDrag)
    eventAdd(container, 'touchmove', eventDrag, { passive: false })

    if (options.isDragCancelledOnLeave) eventAdd(container, 'mouseleave', eventDragStop)
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

    // TODO: should we clear clientTouchPoints?

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
    return target.hasAttribute(options.preventTouchAttributeName)
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

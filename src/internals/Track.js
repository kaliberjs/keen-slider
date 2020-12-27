import { clampValue } from '../machinery'

export /**
* @param {{
*  options: TranslatedOptionsType,
*  onIndexChanged({ newIndex: number, currentlyInAnimationFrame: boolean }): void,
*  onMove(_: {
*    slidePositions: Array<{ portion: number, distance: number }>,
*    currentlyInAnimationFrame: boolean,
*  }): void
* }} params
*/
function Track({ options, onIndexChanged, onMove }) {
 const {
   initialIndex,
   isLoop, isRubberband,
   widthOrHeight,
   numberOfSlides,
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
     onIndexChanged({ newIndex, currentlyInAnimationFrame })
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
 /** @returns {TDetails} */
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
   const relativeIdx = ensureIndexInBounds(idx) // here we lose the direction
   const current = ensureIndexInBounds(currentIdx)
   const left = current < relativeIdx
     ? -current - numberOfSlides + relativeIdx
     : -(current - relativeIdx)
   const right = current > relativeIdx
     ? numberOfSlides - current + relativeIdx
     : relativeIdx - current
   const add = (
     nearest ? (Math.abs(left) <= right ? left : right) :
     relativeIdx < current ? left : right // here we decide left or right based on the abs value of the relative index
   )
   return currentIdx + add
 }
 function isIndexOutOfBounds(idx) {
   return !isLoop && (idx < 0 || idx > numberOfSlides - 1)
 }
 function ensureIndexInBounds(idx) {
   return ((idx % numberOfSlides) + numberOfSlides) % numberOfSlides
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

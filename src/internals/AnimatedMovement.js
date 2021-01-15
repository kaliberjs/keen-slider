/**
 * @param {{
  *   options: OptionsType,
  *   track: ReturnType<import('./Track').Track>['readOnly'],
  *   onMovement(distance: number): void,
  * }} params
  */
export function AnimatedMovement({ options, track, onMovement }) {
   const animation = Animation()

   return {
     moveTo,
     moveToIdx,
     cancel: animation.cancel,
   }

   function moveTo({
     distance,
     duration = options.defaultDuration,
     easing = function easeOutQuint(t) { return 1 + --t * t * t * t * t },
     forceFinish,
     onMoveComplete = undefined
   }) {
     animation.move({ distance, duration, easing,
       onMoveComplete: ({ moved }) => {
         onMovement(distance - moved)
         if (onMoveComplete) return onMoveComplete()
       },
       onMove: ({ delta, stop }) => {
         // TODO: The 'stop' variants only occur in certain scenario's, we should eventually find a way
         // figure out which scenario's. That would allow us to run all animations to completion
         // unless they actually need to be canceled.
         //
         // To my naive brain it does not make sense to start an animation and decide midway:
         // "oops, we should actually do something else"
         //
         // See Animation for more related comments
         //
         // A bit more information. From what I gathered, this can only ever happen on the 'drag end'
         // move. See `onDragStop`. At that point we know the distance so we could check if the
         // movement will end 'out of bounds'. So using `calculateOutOfBoundsOffset` we could
         // determine a new easing function that actually does the rubberbanding. This could probably
         // even render `onMoveComplete` useless.
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
     // TODO: refactor! working on it (I should actually ask what 'refactor!' means, what does he have in mind?)
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
           easing,
           forceFinish: true,
         })
       }
     })
   }

   function moveToIdx(idx, { duration = undefined } = {}) {
     // forceFinish is used to ignore boundaries when rubberband movement is active
     moveTo({ distance: track.calculateIndexDistance(idx), duration, forceFinish: true })
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

export function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function mergeEventHandlers(base, ...eventHandlers) {
  return eventHandlers.reduce(
    (result, x) => Object.entries(x).reduce(
      (result, [event, handler]) => result[event]
        ? (...args) => { result[event](...args); handler(...args) }
        : handler,
      result
    ),
    base
  )
}

export function EventBookKeeper() {
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
export const writeToDOM = {
  using({ currentlyInAnimationFrame }, f) {
    const context = currentlyInAnimationFrame ? 'fromAnimationFrame' : 'fromNonAnimationFrame'
    writeToDOM[context](f)
  },
  fromAnimationFrame(f) { f() },
  fromNonAnimationFrame(f) { window.requestAnimationFrame(f) }
}

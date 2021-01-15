/**
 * @param {PublicOptionsType} o
 * @returns {Omit<OptionsType, 'strategy'>}
 */
// TODO This should probably be renamed to: setDefaultValues
 export function translateOptions(o) {
  return {
    initialIndex:   o.initialIndex || 0,
    numberOfSlides: 'slides' in o ? o.slides.length : o.numberOfSlides,
    isLoop:          !!o.loop,

    isRubberband:           !!o.rubberband,
    isVerticalSlider:       !!o.vertical,
    isDragEnabled:          !('dragEnabled' in o) || o.dragEnabled,
    isDragCancelledOnLeave: !!o.cancelDragOnLeave,
    dragEndMove:            o.dragEndMove || 'free',
    touchMultiplicator:     o.touchMultiplicator || (delta => delta),

    defaultDuration: o.defaultDuration || 500,
    defaultFriction: o.defaultFriction || 0.0025,
  }
}

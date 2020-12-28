declare type TranslatedOptionsType = {
  isLoop: boolean
  isRubberband: boolean
  isVerticalSlider: boolean
  isRtl: boolean
  isCentered: boolean

  enableDragging: boolean
  touchMultiplicator(val: number): number
  cancelOnLeave: boolean
  initialIndex: number
  preventEventAttributeName: string
  duration: number
  friction: number
  dragEndMove: 'snap' | 'free-snap' | 'free'
  numberOfSlides: number
  widthOrHeight: number
  strategy: StrategyType
}

declare type StrategyType = {
  maxPosition: number
  trackLength: number
  calculateSlidePositions(progress: number): Array<SlidePositionType>
  calculateIndex(position: number): number
  calculateIndexTrend(position: number): number
  getDetails(): {
    slidesPerView: number
  }
  getSizeStyle(): string
  getSlidePosition(idx: number, slidePosition: SlidePositionType )
  calculateIndexPosition(idx: number): number
}

type SlidePositionType = {
  portion: number
  distance: number
}

declare interface InternalKeenSliderType {
  mount(): void
  unmount(): void
  resize(): void

  next(): void
  prev(): void

  moveToSlide(idx: number, duration?: number): void
  moveToSlideRelative(relativeIdx: number, nearest?: boolean, duration?: number): void

  details(): TDetails
}

declare type EventHandler<T = {}> = (info: { currentlyInAnimationFrame: boolean } & T) => void
declare type Events = {
  afterChange?: EventHandler
  beforeChange?: EventHandler
  dragStart?: EventHandler
  firstDrag?: EventHandler
  dragEnd?: EventHandler
  mounted?: EventHandler
  unmounted?: EventHandler
  move?: EventHandler<{ slidePositions: Array<SlidePositionType> }>
  slideChanged?: EventHandler<{ newIndex: Number }>
  sliderResize?: EventHandler
}
declare type EventInfo<T extends keyof Events> = Parameters<Events[T]>[0]

declare type TDetails = import('../index').TDetails
declare type TOptionsEventsBreakpoints = import('../index').TOptionsEvents
declare type TOptions = import('../index').TOptions
declare type TEvents = import('../index').TEvents
declare type TOptionsEvents = TOptions & TEvents
declare type TBreakpoints = import('../index').TBreakpoints
declare type TContainer = import('../index').TContainer
declare type KeenSlider = import('../index').default

/*
  Don't worry too much about these definitions, they are (strange as it sounds) for my own sanity.
  They help me preventing mistakes that can be caught by the typesystem
*/
declare type Tuple = [unknown] | {}
declare type WaterfallResult<T, S extends Tuple> =
  S extends [(x: T) => infer X, ...(infer Rest)] ? WaterfallResult<X, Rest> :
  S extends [] ? T :
  never
declare type CompositeResult<T, S extends Tuple, U = {}> =
  S extends [(input?: T, prev?: U) => infer X, ...(infer Rest)] ? CompositeResult<T, Rest, U & X> :
  S extends [] ? U :
  never
declare type AugmentResult<S extends Tuple, U = {}> =
  S extends [infer X, ...(infer Rest)] ? AugmentResult<Rest, U & X> :
  S extends [] ? U :
  never
declare type TranslateWaterfall<S, T extends Tuple> = (input: S, translations: T) => WaterfallResult<S, T>
declare type TranslateComposite<S, T extends Tuple> = (input: S, translations: T) => CompositeResult<S, T>
declare type Augment<S, T extends Tuple> = (input: S, augmentations: T) => S & AugmentResult<T>
declare type RemoveFalsy<T extends Tuple> =
  T extends [false | null | undefined | 0 | '', ...(infer Rest)] ? RemoveFalsy<Rest> :
  T extends [infer X, ...(infer Rest)] ? [X, ...RemoveFalsy<Rest>] :
  []

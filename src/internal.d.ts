declare type PublicOptionsType = {
  /** @default 0 */
  initialIndex?: number

  /** @default false  */ vertical?:            boolean
  /** @default true   */ dragEnabled?:         boolean
  /** @default false  */ cancelDragOnLeave?:   boolean
  /** @default 'free' */ dragEndMove?:         'snap' | 'free-snap' | 'free'
  touchMultiplicator?: (delta: number) => number

  /** @default 500    */ defaultDuration?: number
  /** @default 0.0025 */ defaultFriction?: number

  /** @default false */ loop?: boolean
  /** @default false */ rubberband?: boolean
} & (
  { loop: false, rubberband: boolean } |
  { loop: true , rubberband: false   }
) & (
  { numberOfSlides: number } |
  { slides: Array<HTMLElement> }
)

declare type PublicFixedWidthOptionsType = {
  /** @default true */
  centered?:       boolean
  /** @default 0 */
  spacing?:        number
  /** @default 1 */
  slidesPerView?:  number
}

// TODO: this should probably not differ from the public options
declare type OptionsType = {
  initialIndex: number
  numberOfSlides: number

  isLoop: boolean
  isRubberband: boolean // TODO misschien functie, meer invloed op 1. drag-resistance 2. bounce back animatie
  isVerticalSlider: boolean

  isDragEnabled: boolean
  isDragCancelledOnLeave: boolean // TODO: even kijken uit welke use case dit kwam
  dragEndMove: 'snap' | 'free-snap' | 'free'
  touchMultiplicator(val: number): number // TODO sensible default: val => val

  defaultDuration: number
  defaultFriction: number

  strategy: StrategyType
}

declare type StrategyType = {
  // TODO: from a naive perspective, this interface should only expose one
  maxPosition: number
  trackLength: number

  calculateIndex(position: number): number
  calculateIndexTrend(position: number): number
  calculateIndexPosition(idx: number): number
}

declare type Details = {
  direction:      1 | 0 | -1
  progressTrack:  number
  progressSlides: number
  position:       number
  speed:          number
  relativeSlide:  number
  absoluteSlide:  number
  size:           number
  progress:       number
}

declare type StrategyDetails<T extends {}> = {
  getDetails(details: Details): T
}

declare type HtmlSlideSizeStrategy = {
  hasSlideSizeStragy: true
  getSizeStyle(): string
}
declare type HtmlSlidePositionsStrategy = {
  hasSlidePositionStragy: true
  calculateSlidePositions(progress: number): Array<SlidePositionType>
  getSlidePosition(idx: number, slidePosition: SlidePositionType ): number
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
  // TODO: Discuss with Joost and Peeke, I think this can be removed
  moveToSlideRelative(relativeIdx: number, nearest?: boolean, duration?: number): void

  readonly details: Details
}

declare type EventHandler<T = {}> = (info: { currentlyInAnimationFrame: boolean } & T) => void
declare type Events = {
  onDragStart?: EventHandler
  onFirstDrag?: EventHandler
  onDragEnd?: EventHandler
  onMove?: EventHandler<{ progress: number }>
  onSlideChange?: EventHandler<{ newIndex: number }>
  onSliderResize?: EventHandler
  onDestroy?: EventHandler
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

declare interface Math {
  sign(x: number): -1 | 0 | 1;
}

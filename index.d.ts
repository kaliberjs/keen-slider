export type THtmlElementGetter = () => NodeListOf<Element>
export type TContainer =
  | HTMLElement
  | NodeListOf<Element>
  | string
  | THtmlElementGetter
  | undefined
export type TSlides =
  | HTMLElement
  | NodeListOf<Element>
  | string
  | THtmlElementGetter
  | number
  | undefined

export type TDetails = {
  direction: 1 | 0 | -1
  progressTrack: number
  progressSlides: number
  position: number
  positions: {
    distance: number
    portion: number
  }[]
  speed: number
  relativeSlide: number
  absoluteSlide: number
  size: number
  slidesPerView: number // this only makes sense if slides are of equal size
  widthOrHeight: number
}

export type TSlidesPerViewGetter = () => number

export type TOptions = {
  centered?: boolean
  controls?: boolean
  dragSpeed?: number | ((val: number, instance: KeenSlider) => number)
  duration?: number
  friction?: number
  initial?: number
  loop?: boolean
  mode?: 'snap' | 'free' | 'free-snap'
  preventEvent?: string
  resetSlide?: boolean
  rtl?: boolean
  rubberband?: boolean
  slides?: TSlides
  slidesPerView?: number | TSlidesPerViewGetter
  spacing?: number
  vertical?: boolean
  cancelOnLeave?: boolean
}

type TEventHandler = (instance: KeenSlider) => void

export type TEvents = {
  afterChange?: TEventHandler
  beforeChange?: TEventHandler
  created?: TEventHandler
  dragStart?: TEventHandler
  firstDrag?: TEventHandler
  dragEnd?: TEventHandler
  destroyed?: TEventHandler
  mounted?: TEventHandler
  unmounted?: TEventHandler
  move?: TEventHandler
  slideChanged?: TEventHandler
  sliderResize?: TEventHandler
}

export type TBreakpoints = {
  breakpoints?: {
    [key: string]: TOptions & TEvents
  }
}

export type TOptionsEvents = TOptions & TEvents & TBreakpoints

// TODO: KeenSlider is not actually a class, so `new` should not be used.
// It is confusing that `new KeenSlider(...) instanceof KeenSlider` currently is `false`,
export default class KeenSlider {
  constructor(container: TContainer, options?: TOptionsEvents)
  controls: (active: boolean) => void
  next: () => void
  prev: () => void
  destroy: () => void
  refresh: (options?: TOptionsEvents) => void
  moveToSlideRelative: (
    slide: number,
    nearest?: boolean,
    duration?: number
  ) => void
  moveToSlide: (slide: number, duration?: number) => void
  resize: () => void
  details: () => TDetails
}

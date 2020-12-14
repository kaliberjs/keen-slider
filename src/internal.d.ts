import { TOptions } from '../index'

export type TranslatedOptionsType = {
  enableDragControls: boolean,
  touchMultiplicator(val: number): number,
  isLoop: boolean,
  isRubberband: boolean,
  isVerticalSlider: boolean,
  isRtl: boolean,
  isCentered: boolean,
  cancelOnLeave: boolean,
  initialIndex: number,
  preventEventAttributeName: string,
  duration: number,
  friction: number,
  dragEndMove: 'snap' | 'free-snap' | 'free',
  spacing: TOptions['spacing'],
  slides: Array<HTMLElement> | null,
  numberOfSlides: number,
  slidesPerView: number,
  spacing: number,
  widthOrHeight: number,
  spacing: number,
  origin: number,
  sizePerSlide: number,
  trackLength: number,
  maxPosition: number,
}

export type DynamicOptionsType = {
  isIndexOutOfBounds(idx: number): boolean,
  ensureIndexInBounds(idx: number): number,
}

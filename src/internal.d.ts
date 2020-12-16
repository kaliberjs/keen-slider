import { TOptions } from '../index'

export type BaseOptionType = {
  isLoop: boolean,
  isRubberband: boolean,
  isVerticalSlider: boolean,
  isRtl: boolean,
  isCentered: boolean,
}

export type TranslatedOptionsType = BaseOptionType & {
  enableDragControls: boolean,
  touchMultiplicator(val: number): number,
  cancelOnLeave: boolean,
  initialIndex: number,
  preventEventAttributeName: string,
  duration: number,
  friction: number,
  dragEndMove: 'snap' | 'free-snap' | 'free',
  slides: Array<HTMLElement> | null,
  numberOfSlides: number,
  widthOrHeight: number,
  isIndexOutOfBounds(idx: number): boolean,
  ensureIndexInBounds(idx: number): number,
  strategy: StrategyType,
}

export type StrategyType = {
  maxPosition: number,
  trackLength: number,
  calculateSlidePositions(progress: number): Array<SlidePositionType>
  calculateIndex(position: number): number
  calculateIndexTrend(position: number): number
  getDetails(): {
    slidesPerView: number,
  }
  getSizeStyle(): string
  getSlidePosition(idx: number, slidePosition: SlidePositionType )
  calculateIndexPosition(idx: number): number
}

type SlidePositionType = {
  portion: number,
  distance: number,
}

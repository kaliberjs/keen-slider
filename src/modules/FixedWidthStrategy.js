const { clampValue } = require('../machinery')

 /**
  * @param {HTMLElement} container
  * @returns {StrategyType & HtmlSlideSizeStrategy & HtmlSlidePositionsStrategy}
  */
export function FixedWidthSlides(container, {
  spacing,
  slidesPerView: slidesPerViewOption, numberOfSlides,
  isLoop, rtl, centered, isVerticalSlider
}) {
  const slidesPerView = typeof slidesPerViewOption === 'function'
    ? slidesPerViewOption()
    : clampValue(slidesPerViewOption, 1, Math.max(isLoop ? numberOfSlides - 1 : numberOfSlides, 1))

  const containerSize = isVerticalSlider ? container.offsetHeight : container.offsetWidth
  // so, this does not make much sense, in the default values sliderPerView === 1, that means we
  // clamp the value between 0 and infinity...
  // even with 2 slides per view we clamp it between 0 and the containerSize - 1
  const clampedSpacing = clampValue(spacing, 0, containerSize / (slidesPerView - 1) - 1)
  const widthOrHeight  = containerSize + clampedSpacing

  // only used for positioning and sizing
  const spacingPerSlide = spacing / slidesPerView
  const visibleSpacing  = spacingPerSlide * (slidesPerView - 1)
  const sizePerSlide    = widthOrHeight / slidesPerView
  // only used to calculate slide positions
  const origin          = centered
    ? (widthOrHeight / 2 - sizePerSlide / 2) / widthOrHeight
    : 0
  // what is the difference between maxPosition and trackLength? They should be related
  const maxPosition     = (widthOrHeight * numberOfSlides) / slidesPerView
  const trackLength     = (
    widthOrHeight * (
      numberOfSlides - 1 /* <- check if we need parentheses here */ * (centered ? 1 : slidesPerView)
    )
  ) / slidesPerView

  return {
    maxPosition,
    trackLength,
    calculateIndexPosition,
    calculateIndex,
    calculateIndexTrend,
    getDetails,
    hasSlideSizeStragy: true,
    getSizeStyle,
    hasSlidePositionStragy: true,
    calculateSlidePositions,
    getSlidePosition,
  }

  function getDetails({ progress }) {
    const positions = calculateSlidePositions(progress)
    return { slidesPerView, widthOrHeight, positions }
  }

  function calculateIndexTrend(position) {
    return position / sizePerSlide
  }

  function calculateIndex(position) {
    return Math.round(calculateIndexTrend(position))
  }

  function getSizeStyle() {
    return `calc(${100 / slidesPerView}% - ${visibleSpacing}px)`
  }

  function calculateSlidePositions(progress) {
    // todo - option for not calculating slides that are not in sight
    const slidePositions = []
    const normalizedrogress = progress < 0 && isLoop ? progress + 1 : progress
    for (let idx = 0; idx < numberOfSlides; idx++) {
      let distance =
        (((1 / numberOfSlides) * idx - normalizedrogress) * numberOfSlides) /
          slidesPerView +
          origin
      if (isLoop)
        distance +=
          distance > (numberOfSlides - 1) / slidesPerView  ? -(numberOfSlides / slidesPerView) :
          distance < -(numberOfSlides / slidesPerView) + 1 ? numberOfSlides / slidesPerView :
          0
      const slideFactor = 1 / slidesPerView
      const left = distance + slideFactor
      const portion = (
        left < slideFactor ? left / slideFactor :
        left > 1           ? 1 - ((left - 1) * slidesPerView) / 1 :
        1
      )
      slidePositions.push({
        portion: portion < 0 || portion > 1 ? 0 : portion,
        distance: !rtl ? distance : distance * -1 + 1 - slideFactor
      })
    }
    return slidePositions
  }

  function getSlidePosition(idx, { distance }) {
    const absoluteDistance = distance * widthOrHeight
    const pos =
      absoluteDistance -
      idx * (sizePerSlide - spacingPerSlide - visibleSpacing)

    return pos
  }

  function calculateIndexPosition(idx) {
    return sizePerSlide * clampIndex(idx)
  }

  function clampIndex(idx) {
    return isLoop
      ? idx
      : clampValue(idx, 0, numberOfSlides - 1 - (centered ? 0 : slidesPerView - 1))
  }
}

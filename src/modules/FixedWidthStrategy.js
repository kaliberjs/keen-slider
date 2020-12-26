const { clampValue } = require('src/machinery')

 /** @returns {StrategyType} */
export function FixedWidthSlides({
  spacing,
  slidesPerView, widthOrHeight, numberOfSlides,
  isLoop, isRtl, isCentered,
}) {

  // only used for positioning and sizing
  const spacingPerSlide = spacing / slidesPerView
  const visibleSpacing  = spacingPerSlide * (slidesPerView - 1)
  const sizePerSlide    = widthOrHeight / slidesPerView
  // only used to calculate slide positions
  const origin          = isCentered
    ? (widthOrHeight / 2 - sizePerSlide / 2) / widthOrHeight
    : 0
  // what is the difference between maxPosition and trackLength? They should be related
  const maxPosition     = (widthOrHeight * numberOfSlides) / slidesPerView
  const trackLength     = (
    widthOrHeight * (
      numberOfSlides - 1 /* <- check if we need parentheses here */ * (isCentered ? 1 : slidesPerView)
    )
  ) / slidesPerView

  return {
    maxPosition,
    trackLength,
    calculateIndexPosition,
    calculateSlidePositions,
    calculateIndex,
    calculateIndexTrend,
    getDetails,
    getSizeStyle,
    getSlidePosition,
  }

  // hmmm, this has to move out. It's greatly tied to the way slides are represented.
  // This library provides great freedom in how slides are represented, the different types of
  // slides require different approaches:
  // - number of slides requires people to use the 'details' to position stuff themselves
  // - slides from html elements uses this method. And here we could imagine a different approach
  //   using slides that have different sizes for example. Instead of giving them a size we could
  //   read their size
  // Anyway, it would be helpful if these 'strategies' could be plugged in
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
        distance: !isRtl ? distance : distance * -1 + 1 - slideFactor
      })
    }
    return slidePositions
  }

  function getDetails() {
    return {
      slidesPerView,
    }
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
      : clampValue(idx, 0, numberOfSlides - 1 - (isCentered ? 0 : slidesPerView - 1))
  }
}

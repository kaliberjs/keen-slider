const { writeToDOM } = require('../machinery')

/**
 * @param {object} props
 * @param {HtmlSlidePositionsStrategy} props.strategy
 * @param {Array<HTMLElement>} props.slides
 * @param {boolean} props.isVerticalSlider
 * @returns {Events}
 */
export function setSlidePositions({ strategy, slides, isVerticalSlider }) {
  return {
    onMove(info) {
      const slidePositions = strategy.calculateSlidePositions(info.progress)
      slides.forEach((slide, idx) => {
        const pos = strategy.getSlidePosition(idx, slidePositions[idx])
        const [a, b] = isVerticalSlider ? [0, pos] : [pos, 0]

        const transformString = `translate3d(${a}px, ${b}px, 0)`
        writeToDOM.using(info, () => {
          slide.style.transform = transformString
          slide.style['-webkit-transform'] = transformString
        })
      })
    },
    onDestroy(info) {
      writeToDOM.using(info, () => {
        slides.forEach(removeStyles(['transform', '-webkit-transform']))
      })
    },
  }
}

function removeStyles(styles) {
  return slide => {
    styles.forEach(style => {
      slide.style.removeProperty(style)
    })
  }
}

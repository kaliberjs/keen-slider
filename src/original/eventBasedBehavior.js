const { writeToDOM } = require('../machinery')

const attributeVertical = 'data-keen-slider-v'
const attributeDragging = 'data-keen-slider-moves'

/**
 * @param {HTMLElement} container
 * @param {TOptionsEvents} options
 * @returns {Events}
 */
export function verticalAttributeOnContainer(container, options) {
  return {
    mounted(info) {
      writeToDOM.using(info, () => {
        container.setAttribute(attributeVertical, 'true')
      })
    },
    unmounted(info) {
      writeToDOM.using(info, () => {
        container.removeAttribute(attributeVertical)
      })
    },
  }
}

/**
 * @param {HTMLElement} container
 * @returns {Events}
 */
export function dragAttributeOnContainer(container) {
  return {
    firstDrag(info) {
      writeToDOM.using(info, () => {
        container.setAttribute(attributeDragging, 'true')  // note: not sure if this is backwards compatible, I changed it from true to 'true', but I don't know if browsers do the same behind the scenes
      })
    },
    dragEnd(info) {
      writeToDOM.using(info, () => {
        container.removeAttribute(attributeDragging)
      })
    },
  }
}

/**
 * @param {object} props
 * @param {HtmlSlideSizeStrategy} props.strategy
 * @param {Array<HTMLElement>} props.slides
 * @param {boolean} props.isVerticalSlider
 * @returns {Events}
 */
export function setSlideSizes({ strategy, slides, isVerticalSlider }) {
  return {
    sliderResize(info) {
      const prop = isVerticalSlider ? 'height' : 'width'
      slides.forEach(slide => {
        const style = strategy.getSizeStyle()
        writeToDOM.using(info, () => {
          slide.style[`min-${prop}`] = style
          slide.style[`max-${prop}`] = style
        })
      })
    },
    unmounted(info) {
      writeToDOM.using(info, () => {
        const prop = isVerticalSlider ? 'height' : 'width'
        slides.forEach(removeStyles([`min-${prop}`, `max-${prop}`]))
      })
    }
  }
}

/**
 * @param {object} props
 * @param {HtmlSlidePositionsStrategy} props.strategy
 * @param {Array<HTMLElement>} props.slides
 * @param {boolean} props.isVerticalSlider
 * @returns {Events}
 */
export function setSlidePositions({ strategy, slides, isVerticalSlider }) {
  return {
    move(info) {
      slides.forEach((slide, idx) => {
        const pos = strategy.getSlidePosition(idx, info.slidePositions[idx])
        const [a, b] = isVerticalSlider ? [0, pos] : [pos, 0]

        const transformString = `translate3d(${a}px, ${b}px, 0)`
        writeToDOM.using(info, () => {
          slide.style.transform = transformString
          slide.style['-webkit-transform'] = transformString
        })
      })
    },
    unmounted(info) {
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

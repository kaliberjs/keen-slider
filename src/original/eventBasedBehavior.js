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
 * @param {TranslatedOptionsType & { slides: Array<HTMLElement> }} options
 * @returns {Events}
 */
export function setSlideSizes({ slides, strategy, isVerticalSlider }) {
  return {
    sliderResize(info) {
      const prop = isVerticalSlider ? 'height' : 'width'
      slides.forEach(slide => {
        // TODO: we don't need to calculate the size of a slide when it is already known, that would allow slides of a different size
        // hmm, it seems this is not really how it currently works. The number of slides, slidesPerView and container size determines this
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
 * @param {TranslatedOptionsType & { slides: Array<HTMLElement> }} options
 * @returns {Events}
 */
export function setSlidePositions({ slides, isVerticalSlider, strategy }) {
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

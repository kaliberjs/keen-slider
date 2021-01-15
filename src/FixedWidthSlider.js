import { BaseSlider } from './BaseSlider'
import { FixedWidthSlides } from './modules/FixedWidthStrategy'
import { setSlidePositions } from './modules/eventBasedBehavior'
import { translateOptions } from './modules/optionTranslation'
import { writeToDOM, mergeEventHandlers, EventBookKeeper } from './machinery'

/**
 * @param {HTMLElement} container
 * @param {PublicOptionsType & PublicFixedWidthOptionsType} options
 */
export function FixedWidthSlider(container, options) {
  const translatedOptions = translateOptions(options)

  const { spacing = 0, centered = true, slidesPerView = 1 } = options // TODO: default values should be moved to strategy
  const { numberOfSlides, isLoop, isVerticalSlider } = translatedOptions

  const strategy = FixedWidthSlides(container, {
    spacing, numberOfSlides, slidesPerView,
    isLoop, centered, isVerticalSlider,
  })

  const eventHandlers = 'slides' in options
    ? mergeEventHandlers(
        options,
        setSlideSizes({ strategy, slides: options.slides, isVerticalSlider }),
        setSlidePositions({ strategy, slides: options.slides, isVerticalSlider })
      )
    : options

  return BaseSlider(container, { ...translatedOptions, strategy }, fireEvent)

  /**
   * @template {keyof Events} T
   * @param {T} event
   * @param {EventInfo<T>} info
   */
  function fireEvent(event, info) {
    if (event in eventHandlers) eventHandlers[event](info)
  }
}

// TODO: this should be moved to the slider and should be based on the container
//       `onResize` was previously set to slider.resize(), I think that `resize` can be removed
//       from the api
function ResizeHandling({ onResize }) {
  const { eventAdd, eventsRemove } = EventBookKeeper()
  let resizeLastWidth = null

  eventAdd(document, 'resize', () => {
    const windowWidth = window.innerWidth
    if (windowWidth === resizeLastWidth) return
    resizeLastWidth = windowWidth
    onResize()
  })

  return { destroy: eventsRemove }
}

/**
 * @param {object} props
 * @param {HtmlSlideSizeStrategy} props.strategy
 * @param {Array<HTMLElement>} props.slides
 * @param {boolean} props.isVerticalSlider
 * @returns {Events}
 */
function setSlideSizes({ strategy, slides, isVerticalSlider }) {
  return {
    onSliderResize(info) {
      const prop = isVerticalSlider ? 'height' : 'width'
      slides.forEach(slide => {
        const style = strategy.getSizeStyle()
        writeToDOM.using(info, () => {
          slide.style[`min-${prop}`] = style
          slide.style[`max-${prop}`] = style
        })
      })
    },
    onDestroy(info) {
      writeToDOM.using(info, () => {
        const prop = isVerticalSlider ? 'height' : 'width'
        slides.forEach(removeStyles([`min-${prop}`, `max-${prop}`]))
      })
    }
  }
}

function removeStyles(styles) {
  return slide => {
    styles.forEach(style => {
      slide.style.removeProperty(style)
    })
  }
}

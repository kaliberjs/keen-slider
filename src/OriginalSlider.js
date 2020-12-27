import { containerSize, fixedWidthSlidesStrategy, renameOptions, slidesAndNumberOfSlides, slidesPerView, touchMultiplicator, widthOrHeight } from './original/optionTranslation';
import { BaseSlider } from './BaseSlider';
import { getElements, translateContainer, translateOptions, augmentPublicApi } from './machinery';
import { BreakpointBasedOptions } from './modules/BreakpointBasedOptions';
import { DynamicOptionsWrapper } from './modules/DynamicOptionsWrapper';
import { FixedWidthSlides } from './modules/FixedWidthStrategy';
import { resolveContainer } from './original/containerTranslation';
import { controlsApi, refreshApi } from './original/publicApiAugmentation';
import { verticalAttributeOnContainer, dragAttributeOnContainer, setSlideSizes, setSlidePositions } from './original/eventBasedBehavior';

/** @type {TOptions} */
const defaultOptions = {
  centered: false,
  breakpoints: null,
  controls: true,
  dragSpeed: 1,
  friction: 0.0025,
  loop: false,
  initial: 0,
  duration: 500,
  preventEvent: 'data-keen-slider-pe',
  slides: '.keen-slider__slide',
  vertical: false,
  resetSlide: false,
  slidesPerView: 1,
  spacing: 0,
  mode: 'snap',
  rtl: false,
  rubberband: true,
  cancelOnLeave: true
}

/**
 * @param {TContainer} initialContainer
 * @param {TOptionsEvents} initialOptions
 * @returns {KeenSlider}
 */
export function OriginalSlider(initialContainer, initialOptions) {
  // This is here because the 'hooks/events/callbacks' use it
  let publicApi = null

  const sliderWrapper = DynamicOptionsWrapper(
    /** @param {TOptionsEvents} options */
    (options, sliderWrapper) => {
      if (!publicApi) throw new Error(`Note to self: public API has not been created yet, please delay creating the slider`)

      const translatedContainer = translateContainer(
        initialContainer, [
          resolveContainer,
        ]
      )
      const translatedOptions = translateOptions(
        options, [
          renameOptions,
          touchMultiplicator(publicApi),
          slidesAndNumberOfSlides(translatedContainer),
          slidesPerView,
          containerSize(translatedContainer),
          widthOrHeight,
          fixedWidthSlidesStrategy,
        ]
      )
      const fireEvent = hookIntoEvents(publicApi, options, [
        verticalAttributeOnContainer(translatedContainer, options),
        dragAttributeOnContainer(translatedContainer),
        setSlideSizes(translatedOptions),
        setSlidePositions(translatedOptions),
      ])
      const slider = BaseSlider(translatedContainer, translatedOptions, fireEvent)

      return augmentPublicApi(
        slider, [
          controlsApi({ optionsWrapper, sliderWrapper }),
          refreshApi({ sliderWrapper, optionsWrapper, initialOptions }),
        ]
      )
    }
  )

  const optionsWrapper = BreakpointBasedOptions(
    { ...defaultOptions, ...initialOptions },
    {
      onOptionsChanged(options) {
        if (options.resetSlide) sliderWrapper.replace(options)
        else sliderWrapper.replaceKeepIndex(options)
      }
    }
  )

  publicApi = {
    destroy() {
      optionsWrapper.destroy()
      sliderWrapper.destroy()
    },

    /*
      sliderWrapper.current will change, that is why we forward these methods instead of
      simply returning the current slider
    */
    next()   { sliderWrapper.current.next() },
    prev()   { sliderWrapper.current.prev() },
    resize() { sliderWrapper.current.resize() },

    refresh(options) { sliderWrapper.current.refresh(options) },
    controls(active) { sliderWrapper.current.controls(active) },

    moveToSlideRelative( slide, nearest, duration) {
      sliderWrapper.current.moveToSlideRelative(slide, nearest, duration)
    },
    moveToSlide(slide, duration) {
      sliderWrapper.current.moveToSlide(slide, duration)
    },

    details() { return sliderWrapper.current.details() }
  }

  // initiate after public API has been created
  sliderWrapper.create(optionsWrapper.options)

  return publicApi
}

/**
 * @param {KeenSlider} publicApi
 * @param {TEvents} eventsFromOptions
 * @param {Array<Events>} internalEvents
 */
function hookIntoEvents(publicApi, eventsFromOptions, internalEvents) {
  return (
    /**
     * @template {keyof Events} T
     * @param {T} event
     * @param {EventInfo<T>} info
     */
    (event, info) => {
      internalEvents.forEach(x => {
        // @ts-ignore teypescript can not handle the argument type even though we force the info to being the correct type
        if (x[event]) x[event](info)
      })
      if (eventsFromOptions[event]) eventsFromOptions[event](publicApi)
    }
  )
}

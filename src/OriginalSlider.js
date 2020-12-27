import { containerSize, fixedWidthSlidesStrategy, renameOptions, slidesAndNumberOfSlides, slidesPerView, touchMultiplicator, widthOrHeight } from './original/optionTranslation';
import { BaseSlider } from './BaseSlider';
import { translateContainer, translateOptions, augmentPublicApi, EventBookKeeper } from './machinery';
import { BreakpointBasedOptions } from './modules/BreakpointBasedOptions';
import { DynamicOptionsWrapper } from './modules/DynamicOptionsWrapper';
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
      const internalEventHandler = hookIntoEvents([
        verticalAttributeOnContainer(translatedContainer, options),
        dragAttributeOnContainer(translatedContainer),
        setSlideSizes(translatedOptions),
        setSlidePositions(translatedOptions),
      ])

      const slider = BaseSlider(
        translatedContainer,
        translatedOptions,
        (event, info) => {
          internalEventHandler(event, info)
          fireEvent(event)
        }
      )

      const augmentedSlider = augmentPublicApi(
        slider, [
          controlsApi({ optionsWrapper, sliderWrapper }),
          refreshApi({ sliderWrapper, optionsWrapper, initialOptions }),
        ]
      )

      return augmentedSlider
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

  // This should probably be handled differently. The whole resize think needs to be thought about
  // it seems to not make sense to check for window resize, we should probably monitor the container
  // or the slides. Anyway - food for thought - maybe resize handling should be part of the strategy
  const resizeHandling = ResizeHandling({ onResize: resize })

  publicApi = {
    destroy,
    resize,

    /*
      sliderWrapper.current will change, that is why we forward these methods instead of
      simply returning the current slider
    */
    next()   { sliderWrapper.current.next() },
    prev()   { sliderWrapper.current.prev() },

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
  init()

  return publicApi

  function init() {
    sliderWrapper.create(optionsWrapper.options)
    fireEvent('created')
  }

  function destroy() {
    optionsWrapper.destroy()
    sliderWrapper.destroy()
    resizeHandling.destroy()
    fireEvent('destroyed')
  }

  function resize() {
    // It feels a bit weird to do this, while it is similar to the original behavior, we should
    // probably (in the final version) make this controllable. The question is: when will those
    // dynamic options need to be refreshed?
    //
    // In some cases the options don't change and in other cases there aren't any dynamic options
    //
    // Anyway, we'll revisit this later
    sliderWrapper.replaceKeepIndex(optionsWrapper.options)
    // if the slider is recreated on resize it does not make sense to call the resize method
    sliderWrapper.current.resize()
  }

  /** @param {keyof TEvents} event */
  function fireEvent(event) {
    const { options } = optionsWrapper
    if (options[event]) options[event](publicApi)
  }
}

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
 * @param {Array<Events>} internalEvents
 */
function hookIntoEvents(internalEvents) {
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
    }
  )
}

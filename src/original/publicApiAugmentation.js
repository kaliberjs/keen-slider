/* We should deprecate this */
export function controlsApi({ optionsWrapper, sliderWrapper }) {
  return {
    controls(active) {
      const newOptions = optionsWrapper.update({ controls: active })
      sliderWrapper.replaceKeepIndex(newOptions)
    }
  }
}

/** We should depricate this API */
export function refreshApi({ optionsWrapper, sliderWrapper, initialOptions }) {
  return {
    refresh(options) {
      const newOptions = optionsWrapper.replaceOptions(options || initialOptions)
      sliderWrapper.sliderReplace(newOptions)
    }
  }
}

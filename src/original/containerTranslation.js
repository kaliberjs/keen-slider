import { getElements } from '../machinery'

/** @param {TContainer} initialContainer */
export function resolveContainer(initialContainer) {
  const [container] = getElements(initialContainer, document)
  return container
}

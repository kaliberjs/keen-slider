// TODO: do we need this polyfill?
if (!Math.sign) {
  // @ts-ignore
  Math.sign = function (x) {
    return Number(x > 0) - Number(x < 0) || +x
  }
}

if (!Math.sign) {
  // @ts-ignore
  Math.sign = function (x) {
    return Number(x > 0) - Number(x < 0) || +x
  }
}

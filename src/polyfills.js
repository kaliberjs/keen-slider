if (!Math.sign) {
  Math.sign = function (x) {
    return Number(x > 0) - Number(x < 0) || +x
  }
}

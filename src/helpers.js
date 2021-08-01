function findNearest(arr, needle, getter = el => el) {
	let prevEl
	for (const el of arr) {
		if (getter(el) > needle) {
			if (prevEl && getter(el) - needle > needle - getter(prevEl)) {
				return prevEl
			} else {
				return el
			}
		}
		prevEl = el
	}
	return prevEl
}

module.exports = {
	findNearest
}
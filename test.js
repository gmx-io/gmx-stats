function fillPeriods(arr, { period, from, to }) {
  let i = 0
  let prevTimestamp = from ? from - period : arr[0].timestamp
  let prevPeriodStep = Math.floor(prevTimestamp / period)
  let prevItem
  const ret = []

  while (i < arr.length) {
    const item = arr[i]
    const periodStep = Math.floor(item.timestamp / period) 

    if (periodStep - 1 > prevPeriodStep) {
      const diff = periodStep - prevPeriodStep
      let j = 1
      while (j < diff) {
        ret.push({
          ...prevItem,
          timestamp: (prevPeriodStep + j) * period
        })
        j++
      }
    }

    ret.push(item)

    if (to && i === arr.length - 1) {
      const lastPeriodStep = Math.floor(to / period)
      if (lastPeriodStep > periodStep) {
        const diff = lastPeriodStep - periodStep
        let j = 0
        while (j < diff) {
          ret.push({
            ...item,
            timestamp: (periodStep + j + 1) * period
          })
          j++
        }
      }
    }

    prevItem = item
    prevPeriodStep = periodStep
    i++
  }

  return ret
}

const now = Math.floor(Date.now() / 1000)
const data = [
  {
    timestamp: now - 15000,
    value: 2
  },
  {
    timestamp: now - 5000,
    value: 5
  },
  {
    timestamp: now,
    value: 10
  }
]

const result = fillPeriods(data, { period: 3600, from: now - 86400, to: now + 7200 }).map(item => {
  return {
    date: new Date(item.timestamp * 1000).toISOString(),
    ...item
  }
})
console.log('RESULTS')
console.log(result)
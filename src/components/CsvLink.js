import { useCallback } from 'react'
import { RiDownload2Fill } from 'react-icons/ri'
import strftime from 'strftime'

function formatTimestamp(timestamp) {
  return strftime('%Y-%m-%d', new Date(timestamp * 1000))
}

function getCsvUrl(data, fields) {
  const csvHeader = 'Date,' + fields.map(field => field.name || field.key).join(',')
  const csvBody = data.map(item => {
    return formatTimestamp(item.timestamp) + ',' + fields.map(field => item[field.key]).join(',')
  }).join('\n')
  const csv = csvHeader + '\n' + csvBody
  return `data:application/octet-stream,${encodeURIComponent(csv)}`
}

export default function CsvLink({ data, fields, name = 'GMX stats' }) {
  const onClick = useCallback((evt) => {
    evt.preventDefault()

    const csvUrl = getCsvUrl(data, fields)
    const start = formatTimestamp(data[0].timestamp)
    const end = formatTimestamp(data[data.length - 1].timestamp)
    const fileName = `${name}_${start}_${end}.csv`

    const aElement = document.createElement('a')
    aElement.href = csvUrl
    aElement.download = fileName
    document.body.appendChild(aElement)
    aElement.click()
    document.body.removeChild(aElement)
  }, [data, fields, name])

  if (!data || data.length === 0 || !fields) {
    return null
  }

  return (
    <a title="Download CSV" className="csv-link" onClick={onClick}>
      <RiDownload2Fill size="1em" />
    </a>
  )
}
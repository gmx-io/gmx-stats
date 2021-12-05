import { RiLoader5Fill } from 'react-icons/ri'
import CsvLink from './CsvLink'

export default function ChartWrapper(props) {
  const {
    title,
    loading,
    csvFields,
    data
  } = props
  return <>
    <h3>
      {title}
      <CsvLink
        fields={csvFields}
        name={title}
        data={data}
      />
    </h3>
    {loading && <RiLoader5Fill size="3em" className="loader" />}
    {props.children}
  </>
}
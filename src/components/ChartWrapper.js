import { RiLoader5Fill } from 'react-icons/ri'

export default function ChartWrapper(props) {
  const {
    title,
    loading
  } = props
  return <>
    <h3>{title}</h3>
    {loading && <RiLoader5Fill size="3em" className="loader" />}
    {props.children}
  </>
}
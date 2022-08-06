import { RiLoader5Fill } from 'react-icons/ri'
import cx from 'classnames';
import PropTypes from 'prop-types';
import CsvLink from './CsvLink'

ChartWrapper.propTypes = {
  title: PropTypes.string,
  loading: PropTypes.bool,
  data: PropTypes.arrayOf(PropTypes.any),
  csvFields: PropTypes.arrayOf(PropTypes.objectOf({key: PropTypes.string, name: PropTypes.string})),
  controls: PropTypes.objectOf({
    convertToPercents: PropTypes.func
  }),
  viewState: PropTypes.objectOf({
    isPercentsView: PropTypes.bool,
  }),
  togglePercentView: PropTypes.func,
}

export default function ChartWrapper(props) {
  const {
    title,
    loading,
    csvFields,
    data,
    controls,
    viewState = {},
    togglePercentView
  } = props

  return (
   <>
    <div className='chart-header'>
      <h3>
        {title}
        <CsvLink
          fields={csvFields}
          name={title}
          data={data}
        />
      </h3>
      {controls && (
        <div className='chart-controls'>
          {controls.convertToPercents && 
            <div 
                className={cx({'chart-control-checkbox': true, active: viewState.isPercentsView})}
                onClick={togglePercentView}
            >
                %
            </div>
          }
        </div>
      )}
      </div>
      {loading && <RiLoader5Fill size="3em" className="loader" />}
      {props.children}
    </>
  )
}
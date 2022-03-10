import { useState, useEffect } from 'react'
import Select from 'react-dropdown-select'
import DatePicker from 'react-datepicker'
import "react-datepicker/dist/react-datepicker.css"
import moment from 'moment'

export default function DateRangeSelect({ options, startDate, endDate, onChange }) {
  const [selectedDateRangeOption, setSelectedDateRangeOption] = useState()

  const onSelectItem = (option) => {
    const end = new Date()
    const start = moment().subtract(option.id, 'month').toDate()
    setSelectedDateRangeOption(option.id)
    onChange([start, end])
  }

  useEffect(() => {
    onSelectItem({id: 2})
  }, [])

  const customContentRenderer = ({ props, state }) => {
    const start = startDate && startDate.toISOString().slice(0, 10)
    const end = endDate && endDate.toISOString().slice(0, 10)
    return (<div style={{ cursor: 'pointer' }}>
      {start} ~ {end}
    </div>)
  };

  const customDropdownRenderer = ({ props, state, methods }) => {
    const regexp = new RegExp(state.search, 'i');

    return (
      <div>
        <div className="date-range-items">
          {props.options
            .filter((item) => regexp.test(item[props.searchBy] || item[props.labelField]))
            .map((option, index) => {
              if (!props.keepSelectedInList && methods.isSelected(option)) {
                return null;
              }

              return (
                <div
                  disabled={option.disabled}
                  key={index}
                  onClick={option.disabled ? null : () => onSelectItem(option)}
                  className={option.id === selectedDateRangeOption ? 'date-range-item selected' : 'date-range-item'}
                >
                  <div className="date-range-item__label">{option[props.labelField]}</div>
                </div>
              );
            })}
        </div>
        <div className="date-range-custom" color={props.color}>
          <DatePicker
            selected={startDate}
            onChange={onChange}
            startDate={startDate}
            endDate={endDate}
            selectsRange
            inline
          />
        </div>
      </div>
    );
  };

  return (
    <div>
      <Select
        placeholder="Select"
        multi
        contentRenderer={customContentRenderer}
        dropdownRenderer={customDropdownRenderer}
        labelField="label"
        options={options}
        closeOnSelect={true}
        closeOnScroll={true}
        values={[selectedDateRangeOption]}
      />
    </div>
  )
}

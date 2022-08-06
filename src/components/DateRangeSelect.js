import { useState, useEffect, useRef } from 'react'
import Select from 'react-dropdown-select'
import moment from 'moment'
import { DateRange } from 'react-date-range';
import 'react-date-range/dist/styles.css'; // main css file
import 'react-date-range/dist/theme/default.css'; // theme css file

const ALL_TIME_ID = 4;

export default function DateRangeSelect({ options, startDate, endDate, onChange }) {
  const [selectedDateRangeOption, setSelectedDateRangeOption] = useState()
  const [rangeState, setRangeState] = useState([
    {
      startDate: null,
      endDate: null,
      key: 'selection'
    }
  ]);

  useEffect(() => {
    setRangeState([
      {
        startDate: startDate,
        endDate: endDate,
        key: 'selection'
      }
    ])
  }, [startDate, endDate])

  const onSelectItem = (option) => {
    if (option.id == ALL_TIME_ID) {
      onChange([null, null])
    }
    const end = new Date()
    const start = moment().subtract(option.id, 'month').toDate()
    setSelectedDateRangeOption(option.id)
    if (option.id == ALL_TIME_ID) {
      onChange([null, null])
    } else {
      onChange([start, end])
    }
  }

  useEffect(() => {
    let selected = false
    for (const option of options) {
      if (option.isDefault) {
        selected = true
        onSelectItem(option)
        break
      }
    }
    if (!selected) {
      onSelectItem(options[0])
    }
  }, [])

  const onDateRangeChange = (item) => {
    setRangeState([item.selection])
    if (item.selection.startDate == item.selection.endDate) {
      return
    }
    onChange([item.selection.startDate, item.selection.endDate])
  }

  const customContentRenderer = ({ props, state }) => {
    const start = startDate && startDate.toISOString().slice(0, 10)
    const end = endDate && endDate.toISOString().slice(0, 10)
    return (<div style={{ cursor: 'pointer' }}>
      { startDate && endDate && `${start} ~ ${end}`}
      { (!startDate || !endDate) && 'All time' }
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
          <DateRange
            editableDateInputs={true}
            onChange={onDateRangeChange}
            moveRangeOnFirstSelection={false}
            ranges={rangeState}
            showDateDisplay={false}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="date-range-selector-wrapper">
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

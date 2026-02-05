import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import './CustomSelect.css';

/**
 * Reusable Custom Select Component
 * 
 * @param {Object} props
 * @param {string} props.value - Currently selected value
 * @param {Array<{value: string, label: string|React.Node}>} props.options - List of options
 * @param {(value: string) => void} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.disabled - Whether the dropdown is disabled
 * @param {string} props.className - Additional classes
 */
const CustomSelect = ({ 
  value, 
  options = [], 
  onChange, 
  placeholder = 'Select...', 
  disabled = false,
  className = '',
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (optionValue) => {
    if (onChange) {
      onChange(optionValue);
    }
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div 
      className={`custom-select ${isOpen ? 'open' : ''} ${className} ${disabled ? 'disabled' : ''}`}
      style={{ 
        minWidth: 0, 
        opacity: disabled ? 0.6 : 1, 
        pointerEvents: disabled ? 'none' : 'auto',
        ...style 
      }}
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && setIsOpen(!isOpen)}
    >
      <div className="select-selected">
        {selectedOption ? selectedOption.label : placeholder}
        <ChevronDown size={14} className="select-arrow" />
      </div>
      
      {isOpen && !disabled && (
        <div className="select-options">
          {options.length === 0 ? (
            <div className="select-option disabled" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              No options available
            </div>
          ) : (
            options.map((option) => (
              <div 
                key={option.value}
                className={`select-option ${value === option.value ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(option.value);
                }}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;

import React, { useState, useEffect, useRef } from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';
import './number-input.css';

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  debounceMs?: number;
  fallbackValue?: number;
  allowEmpty?: boolean;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({
    value,
    onChange,
    min,
    max,
    step = 1,
    debounceMs = 300,
    fallbackValue = 0,
    allowEmpty = true,
    className,
    ...props
  }, ref) => {
    const isEmptyDisplay = (v: number) => allowEmpty && (v === 0 || v === fallbackValue);
    const [displayValue, setDisplayValue] = useState<string>(isEmptyDisplay(value) ? '' : String(value));
    const debounceTimeoutRef = useRef<NodeJS.Timeout>();
    const isComposingRef = useRef(false);

    useEffect(() => {
      if (!isComposingRef.current) {
        setDisplayValue(isEmptyDisplay(value) ? '' : String(value));
      }
    }, [value, allowEmpty, fallbackValue]);


    useEffect(() => {
      return () => {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }, []);

    const validateAndConstrainValue = (numValue: number): number => {
      let constrainedValue = numValue;
      if (min !== undefined && constrainedValue < min) {
        constrainedValue = min;
      }
      if (max !== undefined && constrainedValue > max) {
        constrainedValue = max;
      }
      return constrainedValue;
    };

    const commitValue = (inputValue: string) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }


      if (inputValue === '' || inputValue === '-') {
        if (allowEmpty) {
          setDisplayValue('');
          if (value !== fallbackValue) {
            onChange(fallbackValue);
          }
          isComposingRef.current = false;
          return;
        } else {

          const finalValue = fallbackValue;
          setDisplayValue(String(finalValue));
          if (finalValue !== value) {
            onChange(finalValue);
          }
          isComposingRef.current = false;
          return;
        }
      }


      const numValue = parseFloat(inputValue);
      if (isNaN(numValue)) {
        if (allowEmpty) {
          setDisplayValue('');
          if (value !== fallbackValue) {
            onChange(fallbackValue);
          }
          isComposingRef.current = false;
          return;
        } else {

          const finalValue = fallbackValue;
          setDisplayValue(String(finalValue));
          if (finalValue !== value) {
            onChange(finalValue);
          }
          isComposingRef.current = false;
          return;
        }
      }


      const finalValue = validateAndConstrainValue(numValue);
      setDisplayValue(String(finalValue));


      if (finalValue !== value) {
        onChange(finalValue);
      }

      isComposingRef.current = false;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      if (allowEmpty && inputValue !== '' && !/^-?\d*\.?\d*$/.test(inputValue)) {
        return;
      }
      setDisplayValue(inputValue);
      isComposingRef.current = true;


      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }


      debounceTimeoutRef.current = setTimeout(() => {
        commitValue(inputValue);
      }, debounceMs);
    };

    const handleBlur = () => {

      commitValue(displayValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {

      if (e.key === 'Enter') {
        commitValue(displayValue);
      }


      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();


        let currentValue: number;
        if (displayValue === '' || displayValue === '-') {
          currentValue = fallbackValue;
        } else {
          const parsed = parseFloat(displayValue);
          currentValue = isNaN(parsed) ? fallbackValue : parsed;
        }

        const increment = e.key === 'ArrowUp' ? step : -step;
        const newValue = validateAndConstrainValue(currentValue + increment);


        setDisplayValue(String(newValue));
        if (newValue !== value) {
          onChange(newValue);
        }
        isComposingRef.current = false;
      }
    };

    return (
      <Input
        ref={ref}
        type={allowEmpty ? 'text' : 'number'}
        inputMode={allowEmpty ? 'decimal' : undefined}
        value={displayValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        min={allowEmpty ? undefined : min}
        max={allowEmpty ? undefined : max}
        step={allowEmpty ? undefined : step}
        className={cn(
          "number-input-no-spinners",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          className
        )}
        {...props}
      />
    );
  }
);

NumberInput.displayName = 'NumberInput';

import * as React from "react";
import PhoneInput, { type Country, type Value } from "react-phone-number-input/max";
import flags from "react-phone-number-input/flags";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getBrowserPhoneCountry,
  getCountryForPhoneValue,
  getPhoneCallingPrefix,
  isBareCallingCode,
  normalizeExistingPhoneValue,
} from "@/lib/localized-phone";

export interface LocalizedPhoneInputProps {
  value?: string | null;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  autoComplete?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

export function LocalizedPhoneInput({
  value,
  onChange,
  className,
  autoComplete = "tel",
  ...props
}: LocalizedPhoneInputProps) {
  const localeCountry = React.useMemo(() => getBrowserPhoneCountry(), []);
  const initialCountry = React.useMemo(
    () => getCountryForPhoneValue(value, localeCountry),
    // The existing value only determines the initial selector country.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [country, setCountry] = React.useState<Country>(initialCountry);
  const normalizedValue = React.useMemo(
    () => normalizeExistingPhoneValue(value, country),
    [country, value],
  );
  const currentValue = value?.trim() ?? "";
  const compactValue = currentValue.replace(/[\s().-]/g, "");
  const isUnparseableLegacyValue = Boolean(
    currentValue && normalizedValue === currentValue && !/^\+\d+$/.test(compactValue),
  );
  const semanticValue = isBareCallingCode(normalizedValue) ? "" : normalizedValue;
  const displayValue = semanticValue || getPhoneCallingPrefix(country);

  React.useEffect(() => {
    const current = value?.trim() ?? "";
    if (current && normalizedValue !== current) onChange(normalizedValue);
  }, [normalizedValue, onChange, value]);

  const handleChange = (next?: Value) => {
    const nextValue = next ? String(next) : "";
    onChange(isBareCallingCode(nextValue) ? "" : nextValue);
  };

  if (isUnparseableLegacyValue) {
    return (
      <Input
        {...props}
        type="tel"
        autoComplete={autoComplete}
        value={currentValue}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      />
    );
  }

  return (
    <PhoneInput
      {...props}
      flags={flags}
      international
      countryCallingCodeEditable={false}
      limitMaxLength
      defaultCountry={initialCountry}
      value={displayValue as Value}
      onCountryChange={(nextCountry) => {
        const resolvedCountry = nextCountry ?? localeCountry;
        setCountry(resolvedCountry);
        if (!semanticValue) onChange("");
      }}
      onChange={handleChange}
      autoComplete={autoComplete}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "[&_.PhoneInputCountry]:mr-2 [&_.PhoneInputCountrySelect]:cursor-pointer [&_.PhoneInputCountrySelect]:bg-background",
        "[&_.PhoneInputInput]:min-w-0 [&_.PhoneInputInput]:flex-1 [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:p-0 [&_.PhoneInputInput]:outline-none",
        className,
      )}
    />
  );
}

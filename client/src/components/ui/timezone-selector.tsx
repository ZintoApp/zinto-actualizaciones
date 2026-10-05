import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TIMEZONE_OPTIONS, getTimezoneOffset, filterTimezones, type TimezoneOption } from '@/utils/timezones';

interface TimezoneSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TimezoneSelector({
  value,
  onValueChange,
  placeholder = "Select timezone...",
  className,
  disabled = false
}: TimezoneSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');


  const selectedTimezone = useMemo(() => {
    return TIMEZONE_OPTIONS.find(tz => tz.value === value);
  }, [value]);


  const filteredTimezones = useMemo(() => {
    return filterTimezones(searchQuery);
  }, [searchQuery]);


  const groupedTimezones = useMemo(() => {
    const groups: Record<string, TimezoneOption[]> = {};
    
    filteredTimezones.forEach(tz => {
      if (tz.value === 'UTC') {
        if (!groups['UTC']) groups['UTC'] = [];
        groups['UTC'].push(tz);
      } else {
        const continent = tz.value.split('/')[0];
        if (!groups[continent]) groups[continent] = [];
        groups[continent].push(tz);
      }
    });


    const sortedGroups: Record<string, TimezoneOption[]> = {};
    const groupOrder = ['UTC', 'Africa', 'America', 'Asia', 'Europe', 'Australia', 'Pacific'];
    
    groupOrder.forEach(group => {
      if (groups[group]) {
        sortedGroups[group] = groups[group].sort((a, b) => a.label.localeCompare(b.label));
      }
    });


    Object.keys(groups).forEach(group => {
      if (!groupOrder.includes(group)) {
        sortedGroups[group] = groups[group].sort((a, b) => a.label.localeCompare(b.label));
      }
    });

    return sortedGroups;
  }, [filteredTimezones]);

  const handleSelect = (timezone: TimezoneOption) => {
    onValueChange(timezone.value);
    setOpen(false);
    setSearchQuery('');
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between text-xs h-7 min-h-7 max-h-7", className)}
          disabled={disabled}
        >
          {selectedTimezone ? (
            <div className="flex items-center justify-between w-full">
              <span className="truncate">
                {selectedTimezone.label}
              </span>
              <span className="text-muted-foreground ml-2 text-[10px]">
                {getTimezoneOffset(selectedTimezone.value)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            placeholder="Search timezones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={clearSearch}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <ScrollArea className="h-60">
          <div className="p-1">
            {Object.keys(groupedTimezones).length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No timezones found.
              </div>
            ) : (
              Object.entries(groupedTimezones).map(([continent, timezones]) => (
                <div key={continent} className="mb-2">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {continent}
                  </div>
                  {timezones.map((timezone) => (
                    <div
                      key={timezone.value}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground",
                        value === timezone.value && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => handleSelect(timezone)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3 w-3",
                          value === timezone.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {timezone.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {timezone.country}
                            </div>
                          </div>
                          <div className="ml-2 text-[10px] text-muted-foreground">
                            {getTimezoneOffset(timezone.value)}
                          </div>
                        </div>
                        <div className="text-[9px] text-muted-foreground/70 truncate">
                          {timezone.value}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

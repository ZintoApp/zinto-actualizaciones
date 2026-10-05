import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/use-translation';
import type { DaySchedule, TimeWindow } from '@shared/types/calendar-types';
import { DAY_NAMES, isValidTimeFormat } from '@shared/types/calendar-types';
import { validateDayBreaks } from '@shared/utils/calendar-breaks';
import { cn } from '@/lib/utils';
import { X, Plus } from 'lucide-react';

/** Soften native time-picker chrome so dual ranges don't feel icon-heavy */
const TIME_INPUT_CLASS =
  'px-2 [&::-webkit-calendar-picker-indicator]:ml-0.5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-45 hover:[&::-webkit-calendar-picker-indicator]:opacity-80';

const WEEKDAY_INDEXES = [1, 2, 3, 4, 5];

interface WeeklyScheduleCallbacks {
  schedule: DaySchedule[];
  offDays: number[];
  onScheduleChange: (schedule: DaySchedule[]) => void;
  onOffDaysChange: (offDays: number[]) => void;
  disabled?: boolean;
}

export interface WeeklyScheduleQuickActionsProps extends WeeklyScheduleCallbacks {
  className?: string;
  /** Use the primary button style when Mon–Fri is the active pattern. */
  highlightWeekdays?: boolean;
}

interface WeeklyScheduleEditorProps extends WeeklyScheduleCallbacks {
  /** Additional CSS classes */
  className?: string;
  /** Optional class applied to the table's scroll viewport. */
  scrollbarClassName?: string;
  /** Render the preset toolbar above the table. Defaults to true. */
  showQuickActions?: boolean;
  /** Tighter layout for nested panels such as per-dentist overrides. */
  compact?: boolean;
}

function isWeekdaysPattern(schedule: DaySchedule[], offDays: number[]): boolean {
  return schedule.every((day) => {
    const isWeekday = WEEKDAY_INDEXES.includes(day.dayIndex);
    const enabled = day.enabled && !offDays.includes(day.dayIndex);
    return enabled === isWeekday;
  });
}

export function WeeklyScheduleQuickActions({
  schedule,
  offDays,
  onScheduleChange,
  onOffDaysChange,
  disabled = false,
  className = '',
  highlightWeekdays = false,
}: WeeklyScheduleQuickActionsProps) {
  const { t } = useTranslation();
  const weekdaysActive = highlightWeekdays && isWeekdaysPattern(schedule, offDays);

  const handleEnableWeekdays = () => {
    if (disabled) return;
    const newOffDays = offDays.filter((day) => !WEEKDAY_INDEXES.includes(day));
    onOffDaysChange(newOffDays);
    onScheduleChange(
      schedule.map((day) => ({
        ...day,
        enabled: WEEKDAY_INDEXES.includes(day.dayIndex),
        breaks: WEEKDAY_INDEXES.includes(day.dayIndex) ? (day.breaks ?? []) : [],
      })),
    );
  };

  const handleEnableAll = () => {
    if (disabled) return;
    onOffDaysChange([]);
    onScheduleChange(schedule.map((day) => ({ ...day, enabled: true, breaks: day.breaks ?? [] })));
  };

  const handleDisableAll = () => {
    if (disabled) return;
    onOffDaysChange([0, 1, 2, 3, 4, 5, 6]);
    onScheduleChange(schedule.map((day) => ({ ...day, enabled: false, breaks: [] })));
  };

  const handleResetToDefault = () => {
    if (disabled) return;
    onScheduleChange(
      DAY_NAMES.map((dayName, index) => ({
        dayName,
        dayIndex: index,
        enabled: index >= 1 && index <= 5,
        startTime: '09:00',
        endTime: '17:00',
        breaks: [],
      })),
    );
    onOffDaysChange([0, 6]);
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button data-tour="components-flow-builder-weeklyscheduleeditor.button.flow_builder.ai_schedule_all_weekdays"
        type="button"
        variant={weekdaysActive ? 'default' : 'outline'}
        size="sm"
        onClick={handleEnableWeekdays}
        disabled={disabled}
        className="h-7 flex-1 text-xs sm:flex-none"
      >
        {t('flow_builder.ai_schedule_all_weekdays', 'All Weekdays')}
      </Button>
      <Button data-tour="components-flow-builder-weeklyscheduleeditor.button.flow_builder.ai_schedule_all_days"
        type="button"
        variant="outline"
        size="sm"
        onClick={handleEnableAll}
        disabled={disabled}
        className="h-7 flex-1 text-xs sm:flex-none"
      >
        {t('flow_builder.ai_schedule_all_days', 'All Days')}
      </Button>
      <Button data-tour="components-flow-builder-weeklyscheduleeditor.button.flow_builder.ai_schedule_clear_all"
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDisableAll}
        disabled={disabled}
        className="h-7 flex-1 text-xs sm:flex-none"
      >
        {t('flow_builder.ai_schedule_clear_all', 'Clear All')}
      </Button>
      <Button data-tour="components-flow-builder-weeklyscheduleeditor.button.flow_builder.ai_schedule_reset_to_default"
        type="button"
        variant="outline"
        size="sm"
        onClick={handleResetToDefault}
        disabled={disabled}
        className="h-7 flex-1 text-xs sm:flex-none"
      >
        {t('flow_builder.ai_schedule_reset_to_default', 'Reset to Default')}
      </Button>
    </div>
  );
}

/**
 * Reusable Weekly Schedule Editor Component
 * Allows users to configure day-specific working hours, breaks, and mark off-days
 */
export function WeeklyScheduleEditor({
  schedule,
  offDays,
  onScheduleChange,
  onOffDaysChange,
  disabled = false,
  className = '',
  scrollbarClassName = '',
  showQuickActions = true,
  compact = false,
}: WeeklyScheduleEditorProps) {
  const { t } = useTranslation();

  /**
   * Normalize schedule and offDays to ensure consistency
   * If a day is in offDays, its enabled flag should be false
   */
  useEffect(() => {
    let needsNormalization = false;
    const normalizedSchedule = schedule.map(day => {
      const isInOffDays = offDays.includes(day.dayIndex);
      const breaks = day.breaks ?? [];
      if (isInOffDays && day.enabled) {
        needsNormalization = true;
        return { ...day, enabled: false, breaks: [] };
      }
      if (day.breaks === undefined) {
        needsNormalization = true;
        return { ...day, breaks };
      }
      return day;
    });

    if (needsNormalization) {
      onScheduleChange(normalizedSchedule);
    }
  }, [schedule, offDays, onScheduleChange]);

  /**
   * Toggle day enabled/disabled
   */
  const handleDayToggle = (dayIndex: number) => {
    if (disabled) return;
    
    const newOffDays = [...offDays];
    const dayIndexInOffDays = newOffDays.indexOf(dayIndex);
    
    if (dayIndexInOffDays >= 0) {
      // Remove from off-days (enable day)
      newOffDays.splice(dayIndexInOffDays, 1);
    } else {
      // Add to off-days (disable day)
      newOffDays.push(dayIndex);
    }
    
    onOffDaysChange(newOffDays);
    
    // Update schedule to reflect enabled/disabled state
    const newSchedule = schedule.map(day => 
      day.dayIndex === dayIndex 
        ? {
            ...day,
            enabled: dayIndexInOffDays >= 0,
            breaks: dayIndexInOffDays >= 0 ? (day.breaks ?? []) : [],
          }
        : day
    );
    onScheduleChange(newSchedule);
  };

  /**
   * Update time for a specific day
   */
  const handleTimeChange = (dayIndex: number, field: 'startTime' | 'endTime', value: string) => {
    if (disabled) return;
    
    const newSchedule = schedule.map(day => 
      day.dayIndex === dayIndex 
        ? { ...day, [field]: value }
        : day
    );
    onScheduleChange(newSchedule);
  };

  const handleAddBreak = (dayIndex: number) => {
    if (disabled) return;
    const newSchedule = schedule.map((day) => {
      if (day.dayIndex !== dayIndex) return day;
      const breaks = [...(day.breaks ?? [])];
      const toHHMM = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const [wsh, wsm] = day.startTime.split(':').map(Number);
      const [weh, wem] = day.endTime.split(':').map(Number);
      const workStart = wsh * 60 + wsm;
      const workEnd = weh * 60 + wem;

      const candidates: TimeWindow[] = [
        { startTime: '13:00', endTime: '14:00' },
        { startTime: toHHMM(workStart), endTime: toHHMM(Math.min(workStart + 60, workEnd)) },
        { startTime: toHHMM(Math.max(workStart, workEnd - 60)), endTime: toHHMM(workEnd) },
      ];

      for (const candidate of candidates) {
        if (validateDayBreaks(day, [...breaks, candidate]).ok) {
          breaks.push(candidate);
          return { ...day, breaks };
        }
      }
      // No valid non-overlapping slot — do not persist an invalid break
      return day;
    });
    onScheduleChange(newSchedule);
  };

  const handleRemoveBreak = (dayIndex: number, breakIndex: number) => {
    if (disabled) return;
    const newSchedule = schedule.map((day) => {
      if (day.dayIndex !== dayIndex) return day;
      const breaks = [...(day.breaks ?? [])];
      breaks.splice(breakIndex, 1);
      return { ...day, breaks };
    });
    onScheduleChange(newSchedule);
  };

  const handleBreakTimeChange = (
    dayIndex: number,
    breakIndex: number,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    if (disabled) return;
    const newSchedule = schedule.map((day) => {
      if (day.dayIndex !== dayIndex) return day;
      const breaks = (day.breaks ?? []).map((brk, i) =>
        i === breakIndex ? { ...brk, [field]: value } : brk
      );
      return { ...day, breaks };
    });
    onScheduleChange(newSchedule);
  };

  /**
   * Validate time format
   */
  const validateTime = (time: string): boolean => {
    return isValidTimeFormat(time);
  };

  /**
   * Get validation error message for a day's time range
   */
  const getTimeError = (startTime: string, endTime: string): string | null => {
    if (!validateTime(startTime) || !validateTime(endTime)) {
      return t('flow_builder.ai_schedule_invalid_time_format', 'Invalid time format (use HH:MM)');
    }
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (endMinutes <= startMinutes) {
      return t('flow_builder.ai_schedule_end_after_start', 'End time must be after start time');
    }
    
    return null;
  };

  const getBreakError = (day: DaySchedule): string | null => {
    const result = validateDayBreaks(day, day.breaks);
    if (result.ok) return null;
    switch (result.error) {
      case 'outside_work_hours':
        return t('flow_builder.ai_schedule_break_outside_hours', 'Breaks must be inside working hours');
      case 'overlaps':
        return t('flow_builder.ai_schedule_break_overlap', 'Breaks must not overlap');
      case 'start_not_before_end':
        return t('flow_builder.ai_schedule_break_order', 'Break end must be after start');
      default:
        return t('flow_builder.ai_schedule_break_invalid', 'Invalid break times');
    }
  };

  const allDaysDisabled = schedule.every(day => !day.enabled);

  return (
    <div className={`min-w-0 max-w-full space-y-4 ${className}`}>
      {showQuickActions ? (
        <WeeklyScheduleQuickActions
          schedule={schedule}
          offDays={offDays}
          onScheduleChange={onScheduleChange}
          onOffDaysChange={onOffDaysChange}
          disabled={disabled}
        />
      ) : null}

      {/* Warning if all days disabled */}
      {allDaysDisabled && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-2 text-xs text-amber-800 dark:text-amber-200">
          {t('flow_builder.ai_schedule_all_days_disabled_warning', '⚠️ All days are disabled. No appointment slots will be available.')}
        </div>
      )}

      {/* Schedule Table */}
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className={cn('-mx-1 overflow-x-auto sm:mx-0', scrollbarClassName)}>
          <table
            className={`w-full text-sm ${compact ? 'min-w-[22rem] sm:min-w-[36rem]' : 'min-w-[36rem]'}`}
          >
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-foreground sm:px-3">{t('flow_builder.ai_schedule_day', 'Day')}</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-foreground sm:px-3">{t('flow_builder.ai_schedule_status', 'Status')}</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-foreground sm:px-3">{t('flow_builder.ai_schedule_work_hours', 'Working hours')}</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-foreground sm:px-3">{t('flow_builder.ai_schedule_breaks', 'Breaks')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schedule.map((day) => {
                const isOffDay = offDays.includes(day.dayIndex);
                const dayEnabled = day.enabled && !isOffDay;
                const timeError = dayEnabled ? getTimeError(day.startTime, day.endTime) : null;
                const breakError = dayEnabled ? getBreakError(day) : null;
                const breaks = day.breaks ?? [];
                
                return (
                  <tr
                    key={day.dayIndex}
                    className={`transition-colors ${
                      dayEnabled 
                        ? 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30' 
                        : 'bg-muted/30 dark:bg-muted/20 hover:bg-muted/50 dark:hover:bg-muted/30'
                    }`}
                  >
                    <td className="px-2 py-2 align-top sm:px-3">
                      <Label className="text-xs font-medium text-foreground">
                        {day.dayName}
                      </Label>
                    </td>
                    <td className="px-2 py-2 text-center align-top sm:px-3">
                      <Switch
                        checked={dayEnabled}
                        onCheckedChange={() => handleDayToggle(day.dayIndex)}
                        disabled={disabled}
                        className="scale-75"
                      />
                    </td>
                    <td className="px-2 py-2 align-top sm:px-3">
                      {dayEnabled ? (
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                          <Input data-tour="components-flow-builder-weeklyscheduleeditor.input.day.startTime"
                            type="time"
                            value={day.startTime}
                            onChange={(e) => handleTimeChange(day.dayIndex, 'startTime', e.target.value)}
                            disabled={disabled || !dayEnabled}
                            className={`h-7 w-full min-w-0 text-xs sm:w-[7.5rem] bg-background text-foreground ${TIME_INPUT_CLASS} ${
                              timeError ? 'border-red-500 dark:border-red-400' : ''
                            }`}
                            aria-label={`${day.dayName} start time`}
                          />
                          <span className="hidden text-xs text-muted-foreground sm:inline sm:w-2 sm:shrink-0 sm:text-center">
                            –
                          </span>
                          <Input data-tour="components-flow-builder-weeklyscheduleeditor.input.day.endTime"
                            type="time"
                            value={day.endTime}
                            onChange={(e) => handleTimeChange(day.dayIndex, 'endTime', e.target.value)}
                            disabled={disabled || !dayEnabled}
                            className={`h-7 w-full min-w-0 text-xs sm:w-[7.5rem] bg-background text-foreground ${TIME_INPUT_CLASS} ${
                              timeError ? 'border-red-500 dark:border-red-400' : ''
                            }`}
                            aria-label={`${day.dayName} end time`}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2 align-top sm:px-3',
                        compact ? 'min-w-[10rem] sm:min-w-[18rem]' : 'min-w-[12rem] sm:min-w-[18rem]',
                      )}
                    >
                      {dayEnabled ? (
                        <div className="flex flex-col items-start gap-2">
                          {breaks.map((brk, breakIndex) => (
                            <div
                              key={`${day.dayIndex}-break-${breakIndex}`}
                              className={cn(
                                'flex items-center gap-1.5',
                                compact && 'flex-col items-stretch sm:flex-row sm:items-center',
                              )}
                            >
                              <div
                                className={cn(
                                  'flex items-center gap-1.5 rounded-md border px-1.5 py-1',
                                  compact && 'flex-col sm:flex-row',
                                  breakError
                                    ? 'border-red-500/60 bg-red-500/5'
                                    : 'border-border/70 bg-muted/40',
                                )}
                              >
                                <Input data-tour="components-flow-builder-weeklyscheduleeditor.input.brk.startTime"
                                  type="time"
                                  value={brk.startTime}
                                  onChange={(e) =>
                                    handleBreakTimeChange(day.dayIndex, breakIndex, 'startTime', e.target.value)
                                  }
                                  disabled={disabled}
                                  className={`text-xs h-7 bg-background border-border/80 ${TIME_INPUT_CLASS} ${
                                    compact ? 'w-full min-w-0 sm:w-[7.5rem]' : 'w-[7.5rem]'
                                  } ${breakError ? 'border-red-500' : ''}`}
                                  aria-label={`${day.dayName} break ${breakIndex + 1} start`}
                                />
                                <span
                                  className={cn(
                                    'text-xs text-muted-foreground shrink-0 text-center',
                                    compact ? 'hidden sm:inline sm:w-2' : 'w-2',
                                  )}
                                >
                                  –
                                </span>
                                <Input data-tour="components-flow-builder-weeklyscheduleeditor.input.brk.endTime"
                                  type="time"
                                  value={brk.endTime}
                                  onChange={(e) =>
                                    handleBreakTimeChange(day.dayIndex, breakIndex, 'endTime', e.target.value)
                                  }
                                  disabled={disabled}
                                  className={`text-xs h-7 bg-background border-border/80 ${TIME_INPUT_CLASS} ${
                                    compact ? 'w-full min-w-0 sm:w-[7.5rem]' : 'w-[7.5rem]'
                                  } ${breakError ? 'border-red-500' : ''}`}
                                  aria-label={`${day.dayName} break ${breakIndex + 1} end`}
                                />
                              </div>
                              <button data-tour="components-flow-builder-weeklyscheduleeditor.button.flow_builder.ai_schedule_remove_break"
                                type="button"
                                className={cn(
                                  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50',
                                  compact && 'self-end sm:self-auto',
                                )}
                                onClick={() => handleRemoveBreak(day.dayIndex, breakIndex)}
                                disabled={disabled}
                                aria-label={t('flow_builder.ai_schedule_remove_break', 'Remove break')}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button data-tour="components-flow-builder-weeklyscheduleeditor.button.flow_builder.ai_schedule_add_break"
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-green-600 transition-colors hover:bg-green-500/10 dark:text-green-400 disabled:opacity-50"
                            onClick={() => handleAddBreak(day.dayIndex)}
                            disabled={disabled}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t('flow_builder.ai_schedule_add_break', 'Add break')}
                          </button>
                          {breakError && (
                            <div className="text-[11px] leading-snug text-red-600 dark:text-red-400">{breakError}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Validation Errors */}
      {schedule.some(day => {
        if (!day.enabled || offDays.includes(day.dayIndex)) return false;
        return getTimeError(day.startTime, day.endTime) !== null || getBreakError(day) !== null;
      }) && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-2 text-xs text-red-800 dark:text-red-200">
          {t('flow_builder.ai_schedule_invalid_time_ranges', '⚠️ Some days have invalid time ranges. Please check start and end times.')}
        </div>
      )}
    </div>
  );
}

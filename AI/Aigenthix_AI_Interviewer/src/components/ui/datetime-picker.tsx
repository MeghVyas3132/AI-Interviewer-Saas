"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  min?: string
  className?: string
  id?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date and time",
  disabled = false,
  min,
  className,
  id
}: DateTimePickerProps) {
  // Helper function to format date and time to datetime-local string
  const formatDateTime = React.useCallback((selectedDate: Date | undefined, selectedTime: string): string => {
    if (!selectedDate) return ''
    
    const [hours, minutes] = selectedTime.split(':').map(Number)
    const combined = new Date(selectedDate)
    combined.setHours(isNaN(hours) ? 0 : hours)
    combined.setMinutes(isNaN(minutes) ? 0 : minutes)
    combined.setSeconds(0)
    combined.setMilliseconds(0)
    
    // Format as datetime-local string (YYYY-MM-DDTHH:mm)
    const year = combined.getFullYear()
    const month = (combined.getMonth() + 1).toString().padStart(2, '0')
    const day = combined.getDate().toString().padStart(2, '0')
    const hourStr = combined.getHours().toString().padStart(2, '0')
    const minuteStr = combined.getMinutes().toString().padStart(2, '0')
    return `${year}-${month}-${day}T${hourStr}:${minuteStr}`
  }, [])

  // Parse datetime-local string to date and time
  const parseDateTime = React.useCallback((datetimeString: string): { date: Date; time: string } | null => {
    if (!datetimeString) return null
    try {
      const dateObj = new Date(datetimeString)
      if (isNaN(dateObj.getTime())) return null
      const hours = dateObj.getHours().toString().padStart(2, '0')
      const minutes = dateObj.getMinutes().toString().padStart(2, '0')
      return { date: dateObj, time: `${hours}:${minutes}` }
    } catch {
      return null
    }
  }, [])

  // Track the last value we set internally to avoid syncing back
  const lastInternalValue = React.useRef<string>('')

  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (value) {
      const parsed = parseDateTime(value)
      return parsed?.date
    }
    return undefined
  })
  const [time, setTime] = React.useState<string>(() => {
    if (value) {
      const parsed = parseDateTime(value)
      return parsed?.time || '00:00'
    }
    return '00:00'
  })

  // Update date and time when value prop changes from external source
  React.useEffect(() => {
    // Only sync if the value prop is different from what we last set internally
    if (value !== lastInternalValue.current) {
      const parsed = parseDateTime(value || '')
      if (parsed) {
        setDate(parsed.date)
        setTime(parsed.time)
      } else if (!value) {
        setDate(undefined)
        setTime('00:00')
      }
    }
  }, [value, parseDateTime])

  // Handle date selection
  const handleDateSelect = React.useCallback((selectedDate: Date | undefined) => {
    setDate(selectedDate)
    if (selectedDate) {
      const datetimeString = formatDateTime(selectedDate, time)
      lastInternalValue.current = datetimeString
      onChange(datetimeString)
    } else {
      lastInternalValue.current = ''
      onChange('')
    }
  }, [time, formatDateTime, onChange])

  // Handle time change
  const handleTimeChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value
    setTime(newTime)
    if (date) {
      const datetimeString = formatDateTime(date, newTime)
      lastInternalValue.current = datetimeString
      onChange(datetimeString)
    }
  }, [date, formatDateTime, onChange])

  // Handle clear
  const handleClear = React.useCallback(() => {
    setDate(undefined)
    setTime('00:00')
    lastInternalValue.current = ''
    onChange('')
  }, [onChange])

  const displayValue = React.useMemo(() => {
    if (!date) return ''
    const [hours, minutes] = time.split(':').map(Number)
    const combined = new Date(date)
    combined.setHours(hours || 0)
    combined.setMinutes(minutes || 0)
    return format(combined, "PPP 'at' h:mm a")
  }, [date, time])

  const minDate = React.useMemo(() => {
    if (!min) return undefined
    const date = new Date(min)
    // Set to start of day for proper date comparison
    date.setHours(0, 0, 0, 0)
    return date
  }, [min])

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? displayValue : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 space-y-3">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              disabled={(selectedDate) => {
                if (!minDate) return false
                const compareDate = new Date(selectedDate)
                compareDate.setHours(0, 0, 0, 0)
                return compareDate < minDate
              }}
              initialFocus
            />
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor={`${id}-time`} className="text-xs font-medium">
                Time
              </Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  id={`${id}-time`}
                  type="time"
                  value={time}
                  onChange={handleTimeChange}
                  className="w-full"
                  step="60"
                  disabled={!date}
                  min={
                    minDate && date && 
                    date.toDateString() === minDate.toDateString() 
                      ? new Date(min || '').toTimeString().slice(0, 5)
                      : undefined
                  }
                />
              </div>
            </div>
            {date && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}


"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type ComboboxOption = {
  value: string
  label: string
}

type ComboboxProps = {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyPlaceholder?: string
  creatable?: boolean
}

export function Combobox({ 
    options, 
    value, 
    onChange,
    placeholder = "Select an option...",
    searchPlaceholder = "Search...",
    emptyPlaceholder = "No results found.",
    creatable = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const handleSelect = (currentValue: string) => {
      onChange(currentValue === value ? "" : currentValue)
      setOpen(false)
  }
  
  const handleCreate = () => {
    onChange(search)
    setOpen(false)
  }

  const displayedValue = options.find((option) => option.value === value)?.label || value

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value ? displayedValue : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command onValueChange={setSearch} filter={(value, search) => {
            const label = options.find(o => o.value === value)?.label ?? ''
            if (label.toLowerCase().includes(search.toLowerCase())) return 1
            return 0
        }}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>
                {creatable && search.length > 0 ? (
                    <CommandItem onSelect={handleCreate}>
                        Use "{search}"
                    </CommandItem>
                ) : (
                    emptyPlaceholder
                )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

import { Ellipsis, SquarePen, Trash2 } from 'lucide-react'

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/common/catalyst/dropdown'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/common/ui/tooltip'

export function ItemDropdownMenu({
  onRename,
  onDelete,
  renameDisabled,
  ariaLabel,
}: {
  onRename: () => void
  onDelete: () => void
  renameDisabled?: boolean
  ariaLabel: string
}) {
  const renameItem = (
    <DropdownItem onClick={onRename} disabled={renameDisabled}>
      <SquarePen data-slot="icon" />
      <DropdownLabel>Rename</DropdownLabel>
    </DropdownItem>
  )
  return (
    <Dropdown>
      <DropdownButton
        as="button"
        className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-5 items-center justify-center rounded-md"
        aria-label={ariaLabel}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Ellipsis className="size-3.5" />
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="z-100">
        {renameDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>{renameItem}</TooltipTrigger>
            <TooltipContent side="left">
              Rename isn't available while you're working with Q
            </TooltipContent>
          </Tooltip>
        ) : (
          renameItem
        )}
        <DropdownItem onClick={onDelete}>
          <Trash2 data-slot="icon" />
          <DropdownLabel>Delete</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  )
}

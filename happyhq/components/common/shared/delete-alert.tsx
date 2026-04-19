import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@/components/common/catalyst/alert'
import { Button } from '@/components/common/catalyst/button'

export function DeleteAlert({
  open,
  onClose,
  title,
  description,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  onDelete: () => void
}) {
  return (
    <Alert open={open} onClose={onClose}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onDelete}>Delete</Button>
      </AlertActions>
    </Alert>
  )
}

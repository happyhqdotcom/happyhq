import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@/components/common/catalyst/alert'
import { Button } from '@/components/common/catalyst/button'

export function ConfirmRestartAlert({
  open,
  onClose,
  title,
  description,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  onConfirm: () => void
}) {
  return (
    <Alert open={open} onClose={onClose}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          Start
        </Button>
      </AlertActions>
    </Alert>
  )
}

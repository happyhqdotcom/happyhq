import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@/components/common/catalyst/alert'
import { Button } from '@/components/common/catalyst/button'

export function RestartAlert({
  open,
  onClose,
  onConfirm,
  onRestartFromPlan,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  onRestartFromPlan?: () => void
}) {
  return (
    <Alert open={open} onClose={onClose}>
      <AlertTitle>Start this task over?</AlertTitle>
      <AlertDescription>
        Your original inputs stay the same. Choose whether to redo everything
        from scratch, or keep the current plan and redo just the work.
      </AlertDescription>
      <AlertActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        {onRestartFromPlan && (
          <Button
            outline
            onClick={() => {
              onClose()
              onRestartFromPlan()
            }}
          >
            From plan
          </Button>
        )}
        <Button
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          From scratch
        </Button>
      </AlertActions>
    </Alert>
  )
}

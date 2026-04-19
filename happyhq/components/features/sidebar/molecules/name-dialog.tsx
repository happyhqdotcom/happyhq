'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/common/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/common/catalyst/dialog'
import { Field } from '@/components/common/catalyst/fieldset'
import { Input } from '@/components/common/catalyst/input'

interface NameInputDialogProps {
  open: boolean
  onClose: () => void
  title: string
  defaultValue: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
}

export function NameInputDialog({
  open,
  onClose,
  title,
  defaultValue,
  submitLabel,
  onSubmit,
}: NameInputDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      setError(null)
    }
  }, [open, defaultValue])

  const handleClose = () => {
    if (!isSubmitting) onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onSubmit(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} size="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogBody>
          <Field>
            <Input
              autoFocus
              value={value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setValue(e.target.value)
                setError(null)
              }}
            />
          </Field>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!value.trim() || isSubmitting}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

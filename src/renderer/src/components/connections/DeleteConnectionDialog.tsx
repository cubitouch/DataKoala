import type { DataSourceProfile } from '@shared/types'
import { ConfirmationDialog } from '@components/ui/ConfirmationDialog'

export function DeleteConnectionDialog({
  profile,
  onCancel,
  onConfirm,
}: {
  profile: DataSourceProfile
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  return (
    <ConfirmationDialog
      title="Delete connection?"
      description={
        <>
          Delete “{profile.name}”? This removes the saved connection from
          DataKoala.
        </>
      }
      confirmLabel="Delete connection"
      onCancel={onCancel}
      onConfirm={onConfirm}
      restoreFocus={false}
    />
  )
}
